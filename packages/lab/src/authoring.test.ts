import assert from "node:assert/strict";
import { test } from "node:test";
import {
  copyLabScenario,
  generateLabReadings,
  resequenceLabEvents,
} from "@rove/contracts";
import {
  northstarVoltwayScenario,
  controlledMeterProfiles,
} from "../scenarios/northstar-voltway.js";
import {
  compileLabScenario,
  LabValidationError,
  runHeadlessScenario,
} from "./index.js";
const v2 = () =>
  copyLabScenario(northstarVoltwayScenario, "scenario-authoring");

test("v1 keeps its compiler version and v2 supports healthy accounting traces", () => {
  const old = compileLabScenario(
    northstarVoltwayScenario,
    controlledMeterProfiles,
  );
  assert.equal(old.compilerVersion, 1);
  assert.equal(
    old.digest,
    "6e496190dc4d38338e3c971798616d7ee36cfe2ec71ea0f702ab8e374ebc3278",
  );
  const healthy = v2();
  healthy.terminalCondition = "after_trace";
  healthy.events = healthy.events.filter((event) =>
    ["session_start", "valid_reading"].includes(event.type),
  );
  const compiled = compileLabScenario(healthy, controlledMeterProfiles);
  assert.equal(compiled.compilerVersion, 2);
  assert.equal(
    old.digest,
    compileLabScenario(
      {
        ...northstarVoltwayScenario,
        events: [...northstarVoltwayScenario.events].reverse(),
      },
      controlledMeterProfiles,
    ).digest,
  );
});
test("reading generation preserves faults, is deterministic, and obeys power bounds", () => {
  const scenario = v2();
  scenario.lanes[2].expectedProofIntervalMs = 500;
  const generated = generateLabReadings(scenario, "lane-c", "350000", 3500);
  assert.deepEqual(
    generated,
    generateLabReadings(scenario, "lane-c", "350000", 3500),
  );
  assert.equal(
    generated.find((event) => event.id === "reading-c-corrupt")?.traceOffsetMs,
    2000,
  );
  assert.equal(
    generated.find((event) => event.id === "reading-c-recovery")?.traceOffsetMs,
    3100,
  );
  assert.ok(
    !generated.some(
      (event) =>
        event.laneKey === "lane-c" &&
        event.type === "valid_reading" &&
        event.traceOffsetMs > 2000 &&
        event.traceOffsetMs < 3100,
    ),
  );
  compileLabScenario(
    { ...scenario, events: generated },
    controlledMeterProfiles,
  );
  assert.throws(
    () => generateLabReadings(scenario, "lane-c", "350001", 3500),
    /Lane maximum/,
  );
  assert.throws(
    () => generateLabReadings(scenario, "lane-c", "1000", 3600000),
    /200 events/,
  );
});
test("headless and interactive compilation share automatic restorations", async () => {
  const scenario = v2();
  scenario.events.push({
    id: "signer-gap",
    laneKey: "lane-a",
    type: "signer_unavailable",
    traceOffsetMs: 1200,
    sequence: 50,
    durationMs: 100,
    parameters: {},
  });
  const compiled = compileLabScenario(scenario, controlledMeterProfiles);
  const readings = generateLabReadings(scenario, "lane-a", "22000", 3500);
  assert.ok(
    !readings.some(
      (event) =>
        event.laneKey === "lane-a" &&
        event.type === "valid_reading" &&
        event.traceOffsetMs === 1200,
    ),
  );
  const dispatched = await runHeadlessScenario(
    compiled,
    async (event) => event.id,
  );
  assert.ok(dispatched.includes("signer-gap:restore"));
  assert.deepEqual(
    dispatched,
    compiled.events.map((event) => event.id),
  );
});
test("timeline errors identify the original event after sorting and reject unsafe relationships", () => {
  const scenario = v2();
  scenario.events = [...scenario.events].reverse();
  const target = scenario.events.find(
    (event) => event.id === "reading-c-recovery",
  )!;
  target.traceOffsetMs = 500;
  assert.throws(
    () => compileLabScenario(scenario, controlledMeterProfiles),
    (error: unknown) =>
      error instanceof LabValidationError &&
      error.issues.some(
        (issue) =>
          issue.eventId === target.id &&
          issue.path ===
            `events.${scenario.events.indexOf(target)}.traceOffsetMs`,
      ),
  );
  const missingStart = v2();
  missingStart.events = missingStart.events.filter(
    (event) => event.id !== "start-c",
  );
  assert.throws(
    () => compileLabScenario(missingStart, controlledMeterProfiles),
    /validation/i,
  );
  const overlap = v2();
  overlap.events.push(
    {
      id: "gap-a",
      laneKey: "lane-c",
      traceOffsetMs: 2100,
      sequence: 50,
      type: "evidence_gap",
      durationMs: 1200,
      parameters: {},
    },
    {
      id: "gap-b",
      laneKey: "lane-c",
      traceOffsetMs: 2200,
      sequence: 51,
      type: "evidence_gap",
      durationMs: 100,
      parameters: {},
    },
  );
  assert.throws(
    () => compileLabScenario(overlap, controlledMeterProfiles),
    (error: unknown) =>
      error instanceof LabValidationError &&
      error.issues.some((issue) => issue.message.includes("overlap")),
  );
  const moved = v2();
  moved.events = resequenceLabEvents(
    moved.events.map((event) =>
      event.id === "reading-c-corrupt"
        ? { ...event, traceOffsetMs: 3200 }
        : event,
    ),
  );
  assert.throws(() => compileLabScenario(moved, controlledMeterProfiles));
});
