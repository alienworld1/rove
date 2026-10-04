import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { compileLabScenario } from "@rove/lab";
import {
  northstarVoltwayScenario,
  controlledMeterProfiles,
} from "@rove/lab/scenarios/northstar-voltway";
import {
  HostedStore,
  HostedAccessError,
  hashAccessToken,
} from "./hosted-store.js";
import { LabStore } from "./lab-store.js";
import { ChargingStore } from "./index.js";

const url = process.env.HOSTED_TEST_DATABASE_URL;
test(
  "durable invite ownership, atomic admission, cumulative budgets and submission limits",
  {
    skip:
      !url && "Set HOSTED_TEST_DATABASE_URL to an isolated migrated database",
  },
  async () => {
    const access = new HostedStore(url!);
    const lab = new LabStore(url!);
    const charging = new ChargingStore(url!);
    const sql = postgres(url!);
    const ids: string[] = [];
    try {
      const invite = await access.createInvite({
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        maxRedemptions: 2,
        maxRuns: 3,
        runsPerWorkspace: 2,
        fundingBudget: "3600",
        feeBudget: "1600",
      });
      ids.push(invite.id);
      const first = await access.redeem(invite.code, undefined, 24);
      const rotated = await access.redeem(invite.code, first.token, 24);
      assert.equal((await access.session(first.token)).authenticated, false);
      assert.equal(rotated.session.remainingRuns, 2);
      const second = await access.redeem(invite.code, undefined, 24);
      await assert.rejects(
        access.redeem(invite.code, undefined, 24),
        (error: unknown) =>
          error instanceof HostedAccessError && error.status === 409,
      );
      const [stored] =
        await sql`select code_hash from hosted_invites where id = ${invite.id}`;
      assert.equal(stored.code_hash, hashAccessToken(invite.code));
      assert.notEqual(stored.code_hash, invite.code);
      const scenario = {
        ...northstarVoltwayScenario,
        id: `access-${randomUUID()}`,
      };
      const compiled = compileLabScenario(scenario, controlledMeterProfiles);
      const reservation = {
        compiled,
        funding: "1800",
        fees: "800",
        gasLimit: "100",
        maxFeePerGas: "2",
        maxTransactions: 4,
        deploymentFunding: "3600",
        deploymentFees: "1600",
      };
      const runId = randomUUID();
      await sql`update hosted_sessions set capabilities = '["inspect_owned"]'::jsonb where token_hash = ${hashAccessToken(rotated.token)}`;
      assert.equal((await access.session(rotated.token)).canRun, false);
      await assert.rejects(access.admit(rotated.token, runId, reservation));
      await assert.rejects(access.identity(rotated.token, "control_owned"));
      await sql`update hosted_sessions set capabilities = '["inspect_owned","execute_preset","control_owned"]'::jsonb where token_hash = ${hashAccessToken(rotated.token)}`;
      const admitted = await Promise.all([
        access.admit(rotated.token, runId, reservation),
        access.admit(rotated.token, runId, reservation),
      ]);
      assert.equal(admitted[0].run_id, admitted[1].run_id);
      assert.equal((await access.session(rotated.token)).remainingRuns, 1);
      await assert.rejects(
        access.ownsRun(second.token, runId),
        (error: unknown) =>
          error instanceof HostedAccessError && error.status === 404,
      );
      await assert.rejects(
        access.admit(second.token, randomUUID(), reservation),
        (error: unknown) =>
          error instanceof HostedAccessError && error.status === 409,
      );
      await lab.saveScenario(compiled);
      await lab.createRun(compiled, undefined, runId);
      await access.markStarted(runId);
      const corridor = await charging.createCorridor(
        {
          commandId: randomUUID(),
          correlationId: randomUUID(),
          ...scenario.corridor,
          meters: scenario.lanes.map((lane) => ({
            meterId: lane.meterId,
            publicKeyHex: "a".repeat(130),
            fingerprint: randomUUID(),
            source: "controlled-fixture" as const,
          })),
        },
        "hosted-test",
      );
      const bindings: Record<string, string> = {};
      for (const lane of scenario.lanes) {
        const started = await charging.startLane(
          {
            commandId: randomUUID(),
            correlationId: randomUUID(),
            corridorId: corridor.id,
            externalSessionId: randomUUID(),
            chargerId: lane.chargerId,
            meterId: lane.meterId,
            maxPowerWatts: lane.maxPowerWatts,
            expectedProofIntervalMs: lane.expectedProofIntervalMs,
          },
          "hosted-test",
        );
        bindings[lane.key] = started.id;
      }
      await lab.bindRun(runId, corridor.id, bindings);
      await assert.rejects(
        access.ownsResource(second.token, bindings["lane-a"], "lane"),
        (error: unknown) =>
          error instanceof HostedAccessError && error.status === 404,
      );
      assert.equal(
        await access.ownsResource(rotated.token, corridor.id, "corridor"),
        runId,
      );
      const fee = await access.reserveSubmission(
        bindings["lane-a"],
        `${runId}:open-a`,
        "payment.open_requested",
        "500",
      );
      assert.equal(fee.gas * fee.maxFeePerGas, 200n);
      await assert.rejects(
        access.reserveSubmission(
          bindings["lane-a"],
          `${runId}:open-a`,
          "payment.open_requested",
          "500",
        ),
      );
      await assert.rejects(
        access.reserveSubmission(
          bindings["lane-a"],
          `${runId}:bad`,
          "payment.top_up_requested",
          "301",
        ),
      );
      await access.reserveSubmission(
        bindings["lane-b"],
        `${runId}:open-b`,
        "payment.open_requested",
        "500",
      );
      await access.reserveSubmission(
        bindings["lane-c"],
        `${runId}:open-c`,
        "payment.open_requested",
        "500",
      );
      await access.reserveSubmission(
        bindings["lane-c"],
        `${runId}:top`,
        "payment.top_up_requested",
        "300",
      );
      await assert.rejects(
        access.reserveSubmission(
          bindings["lane-c"],
          `${runId}:extra`,
          "payment.top_up_requested",
          "300",
        ),
      );
      await assert.rejects(
        access.reserveSubmission(
          bindings["lane-c"],
          `${runId}:fee`,
          "payment.settlement_requested",
          "1",
        ),
      );
      await access.releaseClosed();
      await assert.rejects(
        access.admit(second.token, randomUUID(), reservation),
      );
      await sql`update lanes set state = 'CLOSED' where corridor_id = ${corridor.id}`;
      await access.releaseClosed();
      const nextId = randomUUID();
      await access.admit(second.token, nextId, reservation);
      await sql`update hosted_admissions set status = 'released' where run_id = ${nextId}`;
      await assert.rejects(
        access.admit(rotated.token, randomUUID(), reservation),
        /funding allowance/,
      );
      const reopened = new HostedStore(url!);
      try {
        assert.equal((await reopened.session(rotated.token)).remainingRuns, 1);
        assert.equal(
          (await reopened.ownsRun(rotated.token, runId)).run_id,
          runId,
        );
      } finally {
        await reopened.close();
      }
      await access.revokeInvite(invite.id);
      assert.equal((await access.session(rotated.token)).authenticated, false);
      await assert.rejects(access.ownsRun(rotated.token, runId));
      assert.equal((await access.queued()).length, 0);
      assert.ok(
        !(await access.listPublished()).some((run) => run.id === runId),
      );
    } finally {
      for (const id of ids) {
        await sql`delete from hosted_submissions where run_id in (select run_id from hosted_admissions where invite_id = ${id})`;
        await sql`delete from hosted_admissions where invite_id = ${id}`;
        await sql`delete from hosted_sessions where invite_id = ${id}`;
        await sql`delete from hosted_invites where id = ${id}`;
      }
      await Promise.all([
        access.close(),
        lab.close(),
        charging.close(),
        sql.end(),
      ]);
    }
  },
);
