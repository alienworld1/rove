import assert from "node:assert/strict";
import { test } from "node:test";
import type { LaneProjection } from "@rove/contracts";
import { summarizeCorridor, projectLaneTrace } from "./corridor-read-model.js";
import { laneHistorySchema } from "@rove/contracts";
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

test("real receipt delays preserve logical fault and recovery positions in recorded traces", () => {
  const epoch = "2026-10-04T00:00:00.000Z";
  const times = [0, 15000, 1000, 2000, 21000, 3100, 3501];
  const history = laneHistorySchema.parse(
    times.map((offset, index) => ({
      id: `event-${index}`,
      type: "lane.protection_checked",
      version: index,
      occurredAt: new Date(Date.parse(epoch) + 30000 + index).toISOString(),
      traceTime: new Date(Date.parse(epoch) + offset).toISOString(),
      reasonCode: null,
      evidenceHash: null,
      channelId: null,
      transactionHash: null,
      summary: null,
      detail: null,
    })),
  );
  const trace = projectLaneTrace(history, epoch, 3500);
  assert.deepEqual(
    trace.map((event) => event.traceOffsetMs),
    [0, 0, 1000, 2000, 2000, 3100, 3100],
  );
  assert.equal(trace[1].occurredAt, history[1].occurredAt);
  assert.equal(trace[4].traceTime, history[4].traceTime);
});

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

test("closed sessions retain totals without active attention or unused reserve", () => {
  const aggregate = summarizeCorridor([
    lane("closed", "CLOSED", {
      trusted: "500000",
      protected: "500000",
      exposure: "0",
      headroom: "250000",
    }),
  ]);
  assert.equal(aggregate.activeLaneCount, 0);
  assert.deepEqual(aggregate.attentionLaneIds, []);
  assert.equal(aggregate.settledValue, "1");
  assert.equal(aggregate.unusedFundedHeadroom, "0");
});
