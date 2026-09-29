import assert from "node:assert/strict";
import { test } from "node:test";
import type { RealtimePresentationEvent } from "@rove/contracts";
import { acceptRealtimeEvent } from "./realtime-state.ts";

const event = (id: string, projectionVersion: number) =>
  ({
    id,
    type: "lane_projection_changed",
    corridorId: "corridor",
    laneId: "lane",
    runId: null,
    projectionVersion,
    reasonCode: null,
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: { eventType: "lane.protected", laneVersion: projectionVersion },
  }) satisfies RealtimePresentationEvent;

test("ignores duplicate and out-of-order live notifications", () => {
  const initial = {
    projectionVersion: 4,
    announcedEventIds: new Set<string>(),
  };
  assert.equal(acceptRealtimeEvent(initial, event("3", 3)).accepted, false);
  const next = acceptRealtimeEvent(initial, event("5", 5));
  assert.equal(next.accepted, true);
  assert.equal(acceptRealtimeEvent(next.state, event("5", 5)).accepted, false);
});

test("run changes at the same projection version refresh once", () => {
  const initial = {
    projectionVersion: 8,
    announcedEventIds: new Set<string>(),
  };
  const runChange = {
    ...event("8", 8),
    type: "lab_run_changed" as const,
    runId: "run-1",
    laneId: null,
    payload: { eventType: "run.version.4", laneVersion: null },
  };
  const first = acceptRealtimeEvent(initial, runChange);
  assert.equal(first.accepted, true);
  assert.equal(acceptRealtimeEvent(first.state, runChange).accepted, false);
  assert.equal(
    acceptRealtimeEvent(first.state, {
      ...runChange,
      payload: { eventType: "run.version.5", laneVersion: null },
    }).accepted,
    true,
  );
});

test("resync notices refresh even when their cursor matches", () => {
  const initial = {
    projectionVersion: 8,
    announcedEventIds: new Set<string>(),
  };
  const notice = {
    ...event("8", 8),
    type: "resync_required" as const,
    laneId: null,
  };
  const accepted = acceptRealtimeEvent(initial, notice);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.resync, true);
});
