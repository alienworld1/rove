import assert from "node:assert/strict";
import { test } from "node:test";
import { causalMotionPlan } from "./causal-motion-plan.ts";

const input = {
  now: 1000,
  evidenceReadyAt: 0,
  acceptedEvidence: true,
  recovering: true,
  paused: false,
  inspecting: false,
};
test("committed recovery reveals evidence before protection, risk and resumed service", () => {
  const plan = causalMotionPlan(input);
  assert.deepEqual(
    [
      plan.frontierDelay,
      plan.riskDelay,
      plan.boundaryDelay,
      plan.physicalDelay,
    ],
    [380, 500, 560, 620],
  );
  const interrupted = causalMotionPlan({
    ...input,
    now: 1100,
    acceptedEvidence: false,
    evidenceReadyAt: plan.evidenceReadyAt,
  });
  assert.equal(interrupted.frontierDelay, 280);
  assert.equal(interrupted.physicalDelay, 520);
});
test("pause and recorded inspection are exact and never queue travel", () => {
  assert.equal(causalMotionPlan({ ...input, paused: true }).physicalDelay, 0);
  assert.equal(
    causalMotionPlan({ ...input, inspecting: true }).frontierDelay,
    0,
  );
  assert.equal(
    causalMotionPlan({ ...input, acceptedEvidence: false }).frontierDelay,
    0,
  );
});
