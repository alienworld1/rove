import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { LabRunView } from "@rove/contracts";
import { readBaseConfig } from "@rove/config";
import { ChargingStore, LabStore } from "@rove/persistence";
import { compileLabScenario, runHeadlessScenario } from "@rove/lab";
import {
  controlledMeterProfiles,
  northstarVoltwayScenario,
} from "@rove/lab/scenarios/northstar-voltway";
import { CorridorLab } from "./corridor-lab.js";

async function execute(lab: CorridorLab, initial: LabRunView) {
  let view = initial;
  const laneIds = view.lanes.map((lane) => lane.projection?.id);
  assert.equal(new Set(laneIds).size, 3);
  const channelIds = view.lanes.map((lane) => lane.projection?.channelId);
  assert.equal(new Set(channelIds).size, 3);
  const compiled = compileLabScenario(
    northstarVoltwayScenario,
    controlledMeterProfiles,
  );
  const outcomes = await runHeadlessScenario(compiled, async (event) => {
    assert.notEqual(view.run.status, "completed");
    view = await lab.transport(view.run.id, "step", view.run.version);
    const lane = view.lanes.find(
      (item) => item.definition.key === event.laneKey,
    );
    return {
      event: event.id,
      lane: event.laneKey,
      state: lane?.projection?.state,
      trusted: lane?.projection?.trustedDeliveredValue,
      protected: lane?.projection?.protectedValue,
      exposure: lane?.projection?.unprotectedExposureBound,
    };
  });
  const corrupt = outcomes.find((item) => item.event === "reading-c-corrupt");
  const before = outcomes.find((item) => item.event === "risk-c-before");
  const boundary = outcomes.find((item) => item.event === "risk-c-boundary");
  const recovered = outcomes.find((item) => item.event === "risk-c-restored");
  assert.equal(corrupt?.trusted, "324");
  assert.equal(corrupt?.protected, "324");
  assert.equal(before?.exposure, "699");
  assert.equal(boundary?.exposure, "700");
  assert.equal(boundary?.state, "PAUSE_REQUIRED");
  assert.equal(boundary?.trusted, "324");
  assert.equal(boundary?.protected, "324");
  assert.equal(recovered?.state, "PROTECTED");
  assert.equal(view.run.status, "completed");
  assert.ok(
    outcomes.findIndex((item) => item.event === "reading-b-3") >
      outcomes.findIndex((item) => item.event === "reading-c-corrupt"),
  );
  assert.ok(
    BigInt(outcomes.find((item) => item.event === "reading-b-3")!.trusted!) >
      BigInt(outcomes.find((item) => item.event === "reading-b-2")!.trusted!),
  );
  assert.ok(
    view.lanes[2].projection?.operations.some(
      (item) => item.type === "top_up" && item.status === "confirmed",
    ),
  );
  assert.ok(
    view.lanes.some((lane) =>
      lane.projection?.operations.some(
        (item) => item.type === "settle" && item.status === "confirmed",
      ),
    ),
  );
  return {
    view,
    laneIds,
    channelIds,
    eventCount: outcomes.length,
    pauseExposure: boundary.exposure,
    outcomeDigest: createHash("sha256")
      .update(JSON.stringify(outcomes))
      .digest("hex"),
  };
}

async function main() {
  const config = readBaseConfig();
  if (!config.DATABASE_URL || config.NODE_ENV !== "development")
    throw new Error("A local development database is required.");
  if (process.argv.includes("--live")) {
    process.stdout.write(
      "Live Tempo acceptance requires three approved evidence identities and a funded test configuration. This run is local and deterministic.\n",
    );
    process.exitCode = 2;
    return;
  }
  const charging = new ChargingStore(config.DATABASE_URL);
  const labStore = new LabStore(config.DATABASE_URL);
  try {
    const lab = new CorridorLab(charging, labStore);
    const scenario = await lab.seed();
    if (process.argv.includes("seed")) {
      process.stdout.write(
        `${JSON.stringify({ result: "saved", scenario: scenario.id, digest: scenario.digest })}\n`,
      );
      return;
    }
    const first = await execute(
      lab,
      await lab.start(scenario.id, scenario.digest),
    );
    assert.equal(
      (await charging.getHistory(first.view.run.laneBindings["lane-c"])).filter(
        (event) => event.type === "pause.requested",
      ).length,
      1,
    );
    let replay: { runId: string; outcomeDigest: string } | undefined;
    if (process.argv.includes("--compare")) {
      const second = await execute(
        lab,
        await lab.transport(first.view.run.id, "reset", first.view.run.version),
      );
      assert.notEqual(second.view.run.id, first.view.run.id);
      assert.notDeepEqual(second.laneIds, first.laneIds);
      assert.notDeepEqual(second.channelIds, first.channelIds);
      assert.equal(second.outcomeDigest, first.outcomeDigest);
      replay = {
        runId: second.view.run.id,
        outcomeDigest: second.outcomeDigest,
      };
    }
    process.stdout.write(
      `${JSON.stringify({ result: "passed", payment: "local deterministic", scenario: scenario.id, runId: first.view.run.id, laneIds: first.laneIds, channelIds: first.channelIds, eventCount: first.eventCount, pauseExposure: first.pauseExposure, outcomeDigest: first.outcomeDigest, replay })}\n`,
    );
  } finally {
    await labStore.close();
    await charging.close();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Lab run failed"}\n`,
  );
  process.exitCode = 1;
});
