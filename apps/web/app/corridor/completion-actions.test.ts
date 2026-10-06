import assert from "node:assert/strict";
import { test } from "node:test";
import type { CompletionSummary } from "@rove/contracts";
import { executeCompletionAction } from "./completion-actions.ts";
import type { CompletionIntent } from "./completion-intent.ts";

function summary(laneId: string, version = 3): CompletionSummary {
  return {
    laneId,
    version,
    externalSessionId: `session-${laneId}`,
    completion: null,
    recovery: { status: "ready", checkedAt: null, reasonCodes: [] },
    failedOperations: [],
    canFinish: true,
    canClose: false,
    paymentSource: "local-simulation",
    evidenceEventId: null,
    paymentEventId: null,
  };
}
test("ambiguous failures inspect saved state and retain the same command on retry", async () => {
  const intents = new Map<string, CompletionIntent>();
  const calls: string[] = [];
  let failure = true;
  let readCount = 0;
  const transport = {
    read: async (laneId: string) => {
      readCount++;
      return summary(laneId, readCount + 2);
    },
    control: async (
      _lane: string,
      version: number,
      _action: string,
      intent: CompletionIntent,
    ) => {
      calls.push(intent.commandId);
      assert.equal(version, 3);
      if (failure) throw new Error("Confirmation unavailable");
      return summary("a");
    },
  };
  await assert.rejects(
    executeCompletionAction(transport, intents, "a", "complete"),
    /Confirmation unavailable/,
  );
  assert.equal(readCount, 2);
  assert.equal(intents.size, 1);
  failure = false;
  await executeCompletionAction(transport, intents, "a", "complete");
  assert.equal(calls[0], calls[1]);
  assert.equal(intents.size, 0);
});
test("version conflicts clear stale intents; blocked closure does not send a command", async () => {
  const intents = new Map<string, CompletionIntent>();
  let controls = 0;
  const transport = {
    read: async () => summary("a"),
    control: async () => {
      controls++;
      throw Object.assign(new Error("Changed"), { status: 409 });
    },
  };
  await assert.rejects(
    executeCompletionAction(transport, intents, "a", "complete"),
  );
  assert.equal(intents.size, 0);
  await assert.rejects(
    executeCompletionAction(transport, intents, "a", "close"),
  );
  assert.equal(controls, 1);
});
test("independent Lane failures preserve the successful result", async () => {
  const intents = new Map<string, CompletionIntent>();
  const transport = {
    read: async (id: string) => summary(id),
    control: async (id: string) => {
      if (id === "b") throw new Error("Unavailable");
      return summary(id);
    },
  };
  const results = await Promise.allSettled(
    ["a", "b"].map((id) =>
      executeCompletionAction(transport, intents, id, "complete"),
    ),
  );
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(intents.has("b:complete"), true);
  assert.equal(intents.has("a:complete"), false);
});
