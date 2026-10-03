import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { ChargingStore, LabStore } from "@rove/persistence";
import { CorridorLab } from "./corridor-lab.js";
import { createLocalLabPaymentAdapter } from "./lab-payment.js";
import { processNextEffect } from "./outbox-worker.js";
import { controlledReading } from "./lab-evidence.js";
import { recoverChargingLane } from "./recover-charging.js";

const databaseUrl = process.env.DATABASE_URL;
test(
  "stopped service reconciles exactly, closes once and retains terminal history after restart",
  { skip: !databaseUrl },
  async () => {
    process.env.CDR_CURRENCY = "USD";
    process.env.CDR_SETTLEMENT_ASSET_ID = "TEST_ASSET";
    process.env.CDR_SOURCE_PARTY_ID = "controlled-cpo";
    const store = new ChargingStore(databaseUrl!);
    const labStore = new LabStore(databaseUrl!);
    const sql = postgres(databaseUrl!);
    let restarted: ChargingStore | undefined;
    try {
      const lab = new CorridorLab(store, labStore);
      const scenario = await lab.seed();
      let view = await lab.start(scenario.id, scenario.digest);
      for (
        let index = 0;
        index < 30 && view.run.status !== "completed";
        index++
      )
        view = await lab.transport(view.run.id, "step", view.run.version);
      assert.equal(view.run.status, "completed");
      const laneId = view.run.laneBindings["lane-c"];
      const before = await store.getLane(laneId);
      const input = {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        laneId,
        expectedVersion: before.version,
      };
      const finished = await lab.finishLane(input);
      assert.equal(finished.completion?.status, "reconciled");
      assert.equal(
        finished.completion.finalTrustedEnergyWh,
        before.trustedEnergyWh,
      );
      assert.equal(finished.completion.comparison?.status, "MATCH");
      assert.equal(finished.completion.finalSettledValue, "342");
      assert.equal(
        (await lab.finishLane(input)).completion?.finalEvidenceHash,
        finished.completion.finalEvidenceHash,
      );
      const now = finished.completion.serviceEndedAt;
      const command = async (
        payload: import("@rove/contracts").LaneCommandInput["payload"],
      ) =>
        store.advanceLane(
          {
            commandId: randomUUID(),
            correlationId: randomUUID(),
            laneId,
            expectedVersion: (await store.getLane(laneId)).version,
            now,
            payload,
          },
          "corridor-lab",
        );
      const original = await store.getAccountingRecord(laneId);
      const cdrRows =
        await sql`select count(*)::int as count from cdrs where lane_id = ${laneId}`;
      assert.equal(cdrRows[0].count, 1);
      await command({ type: "ReceiveCDR", raw: original.raw! });
      const changed = { ...JSON.parse(original.raw!), totalCost: "343" };
      await assert.rejects(
        command({ type: "ReceiveCDR", raw: JSON.stringify(changed) }),
      );
      assert.equal((await store.getAccountingRecord(laneId)).raw, original.raw);
      await assert.rejects(
        command({ type: "BeginRecovery" }),
        /SERVICE_ALREADY_ENDED/,
      );
      const clocked = await command({ type: "TickProtectionClock" });
      assert.equal(clocked.state, "RECONCILED");
      const close = {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        laneId,
        expectedVersion: clocked.version,
        now,
        payload: { type: "CloseChannel" as const },
      };
      const results = await Promise.allSettled([
        store.advanceLane(close, "corridor-lab"),
        store.advanceLane(
          { ...close, commandId: randomUUID() },
          "corridor-lab",
        ),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const jobs =
        await sql`select * from outbox_jobs where lane_id = ${laneId} and effect_type = 'payment.close_requested'`;
      assert.equal(jobs.length, 1);
      // Simulate a receipt discovered after submission but before the terminal database commit.
      const adapter = createLocalLabPaymentAdapter(store, now);
      const receipt = await adapter.reconcile(
        jobs[0].effect_type,
        jobs[0].idempotency_key,
        undefined,
        jobs[0].payload,
      );
      assert.equal(receipt.status, "completed");
      await sql`update outbox_jobs set attempt_count = 1, status = 'submitted' where id = ${jobs[0].id}`;
      restarted = new ChargingStore(databaseUrl!);
      await processNextEffect(
        restarted,
        createLocalLabPaymentAdapter(restarted, now),
        new Date().toISOString(),
        laneId,
        false,
        true,
      );
      const closed = await restarted.getCompletion(laneId);
      assert.equal(closed.completion?.status, "closed");
      assert.equal(closed.completion.finalSettledValue, "342");
      assert.equal(closed.completion.closure?.confirmedRefund, "458");
      assert.equal((await restarted.getLane(laneId)).settledValue, "342");
      assert.ok(
        (await restarted.listLanes(before.corridorId)).includes(laneId),
      );
      const historical = await restarted.getInspector(
        laneId,
        closed.paymentEventId!,
      );
      assert.equal(historical.result.state, "CLOSED");
      assert.equal(historical.payment?.closure?.confirmedRefund, "458");
      assert.equal(historical.voucher?.cumulativeAmount, "342");

      const mismatchId = view.run.laneBindings["lane-a"];
      const mismatchBefore = await store.getPaymentContext(mismatchId);
      const mismatchCommand = async (
        payload: import("@rove/contracts").LaneCommandInput["payload"],
      ) =>
        store.advanceLane(
          {
            commandId: randomUUID(),
            correlationId: randomUUID(),
            laneId: mismatchId,
            expectedVersion: (await store.getLane(mismatchId)).version,
            now,
            payload,
          },
          "corridor-lab",
        );
      await mismatchCommand({
        type: "CompleteLane",
        serviceStartedAt: view.scenario.traceEpoch,
        serviceEndedAt: now,
        endSource: "controlled_twin",
      });
      const cost = BigInt(mismatchBefore.lane.trustedDeliveredValue) + 1n;
      const cdrCommand = {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        laneId: mismatchId,
        expectedVersion: (await store.getLane(mismatchId)).version,
        now,
        payload: {
          type: "ReceiveCDR" as const,
          raw: JSON.stringify({
            externalCdrId: `mismatch-${mismatchId}`,
            externalSessionId: mismatchBefore.lane.externalSessionId,
            sourcePartyId: "controlled-cpo",
            meterId: mismatchBefore.lane.meterId,
            chargerId: mismatchBefore.lane.chargerId,
            startedAt: view.scenario.traceEpoch,
            endedAt: now,
            currency: "USD",
            totalEnergyKwh: `0.${mismatchBefore.lane.trustedEnergyWh.padStart(3, "0")}`,
            totalCost: cost.toString(),
            tariffBasis: mismatchBefore.lane.tariff,
            chargeType: "energy_only_tax_free",
          }),
        },
      };
      const acceptedCdr = await store.advanceLane(cdrCommand, "corridor-lab");
      assert.deepEqual(
        await store.advanceLane(cdrCommand, "corridor-lab"),
        acceptedCdr,
      );
      assert.equal(
        (await store.getCompletion(mismatchId)).completion?.status,
        "awaiting_end_evidence",
      );
      const definition = view.scenario.lanes.find(
        (lane) => lane.key === "lane-a",
      )!;
      const jobsBefore =
        await sql`select count(*)::int as count from outbox_jobs where lane_id = ${mismatchId}`;
      await mismatchCommand({
        type: "ObserveEvidence",
        final: true,
        transportSessionId: mismatchBefore.lane.externalSessionId,
        raw: controlledReading({
          lane: definition,
          sessionId: mismatchBefore.lane.externalSessionId,
          instant: now,
          sequence: mismatchBefore.lane.lastEvidenceSequence! + 1,
          cumulativeMilliWh: (
            BigInt(mismatchBefore.lane.trustedEnergyWh) * 1000n
          ).toString(),
        }),
      });
      const mismatch = await store.getCompletion(mismatchId);
      assert.equal(mismatch.completion?.status, "mismatch");
      assert.equal(mismatch.completion.comparison?.deltas.accounting, "1");
      await assert.rejects(mismatchCommand({ type: "CloseChannel" }));
      const jobsAfter =
        await sql`select count(*)::int as count from outbox_jobs where lane_id = ${mismatchId}`;
      assert.equal(jobsAfter[0].count, jobsBefore[0].count);
      assert.equal(
        (await store.getLane(mismatchId)).settledValue,
        mismatchBefore.lane.settledValue,
      );

      const secondId = view.run.laneBindings["lane-b"];
      let context = await store.getPaymentContext(secondId);
      await store.advanceLane(
        {
          commandId: randomUUID(),
          correlationId: randomUUID(),
          laneId: secondId,
          expectedVersion: context.lane.version,
          now,
          payload: {
            type: "CompleteLane",
            serviceStartedAt: view.scenario.traceEpoch,
            serviceEndedAt: now,
            endSource: "controlled_twin",
          },
        },
        "corridor-lab",
      );
      context = await store.getPaymentContext(secondId);
      assert.equal(context.lane.completion?.status, "awaiting_end_evidence");
      assert.equal(
        (
          await store.advanceLane(
            {
              commandId: randomUUID(),
              correlationId: randomUUID(),
              laneId: secondId,
              expectedVersion: context.lane.version,
              now,
              payload: {
                type: "ObserveEvidence",
                final: true,
                raw: "invalid",
                transportSessionId: context.lane.externalSessionId,
              },
            },
            "corridor-lab",
          )
        ).state,
        "COMPLETING",
      );
      assert.equal(
        (await store.getCompletion(secondId)).completion?.finalTrustedValue,
        null,
      );
      const recovered = await store.getPaymentContext(secondId);
      await recoverChargingLane(
        store,
        { ...recovered.lane, tempoNetwork: "eip155:42431" },
        null,
      );
      assert.equal(store.recovery.get(secondId)?.status, "blocked");
    } finally {
      await restarted?.close();
      await store.close();
      await labStore.close();
      await sql.end();
    }
  },
);

test(
  "definitively reverted settlement and close remain retryable without replacing their durable intent",
  { skip: !databaseUrl },
  async () => {
    process.env.CDR_CURRENCY = "USD";
    process.env.CDR_SETTLEMENT_ASSET_ID = "TEST_ASSET";
    process.env.CDR_SOURCE_PARTY_ID = "controlled-cpo";
    const store = new ChargingStore(databaseUrl!);
    const labStore = new LabStore(databaseUrl!);
    const sql = postgres(databaseUrl!);
    try {
      const lab = new CorridorLab(store, labStore);
      const scenario = await lab.seed();
      let view = await lab.start(scenario.id, scenario.digest);
      for (
        let index = 0;
        index < 30 && view.run.status !== "completed";
        index++
      )
        view = await lab.transport(view.run.id, "step", view.run.version);
      const laneId = view.run.laneBindings["lane-c"];
      const claim = store.claimOutbox.bind(store);
      store.claimOutbox = async () => null;
      await lab.finishLane({
        commandId: randomUUID(),
        correlationId: randomUUID(),
        laneId,
        expectedVersion: (await store.getLane(laneId)).version,
      });
      store.claimOutbox = claim;
      const now = (await store.getCompletion(laneId)).completion!
        .serviceEndedAt;
      const command = async (type: "CheckCompletion" | "CloseChannel") =>
        store.advanceLane(
          {
            commandId: randomUUID(),
            correlationId: randomUUID(),
            laneId,
            expectedVersion: (await store.getLane(laneId)).version,
            now,
            payload: { type },
          },
          "corridor-lab",
        );
      const adapter = createLocalLabPaymentAdapter(store, now);
      const failed: import("./outbox-worker.js").EffectAdapter = {
        reconcile: async () => ({
          status: "failed",
          reasonCode: "PAYMENT_TRANSACTION_FAILED",
          externalReference: "local-reverted",
        }),
        submit: async () => {
          throw new Error("unexpected submission");
        },
      };
      await processNextEffect(store, failed, new Date().toISOString(), laneId);
      const pending = await store.getCompletion(laneId);
      assert.equal(pending.completion?.status, "awaiting_settlement");
      assert.equal(pending.canClose, false);
      assert.equal(pending.failedOperations[0].operation, "settle");
      await command("CheckCompletion");
      await processNextEffect(store, adapter, new Date().toISOString(), laneId);
      assert.equal(
        (await store.getCompletion(laneId)).completion?.status,
        "reconciled",
      );
      await command("CloseChannel");
      await processNextEffect(store, failed, new Date().toISOString(), laneId);
      assert.equal(
        (await store.getCompletion(laneId)).completion?.status,
        "closing",
      );
      assert.notEqual((await store.getLane(laneId)).state, "CLOSED");
      await command("CheckCompletion");
      await processNextEffect(store, adapter, new Date().toISOString(), laneId);
      assert.equal(
        (await store.getCompletion(laneId)).completion?.status,
        "closed",
      );
      const jobs =
        await sql`select effect_type, count(*)::int as count from outbox_jobs where lane_id=${laneId} and payload->>'amount' = '342' and effect_type in ('payment.settlement_requested','payment.close_requested') group by effect_type`;
      assert.ok(jobs.every((job) => job.count === 1));
    } finally {
      await store.close();
      await labStore.close();
      await sql.end();
    }
  },
);
