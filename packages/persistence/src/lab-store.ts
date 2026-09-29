import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { CompiledLabScenario } from "@rove/lab";
import { labRunEvents, labRuns, labScenarios } from "./schema.js";
import { StoreError } from "./index.js";

export class LabStore {
  private client: ReturnType<typeof postgres>;
  private db: ReturnType<typeof drizzle>;

  constructor(url: string) {
    this.client = postgres(url);
    this.db = drizzle(this.client);
  }

  async close() {
    await this.client.end();
  }

  async saveScenario(compiled: CompiledLabScenario) {
    const now = new Date().toISOString();
    await this.db
      .insert(labScenarios)
      .values({
        id: compiled.definition.id,
        name: compiled.definition.name,
        definition: compiled.definition,
        schemaVersion: compiled.definition.schemaVersion,
        compilerVersion: compiled.compilerVersion,
        digest: compiled.digest,
        validationStatus: "valid",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: labScenarios.id,
        set: {
          name: compiled.definition.name,
          definition: compiled.definition,
          schemaVersion: compiled.definition.schemaVersion,
          compilerVersion: compiled.compilerVersion,
          digest: compiled.digest,
          validationStatus: "valid",
          updatedAt: now,
        },
      });
    return {
      id: compiled.definition.id,
      name: compiled.definition.name,
      digest: compiled.digest,
    };
  }

  async listScenarios() {
    return this.db
      .select({
        id: labScenarios.id,
        name: labScenarios.name,
        digest: labScenarios.digest,
        schemaVersion: labScenarios.schemaVersion,
        validationStatus: labScenarios.validationStatus,
      })
      .from(labScenarios)
      .orderBy(labScenarios.name)
      .limit(50);
  }

  async getScenario(id: string) {
    const row = (
      await this.db.select().from(labScenarios).where(eq(labScenarios.id, id))
    )[0];
    if (!row) throw new StoreError("NOT_FOUND");
    return row;
  }

  async createRun(compiled: CompiledLabScenario, replayOfRunId?: string) {
    const scenario = await this.getScenario(compiled.definition.id);
    if (scenario.digest !== compiled.digest)
      throw new StoreError("VERSION_CONFLICT");
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx.insert(labRuns).values({
        id,
        scenarioId: scenario.id,
        scenarioDigest: compiled.digest,
        compiledSnapshot: compiled,
        status: "initializing",
        cursor: 0,
        version: 0,
        traceOffsetMs: 0,
        speed: "1",
        laneBindings: {},
        replayOfRunId: replayOfRunId ?? null,
        startedAt: now,
        updatedAt: now,
      });
      await tx.insert(labRunEvents).values(
        compiled.events.map((event, sequence) => ({
          id: randomUUID(),
          runId: id,
          sequence,
          scenarioEventId: event.id,
          eventType: event.type,
          laneKey: event.laneKey,
          traceOffsetMs: event.traceOffsetMs,
          traceTime: new Date(
            Date.parse(compiled.definition.traceEpoch) + event.traceOffsetMs,
          ).toISOString(),
          payload: event,
          status: "pending",
          createdAt: now,
        })),
      );
    });
    return this.getRun(id);
  }

  async getRun(id: string) {
    const run = (
      await this.db.select().from(labRuns).where(eq(labRuns.id, id))
    )[0];
    if (!run) throw new StoreError("NOT_FOUND");
    const events = await this.db
      .select()
      .from(labRunEvents)
      .where(eq(labRunEvents.runId, id))
      .orderBy(labRunEvents.sequence);
    return { run, events };
  }

  async getLatestRunIdForCorridor(corridorId: string) {
    const run = (
      await this.db
        .select({ id: labRuns.id })
        .from(labRuns)
        .where(eq(labRuns.corridorId, corridorId))
        .orderBy(sql`${labRuns.startedAt} desc`)
        .limit(1)
    )[0];
    return run?.id ?? null;
  }

  async bindRun(
    id: string,
    corridorId: string,
    bindings: Record<string, string>,
  ) {
    const [run] = await this.db
      .update(labRuns)
      .set({
        corridorId,
        laneBindings: bindings,
        status: "ready",
        version: sql`${labRuns.version} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(labRuns.id, id), eq(labRuns.status, "initializing")))
      .returning();
    if (!run) throw new StoreError("VERSION_CONFLICT");
    return run;
  }

  async updateAwaiting(
    id: string,
    wait: { laneKey: string; operation: string } | null,
  ) {
    return this.db.transaction(async (tx) => {
      const run = (
        await tx.select().from(labRuns).where(eq(labRuns.id, id)).for("update")
      )[0];
      if (!run) throw new StoreError("NOT_FOUND");
      if (["completed", "failed"].includes(run.status)) return run;
      if (run.status === "awaiting_chain" && !wait) return run;
      const previous = run.awaiting as {
        laneKey?: string;
        operation?: string;
        startedAt?: string;
      } | null;
      if (
        previous?.laneKey === wait?.laneKey &&
        previous?.operation === wait?.operation
      )
        return run;
      const [updated] = await tx
        .update(labRuns)
        .set({
          awaiting: wait
            ? { ...wait, startedAt: new Date().toISOString() }
            : null,
          version: sql`${labRuns.version} + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(labRuns.id, id))
        .returning();
      return updated;
    });
  }

  async changeTransport(
    id: string,
    expectedVersion: number,
    status: "running" | "paused" | "ready",
    allowedStatuses: Array<"ready" | "running" | "paused" | "awaiting_chain">,
    speed?: number,
  ) {
    const [run] = await this.db
      .update(labRuns)
      .set({
        status,
        speed: speed === undefined ? undefined : String(speed),
        version: sql`${labRuns.version} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(labRuns.id, id),
          eq(labRuns.version, expectedVersion),
          inArray(labRuns.status, allowedStatuses),
        ),
      )
      .returning();
    if (!run) throw new StoreError("VERSION_CONFLICT");
    return run;
  }

  async claimNext(
    id: string,
    expectedVersion: number,
    unavailableLanes: ReadonlySet<string> = new Set(),
  ) {
    return this.db.transaction(async (tx) => {
      const run = (
        await tx.select().from(labRuns).where(eq(labRuns.id, id)).for("update")
      )[0];
      if (!run) throw new StoreError("NOT_FOUND");
      if (run.version !== expectedVersion)
        throw new StoreError("VERSION_CONFLICT", run.version);
      if (
        !["ready", "running", "paused", "awaiting_chain"].includes(run.status)
      )
        throw new StoreError("CONFLICT");
      const ordered = await tx
        .select()
        .from(labRunEvents)
        .where(eq(labRunEvents.runId, id))
        .orderBy(labRunEvents.sequence)
        .for("update");
      const blocked = new Set<string>();
      let event: (typeof ordered)[number] | undefined;
      for (const item of ordered) {
        if (item.status === "blocked" && item.laneKey)
          blocked.add(item.laneKey);
        if (
          item.status === "completed" &&
          item.eventType === "recovery_reading" &&
          item.laneKey
        )
          blocked.delete(item.laneKey);
        if (!["pending", "dispatching"].includes(item.status)) continue;
        if (item.laneKey && unavailableLanes.has(item.laneKey)) continue;
        if (
          item.laneKey &&
          blocked.has(item.laneKey) &&
          item.eventType !== "recovery_reading"
        )
          continue;
        event = item;
        break;
      }
      if (!event) return null;
      if (
        event.status === "dispatching" &&
        event.leaseUntil &&
        Date.parse(event.leaseUntil) > Date.now()
      )
        throw new StoreError("CONFLICT");
      const leaseUntil = new Date(Date.now() + 30_000).toISOString();
      await tx
        .update(labRunEvents)
        .set({ status: "dispatching", leaseUntil })
        .where(eq(labRunEvents.id, event.id));
      return { run, event };
    });
  }

  async completeEvent(
    id: string,
    eventId: string,
    status: "completed" | "rejected" | "blocked" | "awaiting_chain" | "failed",
    reasonCode?: string,
    commandId?: string,
  ) {
    return this.db.transaction(async (tx) => {
      const run = (
        await tx.select().from(labRuns).where(eq(labRuns.id, id)).for("update")
      )[0];
      const event = (
        await tx
          .select()
          .from(labRunEvents)
          .where(and(eq(labRunEvents.runId, id), eq(labRunEvents.id, eventId)))
          .for("update")
      )[0];
      if (!run || !event) throw new StoreError("NOT_FOUND");
      if (["completed", "rejected"].includes(event.status)) return run;
      await tx
        .update(labRunEvents)
        .set({
          status,
          reasonCode: reasonCode ?? null,
          commandId: commandId ?? null,
          completedAt:
            status === "completed" || status === "rejected"
              ? new Date().toISOString()
              : null,
          leaseUntil: null,
        })
        .where(eq(labRunEvents.id, eventId));
      const updatedEvents = await tx
        .select({
          sequence: labRunEvents.sequence,
          status: labRunEvents.status,
        })
        .from(labRunEvents)
        .where(eq(labRunEvents.runId, id))
        .orderBy(labRunEvents.sequence);
      const firstOpen = updatedEvents.find(
        (item) => !["completed", "rejected"].includes(item.status),
      );
      const cursor = firstOpen?.sequence ?? updatedEvents.length;
      const traceOffsetMs = Math.max(run.traceOffsetMs, event.traceOffsetMs);
      const completed = updatedEvents.every((item) =>
        ["completed", "rejected", "blocked"].includes(item.status),
      );
      const [updated] = await tx
        .update(labRuns)
        .set({
          cursor,
          traceOffsetMs,
          status:
            status === "failed"
              ? "failed"
              : completed
                ? "completed"
                : status === "awaiting_chain"
                  ? "awaiting_chain"
                  : run.status,
          awaiting:
            status === "awaiting_chain"
              ? {
                  laneKey: event.laneKey,
                  operation: "payment",
                  startedAt: new Date().toISOString(),
                }
              : null,
          failureCode:
            status === "failed"
              ? (reasonCode ?? "RUN_EVENT_UNAVAILABLE")
              : null,
          version: sql`${labRuns.version} + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(labRuns.id, id))
        .returning();
      return updated;
    });
  }

  async recordEventCommand(
    eventId: string,
    commandId: string,
    expectedLaneVersion: number,
  ) {
    const [event] = await this.db
      .update(labRunEvents)
      .set({ commandId, expectedLaneVersion })
      .where(
        and(
          eq(labRunEvents.id, eventId),
          eq(labRunEvents.status, "dispatching"),
        ),
      )
      .returning();
    if (!event) throw new StoreError("VERSION_CONFLICT");
    return event;
  }

  async listRunningRuns() {
    return this.db
      .select({
        id: labRuns.id,
        version: labRuns.version,
        updatedAt: labRuns.updatedAt,
        traceOffsetMs: labRuns.traceOffsetMs,
        speed: labRuns.speed,
      })
      .from(labRuns)
      .where(eq(labRuns.status, "running"))
      .limit(20);
  }

  async listActiveRuns() {
    return this.db
      .select({
        id: labRuns.id,
        compiledSnapshot: labRuns.compiledSnapshot,
        laneBindings: labRuns.laneBindings,
      })
      .from(labRuns)
      .where(
        sql`${labRuns.status} in ('ready', 'running', 'paused', 'awaiting_chain')`,
      )
      .limit(20);
  }

  async ownsLane(laneId: string) {
    const rows = await this.db.execute(
      sql`select exists(select 1 from lab_runs, jsonb_each_text(lab_runs.lane_bindings) as binding where binding.value = ${laneId}) as owned`,
    );
    return rows[0]?.owned === true;
  }
}
