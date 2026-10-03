import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeLaneGeometry,
  normalizeTracePosition,
} from "./corridor-geometry.ts";

const scale = { valueDomainMax: "200", traceStartMs: 0, traceEndMs: 100 };

test("normalizes authoritative Lane values without changing their scale", () => {
  assert.deepEqual(
    normalizeLaneGeometry({
      scale,
      protectedValue: "80",
      worstCaseDeliveredValue: "110",
      maxUnprotectedExposure: "40",
      unprotectedExposureBound: "30",
      pauseRequired: false,
    }),
    {
      frontier: 0.4,
      physical: 0.55,
      riskStart: 0.4,
      riskEnd: 0.55,
      riskWidth: 0.15,
      protectionLimit: 0.6,
      settled: 0,
      fundedCapacity: null,
    },
  );
});

test("distinguishes confirmed capacity and settlement from protection", () => {
  const geometry = normalizeLaneGeometry({
    scale,
    protectedValue: "80",
    worstCaseDeliveredValue: "110",
    maxUnprotectedExposure: "40",
    unprotectedExposureBound: "30",
    pauseRequired: false,
    settledValue: "30",
    fundedCapacityValue: "180",
  });
  assert.equal(geometry.settled, 0.15);
  assert.equal(geometry.fundedCapacity, 0.9);
  assert.equal(geometry.frontier, 0.4);
});

test("clamps pause geometry exactly at the protection limit", () => {
  const geometry = normalizeLaneGeometry({
    scale,
    protectedValue: "80",
    worstCaseDeliveredValue: "150",
    maxUnprotectedExposure: "40",
    unprotectedExposureBound: "40",
    pauseRequired: true,
  });
  assert.equal(geometry.physical, geometry.protectionLimit);
  assert.equal(geometry.riskEnd, geometry.protectionLimit);
  assert.equal(geometry.riskWidth, 0.2);
});

test("keeps trace positions bounded and stable", () => {
  assert.equal(normalizeTracePosition(-10, 0, 100), 0);
  assert.equal(normalizeTracePosition(50, 0, 100), 0.5);
  assert.equal(normalizeTracePosition(150, 0, 100), 1);
  assert.equal(normalizeTracePosition(null, 0, 100), 0);
});
