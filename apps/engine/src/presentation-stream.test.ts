import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodePresentationEvent,
  parsePresentationCursor,
} from "./presentation-stream.ts";

test("accepts only safe numeric replay cursors", () => {
  assert.equal(parsePresentationCursor(undefined), 0);
  assert.equal(parsePresentationCursor("42"), 42);
  assert.equal(parsePresentationCursor("-1"), null);
  assert.equal(parsePresentationCursor("1:run:2"), null);
  assert.equal(parsePresentationCursor("999999999999999999"), null);
});

test("emits an SSE event with an explicit replay identifier", () => {
  const encoded = encodePresentationEvent({
    id: "12",
    type: "resync_required",
    corridorId: "corridor",
    laneId: null,
    runId: null,
    projectionVersion: 12,
    reasonCode: null,
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: { eventType: null, laneVersion: null },
  });
  assert.match(encoded, /^id: 12\nevent: resync_required\ndata: /);
  assert.ok(encoded.endsWith("\n\n"));
});
