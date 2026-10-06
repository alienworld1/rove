import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ChargingStore, LabStore } from "@rove/persistence";
import { CorridorLab } from "./corridor-lab.js";
import { processNextEffect } from "./outbox-worker.js";
import { createLocalLabPaymentAdapter } from "./lab-payment.js";

const url = process.env.DATABASE_URL;
test(
  "guided presentation survives reload, exposes the bound, and closes all three Lanes with Tempo accounting configured",
  { skip: !url },
  async () => {
    process.env.CDR_CURRENCY = "USD";
    process.env.CDR_SETTLEMENT_ASSET_ID = "tempo-asset";
    process.env.CDR_SOURCE_PARTY_ID = "controlled-cpo";
    const charging = new ChargingStore(url!);
    const runs = new LabStore(url!);
    try {
      let lab = new CorridorLab(charging, runs);
      await lab.seed();
      const scenario = await lab.getScenario("northstar-voltway-presentation");
      let view = await lab.start(
        scenario.id,
        scenario.digest,
        undefined,
        randomUUID(),
        false,
        "guided",
      );
      let pauseEvent: { laneId: string; eventId: string } | undefined;
      const holds = new Set<string>();
      const speeds = [0.25, 0.5, 1, 2, 4];
      for (
        let index = 0;
        index < 200 && view.run.status !== "completed";
        index++
      ) {
        if (view.run.guidance?.active) {
          const active = view.run.guidance.active;
          holds.add(active);
          const held = view.run.guidance.reached.find(
            (item) => item.id === active,
          )!;
          if (active === "pause") {
            pauseEvent = held;
            const inspector = await charging.getInspector(
              held.laneId,
              held.eventId,
            );
            assert.equal(inspector.result.state, "PAUSE_REQUIRED");
            assert.equal(inspector.calculation?.snapshot?.remainingMargin, "0");
            assert.ok(inspector.calculation?.snapshot?.lastTrustedEvidenceAt);
          }
          lab = new CorridorLab(charging, runs);
          const restored = await lab.view(view.run.id);
          assert.equal(restored.run.guidance?.active, active);
          const changedSpeed = await lab.transport(
            view.run.id,
            "speed",
            restored.run.version,
            speeds[(holds.size - 1) % speeds.length],
          );
          assert.equal(changedSpeed.run.guidance?.active, active);
          view = await lab.transport(
            view.run.id,
            "step",
            changedSpeed.run.version,
          );
        } else
          view = await lab.transport(view.run.id, "step", view.run.version);
      }
      assert.equal(view.run.status, "completed");
      for (const id of [
        "accepted",
        "top_up",
        "settled",
        "rejected",
        "risk",
        "pause",
        "recovered",
      ])
        assert.ok(holds.has(id), `missing ${id}`);
      const recordedRisk = view.run.guidance!.reached.find(
        (item) => item.id === "risk",
      )!;
      const recordedRejection = view.run.guidance!.reached.find(
        (item) => item.id === "rejected",
      )!;
      assert.ok(recordedRisk.traceOffsetMs > recordedRejection.traceOffsetMs);
      let continuous = await lab.start(scenario.id, scenario.digest);
      for (
        let index = 0;
        index < 200 && continuous.run.status !== "completed";
        index++
      )
        continuous = await lab.transport(
          continuous.run.id,
          "step",
          continuous.run.version,
        );
      assert.equal(continuous.run.status, "completed");
      for (const key of Object.keys(view.run.laneBindings)) {
        const guidedLane = await charging.getLane(view.run.laneBindings[key]);
        const continuousLane = await charging.getLane(
          continuous.run.laneBindings[key],
        );
        for (const field of [
          "trustedEnergyWh",
          "trustedDeliveredValue",
          "protectedValue",
          "settledValue",
          "confirmedDeposit",
        ] as const)
          assert.equal(
            guidedLane[field],
            continuousLane[field],
            `${key} ${field}`,
          );
      }
      for (const laneId of Object.values(view.run.laneBindings)) {
        let projection = await charging.getLane(laneId);
        const stoppedAt = new Date(
          Date.parse(view.scenario.traceEpoch) + view.run.traceOffsetMs + 1,
        ).toISOString();
        // A restart after cessation must resume final evidence and accounting.
        await charging.advanceLane(
          {
            commandId: randomUUID(),
            correlationId: randomUUID(),
            laneId,
            expectedVersion: projection.version,
            now: stoppedAt,
            payload: {
              type: "CompleteLane",
              serviceStartedAt: view.scenario.traceEpoch,
              serviceEndedAt: stoppedAt,
              endSource: "controlled_twin",
            },
          },
          "corridor-lab",
        );
        assert.equal((await charging.getCompletion(laneId)).canFinish, true);
        lab = new CorridorLab(charging, runs);
        projection = await charging.getLane(laneId);
        const finished = await lab.finishLane({
          commandId: randomUUID(),
          correlationId: randomUUID(),
          laneId,
          expectedVersion: projection.version,
        });
        assert.equal(finished.completion?.comparison?.status, "MATCH");
        await charging.advanceLane(
          {
            commandId: randomUUID(),
            correlationId: randomUUID(),
            laneId,
            expectedVersion: finished.version,
            now: finished.completion!.serviceEndedAt,
            payload: { type: "CloseChannel" },
          },
          "demo-session",
        );
        await processNextEffect(
          charging,
          createLocalLabPaymentAdapter(
            charging,
            finished.completion!.serviceEndedAt,
          ),
          new Date().toISOString(),
          laneId,
        );
        const closed = await charging.getCompletion(laneId);
        assert.equal(closed.completion?.status, "closed");
        assert.notEqual(closed.completion?.closure?.confirmedRefund, null);
      }
      const historical = await charging.getInspector(
        pauseEvent!.laneId,
        pauseEvent!.eventId,
      );
      assert.equal(historical.calculation?.snapshot?.remainingMargin, "0");
      assert.equal(historical.result.state, "PAUSE_REQUIRED");
      await lab.saveScenario({
        ...view.scenario,
        description: "Updated scenario description",
      });
      const replay = await lab.transport(
        view.run.id,
        "reset",
        (await lab.view(view.run.id)).run.version,
      );
      assert.equal(replay.run.scenarioDigest, view.run.scenarioDigest);
      assert.equal(replay.run.replayOfRunId, view.run.id);
      assert.equal(replay.run.guidance?.mode, "guided");
      assert.deepEqual(replay.run.guidance?.reached, []);
      const short = await lab.saveScenario({
        ...view.scenario,
        id: randomUUID(),
        events: view.scenario.events.filter(
          (event) => event.traceOffsetMs <= 60_001,
        ),
      });
      let terminal = await lab.start(
        short.id,
        short.digest,
        undefined,
        undefined,
        false,
        "guided",
      );
      let heldAtEnd = false;
      for (
        let index = 0;
        index < 200 && terminal.run.status !== "completed";
        index++
      ) {
        if (terminal.run.guidance?.active === "recovered") {
          heldAtEnd = true;
          assert.equal(terminal.run.status, "paused");
          assert.equal(terminal.run.traceOffsetMs, 60_001);
        }
        terminal = await lab.transport(
          terminal.run.id,
          "step",
          terminal.run.version,
        );
      }
      assert.ok(heldAtEnd);
      assert.equal(terminal.run.status, "completed");
    } finally {
      await charging.close();
      await runs.close();
    }
  },
);
