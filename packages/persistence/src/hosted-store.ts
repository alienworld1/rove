import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import type { CompiledLabScenario } from "@rove/lab";
import type {
  CausalInspectorTrace,
  CompletionSummary,
  CorridorOperatingView,
  HostedSession,
  LabRunView,
} from "@rove/contracts";

export const hashAccessToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class HostedAccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type PublishedSnapshot = {
  run: LabRunView;
  corridor: CorridorOperatingView;
  traces: Record<string, CorridorOperatingView>;
  inspectors: Record<string, CausalInspectorTrace>;
  completions: Record<string, CompletionSummary>;
  accounting: Record<string, unknown>;
};
export type RunReservation = {
  compiled: CompiledLabScenario;
  funding: string;
  fees: string;
  gasLimit: string;
  maxFeePerGas: string;
  maxTransactions: number;
  deploymentFunding: string;
  deploymentFees: string;
};
const denied = () =>
  new HostedAccessError(
    403,
    "Your access has expired. Use an invite to continue, or explore published runs.",
  );
const emptySession: HostedSession = {
  authenticated: false,
  expiresAt: null,
  canRun: false,
  remainingRuns: 0,
  runs: [],
};

export class HostedStore {
  private sql: ReturnType<typeof postgres>;
  constructor(url: string) {
    this.sql = postgres(url, {
      max: 3,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
    });
  }
  async close() {
    await this.sql.end();
  }

  async createInvite(input: {
    expiresAt: string;
    maxRedemptions: number;
    maxRuns: number;
    runsPerWorkspace: number;
    fundingBudget: string;
    feeBudget: string;
  }) {
    const code = randomBytes(32).toString("base64url");
    const id = randomUUID();
    await this
      .sql`insert into hosted_invites (id, code_hash, expires_at, max_redemptions, max_runs, runs_per_workspace, funding_budget, fee_budget)
      values (${id}, ${hashAccessToken(code)}, ${input.expiresAt}, ${input.maxRedemptions}, ${input.maxRuns}, ${input.runsPerWorkspace}, ${input.fundingBudget}, ${input.feeBudget})`;
    return { id, code };
  }
  async revokeInvite(id: string) {
    await this.sql`update hosted_invites set revoked = true where id = ${id}`;
  }

  async rateLimit(key: string, limit: number) {
    const rows = await this
      .sql`insert into hosted_rate_limits (key, window_start, count) values (${key}, now(), 1)
      on conflict (key) do update set
      count = case when hosted_rate_limits.window_start < now() - interval '1 minute' then 1 else hosted_rate_limits.count + 1 end,
      window_start = case when hosted_rate_limits.window_start < now() - interval '1 minute' then now() else hosted_rate_limits.window_start end returning count`;
    if (Number(rows[0].count) > limit)
      throw new HostedAccessError(
        429,
        "Too many requests. Please try again in a minute.",
      );
  }

  async redeem(code: string, oldToken: string | undefined, hours: number) {
    await this.rateLimit("invite-redemption", 30);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashAccessToken(token);
    await this.sql.begin(async (tx) => {
      const [invite] =
        await tx`select * from hosted_invites where code_hash = ${hashAccessToken(code)} and not revoked and expires_at > now() for update`;
      if (!invite)
        throw new HostedAccessError(
          403,
          "That invite is unavailable or has expired. Check your invite and try again.",
        );
      const [old] = oldToken
        ? await tx`select * from hosted_sessions where token_hash = ${hashAccessToken(oldToken)} and invite_id = ${invite.id} and not revoked`
        : [];
      const [count] =
        await tx`select count(distinct workspace_id)::int as count from hosted_sessions where invite_id = ${invite.id}`;
      if (!old && count.count >= invite.max_redemptions)
        throw new HostedAccessError(
          409,
          "This invite has reached its access allowance. You can still explore published runs.",
        );
      const workspaceId = old?.workspace_id ?? randomUUID();
      const expires = new Date(
        Math.min(
          Date.now() + hours * 3_600_000,
          new Date(invite.expires_at).getTime(),
        ),
      ).toISOString();
      if (old)
        await tx`update hosted_sessions set revoked = true where token_hash = ${hashAccessToken(oldToken!)}`;
      await tx`insert into hosted_sessions (token_hash, workspace_id, invite_id, expires_at) values (${tokenHash}, ${workspaceId}, ${invite.id}, ${expires})`;
    });
    return { token, session: await this.session(token) };
  }

  async identity(
    token?: string,
    capability:
      "inspect_owned" | "execute_preset" | "control_owned" = "inspect_owned",
  ) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw denied();
    const [row] = await this
      .sql`select s.*, i.max_runs, i.runs_per_workspace, i.funding_budget, i.fee_budget from hosted_sessions s join hosted_invites i on i.id = s.invite_id
      where s.token_hash = ${hashAccessToken(token)} and s.capabilities ? ${capability} and not s.revoked and not i.revoked and s.expires_at > now() and i.expires_at > now()`;
    if (!row) throw denied();
    return row;
  }
  async session(token?: string): Promise<HostedSession> {
    let identity;
    try {
      identity = await this.identity(token);
    } catch (error) {
      if (error instanceof HostedAccessError) return emptySession;
      throw error;
    }
    const runs = await this
      .sql`select a.run_id as id, coalesce(r.status, a.status) as status, a.created_at from hosted_admissions a left join lab_runs r on r.id = a.run_id where a.workspace_id = ${identity.workspace_id} order by a.created_at desc`;
    const [total] = await this
      .sql`select count(*)::int as count from hosted_admissions where invite_id = ${identity.invite_id}`;
    const remaining = Math.max(
      0,
      Math.min(
        Number(identity.runs_per_workspace) - runs.length,
        Number(identity.max_runs) - total.count,
      ),
    );
    return {
      authenticated: true,
      expiresAt: new Date(identity.expires_at).toISOString(),
      canRun: remaining > 0 && identity.capabilities.includes("execute_preset"),
      remainingRuns: remaining,
      runs: runs.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  }
  async endSession(token?: string) {
    if (token)
      await this
        .sql`update hosted_sessions set revoked = true where token_hash = ${hashAccessToken(token)}`;
  }
  async ownsRun(token: string | undefined, runId: string) {
    const identity = await this.identity(token);
    const [row] = await this
      .sql`select * from hosted_admissions where run_id = ${runId} and workspace_id = ${identity.workspace_id}`;
    if (!row)
      throw new HostedAccessError(
        404,
        "That run isn't available in this workspace.",
      );
    return row;
  }
  async listScenarios(token?: string) {
    const identity = await this.identity(token);
    const rows = await this
      .sql`select id, name, digest, compiled from hosted_scenarios where workspace_id = ${identity.workspace_id} order by updated_at desc limit 50`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      digest: row.digest,
      schemaVersion: (row.compiled as CompiledLabScenario).definition
        .schemaVersion,
      validationStatus: "valid",
    }));
  }
  async scenario(
    token: string | undefined,
    id: string,
  ): Promise<CompiledLabScenario> {
    const identity = await this.identity(token);
    const [row] = await this
      .sql`select compiled from hosted_scenarios where id = ${id} and workspace_id = ${identity.workspace_id}`;
    if (!row)
      throw new HostedAccessError(
        404,
        "That scenario isn't available in this workspace.",
      );
    return row.compiled as CompiledLabScenario;
  }
  async saveScenario(token: string | undefined, compiled: CompiledLabScenario) {
    const identity = await this.identity(token, "control_owned");
    await this.rateLimit(`scenarios:${identity.workspace_id}`, 30);
    if (!/^scenario-[0-9a-f-]{36}$/.test(compiled.definition.id))
      throw new HostedAccessError(
        400,
        "Create an editable copy before saving this scenario.",
      );
    await this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${identity.workspace_id}))`;
      const [count] =
        await tx`select count(*)::int as count from hosted_scenarios where workspace_id = ${identity.workspace_id}`;
      const [existing] =
        await tx`select workspace_id from hosted_scenarios where id = ${compiled.definition.id}`;
      if (existing && existing.workspace_id !== identity.workspace_id)
        throw new HostedAccessError(404, "That scenario isn't available.");
      if (!existing && count.count >= 50)
        throw new HostedAccessError(
          409,
          "Your workspace holds 50 scenarios. Edit an existing scenario to continue.",
        );
      const rows =
        await tx`insert into hosted_scenarios (id, workspace_id, name, digest, compiled) values (${compiled.definition.id}, ${identity.workspace_id}, ${compiled.definition.name}, ${compiled.digest}, ${tx.json(compiled as unknown as postgres.JSONValue)})
        on conflict (id) do update set name = excluded.name, digest = excluded.digest, compiled = excluded.compiled, updated_at = now() where hosted_scenarios.workspace_id = ${identity.workspace_id} returning id`;
      if (!rows.length)
        throw new HostedAccessError(404, "That scenario isn't available.");
    });
    return {
      id: compiled.definition.id,
      name: compiled.definition.name,
      digest: compiled.digest,
    };
  }

  async ownsResource(
    token: string | undefined,
    id: string,
    kind: "corridor" | "lane",
  ) {
    const identity = await this.identity(token);
    const rows =
      kind === "corridor"
        ? await this
            .sql`select r.id from lab_runs r join hosted_admissions a on a.run_id = r.id where a.workspace_id = ${identity.workspace_id} and r.corridor_id = ${id}`
        : await this
            .sql`select r.id from lab_runs r join hosted_admissions a on a.run_id = r.id, jsonb_each_text(r.lane_bindings) b where a.workspace_id = ${identity.workspace_id} and b.value = ${id}`;
    if (!rows.length)
      throw new HostedAccessError(
        404,
        "That selection isn't available in this workspace.",
      );
    return rows[0].id as string;
  }

  async admit(
    token: string | undefined,
    runId: string,
    reservation: RunReservation,
  ) {
    const identity = await this.identity(token, "execute_preset");
    await this.rateLimit(`commands:${identity.workspace_id}`, 60);
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(724819301)`;
      const [session] =
        await tx`select s.token_hash from hosted_sessions s join hosted_invites i on i.id = s.invite_id where s.token_hash = ${hashAccessToken(token!)} and s.capabilities ? 'execute_preset' and not s.revoked and not i.revoked and s.expires_at > now() and i.expires_at > now() for update of s, i`;
      if (!session) throw denied();
      const [existing] =
        await tx`select * from hosted_admissions where run_id = ${runId}`;
      if (existing) {
        if (existing.workspace_id !== identity.workspace_id)
          throw new HostedAccessError(404, "That run isn't available.");
        if (
          (existing.compiled as CompiledLabScenario).digest !==
          reservation.compiled.digest
        )
          throw new HostedAccessError(
            409,
            "This run was started with a different scenario. Open its saved state.",
          );
        return existing;
      }
      const [active] =
        await tx`select count(*)::int as count from hosted_admissions where status <> 'released'`;
      if (active.count > 0)
        throw new HostedAccessError(
          409,
          "Live execution is busy. Explore published runs and try again shortly.",
        );
      const [workspace] =
        await tx`select count(*)::int as count from hosted_admissions where workspace_id = ${identity.workspace_id}`;
      const [invite] =
        await tx`select count(*)::int as count, coalesce(sum(funding_reserved),0)::text as funding, coalesce(sum(fees_reserved),0)::text as fees from hosted_admissions where invite_id = ${identity.invite_id}`;
      const [deployment] =
        await tx`select coalesce(sum(funding_reserved),0)::text as funding, coalesce(sum(fees_reserved),0)::text as fees from hosted_admissions`;
      if (
        workspace.count >= identity.runs_per_workspace ||
        invite.count >= identity.max_runs
      )
        throw new HostedAccessError(
          409,
          "Your run allowance has been used. Your records and published runs remain available.",
        );
      if (
        BigInt(invite.funding) + BigInt(reservation.funding) >
          BigInt(identity.funding_budget) ||
        BigInt(invite.fees) + BigInt(reservation.fees) >
          BigInt(identity.fee_budget) ||
        BigInt(deployment.funding) + BigInt(reservation.funding) >
          BigInt(reservation.deploymentFunding) ||
        BigInt(deployment.fees) + BigInt(reservation.fees) >
          BigInt(reservation.deploymentFees)
      )
        throw new HostedAccessError(
          409,
          "Live execution has reached its funding allowance. Published runs remain available.",
        );
      const [admitted] =
        await tx`insert into hosted_admissions (run_id, workspace_id, invite_id, compiled, funding_reserved, fees_reserved, gas_limit, max_fee_per_gas, max_transactions, created_at)
        values (${runId}, ${identity.workspace_id}, ${identity.invite_id}, ${tx.json(reservation.compiled as unknown as postgres.JSONValue)}, ${reservation.funding}, ${reservation.fees}, ${reservation.gasLimit}, ${reservation.maxFeePerGas}, ${reservation.maxTransactions}, now()) returning *`;
      return admitted;
    });
  }

  async touchRun(runId: string) {
    await this
      .sql`update hosted_admissions set last_activity_at = now() where run_id = ${runId}`;
  }
  async active() {
    return this
      .sql`select * from hosted_admissions where status = 'active' limit 1`;
  }
  async queued() {
    return this
      .sql`select * from hosted_admissions where status = 'queued' order by created_at limit 1`;
  }
  async markStarted(runId: string) {
    await this
      .sql`update hosted_admissions set status = 'active' where run_id = ${runId}`;
  }
  async releaseClosed() {
    await this
      .sql`update hosted_admissions a set status = 'released' from lab_runs r where r.id = a.run_id and a.status = 'active'
      and (select count(*) from jsonb_each_text(r.lane_bindings)) = jsonb_array_length(a.compiled->'definition'->'lanes')
      and not exists (select 1 from jsonb_each_text(r.lane_bindings) b left join lanes l on l.id = b.value where l.id is null or l.state <> 'CLOSED')`;
  }

  async reserveSubmission(
    laneId: string,
    key: string,
    type: string,
    amount: string | undefined,
  ) {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(724819301)`;
      const [admission] =
        await tx`select a.* from hosted_admissions a join lab_runs r on r.id = a.run_id, jsonb_each_text(r.lane_bindings) b where b.value = ${laneId}`;
      if (!admission)
        throw new HostedAccessError(
          403,
          "Payment work has no hosted allowance.",
        );
      const [existing] =
        await tx`select effect_key from hosted_submissions where effect_key = ${key}`;
      if (existing)
        throw new HostedAccessError(
          409,
          "This payment submission is already reserved. Check its chain state before continuing.",
        );
      const funding = [
        "payment.open_requested",
        "payment.top_up_requested",
      ].includes(type)
        ? BigInt(amount ?? "0")
        : 0n;
      const fee =
        BigInt(admission.gas_limit) * BigInt(admission.max_fee_per_gas);
      const compiled = admission.compiled as CompiledLabScenario;
      const policy = compiled.definition.corridor.reservePolicy;
      if (
        funding &&
        amount !==
          (type === "payment.open_requested"
            ? policy.initialDeposit
            : policy.topUpIncrement)
      )
        throw new HostedAccessError(
          403,
          "This payment exceeds the approved reserve policy.",
        );
      const [used] =
        await tx`select count(*)::int as count, coalesce(sum(funding),0)::text as funding, coalesce(sum(fee),0)::text as fee from hosted_submissions where run_id = ${admission.run_id}`;
      if (
        used.count >= admission.max_transactions ||
        BigInt(used.funding) + funding > BigInt(admission.funding_reserved) ||
        BigInt(used.fee) + fee > BigInt(admission.fees_reserved)
      )
        throw new HostedAccessError(
          409,
          "This run has reached its payment allowance.",
        );
      await tx`insert into hosted_submissions (effect_key, run_id, lane_id, effect_type, funding, fee) values (${key}, ${admission.run_id}, ${laneId}, ${type}, ${funding.toString()}, ${fee.toString()})`;
      return {
        gas: BigInt(admission.gas_limit),
        maxFeePerGas: BigInt(admission.max_fee_per_gas),
        maxPriorityFeePerGas: 0n,
      };
    });
  }

  async listPublished() {
    const rows = await this
      .sql`select run_id, title, description, payment, published_at from published_runs order by published_at desc limit 50`;
    return rows.map((row) => ({
      id: row.run_id,
      title: row.title,
      description: row.description,
      payment: row.payment,
      publishedAt: new Date(row.published_at).toISOString(),
    }));
  }
  async published(runId: string) {
    const [row] = await this
      .sql`select snapshot from published_runs where run_id = ${runId}`;
    return (row?.snapshot as PublishedSnapshot | undefined) ?? null;
  }
  async publishedResource(id: string, kind: "corridor" | "lane") {
    const rows =
      kind === "corridor"
        ? await this
            .sql`select snapshot from published_runs where snapshot->'corridor'->'corridor'->>'id' = ${id}`
        : await this
            .sql`select snapshot from published_runs where snapshot->'completions' ? ${id}`;
    return (rows[0]?.snapshot as PublishedSnapshot | undefined) ?? null;
  }
  async publish(runId: string, snapshot: PublishedSnapshot) {
    await this
      .sql`insert into published_runs (run_id, title, description, payment, snapshot, published_at)
      values (${runId}, ${snapshot.run.scenario.name}, ${snapshot.run.scenario.description}, ${snapshot.run.environment.payment}, ${this.sql.json(snapshot as unknown as postgres.JSONValue)}, now()) on conflict (run_id) do nothing`;
  }
}
