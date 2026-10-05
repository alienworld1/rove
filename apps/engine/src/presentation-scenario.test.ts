import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ChargingStore, LabStore } from "@rove/persistence";
import { compileLabScenario } from "@rove/lab";
import { controlledMeterProfiles } from "@rove/lab/scenarios/northstar-voltway";
import { createPresentationScenario } from "@rove/lab/scenarios/northstar-voltway-presentation";
import { conservativeTariffBound } from "@rove/protection";
import { CorridorLab } from "./corridor-lab.js";
import { quoteHostedRun } from "./hosted-runtime.js";
import { createLocalLabPaymentAdapter } from "./lab-payment.js";
import { processNextEffect } from "./outbox-worker.js";
import { summarizeCorridor } from "./corridor-read-model.js";

test("presentation trace compiles, crosses the exact physical bound and fits admission", () => {
  const scenario = createPresentationScenario();
  const compiled = compileLabScenario(scenario, controlledMeterProfiles);
  assert.equal(compiled.events.at(-1)?.traceOffsetMs, 120000);
  for (const [index, lane] of scenario.lanes.entries()) {
    const deliveredWatts = (BigInt([50, 350, 900][index]) * 3600000n) / 10000n;
    assert.ok(deliveredWatts <= BigInt(lane.maxPowerWatts));
  }
  assert.equal(
    conservativeTariffBound("350000", 18367, "420000", 6, 6),
    749986n,
  );
  assert.equal(
    conservativeTariffBound("350000", 18368, "420000", 6, 6),
    750027n,
  );
  const limits = {
    HOSTED_FUNDING_BUDGET: "10500000",
    HOSTED_FEE_BUDGET: "100000",
    HOSTED_GAS_LIMIT: "100",
    HOSTED_MAX_FEE_PER_GAS: "2",
    HOSTED_MAX_TRANSACTIONS_PER_RUN: 32,
  };
  assert.equal(quoteHostedRun(scenario, limits).funding, "10500000");
  assert.throws(
    () =>
      quoteHostedRun(scenario, {
        ...limits,
        HOSTED_MAX_TRANSACTIONS_PER_RUN: 12,
      }),
    /transaction allowance/,
  );
});

test(
  "presentation payments protect, pause, recover, reconcile and return reserve",
  { skip: !process.env.DATABASE_URL },
  async () => {
    process.env.CDR_CURRENCY = "USD";
    process.env.CDR_SETTLEMENT_ASSET_ID = "TEST_ASSET";
    process.env.CDR_SOURCE_PARTY_ID = "controlled-cpo";
    const store = new ChargingStore(process.env.DATABASE_URL!);
    const saved = new LabStore(process.env.DATABASE_URL!);
    try {
      const lab = new CorridorLab(store, saved);
      const scenario = await lab.saveScenario({
        ...createPresentationScenario(),
        id: randomUUID(),
      });
      let view = await lab.start(scenario.id, scenario.digest);
      let steps = 0;
      while (view.run.status !== "completed" && steps++ < 60) {
        view = await lab.transport(view.run.id, "step", view.run.version);
        const c = view.lanes[2].projection!;
        const event = view.events
          .filter((event) => event.status !== "pending")
          .at(-1);
        if (event?.id === "reading-c-corrupt") {
          assert.equal(c.trustedDeliveredValue, "1512000");
          assert.equal(c.protectedValue, "1512000");
        }
        if (event?.id === "risk-c-boundary") {
          assert.equal(c.state, "PAUSE_REQUIRED");
          assert.equal(c.protectedValue, "1512000");
        }
        if (event?.id === "risk-c-restored") assert.equal(c.state, "PROTECTED");
      }
      assert.equal(view.run.status, "completed");
      assert.deepEqual(
        view.lanes.map((lane) => lane.projection!.trustedDeliveredValue),
        ["252000", "1764000", "3780000"],
      );
      assert.ok(
        view.lanes.some((lane) =>
          lane.projection!.operations.some(
            (op) => op.type === "top_up" && op.status === "confirmed",
          ),
        ),
      );
      assert.ok(
        view.lanes[2].projection!.operations.some(
          (op) => op.type === "settle" && BigInt(op.requestedAmount) < 3780000n,
        ),
      );
      for (const lane of view.lanes) {
        const laneId = lane.projection!.id;
        const summary = await lab.finishLane({
          laneId,
          expectedVersion: (await store.getLane(laneId)).version,
          commandId: randomUUID(),
          correlationId: view.run.id,
        });
        assert.equal(summary.completion?.status, "reconciled");
        assert.equal(summary.completion.comparison?.status, "MATCH");
        await store.advanceLane(
          {
            laneId,
            expectedVersion: summary.version,
            commandId: randomUUID(),
            correlationId: view.run.id,
            now: summary.completion.serviceEndedAt,
            payload: { type: "CloseChannel" },
          },
          "corridor-lab",
        );
        await processNextEffect(
          store,
          createLocalLabPaymentAdapter(
            store,
            summary.completion.serviceEndedAt,
          ),
          new Date().toISOString(),
          laneId,
        );
        const closed = await store.getCompletion(laneId);
        assert.equal(closed.completion?.status, "closed");
        assert.equal(
          closed.completion.closure?.confirmedRefund,
          closed.completion.closure?.expectedRefund,
        );
      }
      const lanes = await Promise.all(
        view.lanes.map((lane) => store.getLane(lane.projection!.id)),
      );
      assert.equal(summarizeCorridor(lanes).settledValue, "5796000");
      assert.equal(summarizeCorridor(lanes).unusedFundedHeadroom, "0");
    } finally {
      await Promise.all([store.close(), saved.close()]);
    }
  },
);

test(
  "receipt waits preserve the persisted Lab service clock",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const store = new ChargingStore(process.env.DATABASE_URL!);
    const saved = new LabStore(process.env.DATABASE_URL!);
    try {
      const lab = new CorridorLab(store, saved);
      const scenario = await lab.saveScenario({
        ...createPresentationScenario(),
        id: randomUUID(),
      });
      let view = await lab.start(scenario.id, scenario.digest);
      for (let steps = 0; steps < 30; steps++) {
        view = await lab.transport(view.run.id, "step", view.run.version);
        const c = view.lanes[2].projection!;
        const event = view.events
          .filter((event) => event.status !== "pending")
          .at(-1);
        if (event?.id === "reading-lane-c-4") {
          const wallTime = "2026-01-01T01:00:00.000Z";
          await store.advanceLane(
            {
              laneId: c.id,
              expectedVersion: c.version,
              commandId: randomUUID(),
              correlationId: view.run.id,
              now: wallTime,
              payload: { type: "TickProtectionClock" },
            },
            "corridor-lab",
            {
              type: "PaymentObserved",
              source: "local-simulation",
              channelId: c.channelId!,
              network: view.scenario.corridor.tempoNetwork,
              assetId: view.scenario.corridor.settlementAssetId,
              observedAt: wallTime,
              confirmedDeposit: c.confirmedDeposit!,
              settledValue: c.settledValue,
              chainHeight: "4",
            },
          );
          const waiting = await store.getLane(c.id);
          assert.equal(
            (await store.getPaymentContext(c.id)).lane.evidenceHealth,
            "fresh",
          );
          assert.equal(waiting.unverifiedServiceBound, "0");
          assert.equal(waiting.chainObservedAt, wallTime);
        }
        if (event?.id === "reading-lane-c-4") return;
      }
      assert.fail("The accepted 40-second reading was not reached.");
    } finally {
      await Promise.all([store.close(), saved.close()]);
    }
  },
);
