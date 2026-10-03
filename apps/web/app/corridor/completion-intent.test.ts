import assert from "node:assert/strict";
import { test } from "node:test";
import { retainCompletionIntent } from "./completion-intent.ts";

test("an uncertain completion retry preserves the entire envelope after a refresh", () => {
  const initial = retainCompletionIntent(undefined, "lane-a", 3);
  const retried = retainCompletionIntent(initial, "lane-a", 8);
  assert.equal(retried, initial);
  assert.equal(retried.expectedVersion, 3);
  assert.notEqual(
    retainCompletionIntent(undefined, "lane-a", 8).commandId,
    initial.commandId,
  );
});

test("a completion intent cannot be reused for a different Lane", () => {
  const initial = retainCompletionIntent(undefined, "lane-a", 3);
  const other = retainCompletionIntent(initial, "lane-b", 4);
  assert.equal(other.laneId, "lane-b");
  assert.equal(other.expectedVersion, 4);
  assert.notEqual(other.commandId, initial.commandId);
});
