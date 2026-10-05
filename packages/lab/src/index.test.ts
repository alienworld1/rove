import assert from "node:assert/strict";
import { test } from "node:test";
import {
  controlledMeterProfiles,
  northstarVoltwayScenario,
} from "../scenarios/northstar-voltway.js";
import {
  compileLabScenario,
  LabValidationError,
  nextEventDelayMs,
  runHeadlessScenario,
  traceInstant,
} from "./index.js";

test("equivalent scenario order produces one digest and stable trace instants", () => {
  const first = compileLabScenario(
    northstarVoltwayScenario,
    controlledMeterProfiles,
  );
  const reordered = compileLabScenario(
    {
      ...northstarVoltwayScenario,
      events: [...northstarVoltwayScenario.events].reverse(),
    },
    controlledMeterProfiles,
  );
  assert.equal(first.digest, reordered.digest);
  assert.equal(first.events[0].id, "start-a");
  assert.equal(traceInstant(first, 3000), "2026-01-01T00:00:03.000Z");
});

test("scenario input cannot supply output state and recovery must follow a fault", () => {
  assert.throws(
    () =>
      compileLabScenario(
        { ...northstarVoltwayScenario, protectedValue: "100" },
        controlledMeterProfiles,
      ),
    LabValidationError,
  );
  assert.throws(
    () =>
      compileLabScenario(
        {
          ...northstarVoltwayScenario,
          events: northstarVoltwayScenario.events.map((event, index) =>
            index === 0 ? { ...event, protectedValue: "100" } : event,
          ),
        },
        controlledMeterProfiles,
      ),
    LabValidationError,
  );
  const invalid = {
    ...northstarVoltwayScenario,
    events: northstarVoltwayScenario.events.map((event) =>
      event.id === "reading-c-recovery"
        ? { ...event, traceOffsetMs: 500 }
        : event,
    ),
  };
  assert.throws(
    () => compileLabScenario(invalid, controlledMeterProfiles),
    (error) =>
      error instanceof LabValidationError &&
      error.issues.some(
        (issue) =>
          issue.message === "Recovery must occur after the fault begins.",
      ),
  );
});

test("speed changes scheduling without changing headless event order", async () => {
  const compiled = compileLabScenario(
    northstarVoltwayScenario,
    controlledMeterProfiles,
  );
  const events = await runHeadlessScenario(compiled, async (event) => event.id);
  assert.deepEqual(
    events,
    compiled.events.map((event) => event.id),
  );
  assert.equal(nextEventDelayMs(1000, 2000, 0.25), 4000);
  assert.equal(nextEventDelayMs(1000, 2000, 4), 250);
  assert.equal(nextEventDelayMs(2000, 1000, 1), 0);
});

test("compiler rejects ambiguous order and unapproved profiles", () => {
  const duplicateOrder = {
    ...northstarVoltwayScenario,
    events: northstarVoltwayScenario.events.map((event) =>
      event.id === "start-b" ? { ...event, sequence: 0 } : event,
    ),
  };
  assert.throws(
    () => compileLabScenario(duplicateOrder, controlledMeterProfiles),
    (error) =>
      error instanceof LabValidationError &&
      error.issues.some((issue) => issue.path.endsWith("sequence")),
  );
  const unapproved = {
    ...northstarVoltwayScenario,
    lanes: northstarVoltwayScenario.lanes.map((lane) =>
      lane.key === "lane-b" ? { ...lane, meterProfileId: "other" } : lane,
    ),
  };
  assert.throws(
    () => compileLabScenario(unapproved, controlledMeterProfiles),
    (error) =>
      error instanceof LabValidationError &&
      error.issues.some((issue) => issue.path.endsWith("meterProfileId")),
  );
  assert.throws(
    () =>
      compileLabScenario(
        { ...northstarVoltwayScenario, schemaVersion: 3 },
        controlledMeterProfiles,
      ),
    LabValidationError,
  );
});

test("meter readings respect cumulative energy and Lane power", () => {
  for (const [reading, message] of [
    ["1", "Meter energy cannot move backward."],
    [
      "1000000",
      "This reading exceeds the Lane power limit for its trace interval.",
    ],
  ] as const) {
    const invalid = {
      ...northstarVoltwayScenario,
      events: northstarVoltwayScenario.events.map((event) =>
        event.id === "reading-a-2"
          ? {
              ...event,
              parameters: { ...event.parameters, cumulativeMilliWh: reading },
            }
          : event,
      ),
    };
    assert.throws(
      () => compileLabScenario(invalid, controlledMeterProfiles),
      (error) =>
        error instanceof LabValidationError &&
        error.issues.some((issue) => issue.message === message),
    );
  }
});
