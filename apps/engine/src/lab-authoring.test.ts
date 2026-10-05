import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ChargingStore, LabStore } from "@rove/persistence";
import { copyLabScenario, resequenceLabEvents } from "@rove/contracts";
import { northstarVoltwayScenario } from "@rove/lab/scenarios/northstar-voltway";
import { CorridorLab } from "./corridor-lab.js";
import { compileLabScenario } from "@rove/lab";
import { controlledMeterProfiles } from "@rove/lab/scenarios/northstar-voltway";
const url = process.env.DATABASE_URL;
test(
  "admitted snapshots retain the saved identity and digest across draft edits and retries",
  { skip: !url },
  async () => {
    const charging = new ChargingStore(url!);
    const savedRuns = new LabStore(url!);
    try {
      const lab = new CorridorLab(charging, savedRuns);
      const scenario = copyLabScenario(
        northstarVoltwayScenario,
        `scenario-${randomUUID()}`,
      );
      const compiled = compileLabScenario(scenario, controlledMeterProfiles);
      await lab.saveScenario(scenario);
      const changed = { ...scenario, name: "Revised draft" };
      await lab.saveScenario(changed);
      const runId = randomUUID();
      await savedRuns.createRun(compiled, undefined, runId, true);
      const run = await lab.startAdmitted(compiled, runId);
      assert.equal(run.run.scenarioId, scenario.id);
      assert.equal(run.run.scenarioDigest, compiled.digest);
      assert.deepEqual(run.scenario, compiled.definition);
      assert.equal((await lab.startAdmitted(compiled, runId)).run.id, runId);
      await assert.rejects(
        lab.startAdmitted(
          compileLabScenario(changed, controlledMeterProfiles),
          runId,
        ),
      );
    } finally {
      await Promise.all([charging.close(), savedRuns.close()]);
    }
  },
);
test(
  "a paused final reading cannot complete a recovery-required trace",
  { skip: !url },
  async () => {
    const charging = new ChargingStore(url!);
    const savedRuns = new LabStore(url!);
    try {
      const lab = new CorridorLab(charging, savedRuns);
      const scenario = copyLabScenario(
        northstarVoltwayScenario,
        `scenario-${randomUUID()}`,
      );
      scenario.lanes = scenario.lanes.filter((lane) => lane.key === "lane-c");
      scenario.events = scenario.events
        .filter((event) => event.laneKey === "lane-c")
        .map((event) =>
          event.id === "reading-c-2"
            ? { ...event, traceOffsetMs: 10000 }
            : event,
        );
      scenario.events.push({
        id: "stale-before-final",
        laneKey: "lane-c",
        type: "protection_tick",
        traceOffsetMs: 9000,
        sequence: 100,
        durationMs: null,
        parameters: {},
      });
      scenario.events = resequenceLabEvents(scenario.events);
      const saved = await lab.saveScenario(scenario);
      let run = await lab.start(saved.id, saved.digest);
      for (let step = 0; step < scenario.events.length; step++)
        run = await lab.transport(run.run.id, "step", run.run.version);
      assert.equal(run.run.status, "awaiting_chain");
      assert.equal(run.events.at(-1)?.reasonCode, "CONTROL_PAUSE_REQUIRED");
      assert.equal(run.events.at(-1)?.status, "awaiting_chain");
    } finally {
      await Promise.all([charging.close(), savedRuns.close()]);
    }
  },
);
for (const mode of ["matching", "custom"] as const)
  test(
    `v2 one-Lane healthy trace completes with genuine ${mode} CDR reconciliation`,
    { skip: !url },
    async () => {
      const previous = {
        currency: process.env.CDR_CURRENCY,
        asset: process.env.CDR_SETTLEMENT_ASSET_ID,
        party: process.env.CDR_SOURCE_PARTY_ID,
      };
      process.env.CDR_CURRENCY = "USD";
      process.env.CDR_SETTLEMENT_ASSET_ID = "TEST_ASSET";
      process.env.CDR_SOURCE_PARTY_ID = "controlled-cpo";
      const charging = new ChargingStore(url!);
      const savedRuns = new LabStore(url!);
      try {
        const lab = new CorridorLab(charging, savedRuns);
        const scenario = copyLabScenario(
          northstarVoltwayScenario,
          `scenario-${randomUUID()}`,
        );
        scenario.lanes = scenario.lanes.slice(0, 1);
        scenario.events = scenario.events.filter(
          (event) => event.laneKey === "lane-a",
        );
        scenario.terminalCondition = "after_trace";
        if (scenario.schemaVersion === 2)
          scenario.accountingByLane = {
            "lane-a":
              mode === "matching"
                ? { mode }
                : { mode, totalEnergyWh: "99", totalCost: "999" },
          };
        const saved = await lab.saveScenario(scenario);
        let run = await lab.start(saved.id, saved.digest);
        for (let step = 0; step < 20 && run.run.status !== "completed"; step++)
          run = await lab.transport(run.run.id, "step", run.run.version);
        assert.equal(run.run.status, "completed");
        assert.equal(run.lanes.length, 1);
        const laneId = run.run.laneBindings["lane-a"];
        const projection = await charging.getLane(laneId);
        const completed = await lab.finishLane({
          laneId,
          expectedVersion: projection.version,
          commandId: randomUUID(),
          correlationId: run.run.id,
        });
        assert.equal(
          completed.completion?.status,
          mode === "matching" ? "reconciled" : "mismatch",
        );
        assert.equal(completed.canClose, mode === "matching");
        if (mode === "custom") {
          const accounting = await charging.getAccountingRecord(laneId);
          assert.ok(JSON.stringify(accounting).includes("999"));
          assert.notEqual(completed.completion?.finalSettledValue, "999");
        }
      } finally {
        for (const [key, value] of [
          ["CDR_CURRENCY", previous.currency],
          ["CDR_SETTLEMENT_ASSET_ID", previous.asset],
          ["CDR_SOURCE_PARTY_ID", previous.party],
        ] as const) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await Promise.all([charging.close(), savedRuns.close()]);
      }
    },
  );
