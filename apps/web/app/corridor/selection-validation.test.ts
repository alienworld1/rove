import assert from "node:assert/strict";
import { test } from "node:test";
import type { CorridorOperatingView } from "@rove/contracts";
import { validateSelection } from "./selection-validation.ts";

const view = {
  activeRun: { traceOffsetMs: 100 },
  lanes: [
    {
      projection: { id: "lane-a" },
      trace: [
        { eventId: "event-a", traceOffsetMs: 50, snapshot: { version: 1 } },
      ],
    },
  ],
} as CorridorOperatingView;

test("keeps valid semantic focus and removes cross-Lane events", () => {
  assert.deepEqual(validateSelection(view, "lane-a", "event-a", 50), {
    laneId: "lane-a",
    eventId: "event-a",
    traceOffsetMs: 50,
    changed: false,
  });
  assert.deepEqual(validateSelection(view, "lane-a", "event-b", 150), {
    laneId: "lane-a",
    eventId: null,
    traceOffsetMs: null,
    changed: true,
  });
});

test("rejects fractional and uncommitted trace positions", () => {
  assert.equal(validateSelection(view, null, null, 50.5).traceOffsetMs, null);
  assert.equal(validateSelection(view, null, null, 75).traceOffsetMs, null);
});
