import assert from "node:assert/strict";
import { test } from "node:test";
import { displayLabDecimal, parseLabDecimal } from "./lab-authoring.ts";

test("decimal input stays exact beyond floating point precision and rejects rounding", () => {
  assert.equal(
    parseLabDecimal("9007199254740993.123456", 6),
    "9007199254740993123456",
  );
  assert.equal(
    displayLabDecimal("9007199254740993123456", 6),
    "9007199254740993.123456",
  );
  assert.equal(parseLabDecimal("0.001", 3), "1");
  assert.equal(parseLabDecimal("1.", 3), "1000");
  for (const value of ["", "-1", "1e3", "NaN", "0.0001"])
    assert.throws(() => parseLabDecimal(value, 3));
});
