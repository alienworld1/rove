import assert from "node:assert/strict";
import { test } from "node:test";
import { readVerifiedReleaseSeed } from "./release-seed.js";
import { assertPublishableSnapshot } from "./publish-hosted-run.js";

test("release seed retains verified real lifecycle and navigable fault/recovery snapshots", async () => {
  const snapshot = await readVerifiedReleaseSeed();
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
