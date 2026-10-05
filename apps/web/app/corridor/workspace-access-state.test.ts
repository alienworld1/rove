import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { clearPrivateWorkspace } from "../workspace-access-state";
import { useLabDraft } from "../lab/lab-draft-store";
import { northstarVoltwayScenario } from "../../../../packages/lab/scenarios/northstar-voltway";

test("changing or ending access clears private scenario, evidence and accounting state while preserving public examples", () => {
  const client = new QueryClient();
  for (const key of [
    "scenario",
    "scenarios",
    "run",
    "corridor",
    "corridor-trace",
    "inspector",
    "completion",
    "accounting-record",
  ])
    client.setQueryData([key, "private"], { owner: "previous" });
  client.setQueryData(["published-runs"], [{ id: "public" }]);
  useLabDraft
    .getState()
    .setDraft(structuredClone(northstarVoltwayScenario), "previous-invite");
  clearPrivateWorkspace(client);
  assert.equal(useLabDraft.getState().draft, null);
  assert.equal(client.getQueryCache().getAll().length, 1);
  assert.deepEqual(client.getQueryData(["published-runs"]), [{ id: "public" }]);
  client.clear();
});
