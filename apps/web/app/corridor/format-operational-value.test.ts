import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatEnergy,
  formatOperationalValue,
} from "./format-operational-value.ts";

test("formats exact amounts without floating point conversion", () => {
  assert.equal(
    formatOperationalValue("100000000000000001", 2),
    "1000000000000000.01",
  );
  assert.equal(formatOperationalValue(null, 2), "Unknown");
  assert.equal(formatEnergy("1234"), "1.234 kWh");
  assert.equal(formatEnergy("9999999999999999999"), "9999999999999999.999 kWh");
});
