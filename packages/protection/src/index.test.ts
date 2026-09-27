import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conservativeTariffBound,
  exposureState,
  formatKwh,
  maxEnergyWh,
  nonnegativeInteger,
  tariffValue,
} from "./index.js";

test("integer energy and tariff arithmetic", () => {
  assert.equal(formatKwh(1250), "1.250");
  assert.equal(formatKwh(0), "0.000");
  assert.equal(tariffValue(1250, 25, 2, 6), 312500n);
  assert.equal(tariffValue(1, 1, 0, 0), 0n);
  assert.equal(maxEnergyWh(7000, 1), 1n);
  assert.equal(conservativeTariffBound(7000, 1, 25, 2, 6), 1n);
  assert.equal(exposureState(5, 5), "at_limit");
  assert.equal(exposureState(4, 5), "within_limit");
  assert.equal(exposureState(6, 5), "over_limit");
});

test("unsafe and invalid inputs never become value", () => {
  assert.throws(
    () => nonnegativeInteger(Number.MAX_SAFE_INTEGER + 1),
    /VALUE_INVALID/,
  );
  assert.throws(() => nonnegativeInteger(-1), /VALUE_INVALID/);
  assert.throws(() => tariffValue(1, 1, -1, 6), /VALUE_INVALID/);
  assert.throws(() => maxEnergyWh(1, 1.5), /VALUE_INVALID/);
});
