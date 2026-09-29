import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyOcmf } from "@rove/evidence";
import { northstarVoltwayScenario } from "@rove/lab/scenarios/northstar-voltway";
import { controlledMeterIdentity, controlledReading } from "./lab-evidence.js";

test("controlled source variants pass through the real signature and continuity verifier", () => {
  const lane = northstarVoltwayScenario.lanes[2];
  const meter = controlledMeterIdentity(lane);
  const sessionId = "controlled-session";
  const firstAt = "2026-01-01T00:00:00.000Z";
  const secondAt = "2026-01-01T00:00:01.000Z";
  const firstRaw = controlledReading({
    lane,
    sessionId,
    instant: firstAt,
    sequence: 1,
    cumulativeMilliWh: "500000",
  });
  assert.equal(
    firstRaw,
    controlledReading({
      lane,
      sessionId,
      instant: firstAt,
      sequence: 1,
      cumulativeMilliWh: "500000",
    }),
  );
  const base = {
    publicKeyHex: meter.publicKeyHex,
    expectedMeterId: lane.meterId,
    expectedSessionId: sessionId,
    transportSessionId: sessionId,
    maxAgeMs: 500,
    now: new Date(firstAt),
  };
  const first = verifyOcmf({ ...base, raw: firstRaw });
  assert.equal(first.accepted, true);
  const previous = {
    rawPayloadHash: first.rawPayloadHash,
    observedAt: firstAt,
    cumulativeMilliWh: 500000n,
    sequence: 1,
  };
  assert.equal(
    verifyOcmf({
      ...base,
      raw: controlledReading({
        lane,
        sessionId,
        instant: secondAt,
        sequence: 2,
        cumulativeMilliWh: "550000",
        corruptSignature: true,
      }),
      now: new Date(secondAt),
      previous,
    }).reasonCode,
    "EVIDENCE_SIGNATURE_INVALID",
  );
  assert.equal(
    verifyOcmf({
      ...base,
      raw: controlledReading({
        lane,
        sessionId,
        instant: secondAt,
        sequence: 2,
        cumulativeMilliWh: "550000",
        wrongMeter: true,
      }),
      now: new Date(secondAt),
      previous,
    }).reasonCode,
    "EVIDENCE_SOURCE_MISMATCH",
  );
  assert.equal(
    verifyOcmf({ ...base, raw: firstRaw, previous }).reasonCode,
    "EVIDENCE_REPLAY",
  );
  assert.equal(
    verifyOcmf({
      ...base,
      raw: controlledReading({
        lane,
        sessionId,
        instant: secondAt,
        sequence: 3,
        cumulativeMilliWh: "550000",
      }),
      now: new Date(secondAt),
      previous,
    }).reasonCode,
    "EVIDENCE_SEQUENCE_INVALID",
  );
  assert.equal(
    verifyOcmf({
      ...base,
      raw: controlledReading({
        lane,
        sessionId,
        instant: firstAt,
        sequence: 1,
        cumulativeMilliWh: "550000",
      }),
      now: new Date(secondAt),
    }).reasonCode,
    "EVIDENCE_STALE",
  );
});
