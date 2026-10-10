import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postgres from "postgres";
import type { LaneCommandInput } from "@rove/contracts";
import { ChargingStore, StoreError } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;
const fixture = JSON.parse(
  readFileSync(
    new URL("../../evidence/fixtures/safe-ocmf-example.json", import.meta.url),
    "utf8",
  ),
) as {
  raw: string;
  publicKeyHex: string;
  transportSessionId: string;
};
const when = "2019-08-13T10:03:37.000Z";

test(
  "health bypasses a saturated charging connection pool",
  {
    skip:
      !databaseUrl && "Set DATABASE_URL to run PostgreSQL integration checks",
  },
  async () => {
    const store = new ChargingStore(databaseUrl!);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    let allStarted!: () => void;
    const ready = new Promise<void>((resolve) => {
      allStarted = resolve;
    });
    const reads = Array.from({ length: 3 }, () =>
      store.consistentRead(async () => {
        if (++started === 3) allStarted();
        await held;
      }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await ready;
      await Promise.race([
        store.health(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Health queued behind reads")),
            4_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      release();
      await Promise.allSettled(reads);
      await store.close();
    }
  },
);

function command(
  laneId: string,
  version: number,
  payload: LaneCommandInput["payload"],
  now = when,
): LaneCommandInput {
  return {
    commandId: randomUUID(),
    correlationId: randomUUID(),
    laneId,
    expectedVersion: version,
    now,
    payload,
  };
}

test(
  "durable charging commands, concurrency, audit and outbox rollback",
  {
    skip:
      !databaseUrl && "Set DATABASE_URL to run PostgreSQL integration checks",
  },
  async () => {
    const store = new ChargingStore(databaseUrl!);
    const inspect = postgres(databaseUrl!);
    try {
      const create = {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        name: "Local charging",
        payerEmsp: "payer",
        payeeCpo: "payee",
        settlementAssetId: "asset",
        tempoNetwork: "test-network",
        tariff: { perKwh: "1000", tariffDecimals: 0, assetDecimals: 0 },
        protectionPolicy: {
          warningThreshold: "20",
          riskThreshold: "50",
          maxUnprotectedExposure: "100",
          evidenceMaxAgeMs: 60_000,
          chainMaxAgeMs: 60_000,
          zeroGrace: false,
          lowHeadroomThreshold: "1",
        },
        reservePolicy: { initialDeposit: "500", topUpIncrement: "200" },
        settlementPolicy: {
          minimumIntervalMs: 1000,
          minimumUnsettledProtectedValue: "100",
        },
        meters: [
          {
            meterId: "17619300",
            publicKeyHex: fixture.publicKeyHex,
            fingerprint: "published-fixture",
            source: "controlled-fixture" as const,
          },
        ],
      };
      const corridor = await store.createCorridor(create, "local-simulation");
      assert.equal(
        (await store.createCorridor(create, "local-simulation")).id,
        corridor.id,
      );
      const start = {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        corridorId: corridor.id,
        externalSessionId: `29-${randomUUID()}`,
        chargerId: "charger",
        meterId: "17619300",
        maxPowerWatts: "3600",
        expectedProofIntervalMs: 1000,
      };
      const started = await store.startLane(start, "local-simulation");
      assert.equal(started.version, 0);
      assert.equal(
        (await store.getLane(started.id)).meterSource,
        "controlled-fixture",
      );
      assert.equal((await store.getLane(started.id)).confirmedDeposit, null);
      assert.equal((await store.getCorridor(corridor.id)).name, create.name);
      const evidence = command(started.id, 0, {
        type: "ObserveEvidence",
        raw: fixture.raw,
        transportSessionId: "wrong-session",
      });
      const rejected = await store.advanceLane(evidence, "local-simulation");
      assert.equal(
        (await store.getLane(started.id)).trustedDeliveredValue,
        "0",
      );
      assert.equal(rejected.version, 1);
      const rejectedEvent = (await store.getHistory(started.id)).find(
        (event) => event.evidenceHash !== null,
      );
      assert.ok(rejectedEvent);
      assert.equal(rejectedEvent.snapshot?.trustedDeliveredValue, "0");
      assert.equal(rejectedEvent.snapshot?.version, rejected.version);
      const consistent = await store.consistentRead(async (snapshot) => ({
        lane: await snapshot.getLane(started.id),
        history: await snapshot.getHistory(started.id),
      }));
      assert.equal(
        consistent.history.at(-1)?.snapshot?.version,
        consistent.lane.version,
      );
      assert.deepEqual(
        await store.getHistory(started.id, consistent.lane),
        consistent.history,
      );
      await assert.rejects(
        store.getHistory(started.id, {
          ...consistent.lane,
          id: "another-lane",
        }),
        (error: unknown) =>
          error instanceof StoreError && error.code === "VALIDATION",
      );
      const rejectedTrace = await store.getInspector(
        started.id,
        rejectedEvent.id,
      );
      assert.equal(rejectedTrace.evidence?.accepted, false);
      assert.equal(rejectedTrace.evidence?.raw, null);
      assert.equal(
        rejectedTrace.causalSteps.find((step) => step.type === "verification")
          ?.status,
        "rejected",
      );
      assert.equal(
        rejectedTrace.causalSteps.find((step) => step.type === "calculation")
          ?.status,
        "complete",
      );
      assert.ok(rejectedTrace.calculation?.snapshot);
      for (const type of ["voucher", "payment"] as const)
        assert.equal(
          rejectedTrace.causalSteps.find((step) => step.type === type)?.status,
          "not_applicable",
        );
      const acceptedSession = `accepted-${randomUUID()}`;
      const acceptedLane = await store.startLane(
        {
          ...start,
          commandId: randomUUID(),
          externalSessionId: acceptedSession,
        },
        "local-simulation",
      );
      const accepted = command(acceptedLane.id, 0, {
        type: "ObserveEvidence",
        raw: fixture.raw,
        transportSessionId: acceptedSession,
      });
      const acceptedResult = await store.advanceLane(
        accepted,
        "local-simulation",
      );
      assert.equal(
        (await store.getLane(acceptedLane.id)).trustedDeliveredValue,
        "259",
      );
      await assert.rejects(
        store.getInspector(acceptedLane.id, rejectedEvent.id),
        (error) => error instanceof StoreError && error.code === "NOT_FOUND",
      );
      const presentation = await store.getPresentationEvents(corridor.id, 0);
      assert.equal(await store.getPresentationReplayFloor(corridor.id), 0);
      assert.ok(presentation.length >= 4);
      assert.ok(
        presentation.every(
          (event, index) =>
            index === 0 ||
            Number(event.id) > Number(presentation[index - 1].id),
        ),
      );
      assert.ok(
        (
          await store.getPresentationEvents(
            corridor.id,
            Number(presentation.at(-1)!.id),
          )
        ).length === 0,
      );
      const eventCount = Number(
        (
          await inspect`select count(*) as total from domain_events where lane_id = ${acceptedLane.id}`
        )[0].total,
      );
      assert.deepEqual(
        await store.advanceLane(accepted, "local-simulation"),
        acceptedResult,
      );
      assert.equal(
        Number(
          (
            await inspect`select count(*) as total from domain_events where lane_id = ${acceptedLane.id}`
          )[0].total,
        ),
        eventCount,
      );
      await assert.rejects(
        store.advanceLane(
          { ...accepted, payload: { type: "TickProtectionClock" } },
          "local-simulation",
        ),
        (error) => error instanceof StoreError && error.code === "CONFLICT",
      );
      await assert.rejects(
        store.advanceLane(
          command(acceptedLane.id, 0, { type: "TickProtectionClock" }),
          "local-simulation",
        ),
        (error) =>
          error instanceof StoreError && error.code === "VERSION_CONFLICT",
      );
      const channelId = `channel-${randomUUID()}`;
      const digest = `0x${createHash("sha256").update(channelId).digest("hex")}`;
      const pay = command(acceptedLane.id, 1, {
        type: "ObservePayment",
        channelId,
        network: "test-network",
        assetId: "asset",
        observedAt: when,
        confirmedDeposit: "500",
        settledValue: "0",
        chainHeight: "1",
      });
      await store.advanceLane(pay, "local-simulation", {
        type: "PaymentObserved",
        source: "local-simulation",
        channelId,
        network: "test-network",
        assetId: "asset",
        observedAt: when,
        confirmedDeposit: "500",
        settledValue: "0",
        chainHeight: "1",
      });
      assert.equal(
        (await store.getLane(acceptedLane.id)).state,
        "INITIALIZING",
      );
      await store.advanceLane(
        command(acceptedLane.id, 2, { type: "TickProtectionClock" }),
        "local-simulation",
        { type: "VoucherVerified", cumulativeAmount: "259", digest },
        undefined,
        undefined,
        {
          channelId,
          cumulativeAmount: "259",
          digest,
          signature: `0x${"11".repeat(65)}`,
          signerRef: "local-simulation",
          domainRef: "local-simulation",
        },
      );
      assert.equal((await store.getLane(acceptedLane.id)).state, "PROTECTED");
      assert.equal(
        (await store.getLane(acceptedLane.id)).paymentSource,
        "local-simulation",
      );
      const stale = command(
        acceptedLane.id,
        3,
        { type: "TickProtectionClock" },
        "2019-08-13T10:04:38.000Z",
      );
      await store.advanceLane(stale, "local-simulation");
      const fail = command(
        acceptedLane.id,
        4,
        { type: "TickProtectionClock" },
        "2019-08-13T10:05:16.000Z",
      );
      const beforeFailure = (
        await inspect`select
        (select count(*) from domain_events where lane_id = ${acceptedLane.id}) as events,
        (select count(*) from audit_projection where lane_id = ${acceptedLane.id}) as audits,
        (select count(*) from outbox_jobs where lane_id = ${acceptedLane.id}) as jobs`
      )[0];
      await assert.rejects(
        store.advanceLane(fail, "local-simulation", undefined, () => {
          throw new Error("INJECTED_FAILURE");
        }),
        /INJECTED_FAILURE/,
      );
      assert.equal((await store.getLane(acceptedLane.id)).version, 4);
      const afterFailure = (
        await inspect`select
        (select count(*) from domain_events where lane_id = ${acceptedLane.id}) as events,
        (select count(*) from audit_projection where lane_id = ${acceptedLane.id}) as audits,
        (select count(*) from outbox_jobs where lane_id = ${acceptedLane.id}) as jobs`
      )[0];
      assert.deepEqual(afterFailure, beforeFailure);
      const paused = await store.advanceLane(fail, "local-simulation");
      assert.equal(paused.state, "PAUSE_REQUIRED");
      assert.equal(
        (await store.getLane(acceptedLane.id)).unprotectedExposureBound,
        "100",
      );
      const restartedStore = new ChargingStore(databaseUrl!);
      await inspect`update outbox_jobs set status = 'completed' where lane_id = ${acceptedLane.id} and effect_type <> 'pause.requested'`;
      const job = await restartedStore.claimOutbox(
        fail.now!,
        30_000,
        acceptedLane.id,
      );
      assert.equal(job?.effectType, "pause.requested");
      assert.equal(
        await restartedStore.claimOutbox(fail.now!, 30_000, acceptedLane.id),
        null,
      );
      await restartedStore.finishOutbox(
        job!.id,
        job!.leaseToken!,
        "submitted",
        fail.now!,
        "external-ref",
      );
      const reclaimed = await restartedStore.claimOutbox(
        fail.now!,
        30_000,
        acceptedLane.id,
      );
      assert.equal(reclaimed?.externalReference, "external-ref");
      await assert.rejects(
        restartedStore.finishOutbox(
          job!.id,
          job!.leaseToken!,
          "completed",
          fail.now!,
        ),
        (error) => error instanceof StoreError && error.code === "CONFLICT",
      );
      await restartedStore.close();
      const sameVersion = command(
        acceptedLane.id,
        5,
        { type: "TickProtectionClock" },
        "2019-08-13T10:05:18.000Z",
      );
      const other = command(
        acceptedLane.id,
        5,
        { type: "TickProtectionClock" },
        "2019-08-13T10:05:18.000Z",
      );
      const concurrent = await Promise.allSettled([
        store.advanceLane(sameVersion, "local-simulation"),
        store.advanceLane(other, "local-simulation"),
      ]);
      assert.equal(
        concurrent.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        concurrent.filter((result) => result.status === "rejected").length,
        1,
      );
      const repeated = command(
        acceptedLane.id,
        6,
        { type: "TickProtectionClock" },
        "2019-08-13T10:05:19.000Z",
      );
      const [firstRetry, secondRetry] = await Promise.all([
        store.advanceLane(repeated, "local-simulation"),
        store.advanceLane(repeated, "local-simulation"),
      ]);
      assert.deepEqual(firstRetry, secondRetry);
      assert.equal(firstRetry.version, 7);
      let arrived = 0;
      let release!: () => void;
      const bothLocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const beforePersist = async () => {
        if (++arrived === 2) release();
        await Promise.race([
          bothLocked,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("LANES_SERIALIZED")), 2_000),
          ),
        ]);
      };
      const independent = await Promise.all([
        store.advanceLane(
          command(started.id, 1, { type: "TickProtectionClock" }),
          "local-simulation",
          undefined,
          undefined,
          beforePersist,
        ),
        store.advanceLane(
          command(
            acceptedLane.id,
            7,
            { type: "TickProtectionClock" },
            "2019-08-13T10:05:20.000Z",
          ),
          "local-simulation",
          undefined,
          undefined,
          beforePersist,
        ),
      ]);
      assert.deepEqual(
        independent.map((result) => result.version),
        [2, 8],
      );
    } finally {
      await inspect.end();
      await store.close();
    }
  },
);
