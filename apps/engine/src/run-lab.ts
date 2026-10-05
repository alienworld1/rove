import { readFile } from "node:fs/promises";
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
import { createConfiguredTempoChannelAdapter } from "./charging-effects.js";
import { createLiveLabScenario } from "./lab-live-scenario.js";

async function waitForChain(lab: CorridorLab, initial: LabRunView) {
  let view = initial;
  const deadline = Date.now() + 300_000;
  while (
    view.run.status === "awaiting_chain" ||
    view.lanes.some((lane) =>
      lane.projection?.operations.some((operation) =>
        ["pending", "submitted", "failed"].includes(operation.status),
      ),
    )
  ) {
    if (Date.now() >= deadline)
      throw new Error(`PAYMENT_CHAIN_WAIT_TIMEOUT: run ${view.run.id}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    view = await lab.check(view.run.id, view.run.version);
  }
  return view;
}

async function execute(lab: CorridorLab, initial: LabRunView, live = false) {
  let view = initial;
  if (live) view = await waitForChain(lab, view);
  const laneIds = view.lanes.map((lane) => lane.projection?.id);
  assert.equal(new Set(laneIds).size, view.scenario.lanes.length);
  const channelIds = view.lanes.map((lane) => lane.projection?.channelId);
  assert.equal(new Set(channelIds).size, view.scenario.lanes.length);
  const compiled = compileLabScenario(view.scenario, controlledMeterProfiles);
  const outcomes = await runHeadlessScenario(compiled, async (event) => {
    assert.notEqual(view.run.status, "completed");
    if (live) view = await waitForChain(lab, view);
    view = await lab.transport(view.run.id, "step", view.run.version);
    if (live) view = await waitForChain(lab, view);
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
  if (view.scenario.schemaVersion === 1) {
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
  }
  assert.equal(view.run.status, "completed");
  return {
    view,
    laneIds,
    channelIds,
    eventCount: outcomes.length,
    pauseExposure:
      outcomes.find((item) => item.event === "risk-c-boundary")?.exposure ??
      null,
    outcomeDigest: createHash("sha256")
      .update(JSON.stringify(outcomes))
      .digest("hex"),
  };
}

async function verifyLiveRun(
  lab: CorridorLab,
  charging: ChargingStore,
  runId: string,
) {
  const view = await lab.view(runId);
  assert.equal(view.run.status, "completed");
  assert.equal(
    view.events.length,
    compileLabScenario(view.scenario, controlledMeterProfiles).events.length,
  );
  assert.ok(
    view.events.every((event) =>
      [
        "completed",
        "rejected",
        ...(view.scenario.schemaVersion === 2 &&
        view.scenario.terminalCondition === "after_trace"
          ? ["blocked"]
          : []),
      ].includes(event.status),
    ),
  );
  if (view.scenario.schemaVersion === 1) {
    assert.equal(
      view.events.find((event) => event.id === "reading-c-corrupt")?.status,
      "rejected",
    );
    assert.equal(
      view.events.find((event) => event.id === "reading-c-recovery")?.status,
      "completed",
    );
  }
  assert.equal(
    new Set(view.lanes.map((lane) => lane.projection?.id)).size,
    view.scenario.lanes.length,
  );
  assert.equal(
    new Set(view.lanes.map((lane) => lane.projection?.channelId)).size,
    view.scenario.lanes.length,
  );
  const tempo = createConfiguredTempoChannelAdapter();
  const channels = [];
  for (const lane of view.lanes) {
    const projection = lane.projection;
    if (!projection?.channelId?.startsWith("0x"))
      throw new Error(`CHANNEL_MISSING: ${lane.definition.key}`);
    if (view.scenario.terminalCondition === "after_recovery")
      assert.equal(projection.state, "PROTECTED");
    assert.equal(projection.paymentSource, "tempo-adapter");
    assert.ok(
      projection.operations.every(
        (operation) => operation.status === "confirmed",
      ),
    );
    const chain = await tempo.readChannel(
      projection.channelId as `0x${string}`,
    );
    assert.equal(chain.confirmedDeposit, projection.confirmedDeposit);
    assert.equal(chain.settledValue, projection.settledValue);
    channels.push({
      lane: lane.definition.key,
      channelId: chain.channelId,
      confirmedDeposit: chain.confirmedDeposit,
      settledValue: chain.settledValue,
      chainHeight: chain.chainHeight,
    });
  }
  if (view.scenario.schemaVersion === 1) {
    const laneC = view.lanes.find((lane) => lane.definition.key === "lane-c")!;
    assert.equal(laneC.projection?.trustedDeliveredValue, "342");
    assert.equal(laneC.projection?.protectedValue, "342");
    assert.equal(laneC.projection?.unprotectedExposureBound, "0");
    assert.ok(
      laneC.projection?.operations.some((item) => item.type === "top_up"),
    );
    assert.ok(
      view.lanes.some((lane) =>
        lane.projection?.operations.some((item) => item.type === "settle"),
      ),
    );
    const history = await charging.getHistory(laneC.projection!.id);
    assert.ok(
      history.some(
        (event) =>
          event.type === "meter.evidence_rejected" &&
          event.reasonCode === "EVIDENCE_SIGNATURE_INVALID",
      ),
    );
    assert.equal(
      history.filter((event) => event.type === "pause.requested").length,
      1,
    );
    assert.ok(
      history.some((event) => event.type === "lane.protection_restored"),
    );
  }
  return {
    result: "verified",
    payment: "Tempo testnet confirmed",
    runId,
    channels,
  };
}

async function main() {
  const config = readBaseConfig();
  if (!config.DATABASE_URL || config.NODE_ENV !== "development")
    throw new Error("A local development database is required.");
  const live = process.argv.includes("--live");
  const fileIndex = process.argv.indexOf("--scenario-file");
  const scenarioFile = fileIndex < 0 ? undefined : process.argv[fileIndex + 1];
  if (fileIndex >= 0 && !scenarioFile)
    throw new Error("Choose a scenario JSON file.");
  const verifyIndex = process.argv.indexOf("--verify");
  const verifyRunId =
    verifyIndex < 0 ? undefined : process.argv[verifyIndex + 1];
  if (verifyIndex >= 0 && (!live || !verifyRunId))
    throw new Error(
      "Use --live --verify <run ID> to check a completed Tempo run.",
    );
  const resumeIndex = process.argv.indexOf("--resume");
  const resumeRunId =
    resumeIndex < 0 ? undefined : process.argv[resumeIndex + 1];
  if (resumeIndex >= 0 && (!live || !resumeRunId))
    throw new Error("Use --live --resume <run ID> to continue a Tempo run.");
  if (verifyRunId && resumeRunId)
    throw new Error("Choose either --verify or --resume.");
  const charging = new ChargingStore(config.DATABASE_URL);
  const labStore = new LabStore(config.DATABASE_URL);
  try {
    const lab = new CorridorLab(charging, labStore);
    if (verifyRunId) {
      process.stdout.write(
        `${JSON.stringify(await verifyLiveRun(lab, charging, verifyRunId))}\n`,
      );
      return;
    }
    const existing = resumeRunId ? await lab.view(resumeRunId) : null;
    if (existing && existing.events.some((event) => event.status !== "pending"))
      throw new Error(
        "This run already has dispatched events; inspect it before continuing.",
      );
    const scenario = existing
      ? { id: existing.scenario.id, digest: existing.run.scenarioDigest }
      : scenarioFile
        ? await lab.saveScenario(
            JSON.parse(await readFile(scenarioFile, "utf8")),
          )
        : live
          ? await lab.saveScenario(createLiveLabScenario())
          : await lab.seed();
    if (process.argv.includes("seed")) {
      process.stdout.write(
        `${JSON.stringify({ result: "saved", scenario: scenario.id, digest: scenario.digest })}\n`,
      );
      return;
    }
    const initial = existing ?? (await lab.start(scenario.id, scenario.digest));
    if (live)
      process.stdout.write(
        `${JSON.stringify({ result: existing ? "resumed" : "started", runId: initial.run.id, scenario: scenario.id, payment: "Tempo testnet" })}\n`,
      );
    const first = await execute(lab, initial, live);
    if (first.view.scenario.schemaVersion === 1)
      assert.equal(
        (
          await charging.getHistory(first.view.run.laneBindings["lane-c"])
        ).filter((event) => event.type === "pause.requested").length,
        1,
      );
    let replay: { runId: string; outcomeDigest: string } | undefined;
    if (process.argv.includes("--compare") && !live) {
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
      `${JSON.stringify({ result: "passed", payment: live ? "Tempo testnet confirmed" : "local deterministic", scenario: scenario.id, runId: first.view.run.id, laneIds: first.laneIds, channelIds: first.channelIds, eventCount: first.eventCount, pauseExposure: first.pauseExposure, outcomeDigest: first.outcomeDigest, replay })}\n`,
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
