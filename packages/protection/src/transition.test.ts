import assert from "node:assert/strict";
import { test } from "node:test";
import type { Lane } from "@rove/domain";
import { transitionLane } from "./transition.js";

function lane(): Lane {
  return {
    id: "lane",
    version: 0,
    corridorId: "corridor",
    externalSessionId: "session",
    chargerId: "charger",
    meterId: "meter",
    maxPowerWatts: "3600",
    expectedProofIntervalMs: 1000,
    tariff: { perKwh: "1000", tariffDecimals: 0, assetDecimals: 0 },
    policy: {
      warningThreshold: "20",
      riskThreshold: "50",
      maxUnprotectedExposure: "100",
      evidenceMaxAgeMs: 1000,
      chainMaxAgeMs: 1000,
      zeroGrace: false,
      lowHeadroomThreshold: "1",
    },
    settlementAssetId: "asset",
    tempoNetwork: "network",
    state: "INITIALIZING",
    serviceStarted: false,
    evidenceHealth: "unknown",
    chainHealth: "unknown",
    signerHealth: "ready",
    trustedEnergyWh: "0",
    trustedDeliveredValue: "0",
    authorizedValue: "0",
    settledValue: "0",
    confirmedDeposit: null,
    fundedHeadroom: null,
    lastTrustedEvidenceAt: null,
    lastChainObservedAt: null,
    lastEvidenceHash: null,
    lastEvidenceSequence: null,
    channelId: null,
    unverifiedServiceBound: "0",
    worstCaseDeliveredValue: "0",
    protectedValue: "0",
    protectedWatermark: "0",
    unprotectedExposureBound: "0",
    reasonCodes: ["PROTECTION_AWAITING_TRUST_AND_FUNDING"],
    finalCdrId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("unstarted clock cannot invent funding, energy or risk", () => {
  const result = transitionLane(
    lane(),
    { type: "ClockTick" },
    "2026-01-01T01:00:00.000Z",
    "key",
  );
  assert.equal(result.lane.state, "INITIALIZING");
  assert.equal(result.lane.confirmedDeposit, null);
  assert.equal(result.lane.unverifiedServiceBound, "0");
});

test("exact exposure equality requests pause once and preserves financial invariants", () => {
  const initial = lane();
  const now = "2026-01-01T00:00:00.000Z";
  const reading = transitionLane(
    initial,
    {
      type: "EvidenceObserved",
      evidenceHash: "a",
      accepted: true,
      observedAt: now,
      cumulativeWh: "100",
      sequence: 1,
    },
    now,
    "read",
  ).lane;
  const funded = transitionLane(
    reading,
    {
      type: "PaymentObserved",
      source: "local-simulation",
      channelId: "channel",
      network: "network",
      assetId: "asset",
      observedAt: now,
      confirmedDeposit: "200",
      authorizedValue: "100",
      settledValue: "50",
      chainHeight: "1",
    },
    now,
    "pay",
  ).lane;
  assert.equal(funded.state, "PROTECTED");
  const stale = transitionLane(
    funded,
    { type: "ClockTick" },
    "2026-01-01T00:00:01.001Z",
    "tick",
  );
  const equality = transitionLane(
    stale.lane,
    { type: "ClockTick" },
    "2026-01-01T00:00:10.000Z",
    "pause",
  );
  assert.equal(equality.lane.unprotectedExposureBound, "10");
  const boundary = transitionLane(
    stale.lane,
    { type: "ClockTick" },
    "2026-01-01T00:01:40.000Z",
    "pause",
  );
  assert.equal(boundary.lane.unprotectedExposureBound, "100");
  assert.equal(boundary.lane.state, "PAUSE_REQUIRED");
  assert.equal(boundary.effects.length, 1);
  assert.equal(boundary.lane.protectedWatermark, "100");
  assert.equal(
    transitionLane(
      boundary.lane,
      { type: "ClockTick" },
      "2026-01-01T00:01:41.000Z",
      "again",
    ).effects.length,
    0,
  );
});

test("rejected evidence and unavailable payment cannot claim trusted or confirmed advancement", () => {
  const first = transitionLane(
    lane(),
    {
      type: "EvidenceObserved",
      evidenceHash: "bad",
      accepted: false,
      reasonCode: "EVIDENCE_SIGNATURE_INVALID",
    },
    "2026-01-01T00:00:00.000Z",
    "bad",
  ).lane;
  const second = transitionLane(
    first,
    {
      type: "PaymentUnavailable",
      reasonCode: "PAYMENT_CHAIN_STATE_UNAVAILABLE",
    },
    "2026-01-01T00:00:01.000Z",
    "chain",
  ).lane;
  assert.equal(second.trustedDeliveredValue, "0");
  assert.equal(second.confirmedDeposit, null);
  assert.ok(first.reasonCodes.includes("EVIDENCE_SIGNATURE_INVALID"));
});

test("a small unfunded gap remains visible rather than ready", () => {
  const base = lane();
  base.serviceStarted = true;
  base.evidenceHealth = "fresh";
  base.chainHealth = "fresh";
  base.lastTrustedEvidenceAt = base.createdAt;
  base.lastChainObservedAt = base.createdAt;
  base.trustedEnergyWh = "100";
  base.trustedDeliveredValue = "100";
  base.authorizedValue = "99";
  base.confirmedDeposit = "200";
  const result = transitionLane(
    base,
    { type: "ClockTick" },
    base.createdAt,
    "gap",
  );
  assert.equal(result.lane.state, "WATCH");
  assert.equal(result.lane.unprotectedExposureBound, "1");
  assert.ok(
    result.lane.reasonCodes.includes("TRUSTED_VALUE_NOT_FULLY_PROTECTED"),
  );
});

test("recovery waits for both trusted evidence and fresh payment", () => {
  const base = lane();
  base.state = "AT_RISK";
  base.serviceStarted = true;
  base.evidenceHealth = "untrusted";
  base.chainHealth = "unavailable";
  base.lastTrustedEvidenceAt = base.createdAt;
  base.lastChainObservedAt = base.createdAt;
  base.confirmedDeposit = "200";
  const next = transitionLane(
    base,
    { type: "RecoveryBegun" },
    base.createdAt,
    "recover",
  );
  assert.equal(next.lane.state, "RECOVERING");
  assert.ok(next.lane.reasonCodes.includes("RECOVERY_CHECKS_PENDING"));
  assert.throws(
    () =>
      transitionLane(
        lane(),
        { type: "PauseRequired" },
        base.createdAt,
        "pause",
      ),
    /SERVICE_NOT_STARTED/,
  );
});

test("property sweep keeps authorization, settlement, protection and exposure bounded", () => {
  for (let trusted = 0; trusted < 300; trusted += 7) {
    const base = lane();
    base.trustedEnergyWh = String(trusted);
    base.trustedDeliveredValue = String(trusted);
    base.authorizedValue = String(Math.floor(trusted / 2));
    base.settledValue = String(Math.floor(trusted / 3));
    base.confirmedDeposit = String(trusted + 10);
    base.serviceStarted = true;
    base.evidenceHealth = "fresh";
    base.chainHealth = "fresh";
    base.lastTrustedEvidenceAt = "2026-01-01T00:00:00.000Z";
    base.lastChainObservedAt = "2026-01-01T00:00:00.000Z";
    const next = transitionLane(
      base,
      { type: "ClockTick" },
      "2026-01-01T00:00:00.000Z",
      `key-${trusted}`,
    ).lane;
    assert.ok(
      BigInt(next.authorizedValue) <= BigInt(next.trustedDeliveredValue),
    );
    assert.ok(BigInt(next.authorizedValue) <= BigInt(next.confirmedDeposit!));
    assert.ok(BigInt(next.settledValue) <= BigInt(next.authorizedValue));
    assert.ok(
      BigInt(next.protectedWatermark) >= BigInt(base.protectedWatermark),
    );
    assert.ok(BigInt(next.unprotectedExposureBound) >= 0n);
  }
});
