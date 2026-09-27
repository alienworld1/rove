import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyOcmf } from "./index.js";

const fixture = JSON.parse(
  readFileSync(
    new URL("../fixtures/safe-ocmf-example.json", import.meta.url),
    "utf8",
  ),
) as {
  raw: string;
  publicKeyHex: string;
  transportSessionId: string;
};

const expected = {
  ...fixture,
  expectedMeterId: "17619300",
  expectedSessionId: "29",
  maxAgeMs: 60_000,
  now: new Date("2019-08-13T10:03:37.000Z"),
};

test("published OCMF bytes verify and normalize conservatively", () => {
  const result = verifyOcmf(expected);
  assert.equal(result.accepted, true);
  assert.equal(result.signatureValid, true);
  assert.equal(result.cumulativeWh, "259");
});

test("altered bytes, identity, session, replay and stale time reject", () => {
  const accepted = verifyOcmf(expected);
  const cases = [
    [
      { ...expected, raw: expected.raw.replace("0.2597", "0.2598") },
      "EVIDENCE_SIGNATURE_INVALID",
    ],
    [{ ...expected, expectedMeterId: "different" }, "EVIDENCE_SOURCE_MISMATCH"],
    [
      { ...expected, expectedSessionId: "different" },
      "EVIDENCE_SESSION_MISMATCH",
    ],
    [
      {
        ...expected,
        previous: {
          rawPayloadHash: accepted.rawPayloadHash,
          observedAt: accepted.observedAt!,
          cumulativeMilliWh: 259700n,
          sequence: 32,
        },
      },
      "EVIDENCE_REPLAY",
    ],
    [
      { ...expected, now: new Date("2019-08-13T10:05:00.000Z") },
      "EVIDENCE_STALE",
    ],
    [
      {
        ...expected,
        previous: {
          rawPayloadHash: "different",
          observedAt: "2019-08-13T10:03:00.000Z",
          cumulativeMilliWh: 259600n,
          sequence: 30,
        },
      },
      "EVIDENCE_SEQUENCE_INVALID",
    ],
    [
      {
        ...expected,
        previous: {
          rawPayloadHash: "different",
          observedAt: "2019-08-13T10:03:00.000Z",
          cumulativeMilliWh: 300000n,
          sequence: 31,
        },
      },
      "EVIDENCE_ENERGY_REGRESSION",
    ],
  ] as const;
  for (const [input, reason] of cases) {
    const result = verifyOcmf(input);
    assert.equal(result.accepted, false);
    assert.equal(result.reasonCode, reason);
    assert.equal(result.cumulativeWh, undefined);
  }
});
