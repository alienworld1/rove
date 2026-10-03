import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readBaseConfig, readPaymentConfig } from "@rove/config";
import { ChargingStore } from "@rove/persistence";
import { createLiveLabScenario } from "./lab-live-scenario.js";
import { controlledMeterIdentity, controlledReading } from "./lab-evidence.js";
import { createChargingEffectAdapter } from "./charging-effects.js";
import { processNextEffect } from "./outbox-worker.js";
import { recoverChargingLane } from "./recover-charging.js";

const config = readBaseConfig();
const payment = readPaymentConfig();
if (!config.DATABASE_URL || config.NODE_ENV !== "development")
  throw new Error(
    "Use a development database for terminal payment verification.",
  );
const store = new ChargingStore(config.DATABASE_URL);
const scenario = createLiveLabScenario();
const meter = scenario.lanes[0];
const adapter = createChargingEffectAdapter(store);
try {
  for (const energyWh of ["0", "1000"]) {
    const value = energyWh === "0" ? "0" : "500000";
    const deposit = energyWh === "0" ? "500" : "500000";
    const tariff = {
      perKwh: "500000",
      tariffDecimals: 6,
      assetDecimals: payment.TEMPO_ASSET_DECIMALS,
    };
    const corridor = await store.createCorridor(
      {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        ...scenario.corridor,
        reservePolicy: { initialDeposit: deposit, topUpIncrement: "300" },
        tariff,
        meters: [controlledMeterIdentity(meter)],
      },
      "completion-proof",
    );
    const started = await store.startLane(
      {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        corridorId: corridor.id,
        externalSessionId: `terminal-${randomUUID()}`,
        chargerId: meter.chargerId,
        meterId: meter.meterId,
        maxPowerWatts: meter.maxPowerWatts,
        expectedProofIntervalMs: 1000,
      },
      "completion-proof",
    );
    for (let i = 0; i < 30; i++) {
      await processNextEffect(
        store,
        adapter,
        new Date().toISOString(),
        started.id,
      );
      if ((await store.getLane(started.id)).confirmedDeposit) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    let lane = (await store.getPaymentContext(started.id)).lane;
    assert.equal(lane.confirmedDeposit, deposit);
    const now = new Date().toISOString();
    const command = async (
      payload: import("@rove/contracts").LaneCommandInput["payload"],
    ) =>
      store.advanceLane(
        {
          commandId: randomUUID(),
          correlationId: randomUUID(),
          laneId: lane.id,
          expectedVersion: (await store.getLane(lane.id)).version,
          now,
          payload,
        },
        "corridor-lab",
      );
    await command({
      type: "CompleteLane",
      serviceStartedAt: lane.createdAt,
      serviceEndedAt: now,
      endSource: "controlled_twin",
    });
    await command({
      type: "ObserveEvidence",
      final: true,
      transportSessionId: lane.externalSessionId,
      raw: controlledReading({
        lane: meter,
        sessionId: lane.externalSessionId,
        instant: now,
        sequence: 1,
        cumulativeMilliWh: (BigInt(energyWh) * 1000n).toString(),
      }),
    });
    await command({
      type: "ReceiveCDR",
      raw: JSON.stringify({
        externalCdrId: `record-${lane.id}`,
        externalSessionId: lane.externalSessionId,
        sourcePartyId: process.env.CDR_SOURCE_PARTY_ID,
        meterId: lane.meterId,
        chargerId: lane.chargerId,
        startedAt: lane.createdAt,
        endedAt: now,
        currency: "USD",
        totalEnergyKwh: energyWh === "0" ? "0.000" : "1.000",
        totalCost: value === "0" ? "0.000000" : "0.500000",
        tariffBasis: tariff,
        chargeType: "energy_only_tax_free",
      }),
    });
    for (let i = 0; i < 60; i++) {
      await processNextEffect(
        store,
        adapter,
        new Date().toISOString(),
        lane.id,
      );
      const s = await store.getCompletion(lane.id);
      if (s.completion?.status === "reconciled" && s.canClose) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    let summary = await store.getCompletion(lane.id);
    assert.equal(summary.completion?.status, "reconciled");
    const observation = await adapter.observe(lane.id);
    await store.advanceLane(
      {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        laneId: lane.id,
        expectedVersion: summary.version,
        now: observation.observedAt,
        payload: { type: "CloseChannel" },
      },
      "completion-proof",
      observation,
    );
    await processNextEffect(store, adapter, new Date().toISOString(), lane.id);
    // Lose the database submission reference after the real submission to exercise receipt discovery.
    const postgres = (await import("postgres")).default;
    const db = postgres(config.DATABASE_URL!);
    await db`update outbox_jobs set external_reference = null where lane_id = ${lane.id} and effect_type = 'payment.close_requested'`;
    await db.end();
    for (let i = 0; i < 60; i++) {
      lane = (await store.getPaymentContext(lane.id)).lane;
      await recoverChargingLane(store, lane, adapter);
      summary = await store.getCompletion(lane.id);
      if (
        summary.completion?.status === "closed" &&
        summary.recovery.status === "ready"
      )
        break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.equal(summary.completion?.status, "closed");
    assert.equal(summary.completion.finalTrustedValue, value);
    assert.equal(
      summary.completion.closure?.confirmedRefund,
      energyWh === "0" ? "500" : "0",
    );
    process.stdout.write(
      JSON.stringify({
        energyWh,
        total: value,
        laneId: lane.id,
        channelId: lane.channelId,
        closure: summary.completion.closure,
        recovery: summary.recovery,
      }) + "\n",
    );
  }
} finally {
  await store.close();
}
