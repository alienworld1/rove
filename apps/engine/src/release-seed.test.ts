import assert from "node:assert/strict";
import { test } from "node:test";
import { readVerifiedReleaseSeed } from "./release-seed.js";
import { assertPublishableSnapshot } from "./publish-hosted-run.js";

test("release seed retains verified real lifecycle and navigable fault/recovery snapshots", async () => {
  const snapshot = await readVerifiedReleaseSeed("boundary");
  assert.equal(snapshot.corridor.aggregate.settledValue, "550");
  assert.equal(snapshot.corridor.aggregate.unusedFundedHeadroom, "0");
  assert.equal(
    snapshot.traces["3000"].lanes[2].projection.state,
    "PAUSE_REQUIRED",
  );
  assert.equal(snapshot.traces["3100"].lanes[2].projection.state, "PROTECTED");
  assert.ok(
    Object.values(snapshot.completions).every(
      (record) =>
        record.completion?.closure?.confirmedRefund ===
        record.completion?.closure?.expectedRefund,
    ),
  );
  const invalid = structuredClone(snapshot);
  for (const lane of invalid.corridor.lanes)
    lane.projection.operations = lane.projection.operations.filter(
      (operation) =>
        operation.type !== "settle" ||
        operation.requestedAmount === lane.projection.settledValue,
    );
  assert.throws(() => assertPublishableSnapshot(invalid), /partial settlement/);
});

test("presentation release retains exact settlement, protection and confirmed returns", async () => {
  const snapshot = await readVerifiedReleaseSeed();
  assert.equal(snapshot.corridor.aggregate.settledValue, "5796000");
  assert.equal(snapshot.corridor.aggregate.unusedFundedHeadroom, "0");
  assert.deepEqual(
    snapshot.corridor.lanes.map((lane) => lane.projection.settledValue),
    ["252000", "1764000", "3780000"],
  );
  assert.equal(
    snapshot.traces["58368"].lanes[2].projection.state,
    "PAUSE_REQUIRED",
  );
  assert.equal(snapshot.traces["60001"].lanes[2].projection.state, "PROTECTED");
  assert.deepEqual(
    snapshot.corridor.lanes.map(
      (lane) =>
        snapshot.completions[lane.projection.id].completion?.closure
          ?.confirmedRefund,
    ),
    ["1748000", "1736000", "1220000"],
  );
  assert.ok(
    Object.values(snapshot.completions).every(
      (record) => record.completion?.comparison?.status === "MATCH",
    ),
  );
});
