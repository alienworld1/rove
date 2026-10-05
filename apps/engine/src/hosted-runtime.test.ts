import assert from "node:assert/strict";
import { test } from "node:test";
import { northstarVoltwayScenario } from "@rove/lab/scenarios/northstar-voltway";
import { HostedRuntime, quoteHostedRun } from "./hosted-runtime.js";
import { randomUUID } from "node:crypto";
import {
  HostedStore,
  HostedAccessError,
  ChargingStore,
  LabStore,
  hashAccessToken,
} from "@rove/persistence";
import postgres from "postgres";
import { compileLabScenario } from "@rove/lab";
import { controlledMeterProfiles } from "@rove/lab/scenarios/northstar-voltway";
import { CorridorLab } from "./corridor-lab.js";

test(
  "hosted starts reject forged and stale references, retry one admission, and deny expired access",
  { skip: !process.env.HOSTED_TEST_DATABASE_URL },
  async () => {
    const url = process.env.HOSTED_TEST_DATABASE_URL!;
    const access = new HostedStore(url);
    const charging = new ChargingStore(url);
    const savedRuns = new LabStore(url);
    const sql = postgres(url);
    let inviteId: string | undefined;
    try {
      const runtime = new HostedRuntime(
        access,
        new CorridorLab(charging, savedRuns),
        charging,
      );
      const invite = await access.createInvite({
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        maxRedemptions: 2,
        maxRuns: 2,
        runsPerWorkspace: 1,
        fundingBudget: "10000",
        feeBudget: "10000",
      });
      inviteId = invite.id;
      const first = await access.redeem(invite.code, undefined, 24);
      const second = await access.redeem(invite.code, undefined, 24);
      const compiled = compileLabScenario(
        { ...northstarVoltwayScenario, id: `scenario-${randomUUID()}` },
        controlledMeterProfiles,
      );
      await access.saveScenario(first.token, compiled);
      const ref = {
        scenarioId: compiled.definition.id,
        scenarioDigest: compiled.digest,
      };
      const isStatus = (status: number) => (error: unknown) =>
        error instanceof HostedAccessError && error.status === status;
      await assert.rejects(
        runtime.start(second.token, randomUUID(), ref),
        isStatus(404),
      );
      await assert.rejects(
        runtime.start(first.token, randomUUID(), {
          ...ref,
          scenarioDigest: "0".repeat(64),
        }),
        isStatus(409),
      );
      await assert.rejects(
        runtime.quote(first.token, { ...ref, scenarioDigest: "0".repeat(64) }),
        isStatus(409),
      );
      const runId = randomUUID();
      await access.admit(first.token, runId, {
        compiled,
        funding: "1800",
        fees: "800",
        gasLimit: "100",
        maxFeePerGas: "2",
        maxTransactions: 4,
        deploymentFunding: "1000000000",
        deploymentFees: "1000000000",
      });
      const retry = await runtime.start(first.token, runId, ref);
      assert.equal(retry.run.scenarioDigest, compiled.digest);
      assert.equal((await access.session(first.token)).remainingRuns, 0);
      await assert.rejects(
        runtime.start(first.token, runId, {
          ...ref,
          scenarioDigest: "0".repeat(64),
        }),
        isStatus(409),
      );
      await sql`update hosted_sessions set expires_at = '2000-01-01T00:00:00Z' where token_hash = ${hashAccessToken(first.token)}`;
      await assert.rejects(runtime.quote(first.token, ref), isStatus(403));
    } finally {
      if (inviteId) {
        await sql`delete from hosted_admissions where invite_id = ${inviteId}`;
        await sql`delete from hosted_scenarios where workspace_id in (select workspace_id from hosted_sessions where invite_id = ${inviteId})`;
        await sql`delete from hosted_sessions where invite_id = ${inviteId}`;
        await sql`delete from hosted_invites where id = ${inviteId}`;
      }
      await Promise.all([
        access.close(),
        charging.close(),
        savedRuns.close(),
        sql.end(),
      ]);
    }
  },
);
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

test("custom hosted traces cannot exceed their reserved transaction capacity", () => {
  const expensive = structuredClone(northstarVoltwayScenario);
  expensive.corridor.reservePolicy.topUpIncrement = "1";
  assert.throws(
    () =>
      quoteHostedRun(expensive, {
        HOSTED_FUNDING_BUDGET: "10000",
        HOSTED_FEE_BUDGET: "100000",
        HOSTED_GAS_LIMIT: "100",
        HOSTED_MAX_FEE_PER_GAS: "2",
        HOSTED_MAX_TRANSACTIONS_PER_RUN: 32,
      }),
    /transaction allowance/,
  );
});
