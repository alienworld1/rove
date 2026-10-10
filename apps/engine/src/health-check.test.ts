import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDatabaseHealth } from "./health-check.js";

test("health reports a successful or failed database probe", async () => {
  assert.equal(await checkDatabaseHealth(async () => {}), "ready");
  assert.equal(
    await checkDatabaseHealth(async () => {
      throw new Error("Database unavailable");
    }),
    "unavailable",
  );
});

test("health returns when a database probe never finishes", async () => {
  assert.equal(
    await checkDatabaseHealth(() => new Promise<void>(() => {}), 10),
    "unavailable",
  );
});
