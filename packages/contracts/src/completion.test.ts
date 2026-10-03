import assert from "node:assert/strict";
import { test } from "node:test";
import { completionCommandSchema } from "./completion.ts";

test("controlled completion accepts intent and rejects asserted financial truth", () => {
  const command = {
    commandId: "finish-request",
    correlationId: "session-request",
    laneId: "charging-session",
    expectedVersion: 7,
  };
  assert.deepEqual(completionCommandSchema.parse(command), command);
  for (const field of [
    "amount",
    "refund",
    "settledValue",
    "raw",
    "serviceEndedAt",
    "actor",
    "now",
  ])
    assert.equal(
      completionCommandSchema.safeParse({ ...command, [field]: "1" }).success,
      false,
    );
  for (const version of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(
      completionCommandSchema.safeParse({
        ...command,
        expectedVersion: version,
      }).success,
      false,
    );
});
