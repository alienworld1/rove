import assert from "node:assert/strict";
import { test } from "node:test";
import type { LaneProjection } from "@rove/contracts";
import { summarizeCorridor } from "./corridor-read-model.js";
import {
  encodePresentationEvent,
  parsePresentationCursor,
} from "./presentation-stream.js";

function lane(
  id: string,
  state: LaneProjection["state"],
  values: {
    trusted: string;
    protected: string;
    exposure: string;
    headroom: string | null;
  },
) {
  return {
    id,
    state,
    trustedDeliveredValue: values.trusted,
    protectedValue: values.protected,
    settledValue: "1",
    unprotectedExposureBound: values.exposure,
    fundedHeadroom: values.headroom,
  } as LaneProjection;
}

test("Corridor aggregation preserves exact values and severe Lane attention", () => {
  const aggregate = summarizeCorridor([
    lane("a", "PROTECTED", {
      trusted: "9007199254740993",
      protected: "10",
      exposure: "0",
      headroom: "7",
    }),
    lane("c", "PAUSE_REQUIRED", {
      trusted: "9",
      protected: "8",
      exposure: "4",
      headroom: null,
    }),
  ]);
  assert.equal(aggregate.trustedDeliveredValue, "9007199254741002");
  assert.deepEqual(aggregate.attentionLaneIds, ["c"]);
  assert.equal(aggregate.state, "MIXED");
  assert.equal(aggregate.unusedFundedHeadroom, null);
});

test("presentation cursors are bounded and events use standard framing", () => {
  assert.equal(parsePresentationCursor("42"), 42);
  assert.equal(parsePresentationCursor("-1"), null);
  assert.equal(parsePresentationCursor("anything"), null);
  const encoded = encodePresentationEvent({
    id: "42",
    type: "lane_projection_changed",
    corridorId: "corridor",
    laneId: "lane",
    runId: null,
    projectionVersion: 42,
    reasonCode: null,
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: { eventType: "meter.evidence_accepted", laneVersion: 2 },
  });
  assert.match(encoded, /^id: 42\nevent: lane_projection_changed\ndata: /);
  assert.match(encoded, /\n\n$/);
});
