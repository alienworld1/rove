import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { ChargingStore, LabStore } from "@rove/persistence";
import { CorridorLab } from "./corridor-lab.js";
import { composeCorridorOperatingView } from "./corridor-read-model.js";

const databaseUrl = process.env.DATABASE_URL;
const stableId = (value: string) =>
  createHash("sha256").update(value).digest("hex");

test(
  "a lost run-start response retains one durable run and channel set",
  { skip: !databaseUrl },
  async () => {
    const charging = new ChargingStore(databaseUrl!);
    const savedRuns = new LabStore(databaseUrl!);
    try {
      const lab = new CorridorLab(charging, savedRuns);
      const scenario = await lab.seed();
      const runId = randomUUID();
      const first = await lab.start(
        scenario.id,
        scenario.digest,
        undefined,
        runId,
      );
      const retried = await lab.start(
        scenario.id,
        scenario.digest,
        undefined,
        runId,
      );
      assert.equal(retried.run.id, first.run.id);
      assert.deepEqual(retried.run.laneBindings, first.run.laneBindings);
      assert.deepEqual(
        retried.lanes.map((lane) => lane.projection?.channelId),
        first.lanes.map((lane) => lane.projection?.channelId),
      );
      assert.equal(retried.events.length, first.events.length);
      await assert.rejects(
        lab.start(scenario.id, "f".repeat(64), undefined, runId),
      );
      const restored = await lab.view(runId);
      assert.deepEqual(restored.run, retried.run);
      const concurrentId = randomUUID();
      const concurrent = await Promise.all([
        lab.start(scenario.id, scenario.digest, undefined, concurrentId),
        lab.start(scenario.id, scenario.digest, undefined, concurrentId),
      ]);
      assert.ok(concurrent.every((view) => view.run.id === concurrentId));
      const committed = await lab.view(concurrentId);
      assert.equal(Object.keys(committed.run.laneBindings).length, 3);
      assert.equal(committed.events.length, first.events.length);
    } finally {
      await savedRuns.close();
      await charging.close();
    }
  },
);

test(
  "a recovered dispatch uses its committed command once and parallel steps serialize",
  {
    skip:
      !databaseUrl && "Set DATABASE_URL to run PostgreSQL integration checks",
  },
  async () => {
    const charging = new ChargingStore(databaseUrl!);
    const labStore = new LabStore(databaseUrl!);
    const sql = postgres(databaseUrl!);
    try {
      const lab = new CorridorLab(charging, labStore);
      const scenario = await lab.seed();
      const started = await lab.start(scenario.id, scenario.digest);
      const runId = started.run.id;
      const first = await labStore.claimNext(runId, started.run.version);
      assert.ok(first);
      const laneId = started.run.laneBindings["lane-a"];
      const before = await charging.getLane(laneId);
      const commandId = stableId(`${runId}:start-a:command`);
      await labStore.recordEventCommand(
        first.event.id,
        commandId,
        before.version,
      );
      await charging.advanceLane(
        {
          commandId,
          correlationId: stableId(`${runId}:start-a`),
          laneId,
          expectedVersion: before.version,
          now: "2026-01-01T00:00:00.000Z",
          payload: { type: "TickProtectionClock" },
        },
        "corridor-lab",
      );
      const afterDomainCommit = await charging.getLane(laneId);
      await sql`update lab_run_events set lease_until = '2020-01-01T00:00:00Z' where id = ${first.event.id}`;
      await lab.dispatchOne(runId, started.run.version);
      const afterRecovery = await charging.getLane(laneId);
      assert.equal(afterRecovery.version, afterDomainCommit.version);
      const current = await lab.view(runId);
      assert.equal(current.events[0].status, "completed");
      const results = await Promise.allSettled([
        lab.transport(runId, "step", current.run.version),
        lab.transport(runId, "step", current.run.version),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        (await lab.view(runId)).events.filter(
          (event) => event.status === "completed",
        ).length,
        2,
      );
      const ready = await lab.view(runId);
      await assert.rejects(lab.transport(runId, "pause", ready.run.version));
      const running = await lab.transport(runId, "play", ready.run.version);
      await assert.rejects(lab.transport(runId, "step", running.run.version));
      const paused = await lab.transport(runId, "pause", running.run.version);
      assert.equal(paused.run.status, "paused");
      const faster = await lab.transport(runId, "speed", paused.run.version, 4);
      assert.equal(faster.run.speed, 4);
      let completed = faster;
      while (completed.run.status !== "completed")
        completed = await lab.transport(runId, "step", completed.run.version);
      await assert.rejects(lab.transport(runId, "play", completed.run.version));
      const corridorId = completed.lanes[0].projection!.corridorId;
      const live = await composeCorridorOperatingView(
        charging,
        lab,
        corridorId,
      );
      const recorded = await composeCorridorOperatingView(
        charging,
        lab,
        corridorId,
        1000,
      );
      assert.equal(recorded.inspectionTraceOffsetMs, 1000);
      assert.equal(recorded.activeRun?.version, live.activeRun?.version);
      for (const lane of recorded.lanes) {
        const snapshot = [...lane.trace]
          .reverse()
          .find(
            (event) => event.traceOffsetMs! <= 1000 && event.snapshot,
          )?.snapshot;
        assert.ok(snapshot);
        assert.equal(
          lane.projection.trustedDeliveredValue,
          snapshot.trustedDeliveredValue,
        );
        assert.equal(lane.projection.state, snapshot.state);
        assert.ok(
          lane.trace.every(
            (event, index) =>
              index === 0 ||
              event.traceOffsetMs! >= lane.trace[index - 1].traceOffsetMs!,
          ),
        );
      }
      assert.equal(
        recorded.aggregate.trustedDeliveredValue,
        recorded.lanes
          .reduce(
            (sum, lane) => sum + BigInt(lane.projection.trustedDeliveredValue),
            0n,
          )
          .toString(),
      );
      for (const lane of live.lanes) {
        const accepted = lane.trace.find(
          (event) => event.eventType === "meter.evidence_accepted",
        );
        assert.ok(accepted);
        const inspector = await charging.getInspector(
          lane.projection.id,
          accepted.eventId,
        );
        assert.equal(inspector.voucher?.verificationStatus, "verified");
        assert.equal(
          inspector.causalSteps.find((step) => step.type === "voucher")?.status,
          "complete",
        );
      }
      assert.equal((await lab.view(runId)).run.version, completed.run.version);
      await assert.rejects(
        composeCorridorOperatingView(charging, lab, corridorId, 50.5),
      );
      await assert.rejects(
        composeCorridorOperatingView(charging, lab, corridorId, 999),
      );
    } finally {
      await sql.end();
      await labStore.close();
      await charging.close();
    }
  },
);

test(
  "a Lane waiting on payment leaves the next independent Lane eligible",
  {
    skip:
      !databaseUrl && "Set DATABASE_URL to run PostgreSQL integration checks",
  },
  async () => {
    const charging = new ChargingStore(databaseUrl!);
    const labStore = new LabStore(databaseUrl!);
    try {
      const lab = new CorridorLab(charging, labStore);
      const scenario = await lab.seed();
      const started = await lab.start(scenario.id, scenario.digest);
      const claimed = await labStore.claimNext(
        started.run.id,
        started.run.version,
        new Set(["lane-a"]),
      );
      assert.equal(claimed?.event.scenarioEventId, "start-b");
      assert.equal(
        (await labStore.getRun(started.run.id)).events[0].status,
        "pending",
      );
    } finally {
      await labStore.close();
      await charging.close();
    }
  },
);
