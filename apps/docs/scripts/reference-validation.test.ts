import assert from "node:assert/strict";
import test from "node:test";
import { validateTarget, validateCoverage } from "../lib/reference-validation";
test("removed public headings and source identifiers fail the reference gate", () => {
  const targets = new Map([
    ["/docs/reference/reason-codes", new Set(["evidence-signature-invalid"])],
  ]);
  validateTarget(
    "/docs/reference/reason-codes#evidence-signature-invalid",
    targets,
  );
  targets.get("/docs/reference/reason-codes")!.clear();
  assert.throws(
    () =>
      validateTarget(
        "/docs/reference/reason-codes#evidence-signature-invalid",
        targets,
      ),
    /fragment/,
  );
  validateCoverage(
    ["EVIDENCE_SIGNATURE_INVALID"],
    "`EVIDENCE_SIGNATURE_INVALID`",
    "reason",
  );
  assert.throws(
    () => validateCoverage(["EVIDENCE_SIGNATURE_INVALID"], "", "reason"),
    /Missing reason/,
  );
});
