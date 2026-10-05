import assert from "node:assert/strict";
import { test } from "node:test";
import { copyLabScenario } from "@rove/contracts";
import { northstarVoltwayScenario } from "../../../../packages/lab/scenarios/northstar-voltway";
import { useLabDraft } from "../lab/lab-draft-store";

test("incomplete numeric input survives unrelated edits and cannot acquire saved validation", () => {
  const store = useLabDraft.getState();
  store.setDraft(copyLabScenario(northstarVoltwayScenario, "scenario-draft"));
  store.field("lanes.lane-c.maxPowerWatts", "1.");
  const draft = useLabDraft.getState().draft!;
  store.change({ ...draft, name: "Renamed while editing power" });
  store.saved("digest", useLabDraft.getState().revision);
  assert.equal(
    useLabDraft.getState().pending["lanes.lane-c.maxPowerWatts"],
    "1.",
  );
  assert.equal(useLabDraft.getState().savedDigest, null);
  assert.equal(useLabDraft.getState().draft?.lanes[2].maxPowerWatts, "350000");
  store.field("lanes.lane-c.maxPowerWatts", null);
  store.saved("digest", useLabDraft.getState().revision);
  assert.equal(useLabDraft.getState().savedDigest, "digest");
});

test("pending event fields follow identities through movement and disappear on removal", () => {
  const store = useLabDraft.getState();
  store.setDraft(copyLabScenario(northstarVoltwayScenario, "scenario-events"));
  store.field("events.reading-c-corrupt.traceOffsetMs", "");
  const draft = useLabDraft.getState().draft!;
  store.change({ ...draft, events: [...draft.events].reverse() });
  assert.equal(
    useLabDraft.getState().pending["events.reading-c-corrupt.traceOffsetMs"],
    "",
  );
  store.change({
    ...draft,
    events: draft.events.filter((event) => event.id !== "reading-c-corrupt"),
  });
  assert.deepEqual(useLabDraft.getState().pending, {});
});

test("a save response cannot validate a newer draft revision", () => {
  const store = useLabDraft.getState();
  store.setDraft(
    copyLabScenario(northstarVoltwayScenario, "scenario-revision"),
  );
  const revision = useLabDraft.getState().revision;
  store.change({
    ...useLabDraft.getState().draft!,
    name: "Changed after save request",
  });
  store.saved("stale-digest", revision);
  assert.equal(useLabDraft.getState().savedDigest, null);
});
