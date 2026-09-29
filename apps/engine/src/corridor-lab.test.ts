import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { ChargingStore, LabStore } from "@rove/persistence";
import { CorridorLab } from "./corridor-lab.js";

const databaseUrl = process.env.DATABASE_URL;
const stableId = (value: string) =>
  createHash("sha256").update(value).digest("hex");

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
