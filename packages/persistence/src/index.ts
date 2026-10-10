import { readAccountingConfig } from "@rove/config";
import { normalizeAccountingRecord, compareSessionTotals } from "@rove/ocpi";
import { completionSummarySchema } from "@rove/contracts";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import stringify from "fast-json-stable-stringify";
import type { CorridorConfig, Lane, VerifiedObservation } from "@rove/domain";
import type {
  CausalInspectorTrace,
  CreateCorridorInput,
  LaneCommandInput,
  LaneProjection,
  RealtimePresentationEvent,
  StartLaneInput,
} from "@rove/contracts";
import {
  causalInspectorTraceSchema,
  laneProjectionSchema,
  lanePresentationSnapshotSchema,
  reasonTextFor,
  realtimePresentationEventSchema,
} from "@rove/contracts";
import { verifyOcmf } from "@rove/evidence";
import { transitionLane } from "@rove/protection";
import {
  auditProjection,
  cdrs,
  reconciliations,
  corridors,
  domainEvents,
  evidenceVerifications,
  lanes,
  meterEvidence,
  meterIdentities,
  outboxJobs,
  paymentOperations,
  processedCommands,
  tempoChainSnapshots,
  tempoChannels,
  tempoTransactions,
  tempoVouchers,
  labRuns,
} from "./schema.js";
export { LabStore } from "./lab-store.js";
export {
  HostedStore,
  HostedAccessError,
  hashAccessToken,
} from "./hosted-store.js";
export type { PublishedSnapshot, RunReservation } from "./hosted-store.js";

export class StoreError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "VERSION_CONFLICT"
      | "ACCESS_DENIED"
      | "INCONSISTENT_PROJECTION"
      | "VALIDATION",
    public currentVersion?: number,
  ) {
    super(code);
  }
}

type Database = ReturnType<typeof drizzle>;
type LaneRow = typeof lanes.$inferSelect;
export type VerifiedVoucher = {
  channelId: string;
  cumulativeAmount: string;
  digest: string;
  signature: string;
  signerRef: string;
  domainRef: string;
};
const hash = (value: unknown) =>
  createHash("sha256").update(stringify(value)).digest("hex");
const date = (value: string) => new Date(value).toISOString();

function isFresh(now: string, observedAt: string, maxAgeMs: number) {
  const age = BigInt(Date.parse(now)) - BigInt(Date.parse(observedAt));
  return age >= 0n && age <= BigInt(maxAgeMs);
}

function protectionSnapshot(lane: Lane) {
  return {
    version: lane.version,
    state: lane.state,
    reasonCodes: lane.reasonCodes,
    trustedEnergyWh: lane.trustedEnergyWh,
    trustedDeliveredValue: lane.trustedDeliveredValue,
    authorizedValue: lane.authorizedValue,
    settledValue: lane.settledValue,
    confirmedDeposit: lane.confirmedDeposit,
    fundedHeadroom: lane.fundedHeadroom,
    protectedValue: lane.protectedValue,
    unverifiedServiceBound: lane.unverifiedServiceBound,
    worstCaseDeliveredValue: lane.worstCaseDeliveredValue,
    unprotectedExposureBound: lane.unprotectedExposureBound,
  };
}

function summaryForLane(lane: Lane) {
  if (lane.state === "PAUSE_REQUIRED")
    return "Charging should pause until protection is restored.";
  if (lane.reasonCodes.some((reason) => reason.startsWith("EVIDENCE_")))
    return "Meter readings need checking.";
  if (lane.reasonCodes.some((reason) => reason.startsWith("PAYMENT_")))
    return "Payment status needs checking.";
  if (lane.state === "INITIALIZING")
    return "Waiting for trusted readings and confirmed funding.";
  if (lane.state === "PROTECTED") return "Protection is ready.";
  return "Protection needs attention.";
}

function assertProjection(
  lane: Lane,
  audit: typeof auditProjection.$inferSelect | undefined,
  event: typeof domainEvents.$inferSelect | undefined,
) {
  const payload = event?.payload as { projection?: unknown } | undefined;
  if (
    !audit ||
    !event ||
    audit.laneVersion !== lane.version ||
    audit.state !== lane.state ||
    stringify(audit.reasonCodes) !== stringify(lane.reasonCodes) ||
    stringify(payload?.projection) !== stringify(protectionSnapshot(lane))
  )
    throw new StoreError("INCONSISTENT_PROJECTION");
}

function fromRow(row: LaneRow): Lane {
  return {
    id: row.id,
    version: row.version,
    corridorId: row.corridorId,
    externalSessionId: row.externalSessionId,
    chargerId: row.chargerId,
    meterId: row.meterId,
    maxPowerWatts: row.maxPowerWatts,
    expectedProofIntervalMs: row.expectedProofIntervalMs,
    tariff: row.tariffSnapshot as Lane["tariff"],
    policy: row.policySnapshot as Lane["policy"],
    reservePolicy: row.reservePolicySnapshot as Lane["reservePolicy"],
    settlementPolicy: row.settlementPolicySnapshot as Lane["settlementPolicy"],
    settlementAssetId: row.settlementAssetId,
    tempoNetwork: row.tempoNetwork,
    state: row.state as Lane["state"],
    serviceStarted: row.serviceStarted,
    evidenceHealth: row.evidenceHealth as Lane["evidenceHealth"],
    chainHealth: row.chainHealth as Lane["chainHealth"],
    signerHealth: row.signerHealth as Lane["signerHealth"],
    trustedEnergyWh: row.trustedEnergyWh,
    trustedDeliveredValue: row.trustedDeliveredValue,
    authorizedValue: row.authorizedValue,
    settledValue: row.settledValue,
    confirmedDeposit: row.confirmedDeposit,
    fundedHeadroom: row.fundedHeadroom,
    lastTrustedEvidenceAt: row.lastTrustedEvidenceAt
      ? date(row.lastTrustedEvidenceAt)
      : null,
    lastChainObservedAt: row.lastChainObservedAt
      ? date(row.lastChainObservedAt)
      : null,
    lastEvidenceHash: row.lastEvidenceHash,
    lastEvidenceSequence: row.lastEvidenceSequence,
    channelId: row.channelId,
    unverifiedServiceBound: row.unverifiedServiceBound,
    worstCaseDeliveredValue: row.worstCaseDeliveredValue,
    protectedValue: row.protectedValue,
    protectedWatermark: row.protectedWatermark,
    unprotectedExposureBound: row.unprotectedExposureBound,
    reasonCodes: row.reasonCodes as string[],
    finalCdrId: row.finalCdrId,
    completion: row.completion as Lane["completion"],
    createdAt: date(row.createdAt),
    updatedAt: date(row.updatedAt),
  };
}

function laneValues(lane: Lane) {
  return {
    id: lane.id,
    version: lane.version,
    corridorId: lane.corridorId,
    externalSessionId: lane.externalSessionId,
    chargerId: lane.chargerId,
    meterId: lane.meterId,
    maxPowerWatts: lane.maxPowerWatts,
    expectedProofIntervalMs: lane.expectedProofIntervalMs,
    tariffSnapshot: lane.tariff,
    policySnapshot: lane.policy,
    reservePolicySnapshot: lane.reservePolicy,
    settlementPolicySnapshot: lane.settlementPolicy,
    settlementAssetId: lane.settlementAssetId,
    tempoNetwork: lane.tempoNetwork,
    state: lane.state,
    serviceStarted: lane.serviceStarted,
    evidenceHealth: lane.evidenceHealth,
    chainHealth: lane.chainHealth,
    signerHealth: lane.signerHealth,
    trustedEnergyWh: lane.trustedEnergyWh,
    trustedDeliveredValue: lane.trustedDeliveredValue,
    authorizedValue: lane.authorizedValue,
    settledValue: lane.settledValue,
    confirmedDeposit: lane.confirmedDeposit,
    fundedHeadroom: lane.fundedHeadroom,
    lastTrustedEvidenceAt: lane.lastTrustedEvidenceAt,
    lastChainObservedAt: lane.lastChainObservedAt,
    lastEvidenceHash: lane.lastEvidenceHash,
    lastEvidenceSequence: lane.lastEvidenceSequence,
    channelId: lane.channelId,
    unverifiedServiceBound: lane.unverifiedServiceBound,
    worstCaseDeliveredValue: lane.worstCaseDeliveredValue,
    protectedValue: lane.protectedValue,
    protectedWatermark: lane.protectedWatermark,
    unprotectedExposureBound: lane.unprotectedExposureBound,
    reasonCodes: lane.reasonCodes,
    finalCdrId: lane.finalCdrId,
    completion: lane.completion ?? null,
    createdAt: lane.createdAt,
    updatedAt: lane.updatedAt,
  };
}

function corridorFromRow(row: typeof corridors.$inferSelect): CorridorConfig {
  return {
    id: row.id,
    name: row.name,
    payerEmsp: row.payerEmsp,
    payeeCpo: row.payeeCpo,
    settlementAssetId: row.settlementAssetId,
    tempoNetwork: row.tempoNetwork,
    tariff: {
      perKwh: row.tariffPerKwh,
      tariffDecimals: row.tariffDecimals,
      assetDecimals: row.assetDecimals,
    },
    protectionPolicy:
      row.protectionPolicy as CorridorConfig["protectionPolicy"],
    reservePolicy: row.reservePolicy as CorridorConfig["reservePolicy"],
    settlementPolicy:
      row.settlementPolicy as CorridorConfig["settlementPolicy"],
    accountingProfile:
      row.accountingProfile as CorridorConfig["accountingProfile"],
    status: row.status as CorridorConfig["status"],
    createdAt: date(row.createdAt),
    updatedAt: date(row.updatedAt),
  };
}

function projectionValues(projection?: Record<string, unknown>) {
  if (
    !projection ||
    typeof projection.trustedDeliveredValue !== "string" ||
    typeof projection.protectedValue !== "string" ||
    typeof projection.unprotectedExposureBound !== "string" ||
    typeof projection.authorizedValue !== "string" ||
    typeof projection.settledValue !== "string" ||
    !(
      projection.confirmedDeposit === null ||
      typeof projection.confirmedDeposit === "string"
    ) ||
    !(
      projection.fundedHeadroom === null ||
      typeof projection.fundedHeadroom === "string"
    )
  )
    return null;
  return {
    trusted: projection.trustedDeliveredValue,
    protected: projection.protectedValue,
    exposure: projection.unprotectedExposureBound,
    authorized: projection.authorizedValue,
    settled: projection.settledValue,
    deposit: projection.confirmedDeposit,
    headroom: projection.fundedHeadroom,
  };
}

function operationStatusAtEvent(eventType: string, current: string | null) {
  if (eventType === "payment.channel_closed") return "confirmed";
  const stage =
    /^payment\.(?:open|top_up|settlement|voucher)_(pending|submitted|completed|failed)$/.exec(
      eventType,
    )?.[1];
  if (stage === "completed") return "confirmed";
  if (stage === "submitted" || stage === "pending" || stage === "failed")
    return stage;
  if (eventType === "payment.voucher_verified") return "confirmed";
  return current &&
    ["pending", "submitted", "confirmed", "failed"].includes(current)
    ? current
    : null;
}

function summarizeSignature(signature: string | null) {
  if (!signature) return "Verified signature";
  return signature.length <= 18
    ? signature
    : `${signature.slice(0, 10)}…${signature.slice(-8)}`;
}

function verificationChecks(reasonCode: string | null) {
  const rejected = (code: string) =>
    reasonCode === code ? "rejected" : "unavailable";
  if (!reasonCode)
    return {
      signature: "verified",
      identity: "verified",
      continuity: "verified",
      replay: "verified",
      freshness: "verified",
    } as const;
  return {
    signature: rejected("EVIDENCE_SIGNATURE_INVALID"),
    identity:
      reasonCode === "EVIDENCE_SOURCE_MISMATCH" ||
      reasonCode === "EVIDENCE_SESSION_MISMATCH"
        ? "rejected"
        : "unavailable",
    continuity: rejected("EVIDENCE_SEQUENCE_INVALID"),
    replay: rejected("EVIDENCE_REPLAY"),
    freshness: rejected("EVIDENCE_STALE"),
  } as const;
}

export class ChargingStore {
  private client: ReturnType<typeof postgres>;
  private db: Database;
  readonly recovery = new Map<
    string,
    {
      status: "pending" | "ready" | "blocked";
      checkedAt: string | null;
      reasonCodes: string[];
    }
  >();
  recoveryEnforced = false;

  async requestEffectCheck(laneId: string) {
    await this.db
      .update(outboxJobs)
      .set({ nextAttemptAt: new Date().toISOString() })
      .where(
        and(
          eq(outboxJobs.laneId, laneId),
          sql`${outboxJobs.status} in ('pending', 'submitted', 'failed') and ${outboxJobs.attemptCount} > 0`,
        ),
      );
  }

  async hasUnresolvedSubmission(laneId: string) {
    const [row] = await this.db
      .select({ id: outboxJobs.id })
      .from(outboxJobs)
      .where(
        and(
          eq(outboxJobs.laneId, laneId),
          sql`${outboxJobs.attemptCount} > 0 and ${outboxJobs.status} <> 'completed' and not (${outboxJobs.status} = 'failed' and ${outboxJobs.lastError} = 'PAYMENT_TRANSACTION_FAILED')`,
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async listRecoveryLanes() {
    return (await this.db.select().from(lanes)).map(fromRow);
  }

  async getCompletion(laneId: string) {
    return this.consistentRead((store) => store.readCompletion(laneId));
  }

  private async readCompletion(laneId: string) {
    const context = await this.getPaymentContext(laneId);
    const projection = await this.getLane(laneId);
    const completion = context.lane.completion
      ? structuredClone(context.lane.completion)
      : null;
    if (completion?.closure && !completion.closure.transactionHash)
      completion.closure.transactionHash =
        projection.operations.find((operation) => operation.type === "close")
          ?.transactionHash ?? null;
    const recovery = this.recovery.get(laneId) ?? {
      status: this.recoveryEnforced ? ("pending" as const) : ("ready" as const),
      checkedAt: null,
      reasonCodes: [],
    };
    const events = await this.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.laneId, laneId))
      .orderBy(sql`${domainEvents.ordinal} desc`);
    return completionSummarySchema.parse({
      laneId,
      externalSessionId: context.lane.externalSessionId,
      version: projection.version,
      completion,
      recovery,
      failedOperations: projection.operations
        .filter((operation) => operation.status === "failed")
        .map((operation) => ({
          operation: operation.type,
          reasonCode: operation.reasonCode,
        })),
      canFinish:
        (!completion ||
          ((!completion.finalEvidenceHash || !completion.cdr) &&
            completion.status !== "closed")) &&
        projection.meterSource === "controlled-fixture" &&
        recovery.status === "ready",
      canClose:
        completion?.status === "reconciled" &&
        completion.comparison?.status === "MATCH" &&
        (projection.chainFreshness === "current" ||
          (context.lane.tempoNetwork === "local-simulation" &&
            context.lane.chainHealth === "fresh")) &&
        recovery.status === "ready" &&
        projection.operations.every((op) => op.status === "confirmed"),
      paymentSource: projection.paymentSource,
      evidenceEventId:
        events.find(
          (event) => event.evidenceHash === completion?.finalEvidenceHash,
        )?.id ?? null,
      paymentEventId:
        events.find((event) => event.type === "payment.channel_closed")?.id ??
        events.find((event) => event.txHash)?.id ??
        null,
    });
  }

  async getAccountingRecord(laneId: string) {
    const lane = await this.getPaymentContext(laneId);
    if (!lane.lane.finalCdrId) throw new StoreError("NOT_FOUND");
    const [cdr] = await this.db
      .select()
      .from(cdrs)
      .where(and(eq(cdrs.id, lane.lane.finalCdrId), eq(cdrs.laneId, laneId)));
    if (!cdr) throw new StoreError("NOT_FOUND");
    return { id: cdr.id, raw: cdr.rawText, normalization: cdr.normalization };
  }

  constructor(databaseUrl: string) {
    this.client = postgres(databaseUrl, {
      max: 3,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
    });
    this.db = drizzle(this.client);
  }

  async close() {
    await this.client.end();
  }
  async health() {
    await this.db.execute(sql`select 1`);
  }

  async consistentRead<T>(read: (store: ChargingStore) => Promise<T>) {
    return this.db.transaction(
      async (tx) => {
        const snapshot = Object.create(this) as ChargingStore;
        snapshot.db = tx as unknown as Database;
        return read(snapshot);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async createCorridor(
    input: CreateCorridorInput,
    actor: string,
    accountingProfile?: import("@rove/domain").AccountingProfile,
  ) {
    const requestHash = hash(
      accountingProfile ? { ...input, accountingProfile } : input,
    );
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.commandId}, 0))`,
      );
      const existing = await tx
        .select()
        .from(processedCommands)
        .where(eq(processedCommands.commandId, input.commandId));
      if (existing[0]) {
        if (existing[0].requestHash !== requestHash)
          throw new StoreError("CONFLICT");
        return existing[0].outcome as { id: string; correlationId: string };
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      await tx.insert(corridors).values({
        id,
        name: input.name,
        payerEmsp: input.payerEmsp,
        payeeCpo: input.payeeCpo,
        settlementAssetId: input.settlementAssetId,
        tempoNetwork: input.tempoNetwork,
        assetDecimals: input.tariff.assetDecimals,
        tariffPerKwh: input.tariff.perKwh,
        tariffDecimals: input.tariff.tariffDecimals,
        protectionPolicy: input.protectionPolicy,
        reservePolicy: input.reservePolicy,
        settlementPolicy: input.settlementPolicy,
        accountingProfile: accountingProfile ?? null,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
      for (const meter of input.meters)
        await tx.insert(meterIdentities).values({
          id: randomUUID(),
          corridorId: id,
          meterId: meter.meterId,
          cpo: input.payeeCpo,
          publicKeyHex: meter.publicKeyHex,
          algorithm: "secp256r1-sha256",
          fingerprint: meter.fingerprint,
          enabled: true,
          metadata: { source: meter.source ?? "meter" },
          createdAt: now,
        });
      const eventId = randomUUID();
      await tx.insert(domainEvents).values({
        id: eventId,
        type: "corridor.created",
        schemaVersion: 1,
        corridorId: id,
        occurredAt: now,
        correlationId: input.correlationId,
        causationId: input.commandId,
        payload: { name: input.name, actor },
      });
      const outcome = { id, correlationId: input.correlationId };
      await tx.insert(processedCommands).values({
        commandId: input.commandId,
        aggregateId: id,
        requestHash,
        outcome,
        createdAt: now,
      });
      return outcome;
    });
  }

  async startLane(input: StartLaneInput, actor: string) {
    const requestHash = hash(input);
    let created = false;
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.commandId}, 0))`,
      );
      const existing = await tx
        .select()
        .from(processedCommands)
        .where(eq(processedCommands.commandId, input.commandId));
      if (existing[0]) {
        if (existing[0].requestHash !== requestHash)
          throw new StoreError("CONFLICT");
        return existing[0].outcome as {
          id: string;
          version: number;
          state: string;
          correlationId: string;
          reasonCodes: string[];
        };
      }
      const corridorRow = (
        await tx
          .select()
          .from(corridors)
          .where(eq(corridors.id, input.corridorId))
      )[0];
      if (!corridorRow || corridorRow.status !== "ACTIVE")
        throw new StoreError("NOT_FOUND");
      const meter = (
        await tx
          .select()
          .from(meterIdentities)
          .where(
            and(
              eq(meterIdentities.corridorId, input.corridorId),
              eq(meterIdentities.meterId, input.meterId),
            ),
          )
      )[0];
      if (!meter?.enabled) throw new StoreError("VALIDATION");
      const now = new Date().toISOString();
      const id = randomUUID();
      const corridor = corridorFromRow(corridorRow);
      const lane: Lane = {
        id,
        version: 0,
        corridorId: corridor.id,
        externalSessionId: input.externalSessionId,
        chargerId: input.chargerId,
        meterId: input.meterId,
        maxPowerWatts: input.maxPowerWatts,
        expectedProofIntervalMs: input.expectedProofIntervalMs,
        tariff: corridor.tariff,
        policy: corridor.protectionPolicy,
        reservePolicy: corridor.reservePolicy,
        settlementPolicy: corridor.settlementPolicy,
        settlementAssetId: corridor.settlementAssetId,
        tempoNetwork: corridor.tempoNetwork,
        state: "INITIALIZING",
        serviceStarted: false,
        evidenceHealth: "unknown",
        chainHealth: "unknown",
        signerHealth: "ready",
        trustedEnergyWh: "0",
        trustedDeliveredValue: "0",
        authorizedValue: "0",
        settledValue: "0",
        confirmedDeposit: null,
        fundedHeadroom: null,
        lastTrustedEvidenceAt: null,
        lastChainObservedAt: null,
        lastEvidenceHash: null,
        lastEvidenceSequence: null,
        channelId: null,
        unverifiedServiceBound: "0",
        worstCaseDeliveredValue: "0",
        protectedValue: "0",
        protectedWatermark: "0",
        unprotectedExposureBound: "0",
        reasonCodes: ["PROTECTION_AWAITING_TRUST_AND_FUNDING"],
        finalCdrId: null,
        createdAt: now,
        updatedAt: now,
      };
      await tx.insert(lanes).values(laneValues(lane));
      const eventId = randomUUID();
      await tx.insert(domainEvents).values({
        id: eventId,
        type: "lane.initializing",
        schemaVersion: 1,
        corridorId: corridor.id,
        laneId: id,
        laneVersion: 0,
        occurredAt: now,
        causationId: input.commandId,
        correlationId: input.correlationId,
        reasonCode: lane.reasonCodes[0],
        payload: {
          actor,
          externalSessionId: lane.externalSessionId,
          projection: protectionSnapshot(lane),
        },
      });
      await tx.insert(auditProjection).values({
        eventId,
        corridorId: corridor.id,
        laneId: id,
        laneVersion: 0,
        state: lane.state,
        reasonCodes: lane.reasonCodes,
        summary:
          "Charging protection is waiting for trusted readings and funding.",
        occurredAt: now,
      });
      await tx.insert(outboxJobs).values({
        id: randomUUID(),
        eventId,
        laneId: id,
        effectType: "payment.open_requested",
        idempotencyKey: `${id}:open`,
        payload: { laneId: id, amount: corridor.reservePolicy.initialDeposit },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
      });
      await tx.insert(paymentOperations).values({
        id: randomUUID(),
        laneId: id,
        operation: "open",
        requestedAmount: corridor.reservePolicy.initialDeposit,
        status: "pending",
        idempotencyKey: `${id}:open`,
        createdAt: now,
      });
      const outcome = {
        id,
        version: 0,
        state: lane.state,
        correlationId: input.correlationId,
        reasonCodes: lane.reasonCodes,
      };
      await tx.insert(processedCommands).values({
        commandId: input.commandId,
        aggregateId: id,
        requestHash,
        outcome,
        createdAt: now,
      });
      created = true;
      return outcome;
    });
    if (created)
      this.recovery.set(result.id, {
        status: "ready",
        checkedAt: new Date().toISOString(),
        reasonCodes: [],
      });
    return result;
  }

  async getCorridor(id: string) {
    const row = (
      await this.db.select().from(corridors).where(eq(corridors.id, id))
    )[0];
    if (!row) throw new StoreError("NOT_FOUND");
    return corridorFromRow(row);
  }

  async listCorridors() {
    return (
      await this.db
        .select()
        .from(corridors)
        .orderBy(corridors.createdAt)
        .limit(20)
    ).map(corridorFromRow);
  }

  async getLane(id: string) {
    return this.db.transaction(
      async (tx) => {
        const row = (await tx.select().from(lanes).where(eq(lanes.id, id)))[0];
        if (!row) throw new StoreError("NOT_FOUND");
        const latest = (
          await tx
            .select()
            .from(auditProjection)
            .where(eq(auditProjection.laneId, id))
            .orderBy(sql`${auditProjection.laneVersion} desc`)
            .limit(1)
        )[0];
        const lane = fromRow(row);
        const meter = (
          await tx
            .select({ metadata: meterIdentities.metadata })
            .from(meterIdentities)
            .where(
              and(
                eq(meterIdentities.corridorId, lane.corridorId),
                eq(meterIdentities.meterId, lane.meterId),
              ),
            )
            .limit(1)
        )[0];
        const meterMetadata = meter?.metadata as { source?: string } | null;
        const paymentSnapshot = lane.channelId
          ? (
              await tx
                .select()
                .from(tempoChainSnapshots)
                .where(eq(tempoChainSnapshots.channelId, lane.channelId))
                .orderBy(sql`${tempoChainSnapshots.observedAt} desc`)
                .limit(1)
            )[0]
          : undefined;
        const latestEvent = latest
          ? (
              await tx
                .select()
                .from(domainEvents)
                .where(eq(domainEvents.id, latest.eventId))
            )[0]
          : undefined;
        assertProjection(lane, latest, latestEvent);
        const voucher = lane.channelId
          ? (
              await tx
                .select()
                .from(tempoVouchers)
                .where(
                  and(
                    eq(tempoVouchers.channelId, lane.channelId),
                    eq(tempoVouchers.verificationStatus, "verified"),
                  ),
                )
                .orderBy(sql`${tempoVouchers.cumulativeAmount} desc`)
                .limit(1)
            )[0]
          : undefined;
        if (lane.authorizedValue !== (voucher?.cumulativeAmount ?? "0"))
          throw new StoreError("INCONSISTENT_PROJECTION");
        const operations = await tx
          .select()
          .from(paymentOperations)
          .where(eq(paymentOperations.laneId, id))
          .orderBy(
            sql`${paymentOperations.createdAt} desc`,
            sql`${paymentOperations.id} desc`,
          )
          .limit(20);
        const exposureRemaining =
          BigInt(lane.policy.maxUnprotectedExposure) -
          BigInt(lane.unprotectedExposureBound);
        const checkedAt = new Date().toISOString();
        const chainFreshness = !lane.lastChainObservedAt
          ? "unknown"
          : lane.chainHealth === "fresh" &&
              isFresh(
                checkedAt,
                lane.lastChainObservedAt,
                lane.policy.chainMaxAgeMs,
              )
            ? "current"
            : "historical";
        const evidenceFreshness = !lane.lastTrustedEvidenceAt
          ? "unknown"
          : lane.evidenceHealth === "fresh" &&
              isFresh(
                checkedAt,
                lane.lastTrustedEvidenceAt,
                lane.policy.evidenceMaxAgeMs,
              )
            ? "current"
            : "historical";
        return laneProjectionSchema.parse({
          id: lane.id,
          version: lane.version,
          corridorId: lane.corridorId,
          externalSessionId: lane.externalSessionId,
          chargerId: lane.chargerId,
          meterId: lane.meterId,
          state: lane.state,
          trustedEnergyWh: lane.trustedEnergyWh,
          trustedDeliveredValue: lane.trustedDeliveredValue,
          authorizedValue: lane.authorizedValue,
          settledValue: lane.settledValue,
          confirmedDeposit: lane.confirmedDeposit,
          fundedHeadroom: lane.fundedHeadroom,
          protectedValue: lane.protectedValue,
          unverifiedServiceBound: lane.unverifiedServiceBound,
          worstCaseDeliveredValue: lane.worstCaseDeliveredValue,
          unprotectedExposureBound: lane.unprotectedExposureBound,
          exposureRemaining: (exposureRemaining > 0n
            ? exposureRemaining
            : 0n
          ).toString(),
          maxUnprotectedExposure: lane.policy.maxUnprotectedExposure,
          channelId: lane.channelId,
          lastEvidenceHash: lane.lastEvidenceHash,
          lastTrustedEvidenceAt: lane.lastTrustedEvidenceAt,
          latestVoucherDigest: voucher?.digest ?? null,
          operations: operations.map((operation) => ({
            type: operation.operation,
            status: operation.status,
            requestedAmount: operation.requestedAmount,
            transactionHash: operation.txHash,
            reasonCode: operation.lastReason,
          })),
          reasonCodes: lane.reasonCodes,
          updatedAt: lane.updatedAt,
          source: "stored-projection",
          chainObservedAt: lane.lastChainObservedAt,
          paymentSource: paymentSnapshot?.source ?? null,
          meterSource:
            meterMetadata?.source === "controlled-fixture"
              ? "controlled-fixture"
              : "meter",
          chainFreshness,
          evidenceFreshness,
          authorityCheckedAt: checkedAt,
        });
      },
      { isolationLevel: "repeatable read" },
    );
  }

  async listLanes(corridorId: string) {
    return (
      await this.db
        .select({ id: lanes.id })
        .from(lanes)
        .where(eq(lanes.corridorId, corridorId))
    ).map((row) => row.id);
  }

  async listActiveLanes(limit = 20) {
    return (
      await this.db
        .select()
        .from(lanes)
        .where(sql`${lanes.state} not in ('CLOSED', 'RECONCILED')`)
        .orderBy(lanes.updatedAt)
        .limit(limit)
    ).map(fromRow);
  }

  async getPaymentContext(laneId: string) {
    const row = (
      await this.db.select().from(lanes).where(eq(lanes.id, laneId))
    )[0];
    if (!row) throw new StoreError("NOT_FOUND");
    const corridor = await this.getCorridor(row.corridorId);
    const channel =
      (
        await this.db
          .select()
          .from(tempoChannels)
          .where(eq(tempoChannels.laneId, laneId))
      )[0] ?? null;
    const voucher = channel
      ? ((
          await this.db
            .select()
            .from(tempoVouchers)
            .where(
              and(
                eq(tempoVouchers.channelId, channel.channelId),
                eq(tempoVouchers.verificationStatus, "verified"),
              ),
            )
            .orderBy(sql`${tempoVouchers.cumulativeAmount} desc`)
            .limit(1)
        )[0] ?? null)
      : null;
    return { lane: fromRow(row), corridor, channel, voucher };
  }

  async getHistory(laneId: string, projection?: LaneProjection) {
    const current = projection ?? (await this.getLane(laneId));
    if (current.id !== laneId) throw new StoreError("VALIDATION");
    const [material, checks] = await Promise.all([
      this.db
        .select()
        .from(domainEvents)
        .where(
          and(
            eq(domainEvents.laneId, laneId),
            sql`${domainEvents.type} <> 'lane.protection_checked'`,
          ),
        )
        .orderBy(sql`${domainEvents.ordinal} desc`)
        .limit(90),
      this.db
        .select()
        .from(domainEvents)
        .where(
          and(
            eq(domainEvents.laneId, laneId),
            eq(domainEvents.type, "lane.protection_checked"),
          ),
        )
        .orderBy(sql`${domainEvents.ordinal} desc`)
        .limit(10),
    ]);
    const rows = [...material, ...checks].sort((a, b) => a.ordinal - b.ordinal);
    let previous: {
      trusted: string;
      protected: string;
      exposure: string;
    } | null = null;
    return rows.map((row) => {
      const projection = (
        row.payload as { projection?: Record<string, unknown> }
      ).projection;
      const after =
        projection &&
        typeof projection.trustedDeliveredValue === "string" &&
        typeof projection.protectedValue === "string" &&
        typeof projection.unprotectedExposureBound === "string"
          ? {
              trusted: projection.trustedDeliveredValue,
              protected: projection.protectedValue,
              exposure: projection.unprotectedExposureBound,
            }
          : null;
      const summary = after ? { before: previous, after } : null;
      const remaining = after
        ? BigInt(current.maxUnprotectedExposure) - BigInt(after.exposure)
        : 0n;
      const parsedSnapshot = lanePresentationSnapshotSchema.safeParse({
        ...projection,
        exposureRemaining: (remaining > 0n ? remaining : 0n).toString(),
      });
      if (after) previous = after;
      return {
        id: row.id,
        type: row.type,
        version: row.laneVersion,
        occurredAt: date(row.occurredAt),
        traceTime: row.traceTime ? date(row.traceTime) : null,
        reasonCode: row.reasonCode,
        evidenceHash: row.evidenceHash,
        channelId: row.channelId,
        transactionHash: row.txHash,
        summary,
        snapshot: parsedSnapshot.success ? parsedSnapshot.data : null,
        detail:
          row.type === "payment.voucher_verified"
            ? { digest: (row.payload as { digest?: string }).digest ?? null }
            : null,
      };
    });
  }

  async getLatestEventOrdinal(corridorId: string) {
    await this.getCorridor(corridorId);
    const row = (
      await this.db
        .select({ ordinal: domainEvents.ordinal })
        .from(domainEvents)
        .where(eq(domainEvents.corridorId, corridorId))
        .orderBy(sql`${domainEvents.ordinal} desc`)
        .limit(1)
    )[0];
    return row?.ordinal ?? 0;
  }

  async getPresentationReplayFloor(corridorId: string) {
    await this.getCorridor(corridorId);
    const rows = await this.db
      .select({ ordinal: domainEvents.ordinal })
      .from(domainEvents)
      .where(eq(domainEvents.corridorId, corridorId))
      .orderBy(sql`${domainEvents.ordinal} desc`)
      .limit(101);
    return rows.length > 100 ? rows[100].ordinal : 0;
  }

  async getPresentationEvents(
    corridorId: string,
    afterOrdinal: number,
    limit = 100,
  ): Promise<RealtimePresentationEvent[]> {
    await this.getCorridor(corridorId);
    const rows = await this.db
      .select()
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.corridorId, corridorId),
          sql`${domainEvents.ordinal} > ${afterOrdinal}`,
        ),
      )
      .orderBy(domainEvents.ordinal)
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map((row) =>
      realtimePresentationEventSchema.parse({
        id: String(row.ordinal),
        type: row.laneId
          ? "lane_projection_changed"
          : "corridor_projection_changed",
        corridorId: row.corridorId,
        laneId: row.laneId,
        runId: null,
        projectionVersion: row.ordinal,
        reasonCode: row.reasonCode,
        occurredAt: date(row.occurredAt),
        payload: {
          eventType: row.type,
          laneVersion: row.laneVersion,
        },
      }),
    );
  }

  async getInspector(
    laneId: string,
    eventId: string,
  ): Promise<CausalInspectorTrace> {
    return this.db.transaction(
      async (tx) => {
        const laneRow = (
          await tx.select().from(lanes).where(eq(lanes.id, laneId))
        )[0];
        if (!laneRow) throw new StoreError("NOT_FOUND");
        const event = (
          await tx
            .select()
            .from(domainEvents)
            .where(
              and(
                eq(domainEvents.id, eventId),
                eq(domainEvents.laneId, laneId),
              ),
            )
        )[0];
        if (!event) throw new StoreError("NOT_FOUND");
        const corridor = (
          await tx
            .select()
            .from(corridors)
            .where(eq(corridors.id, laneRow.corridorId))
        )[0];
        if (!corridor) throw new StoreError("NOT_FOUND");
        const previousEvent = (
          await tx
            .select()
            .from(domainEvents)
            .where(
              and(
                eq(domainEvents.laneId, laneId),
                sql`${domainEvents.ordinal} < ${event.ordinal}`,
                sql`${domainEvents.payload} ? 'projection'`,
              ),
            )
            .orderBy(sql`${domainEvents.ordinal} desc`)
            .limit(1)
        )[0];
        const payload = event.payload as {
          projection?: Record<string, unknown>;
          calculation?: import("@rove/domain").ProtectionCalculation | null;
          digest?: string;
        };
        const beforePayload = previousEvent?.payload as
          { projection?: Record<string, unknown> } | undefined;
        const after = projectionValues(payload.projection);
        const before = projectionValues(beforePayload?.projection);
        if (!after) throw new StoreError("INCONSISTENT_PROJECTION");

        const evidence = event.evidenceHash
          ? (
              await tx
                .select()
                .from(meterEvidence)
                .where(
                  and(
                    eq(meterEvidence.laneId, laneId),
                    eq(meterEvidence.evidenceHash, event.evidenceHash),
                  ),
                )
            )[0]
          : undefined;
        const verification = evidence
          ? (
              await tx
                .select()
                .from(evidenceVerifications)
                .where(eq(evidenceVerifications.evidenceId, evidence.id))
            )[0]
          : undefined;
        const linkedVoucherJob = (
          await tx
            .select()
            .from(outboxJobs)
            .where(
              and(
                eq(outboxJobs.eventId, event.id),
                eq(outboxJobs.effectType, "payment.voucher_requested"),
              ),
            )
            .limit(1)
        )[0];
        const downstreamVoucherEvent = linkedVoucherJob
          ? (
              await tx
                .select()
                .from(domainEvents)
                .where(
                  and(
                    eq(domainEvents.laneId, laneId),
                    or(
                      eq(
                        domainEvents.causationId,
                        linkedVoucherJob.idempotencyKey,
                      ),
                      eq(
                        domainEvents.causationId,
                        createHash("sha256")
                          .update(
                            `${linkedVoucherJob.idempotencyKey}:confirmed`,
                          )
                          .digest("hex"),
                      ),
                    ),
                    eq(domainEvents.type, "payment.voucher_verified"),
                  ),
                )
                .limit(1)
            )[0]
          : undefined;
        const terminalCompletion =
          event.type === "payment.channel_closed"
            ? (laneRow.completion as
                import("@rove/domain").SessionCompletion | null)
            : null;
        const voucherDigest =
          payload.digest ??
          terminalCompletion?.finalVoucherDigest ??
          terminalCompletion?.comparison?.references.voucherDigest ??
          (downstreamVoucherEvent?.payload as { digest?: string } | undefined)
            ?.digest;
        const voucher = voucherDigest
          ? (
              await tx
                .select()
                .from(tempoVouchers)
                .where(eq(tempoVouchers.digest, voucherDigest))
                .limit(1)
            )[0]
          : undefined;
        const channelId = event.channelId ?? laneRow.channelId;
        const channel = channelId
          ? (
              await tx
                .select()
                .from(tempoChannels)
                .where(eq(tempoChannels.channelId, channelId))
                .limit(1)
            )[0]
          : undefined;
        const linkedJob = (
          await tx
            .select()
            .from(outboxJobs)
            .where(eq(outboxJobs.eventId, event.id))
            .limit(1)
        )[0];
        const operationKey = linkedJob?.idempotencyKey ?? event.causationId;
        const operation = event.txHash
          ? (
              await tx
                .select()
                .from(paymentOperations)
                .where(
                  and(
                    eq(paymentOperations.laneId, laneId),
                    eq(paymentOperations.txHash, event.txHash),
                  ),
                )
                .limit(1)
            )[0]
          : (
              await tx
                .select()
                .from(paymentOperations)
                .where(
                  and(
                    eq(paymentOperations.laneId, laneId),
                    eq(paymentOperations.idempotencyKey, operationKey),
                  ),
                )
                .limit(1)
            )[0];
        const checks = verificationChecks(verification?.reasonCode ?? null);
        const operationStatus = operationStatusAtEvent(
          event.type,
          operation?.status ?? null,
        );
        const rejectedEvidence = verification?.accepted === false;
        const hasPayment = Boolean(channel);
        const resultState =
          typeof payload.projection?.state === "string"
            ? payload.projection.state
            : laneRow.state;
        const reasonCode = event.reasonCode ?? verification?.reasonCode ?? null;
        return causalInspectorTraceSchema.parse({
          corridorId: event.corridorId,
          laneId,
          eventId: event.id,
          eventType: event.type,
          occurredAt: date(event.occurredAt),
          traceTime: event.traceTime ? date(event.traceTime) : null,
          reasonCode,
          reasonText: reasonTextFor(reasonCode),
          evidence:
            evidence && verification
              ? {
                  evidenceHash: evidence.evidenceHash,
                  source: "Signed meter reading",
                  meterId: evidence.meterId,
                  sessionId: evidence.sessionId,
                  timestamp: evidence.traceTime
                    ? date(evidence.traceTime)
                    : null,
                  sequence: evidence.sequence,
                  cumulativeWh: evidence.cumulativeWh,
                  verifierVersion: verification.verifierVersion,
                  accepted: verification.accepted,

                  checks,
                  raw: null,
                }
              : null,
          calculation: {
            snapshot: payload.calculation ?? null,
            tariffPerKwh: corridor.tariffPerKwh,
            tariffDecimals: corridor.tariffDecimals,
            assetDecimals: corridor.assetDecimals,
            priorTrustedValue: before?.trusted ?? after.trusted,
            nextTrustedValue: after.trusted,
            priorProtectedValue: before?.protected ?? after.protected,
            nextProtectedValue: after.protected,
            priorExposureBound: before?.exposure ?? after.exposure,
            nextExposureBound: after.exposure,
          },
          voucher: voucher
            ? {
                cumulativeAmount: voucher.cumulativeAmount,
                digest: voucher.digest,
                signatureSummary: summarizeSignature(voucher.signature),
                verificationStatus: voucher.verificationStatus,
                verifiedAt: voucher.verifiedAt
                  ? date(voucher.verifiedAt)
                  : null,
                signerRef: voucher.signerRef,
                domainRef: voucher.domainRef,
              }
            : null,
          payment: channel
            ? {
                channelId: channel.channelId,
                payer: corridor.payerEmsp,
                payee: corridor.payeeCpo,
                assetId: channel.assetId,
                network: channel.network,
                confirmedDeposit: after.deposit,
                authorizedValue: after.authorized,
                settledValue: after.settled,
                fundedHeadroom: after.headroom,
                operationType:
                  operation?.operation ?? (terminalCompletion ? "close" : null),
                operationStatus,
                closure: terminalCompletion?.closure ?? null,
                transactionHash: operation?.txHash ?? event.txHash,
                confirmedAt:
                  operationStatus === "confirmed" && operation?.confirmedAt
                    ? date(operation.confirmedAt)
                    : null,
              }
            : null,
          result: {
            laneVersion: event.laneVersion,
            state: resultState,
            reasonCodes: Array.isArray(payload.projection?.reasonCodes)
              ? payload.projection.reasonCodes
              : [],
            before: before
              ? {
                  trusted: before.trusted,
                  protected: before.protected,
                  exposure: before.exposure,
                }
              : null,
            after: {
              trusted: after.trusted,
              protected: after.protected,
              exposure: after.exposure,
            },
          },
          causalSteps: [
            {
              type: "evidence",
              label: "Meter evidence",
              status: evidence ? "complete" : "not_applicable",
              reference: evidence?.evidenceHash ?? null,
            },
            {
              type: "verification",
              label: "Verification",
              status: verification
                ? verification.accepted
                  ? "complete"
                  : "rejected"
                : "not_applicable",
              reference: verification?.verifierVersion ?? null,
            },
            {
              type: "calculation",
              label: "Protection calculation",
              status: payload.calculation ? "complete" : "unavailable",
              reference: null,
            },
            {
              type: "voucher",
              label: "Cumulative authorization",
              status: rejectedEvidence
                ? "not_applicable"
                : voucher
                  ? "complete"
                  : linkedVoucherJob
                    ? linkedVoucherJob.status === "failed"
                      ? "rejected"
                      : linkedVoucherJob.status === "completed"
                        ? "unavailable"
                        : "pending"
                    : "not_applicable",
              reference: voucher?.digest ?? null,
            },
            {
              type: "payment",
              label: "Payment channel",
              status: rejectedEvidence
                ? "not_applicable"
                : operationStatus
                  ? operationStatus === "failed"
                    ? "rejected"
                    : operationStatus === "confirmed"
                      ? "complete"
                      : "pending"
                  : hasPayment
                    ? "complete"
                    : "not_applicable",
              reference: operation?.txHash ?? channel?.channelId ?? null,
            },
            {
              type: "result",
              label: "Lane state",
              status: "complete",
              reference: String(event.laneVersion ?? ""),
            },
          ],
        });
      },
      { isolationLevel: "repeatable read" },
    );
  }

  async advanceLane(
    input: LaneCommandInput,
    actor: string,
    override?: VerifiedObservation,
    beforeEffectInsert?: () => void,
    beforePersist?: () => Promise<void>,
    voucher?: VerifiedVoucher,
    channelDescriptor?: Record<string, string>,
  ) {
    const requestHash = hash({ ...input, now: undefined });
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.commandId}, 0))`,
      );
      const existing = (
        await tx
          .select()
          .from(processedCommands)
          .where(eq(processedCommands.commandId, input.commandId))
      )[0];
      if (existing) {
        if (
          existing.requestHash !== requestHash ||
          existing.aggregateId !== input.laneId
        )
          throw new StoreError("CONFLICT");
        return existing.outcome as {
          id: string;
          version: number;
          state: string;
          correlationId: string;
          reasonCodes: string[];
        };
      }
      const locked = (
        await tx
          .select()
          .from(lanes)
          .where(eq(lanes.id, input.laneId))
          .for("update")
      )[0];
      if (!locked) throw new StoreError("NOT_FOUND");
      if (locked.version !== input.expectedVersion)
        throw new StoreError("VERSION_CONFLICT", locked.version);
      const lane = fromRow(locked);
      const latestAudit = (
        await tx
          .select()
          .from(auditProjection)
          .where(eq(auditProjection.laneId, lane.id))
          .orderBy(sql`${auditProjection.laneVersion} desc`)
          .limit(1)
      )[0];
      const latestEvent = latestAudit
        ? (
            await tx
              .select()
              .from(domainEvents)
              .where(eq(domainEvents.id, latestAudit.eventId))
          )[0]
        : undefined;
      assertProjection(lane, latestAudit, latestEvent);
      const now = input.now ?? new Date().toISOString();
      if (
        override?.type === "PaymentObserved" &&
        override.source === "local-simulation" &&
        process.env.NODE_ENV === "production"
      )
        throw new StoreError("ACCESS_DENIED");
      if (
        this.recoveryEnforced &&
        this.recovery.get(lane.id)?.status !== "ready" &&
        !override &&
        actor !== "engine-recovery"
      )
        throw new StoreError("VALIDATION");
      if (
        lane.completion &&
        input.payload.type === "ObserveEvidence" &&
        (!input.payload.final || lane.completion.finalEvidenceHash)
      )
        throw new StoreError("VALIDATION");
      if (
        !lane.completion &&
        input.payload.type === "ObserveEvidence" &&
        input.payload.final
      )
        throw new StoreError("VALIDATION");
      if (
        input.payload.type === "CompleteLane" &&
        actor !== "corridor-lab" &&
        actor !== "external-adapter"
      )
        throw new StoreError("ACCESS_DENIED");
      let observation: VerifiedObservation | undefined = override;
      let verification: ReturnType<typeof verifyOcmf> | undefined;
      if (!observation && input.payload.type === "ObserveEvidence") {
        const meter = (
          await tx
            .select()
            .from(meterIdentities)
            .where(
              and(
                eq(meterIdentities.corridorId, lane.corridorId),
                eq(meterIdentities.meterId, lane.meterId),
              ),
            )
        )[0];
        if (!meter?.enabled) throw new StoreError("VALIDATION");
        const previousEvidence = lane.lastEvidenceHash
          ? (
              await tx
                .select()
                .from(meterEvidence)
                .where(
                  and(
                    eq(meterEvidence.laneId, lane.id),
                    eq(meterEvidence.evidenceHash, lane.lastEvidenceHash),
                  ),
                )
            )[0]
          : undefined;
        verification = verifyOcmf({
          raw: input.payload.raw,
          publicKeyHex: meter.publicKeyHex,
          expectedMeterId: lane.meterId,
          expectedSessionId: lane.externalSessionId,
          transportSessionId: input.payload.transportSessionId,
          maxAgeMs: lane.policy.evidenceMaxAgeMs,
          now: new Date(now),
          previous:
            previousEvidence?.sequence !== null &&
            previousEvidence?.sequence !== undefined &&
            previousEvidence.traceTime &&
            previousEvidence.cumulativeMilliWh
              ? {
                  rawPayloadHash: previousEvidence.evidenceHash,
                  observedAt: date(previousEvidence.traceTime),
                  cumulativeMilliWh: BigInt(previousEvidence.cumulativeMilliWh),
                  sequence: previousEvidence.sequence,
                }
              : undefined,
        });
        observation = {
          type: "EvidenceObserved",
          evidenceHash: verification.rawPayloadHash,
          accepted: verification.accepted,
          final: input.payload.final,
          reasonCode: verification.reasonCode,
          observedAt: verification.observedAt,
          sequence: verification.sequence,
          cumulativeWh: verification.cumulativeWh,
        };
      }
      if (!observation) {
        const payload = input.payload;
        if (payload.type === "ObservePayment")
          throw new StoreError("ACCESS_DENIED");
        observation =
          payload.type === "CompleteLane"
            ? {
                type: "ServiceEnded",
                startedAt: payload.serviceStartedAt,
                endedAt: payload.serviceEndedAt,
                source: payload.endSource,
              }
            : payload.type === "ReceiveCDR" ||
                payload.type === "CheckCompletion" ||
                payload.type === "CloseChannel"
              ? { type: "ClockTick" }
              : payload.type === "PaymentUnavailable"
                ? { type: "PaymentUnavailable", reasonCode: payload.reason }
                : payload.type === "TickProtectionClock"
                  ? { type: "ClockTick" }
                  : payload.type === "RequirePause"
                    ? { type: "PauseRequired" }
                    : { type: "RecoveryBegun" };
      }
      if (input.payload.type === "ReceiveCDR") {
        if (!lane.completion || lane.state === "CLOSED")
          throw new StoreError("VALIDATION");
        const corridor = corridorFromRow(
          (
            await tx
              .select()
              .from(corridors)
              .where(eq(corridors.id, lane.corridorId))
          )[0]!,
        );
        const profile =
          actor === "corridor-lab" ? corridor.accountingProfile : null;
        const settings = profile
          ? {
              CDR_SETTLEMENT_ASSET_ID: profile.settlementAssetId,
              CDR_CURRENCY: profile.currency,
              CDR_SOURCE_PARTY_ID: profile.sourcePartyId,
            }
          : readAccountingConfig();
        if (
          settings.CDR_SETTLEMENT_ASSET_ID.toLowerCase() !==
          lane.settlementAssetId.toLowerCase()
        )
          throw new StoreError("VALIDATION");
        const normalized = normalizeAccountingRecord(
          input.payload.raw,
          {
            externalSessionId: lane.externalSessionId,
            sourcePartyId: settings.CDR_SOURCE_PARTY_ID,
            meterId: lane.meterId,
            chargerId: lane.chargerId,
            startedAt: lane.completion.serviceStartedAt,
            endedAt: lane.completion.serviceEndedAt,
            currency: settings.CDR_CURRENCY,
            settlementAssetId: lane.settlementAssetId,
            tariff: lane.tariff,
          },
          now,
        );
        const [existingCdr] = await tx
          .select()
          .from(cdrs)
          .where(
            and(
              eq(cdrs.sourcePartyId, normalized.record.sourcePartyId),
              eq(cdrs.externalCdrId, normalized.record.externalCdrId),
            ),
          );
        if (
          existingCdr &&
          (existingCdr.contentHash !== normalized.contentHash ||
            existingCdr.laneId !== lane.id)
        )
          throw new StoreError("CONFLICT");
        if (lane.finalCdrId && lane.finalCdrId !== existingCdr?.id)
          throw new StoreError("CONFLICT");
        const cdrId = existingCdr?.id ?? randomUUID();
        if (!existingCdr)
          await tx.insert(cdrs).values({
            id: cdrId,
            laneId: lane.id,
            externalSessionId: lane.externalSessionId,
            raw: normalized.record,
            rawText: normalized.raw,
            sourcePartyId: normalized.record.sourcePartyId,
            externalCdrId: normalized.record.externalCdrId,
            contentHash: normalized.contentHash,
            normalization: normalized,
            normalizedTotal: normalized.normalizedTotal,
            receivedAt: now,
          });
        lane.finalCdrId = cdrId;
        lane.completion.cdr = {
          id: cdrId,
          contentHash: normalized.contentHash,
          totalEnergyWh: normalized.totalEnergyWh,
          normalizedTotal: normalized.normalizedTotal,
          currency: normalized.record.currency,
          sourcePartyId: normalized.record.sourcePartyId,
          source:
            actor === "corridor-lab"
              ? "controlled_fixture"
              : "external_adapter",
        };
      }
      // Only persisted Lab membership supplies a virtual physical clock.
      // Receipt timestamps and chain freshness continue to use the real clock.
      const labClock =
        lane.tempoNetwork !== "local-simulation" ||
        (input.payload.type === "TickProtectionClock" &&
          (override || actor !== "corridor-lab"))
          ? (
              await tx
                .select({
                  traceEpoch: sql<string>`${labRuns.compiledSnapshot}->'definition'->>'traceEpoch'`,
                  offset: labRuns.traceOffsetMs,
                })
                .from(labRuns)
                .where(eq(labRuns.corridorId, lane.corridorId))
                .limit(1)
            )[0]
          : undefined;
      const physicalNow =
        labClock &&
        input.payload.type === "TickProtectionClock" &&
        (override || actor !== "corridor-lab")
          ? new Date(
              Date.parse(labClock.traceEpoch) + labClock.offset,
            ).toISOString()
          : now;
      const result = transitionLane(
        lane,
        observation,
        now,
        `${input.commandId}:pause`,
        physicalNow,
        labClock && lane.tempoNetwork !== "local-simulation"
          ? new Date().toISOString()
          : now,
      );
      const completion = result.lane.completion;
      if (
        completion &&
        completion.finalEvidenceHash &&
        completion.cdr &&
        ["mismatch", "reconciled"].includes(completion.status)
      ) {
        const comparison = compareSessionTotals({
          trustedEnergyWh: completion.finalTrustedEnergyWh!,
          cdrEnergyWh: completion.cdr.totalEnergyWh,
          trustedValue: completion.finalTrustedValue!,
          cdrTotal: completion.cdr.normalizedTotal,
          authorizedValue: result.lane.authorizedValue,
          settledValue: result.lane.settledValue,
        });
        const [currentVoucher] = await tx
          .select()
          .from(tempoVouchers)
          .where(
            and(
              eq(tempoVouchers.channelId, lane.channelId ?? ""),
              eq(tempoVouchers.verificationStatus, "verified"),
              eq(tempoVouchers.cumulativeAmount, result.lane.authorizedValue),
            ),
          )
          .orderBy(sql`${tempoVouchers.createdAt} desc`)
          .limit(1);
        if (voucher?.cumulativeAmount === completion.finalTrustedValue)
          completion.finalVoucherDigest = voucher.digest;
        else if (
          currentVoucher?.cumulativeAmount === completion.finalTrustedValue
        )
          completion.finalVoucherDigest = currentVoucher.digest;
        completion.comparison = {
          ...comparison,
          id: randomUUID(),
          laneVersion: result.lane.version,
          checkedAt: now,
          references: {
            evidenceHash: completion.finalEvidenceHash,
            voucherDigest: voucher?.digest ?? currentVoucher?.digest ?? null,
            chainObservedAt: result.lane.lastChainObservedAt,
            cdrId: completion.cdr.id,
          },
        };
        await tx.insert(reconciliations).values({
          id: completion.comparison.id,
          laneId: lane.id,
          cdrId: completion.cdr.id,
          status: comparison.status,
          comparedTotal: completion.finalTrustedValue,
          comparison: {
            ...completion.comparison,
            trustedEnergyWh: completion.finalTrustedEnergyWh,
            cdrEnergyWh: completion.cdr.totalEnergyWh,
            trustedValue: completion.finalTrustedValue,
            authorizedValue: result.lane.authorizedValue,
            settledValue: result.lane.settledValue,
            cdrTotal: completion.cdr.normalizedTotal,
          },
          reasonCode: comparison.reasonCodes[0] ?? null,
          checkedAt: now,
        });
        result.events.push({
          type:
            comparison.status === "MATCH"
              ? "session.reconciled"
              : "session.accounting_mismatch",
          payload: {
            comparisonId: completion.comparison.id,
            cdrId: completion.cdr.id,
            deltas: comparison.deltas,
          },
        });
      }
      if (
        input.payload.type === "CheckCompletion" &&
        completion &&
        completion.status !== "mismatch" &&
        result.lane.chainHealth === "fresh"
      ) {
        const failed = await tx
          .select()
          .from(outboxJobs)
          .where(
            and(
              eq(outboxJobs.laneId, lane.id),
              eq(outboxJobs.status, "failed"),
              eq(outboxJobs.lastError, "PAYMENT_TRANSACTION_FAILED"),
            ),
          );
        for (const job of failed) {
          if (
            ![
              "payment.top_up_requested",
              "payment.settlement_requested",
              "payment.close_requested",
            ].includes(job.effectType)
          )
            continue;
          await tx
            .update(outboxJobs)
            .set({
              status: "pending",
              attemptCount: 0,
              externalReference: null,
              lastError: null,
              nextAttemptAt: now,
            })
            .where(eq(outboxJobs.id, job.id));
          await tx
            .update(paymentOperations)
            .set({
              status: "pending",
              txHash: null,
              lastReason: null,
              attempts: 0,
            })
            .where(eq(paymentOperations.idempotencyKey, job.idempotencyKey));
          result.events.push({
            type: "payment.operation_rechecked",
            payload: { operationId: job.id },
          });
        }
      }
      if (input.payload.type === "CloseChannel") {
        const pending = await tx
          .select()
          .from(outboxJobs)
          .where(
            and(
              eq(outboxJobs.laneId, lane.id),
              sql`${outboxJobs.status} <> 'completed'`,
            ),
          );
        if (
          !completion ||
          completion.status !== "reconciled" ||
          completion.comparison?.status !== "MATCH" ||
          result.lane.chainHealth !== "fresh" ||
          !result.lane.confirmedDeposit ||
          !result.lane.channelId ||
          pending.length
        )
          throw new StoreError("VALIDATION");
        completion.status = "closing";
        completion.closure = {
          depositBeforeClose: result.lane.confirmedDeposit,
          settledBeforeClose: result.lane.settledValue,
          expectedRefund: (
            BigInt(result.lane.confirmedDeposit) -
            BigInt(result.lane.settledValue)
          ).toString(),
          confirmedRefund: null,
          transactionHash: null,
          receiptBlock: null,
          closeEventReference: null,
          refundEvidenceReference: null,
          observedAt: null,
        };
        result.effects.push({
          type: "payment.close_requested",
          idempotencyKey: `${lane.id}:close`,
          payload: {
            laneId: lane.id,
            channelId: lane.channelId!,
            amount: result.lane.settledValue,
            priorDeposit: result.lane.confirmedDeposit,
          },
        });
        result.events.push({ type: "payment.close_requested", payload: {} });
      }
      if (
        this.recoveryEnforced &&
        this.recovery.get(lane.id)?.status !== "ready"
      )
        result.effects = [];
      await beforePersist?.();
      if (observation.type === "VoucherVerified") {
        if (
          !voucher ||
          voucher.channelId !== lane.channelId ||
          voucher.cumulativeAmount !== observation.cumulativeAmount ||
          voucher.digest !== observation.digest ||
          !/^0x[0-9a-fA-F]{130}$/.test(voucher.signature)
        )
          throw new StoreError("VALIDATION");
        const previousVoucher = (
          await tx
            .select()
            .from(tempoVouchers)
            .where(
              and(
                eq(tempoVouchers.channelId, voucher.channelId),
                eq(tempoVouchers.verificationStatus, "verified"),
              ),
            )
            .orderBy(sql`${tempoVouchers.cumulativeAmount} desc`)
            .limit(1)
        )[0];
        if (
          previousVoucher &&
          BigInt(voucher.cumulativeAmount) <=
            BigInt(previousVoucher.cumulativeAmount)
        )
          throw new StoreError("CONFLICT");
        await tx.insert(tempoVouchers).values({
          id: randomUUID(),
          channelId: voucher.channelId,
          cumulativeAmount: voucher.cumulativeAmount,
          signerRef: voucher.signerRef,
          domainRef: voucher.domainRef,
          signatureRef: voucher.digest,
          digest: voucher.digest,
          signature: voucher.signature,
          createdAt: now,
          verifiedAt: now,
          verificationStatus: "verified",
        });
      }
      await tx
        .update(lanes)
        .set(laneValues(result.lane))
        .where(eq(lanes.id, lane.id));
      if (verification && verification.rawPayloadHash) {
        const duplicate = (
          await tx
            .select({ id: meterEvidence.id })
            .from(meterEvidence)
            .where(
              and(
                eq(meterEvidence.laneId, lane.id),
                eq(meterEvidence.evidenceHash, verification.rawPayloadHash),
              ),
            )
        )[0];
        if (!duplicate) {
          const evidenceId = randomUUID();
          await tx.insert(meterEvidence).values({
            id: evidenceId,
            laneId: lane.id,
            raw:
              input.payload.type === "ObserveEvidence" ? input.payload.raw : "",
            evidenceHash: verification.rawPayloadHash,
            receivedAt: now,
            traceTime: verification.observedAt,
            meterId: verification.meterId,
            sessionId: verification.sessionId,
            sequence: verification.sequence,
            acceptedSequence: verification.accepted
              ? verification.sequence
              : null,
            cumulativeWh: verification.cumulativeWh,
            cumulativeMilliWh: verification.cumulativeMilliWh,
          });
          await tx.insert(evidenceVerifications).values({
            id: randomUUID(),
            evidenceId,
            verifierVersion: "ocmf-secp256r1-sha256:1",
            accepted: verification.accepted,
            reasonCode: verification.reasonCode,
            checkedAt: now,
          });
        }
      }
      if (observation.type === "PaymentObserved") {
        const priorSnapshot = (
          await tx
            .select()
            .from(tempoChainSnapshots)
            .where(eq(tempoChainSnapshots.channelId, observation.channelId))
            .orderBy(sql`${tempoChainSnapshots.observedAt} desc`)
            .limit(1)
        )[0];
        if (
          priorSnapshot &&
          (BigInt(observation.chainHeight) <
            BigInt(priorSnapshot.chainHeight) ||
            BigInt(observation.confirmedDeposit) <
              BigInt(priorSnapshot.confirmedDeposit))
        )
          throw new StoreError("VALIDATION");
        const known = (
          await tx
            .select()
            .from(tempoChannels)
            .where(eq(tempoChannels.laneId, lane.id))
        )[0];
        if (!known)
          await tx.insert(tempoChannels).values({
            laneId: lane.id,
            channelId: observation.channelId,
            network: observation.network,
            assetId: observation.assetId,
            status: "confirmed",
            descriptor: channelDescriptor ?? null,
            observedAt: observation.observedAt,
          });
        else
          await tx
            .update(tempoChannels)
            .set({
              status: "confirmed",
              observedAt: observation.observedAt,
              descriptor: channelDescriptor ?? known.descriptor,
            })
            .where(eq(tempoChannels.laneId, lane.id));
        await tx.insert(tempoChainSnapshots).values({
          id: randomUUID(),
          channelId: observation.channelId,
          chainHeight: observation.chainHeight,
          observedAt: observation.observedAt,
          confirmedDeposit: observation.confirmedDeposit,
          settledValue: observation.settledValue,
          channelState: "confirmed",
          source: observation.source,
        });
      }
      let firstEventId = "";
      for (const item of result.events) {
        const eventId = randomUUID();
        if (!firstEventId) firstEventId = eventId;
        await tx.insert(domainEvents).values({
          id: eventId,
          type: item.type,
          schemaVersion: 1,
          corridorId: lane.corridorId,
          laneId: lane.id,
          laneVersion: result.lane.version,
          occurredAt: new Date().toISOString(),
          traceTime: item.traceTime ?? now,
          causationId: input.causationId ?? input.commandId,
          correlationId: input.correlationId,
          reasonCode: item.reasonCode ?? result.lane.reasonCodes[0],
          payload: {
            ...item.payload,
            actor,
            projection: protectionSnapshot(result.lane),
            calculation: result.calculation ?? null,
          },
          evidenceHash: item.evidenceHash,
          channelId: item.channelId,
          txHash: item.txHash,
          cdrId: result.lane.finalCdrId ?? undefined,
        });
        await tx.insert(auditProjection).values({
          eventId,
          corridorId: lane.corridorId,
          laneId: lane.id,
          laneVersion: result.lane.version,
          state: result.lane.state,
          reasonCodes: result.lane.reasonCodes,
          summary: summaryForLane(result.lane),
          occurredAt: now,
        });
      }
      if (result.effects.length) beforeEffectInsert?.();
      for (const effect of result.effects) {
        if (
          effect.type === "payment.voucher_requested" ||
          effect.type === "payment.settlement_requested" ||
          effect.type === "payment.top_up_requested" ||
          effect.type === "payment.close_requested"
        ) {
          const operation =
            effect.type === "payment.voucher_requested"
              ? "voucher"
              : effect.type === "payment.settlement_requested"
                ? "settle"
                : effect.type === "payment.close_requested"
                  ? "close"
                  : "top_up";
          const previousOperations = await tx
            .select()
            .from(paymentOperations)
            .where(
              and(
                eq(paymentOperations.laneId, lane.id),
                eq(paymentOperations.operation, operation),
              ),
            )
            .orderBy(
              sql`${paymentOperations.confirmedAt} desc nulls last`,
              sql`${paymentOperations.submittedAt} desc nulls last`,
            )
            .limit(10);
          if (
            previousOperations.some(
              (item) =>
                item.status === "pending" || item.status === "submitted",
            )
          )
            continue;
          if (
            operation === "settle" &&
            !result.lane.completion &&
            previousOperations.some(
              (item) =>
                item.status === "confirmed" &&
                item.confirmedAt &&
                Date.parse(now) - Date.parse(item.confirmedAt) <
                  lane.settlementPolicy.minimumIntervalMs,
            )
          )
            continue;
        }
        await tx
          .insert(outboxJobs)
          .values({
            id: randomUUID(),
            eventId: firstEventId,
            laneId: lane.id,
            effectType: effect.type,
            idempotencyKey: effect.idempotencyKey,
            payload: effect.payload,
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: now,
          })
          .onConflictDoNothing();
        if (effect.type !== "pause.requested")
          await tx
            .insert(paymentOperations)
            .values({
              id: randomUUID(),
              laneId: lane.id,
              channelId: effect.payload.channelId,
              operation:
                effect.type === "payment.voucher_requested"
                  ? "voucher"
                  : effect.type === "payment.top_up_requested"
                    ? "top_up"
                    : effect.type === "payment.close_requested"
                      ? "close"
                      : "settle",
              requestedAmount: effect.payload.amount,
              status: "pending",
              idempotencyKey: effect.idempotencyKey,
              createdAt: now,
            })
            .onConflictDoNothing();
      }
      const outcome = {
        id: lane.id,
        version: result.lane.version,
        state: result.lane.state,
        correlationId: input.correlationId,
        reasonCodes: result.lane.reasonCodes,
      };
      await tx.insert(processedCommands).values({
        commandId: input.commandId,
        aggregateId: lane.id,
        requestHash,
        outcome,
        createdAt: now,
      });
      return outcome;
    });
  }

  async claimOutbox(
    now: string,
    leaseMs: number,
    laneId?: string,
    excludeLab = false,
    reconcileOnly = false,
  ) {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute(
        sql`select outbox_jobs.id, outbox_jobs.status, domain_events.occurred_at as effect_created_at from outbox_jobs join domain_events on domain_events.id = outbox_jobs.event_id where (${reconcileOnly} = false or outbox_jobs.attempt_count > 0) and (outbox_jobs.attempt_count < 8 or outbox_jobs.status in ('pending', 'submitted')) and (outbox_jobs.status in ('pending', 'submitted', 'failed') or (outbox_jobs.status = 'processing' and outbox_jobs.lease_until < ${now})) and outbox_jobs.next_attempt_at <= ${now} and (${laneId ?? null}::text is null or outbox_jobs.lane_id = ${laneId ?? null}) and (${excludeLab} = false or not exists (select 1 from lab_runs, jsonb_each_text(lab_runs.lane_bindings) as binding where binding.value = outbox_jobs.lane_id)) order by outbox_jobs.next_attempt_at for update of outbox_jobs skip locked limit 1`,
      );
      const id = rows[0]?.id as string | undefined;
      if (!id) return null;
      const leaseUntil = new Date(Date.parse(now) + leaseMs).toISOString();
      const updated = await tx
        .update(outboxJobs)
        .set({
          status: "processing",
          leaseUntil,
          leaseToken: randomUUID(),
          attemptCount: sql`${outboxJobs.attemptCount} + 1`,
        })
        .where(eq(outboxJobs.id, id))
        .returning();
      return updated[0]
        ? {
            ...updated[0],
            previousStatus: rows[0].status as string,
            effectCreatedAt: rows[0].effect_created_at as string,
          }
        : null;
    });
  }

  async finishOutbox(
    id: string,
    leaseToken: string,
    status: "pending" | "submitted" | "completed" | "failed",
    nextAttemptAt: string,
    externalReference?: string,
    lastError?: string,
  ) {
    await this.db.transaction(async (tx) => {
      const prior = (
        await tx.select().from(outboxJobs).where(eq(outboxJobs.id, id))
      )[0];
      const updated = await tx
        .update(outboxJobs)
        .set({
          status,
          nextAttemptAt,
          leaseUntil: null,
          leaseToken: null,
          externalReference,
          lastError,
        })
        .where(
          and(
            eq(outboxJobs.id, id),
            eq(outboxJobs.status, "processing"),
            eq(outboxJobs.leaseToken, leaseToken),
          ),
        )
        .returning();
      const job = updated[0];
      if (!job) throw new StoreError("CONFLICT");
      if (job.effectType.startsWith("payment.") && prior?.status !== status) {
        const lane = (
          await tx.select().from(lanes).where(eq(lanes.id, job.laneId))
        )[0];
        if (lane) {
          const operation =
            job.effectType === "payment.open_requested"
              ? "open"
              : job.effectType === "payment.top_up_requested"
                ? "top_up"
                : job.effectType === "payment.settlement_requested"
                  ? "settlement"
                  : job.effectType === "payment.close_requested"
                    ? "close"
                    : "voucher";
          await tx.insert(domainEvents).values({
            id: randomUUID(),
            type: `payment.${operation}_${status}`,
            schemaVersion: 1,
            corridorId: lane.corridorId,
            laneId: job.laneId,
            laneVersion: lane.version,
            occurredAt: new Date().toISOString(),
            correlationId: job.idempotencyKey,
            causationId: job.idempotencyKey,
            reasonCode: lastError ?? undefined,
            payload: {
              requestedAmount:
                (job.payload as { amount?: string }).amount ?? null,
              projection: protectionSnapshot(fromRow(lane)),
            },
            channelId: (job.payload as { channelId?: string }).channelId,
            txHash: externalReference,
          });
        }
      }
      if (job.effectType.startsWith("payment.") && externalReference) {
        const channelId = (job.payload as { channelId?: string }).channelId;
        if (channelId)
          await tx
            .insert(tempoTransactions)
            .values({
              id: randomUUID(),
              channelId,
              txHash: externalReference,
              operation: job.effectType,
              status,
              submittedAt: new Date().toISOString(),
              confirmedAt:
                status === "completed" ? new Date().toISOString() : null,
            })
            .onConflictDoUpdate({
              target: tempoTransactions.txHash,
              set: {
                status,
                confirmedAt:
                  status === "completed" ? new Date().toISOString() : null,
              },
            });
      }
      if (job.effectType.startsWith("payment."))
        await tx
          .update(paymentOperations)
          .set({
            status:
              status === "completed"
                ? "confirmed"
                : status === "submitted"
                  ? "submitted"
                  : status === "failed"
                    ? "failed"
                    : "pending",
            txHash: externalReference ?? null,
            lastReason: lastError ?? null,
            attempts: job.attemptCount,
            submittedAt:
              status === "submitted" ? new Date().toISOString() : undefined,
            confirmedAt:
              status === "completed" ? new Date().toISOString() : undefined,
          })
          .where(eq(paymentOperations.idempotencyKey, job.idempotencyKey));
    });
  }
}
