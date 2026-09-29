import assert from "node:assert/strict";
import { test } from "node:test";
import { labScenarioSummarySchema } from "./lab.ts";
import { presentationCursorSchema } from "./corridor.ts";

test("rejects unsafe replay cursors", () => {
  assert.equal(presentationCursorSchema.safeParse("42").success, true);
  assert.equal(presentationCursorSchema.safeParse("-1").success, false);
  assert.equal(
    presentationCursorSchema.safeParse("999999999999999999").success,
    false,
  );
});

test("scenario summaries reject unrecognized server fields", () => {
  const summary = {
    id: "northstar-voltway",
    name: "Northstar Mobility ↔ Voltway",
    digest: "a".repeat(64),
    schemaVersion: 1,
    validationStatus: "valid",
  };
  assert.equal(labScenarioSummarySchema.safeParse(summary).success, true);
  assert.equal(
    labScenarioSummarySchema.safeParse({ ...summary, secret: "untrusted" })
      .success,
    false,
  );
});
