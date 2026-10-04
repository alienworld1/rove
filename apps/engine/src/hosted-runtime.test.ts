import assert from "node:assert/strict";
import { test } from "node:test";
import { northstarVoltwayScenario } from "@rove/lab/scenarios/northstar-voltway";
import { quoteHostedRun } from "./hosted-runtime.js";
import { PresentationPoller } from "./presentation-poller.js";

test("quotes all three channels and reserve top-ups using deterministic tariff math", () => {
  const quote = quoteHostedRun(northstarVoltwayScenario, {
    HOSTED_FUNDING_BUDGET: "10000",
    HOSTED_FEE_BUDGET: "100000",
    HOSTED_GAS_LIMIT: "100",
    HOSTED_MAX_FEE_PER_GAS: "2",
    HOSTED_MAX_TRANSACTIONS_PER_RUN: 32,
  });
  assert.equal(quote.funding, "1800");
  assert.equal(quote.fees, "6400");
  const larger = structuredClone(northstarVoltwayScenario);
  larger.corridor.reservePolicy.initialDeposit = "100";
  assert.ok(
    BigInt(
      quoteHostedRun(larger, {
        HOSTED_FUNDING_BUDGET: "10000",
        HOSTED_FEE_BUDGET: "100000",
        HOSTED_GAS_LIMIT: "100",
        HOSTED_MAX_FEE_PER_GAS: "2",
        HOSTED_MAX_TRANSACTIONS_PER_RUN: 32,
      }).funding,
    ) >= 900n,
  );
});

test("concurrent presentation readers share one Corridor poll and run-version query", async () => {
  let reads = 0;
  let versions = 0;
  const poller = new PresentationPoller(
    async () => {
      reads++;
      return [];
    },
    async () => {
      versions++;
      return 2;
    },
  );
  const results = await Promise.all(
    Array.from({ length: 10 }, () => poller.read("corridor", 5, "run")),
  );
  assert.equal(reads, 1);
  assert.equal(versions, 1);
  assert.ok(results.every((value) => value.runVersion === 2));
  await poller.read("corridor", 4, "run");
  assert.equal(reads, 2);
});
