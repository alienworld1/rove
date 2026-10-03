import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { LabScenarioEvent } from "@rove/contracts";
import { ChargingStore, LabStore } from "@rove/persistence";
import { northstarVoltwayScenario } from "@rove/lab/scenarios/northstar-voltway";
import { CorridorLab } from "./corridor-lab.js";

const databaseUrl = process.env.DATABASE_URL;
const faults = [
  ["corrupt_signature", "EVIDENCE_SIGNATURE_INVALID"],
  ["wrong_meter", "EVIDENCE_SOURCE_MISMATCH"],
  ["replay_reading", "EVIDENCE_REPLAY"],
  ["sequence_break", "EVIDENCE_SEQUENCE_INVALID"],
  ["evidence_gap", "EVIDENCE_UNTRUSTED_OR_STALE"],
  ["signer_unavailable", "PAYMENT_SIGNER_UNAVAILABLE"],
  ["top_up_failure", "PAYMENT_TOPUP_FAILED"],
  ["tempo_unavailable", "PAYMENT_CHAIN_STATE_UNAVAILABLE"],
] as const;

for (const [fault, reason] of faults) {
  test(
    `${fault} retains trusted protection, records its reason, and isolates recovery`,
    { skip: !databaseUrl },
    async () => {
      const charging = new ChargingStore(databaseUrl!);
      const savedRuns = new LabStore(databaseUrl!);
      try {
        const lab = new CorridorLab(charging, savedRuns);
        const definition = structuredClone(northstarVoltwayScenario);
        definition.id = `fault-${randomUUID()}`;
        const sourceFault = [
          "signer_unavailable",
          "top_up_failure",
          "tempo_unavailable",
        ].includes(fault);
        if (sourceFault)
          definition.events.push({
            id: "source-unavailable",
            laneKey: "lane-c",
            traceOffsetMs: 1500,
            sequence: 30,
            type: fault,
            parameters: {},
            durationMs: fault === "top_up_failure" ? null : 1000,
          } as LabScenarioEvent);
        else {
          const event = definition.events.find(
            (event) => event.id === "reading-c-corrupt",
          )!;
          event.type = fault;
          if (fault === "replay_reading") event.parameters = {};
          if (fault === "evidence_gap") {
            event.parameters = {};
            event.durationMs = 100;
          }
          if (fault === "replay_reading")
            definition.corridor.protectionPolicy.evidenceMaxAgeMs = 2000;
        }
        const scenario = await lab.saveScenario(definition);
        let view = await lab.start(scenario.id, scenario.digest);
        let rejected = false;
        for (
          let step = 0;
          step < 40 && view.run.status !== "completed";
          step++
        ) {
          const prior = view;
          view = await lab.transport(view.run.id, "step", view.run.version);
          const committed = view.events.find(
            (event) => event.sequence === prior.run.cursor,
          );
          if (
            committed?.id === "reading-c-corrupt" &&
            !sourceFault &&
            fault !== "evidence_gap"
          ) {
            rejected = true;
            assert.equal(committed.reasonCode, reason);
            assert.equal(
              view.lanes[2].projection!.trustedDeliveredValue,
              prior.lanes[2].projection!.trustedDeliveredValue,
            );
            assert.equal(
              view.lanes[2].projection!.authorizedValue,
              prior.lanes[2].projection!.authorizedValue,
            );
          }
        }
        assert.equal(view.run.status, "completed");
        if (!sourceFault && fault !== "evidence_gap")
          assert.equal(rejected, true);
        const history = await charging.getHistory(
          view.run.laneBindings["lane-c"],
        );
        assert.ok(
          history.some((event) => event.reasonCode === reason),
          `Missing ${reason}`,
        );
        assert.equal(view.lanes[2].projection!.state, "PROTECTED");
        assert.equal(view.lanes[0].projection!.trustedDeliveredValue, "28");
        assert.equal(view.lanes[1].projection!.trustedDeliveredValue, "180");
        for (const lane of view.lanes.slice(0, 2)) {
          const unaffected = await charging.getHistory(lane.projection!.id);
          assert.ok(unaffected.every((event) => event.reasonCode !== reason));
        }
      } finally {
        await savedRuns.close();
        await charging.close();
      }
    },
  );
}
