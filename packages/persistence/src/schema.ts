import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });
const amount = (name: string) => numeric(name, { precision: 78, scale: 0 });
const nonnegative = (column: string) => sql.raw(`${column} >= 0`);

export const corridors = pgTable(
  "corridors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    payerEmsp: text("payer_emsp").notNull(),
    payeeCpo: text("payee_cpo").notNull(),
    settlementAssetId: text("settlement_asset_id").notNull(),
    tempoNetwork: text("tempo_network").notNull(),
    assetDecimals: integer("asset_decimals").notNull(),
    tariffPerKwh: amount("tariff_per_kwh").notNull(),
    tariffDecimals: integer("tariff_decimals").notNull(),
    protectionPolicy: jsonb("protection_policy").notNull(),
    reservePolicy: jsonb("reserve_policy").notNull(),
    settlementPolicy: jsonb("settlement_policy").notNull(),
    accountingProfile: jsonb("accounting_profile"),
    status: text("status").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (table) => [
    check("corridor_tariff_nonnegative", nonnegative("tariff_per_kwh")),
    check(
      "corridor_identity_nonempty",
      sql`length(trim(${table.name})) > 0 and length(trim(${table.payerEmsp})) > 0 and length(trim(${table.payeeCpo})) > 0`,
    ),
    check(
      "corridor_decimals_valid",
      sql`${table.assetDecimals} between 0 and 36 and ${table.tariffDecimals} between 0 and 36`,
    ),
  ],
).enableRLS();

export const meterIdentities = pgTable(
  "meter_identities",
  {
    id: text("id").primaryKey(),
    corridorId: text("corridor_id")
      .notNull()
      .references(() => corridors.id),
    meterId: text("meter_id").notNull(),
    cpo: text("cpo").notNull(),
    publicKeyHex: text("public_key_hex").notNull(),
    algorithm: text("algorithm").notNull(),
    fingerprint: text("fingerprint").notNull(),
    enabled: boolean("enabled").notNull(),
    metadata: jsonb("metadata"),
    createdAt: instant("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("meter_corridor_identity").on(table.corridorId, table.meterId),
    index("meter_corridor_idx").on(table.corridorId),
  ],
).enableRLS();

export const lanes = pgTable(
  "lanes",
  {
    id: text("id").primaryKey(),
    corridorId: text("corridor_id")
      .notNull()
      .references(() => corridors.id),
    version: integer("version").notNull(),
    externalSessionId: text("external_session_id").notNull(),
    chargerId: text("charger_id").notNull(),
    meterId: text("meter_id").notNull(),
    maxPowerWatts: amount("max_power_watts").notNull(),
    expectedProofIntervalMs: bigint("expected_proof_interval_ms", {
      mode: "number",
    }).notNull(),
    tariffSnapshot: jsonb("tariff_snapshot").notNull(),
    policySnapshot: jsonb("policy_snapshot").notNull(),
    reservePolicySnapshot: jsonb("reserve_policy_snapshot").notNull(),
    settlementPolicySnapshot: jsonb("settlement_policy_snapshot").notNull(),
    settlementAssetId: text("settlement_asset_id").notNull(),
    tempoNetwork: text("tempo_network").notNull(),
    state: text("state").notNull(),
    serviceStarted: boolean("service_started").notNull(),
    evidenceHealth: text("evidence_health").notNull(),
    chainHealth: text("chain_health").notNull(),
    signerHealth: text("signer_health").notNull(),
    trustedEnergyWh: amount("trusted_energy_wh").notNull(),
    trustedDeliveredValue: amount("trusted_delivered_value").notNull(),
    authorizedValue: amount("authorized_value").notNull(),
    settledValue: amount("settled_value").notNull(),
    confirmedDeposit: amount("confirmed_deposit"),
    fundedHeadroom: amount("funded_headroom"),
    lastTrustedEvidenceAt: instant("last_trusted_evidence_at"),
    lastChainObservedAt: instant("last_chain_observed_at"),
    lastEvidenceHash: text("last_evidence_hash"),
    lastEvidenceSequence: integer("last_evidence_sequence"),
    channelId: text("channel_id"),
    unverifiedServiceBound: amount("unverified_service_bound").notNull(),
    worstCaseDeliveredValue: amount("worst_case_delivered_value").notNull(),
    protectedValue: amount("protected_value").notNull(),
    protectedWatermark: amount("protected_watermark").notNull(),
    unprotectedExposureBound: amount("unprotected_exposure_bound").notNull(),
    reasonCodes: jsonb("reason_codes").notNull(),
    finalCdrId: text("final_cdr_id"),
    completion: jsonb("completion"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("lane_external_session_unique").on(table.externalSessionId),
    uniqueIndex("lane_channel_unique").on(table.channelId),
    index("lane_corridor_idx").on(table.corridorId),
    check("lane_version_nonnegative", nonnegative("version")),
    check(
      "lane_values_nonnegative",
      sql`${table.trustedEnergyWh} >= 0 and ${table.trustedDeliveredValue} >= 0 and ${table.authorizedValue} >= 0 and ${table.settledValue} >= 0 and (${table.confirmedDeposit} is null or ${table.confirmedDeposit} >= 0) and (${table.fundedHeadroom} is null or ${table.fundedHeadroom} >= 0) and ${table.unverifiedServiceBound} >= 0 and ${table.worstCaseDeliveredValue} >= 0 and ${table.protectedValue} >= 0 and ${table.protectedWatermark} >= 0 and ${table.unprotectedExposureBound} >= 0`,
    ),
    check(
      "lane_capacity_positive",
      sql`${table.maxPowerWatts} > 0 and ${table.expectedProofIntervalMs} > 0`,
    ),
    check(
      "lane_value_order",
      sql`${table.authorizedValue} <= ${table.trustedDeliveredValue} and ${table.settledValue} <= ${table.authorizedValue} and (${table.confirmedDeposit} is null or ${table.authorizedValue} <= ${table.confirmedDeposit}) and ${table.protectedValue} <= ${table.authorizedValue} and ${table.protectedValue} <= ${table.trustedDeliveredValue}`,
    ),
  ],
).enableRLS();

export const meterEvidence = pgTable(
  "meter_evidence",
  {
    id: text("id").primaryKey(),
    laneId: text("lane_id")
      .notNull()
      .references(() => lanes.id),
    raw: text("raw").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    receivedAt: instant("received_at").notNull(),
    traceTime: instant("trace_time"),
    meterId: text("meter_id"),
    sessionId: text("session_id"),
    sequence: integer("sequence"),
    acceptedSequence: integer("accepted_sequence"),
    cumulativeWh: amount("cumulative_wh"),
    cumulativeMilliWh: amount("cumulative_milli_wh"),
  },
  (table) => [
    uniqueIndex("evidence_lane_hash_unique").on(
      table.laneId,
      table.evidenceHash,
    ),
    index("evidence_lane_time_idx").on(table.laneId, table.receivedAt),
    uniqueIndex("evidence_accepted_sequence_unique").on(
      table.laneId,
      table.acceptedSequence,
    ),
    check(
      "evidence_values_nonnegative",
      sql`(${table.cumulativeWh} is null or ${table.cumulativeWh} >= 0) and (${table.cumulativeMilliWh} is null or ${table.cumulativeMilliWh} >= 0)`,
    ),
  ],
).enableRLS();

export const evidenceVerifications = pgTable(
  "evidence_verifications",
  {
    id: text("id").primaryKey(),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => meterEvidence.id),
    verifierVersion: text("verifier_version").notNull(),
    accepted: boolean("accepted").notNull(),
    reasonCode: text("reason_code"),
    checkedAt: instant("checked_at").notNull(),
  },
  (table) => [uniqueIndex("verification_evidence_unique").on(table.evidenceId)],
).enableRLS();

export const tempoChannels = pgTable("tempo_channels", {
  laneId: text("lane_id")
    .primaryKey()
    .references(() => lanes.id),
  channelId: text("channel_id").notNull().unique(),
  network: text("network").notNull(),
  assetId: text("asset_id").notNull(),
  status: text("status").notNull(),
  descriptor: jsonb("descriptor"),
  observedAt: instant("observed_at"),
}).enableRLS();
export const paymentOperations = pgTable(
  "payment_operations",
  {
    id: text("id").primaryKey(),
    laneId: text("lane_id")
      .notNull()
      .references(() => lanes.id),
    channelId: text("channel_id"),
    operation: text("operation").notNull(),
    requestedAmount: amount("requested_amount").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: instant("created_at").notNull(),
    txHash: text("tx_hash"),
    submittedAt: instant("submitted_at"),
    confirmedAt: instant("confirmed_at"),
    lastReason: text("last_reason"),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [
    uniqueIndex("payment_operation_key_unique").on(table.idempotencyKey),
    uniqueIndex("payment_operation_hash_unique").on(table.txHash),
    index("payment_operation_lane_idx").on(table.laneId),
    check(
      "payment_operation_amount_positive",
      sql`${table.requestedAmount} > 0 or (${table.requestedAmount} = 0 and ${table.operation} in ('close', 'voucher'))`,
    ),
  ],
).enableRLS();
export const tempoTransactions = pgTable(
  "tempo_transactions",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => tempoChannels.channelId),
    txHash: text("tx_hash").unique(),
    operation: text("operation").notNull(),
    status: text("status").notNull(),
    submittedAt: instant("submitted_at"),
    confirmedAt: instant("confirmed_at"),
  },
  (table) => [index("tempo_transaction_channel_idx").on(table.channelId)],
).enableRLS();
export const tempoVouchers = pgTable(
  "tempo_vouchers",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => tempoChannels.channelId),
    cumulativeAmount: amount("cumulative_amount").notNull(),
    signerRef: text("signer_ref").notNull(),
    domainRef: text("domain_ref").notNull(),
    signatureRef: text("signature_ref"),
    digest: text("digest"),
    signature: text("signature"),
    verifiedAt: instant("verified_at"),
    verificationStatus: text("verification_status")
      .notNull()
      .default("unverified"),
    createdAt: instant("created_at").notNull(),
  },
  (table) => [
    index("tempo_voucher_channel_idx").on(table.channelId),
    uniqueIndex("tempo_voucher_channel_amount_unique").on(
      table.channelId,
      table.cumulativeAmount,
    ),
    uniqueIndex("tempo_voucher_digest_unique").on(table.digest),
    check(
      "verified_voucher_has_proof",
      sql`${table.verificationStatus} <> 'verified' or (${table.digest} is not null and ${table.signature} is not null and ${table.verifiedAt} is not null)`,
    ),
    check("voucher_amount_nonnegative", nonnegative("cumulative_amount")),
  ],
).enableRLS();
export const tempoChainSnapshots = pgTable(
  "tempo_chain_snapshots",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => tempoChannels.channelId),
    chainHeight: amount("chain_height").notNull(),
    observedAt: instant("observed_at").notNull(),
    confirmedDeposit: amount("confirmed_deposit").notNull(),
    settledValue: amount("settled_value").notNull(),
    channelState: text("channel_state").notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    index("tempo_snapshot_channel_time_idx").on(
      table.channelId,
      table.observedAt,
    ),
    check(
      "snapshot_values_nonnegative",
      sql`${table.chainHeight} >= 0 and ${table.confirmedDeposit} >= 0 and ${table.settledValue} >= 0`,
    ),
  ],
).enableRLS();

export const cdrs = pgTable(
  "cdrs",
  {
    id: text("id").primaryKey(),
    laneId: text("lane_id")
      .notNull()
      .references(() => lanes.id),
    externalSessionId: text("external_session_id").notNull(),
    raw: jsonb("raw").notNull(),
    rawText: text("raw_text"),
    sourcePartyId: text("source_party_id"),
    externalCdrId: text("external_cdr_id"),
    contentHash: text("content_hash"),
    normalization: jsonb("normalization"),
    receivedAt: instant("received_at").notNull(),
    normalizedTotal: amount("normalized_total"),
  },
  (table) => [
    index("cdr_lane_idx").on(table.laneId),
    uniqueIndex("cdr_provider_identity_unique").on(
      table.sourcePartyId,
      table.externalCdrId,
    ),
    check(
      "cdr_total_nonnegative",
      sql`${table.normalizedTotal} is null or ${table.normalizedTotal} >= 0`,
    ),
  ],
).enableRLS();
export const reconciliations = pgTable(
  "reconciliations",
  {
    id: text("id").primaryKey(),
    laneId: text("lane_id")
      .notNull()
      .references(() => lanes.id),
    cdrId: text("cdr_id")
      .notNull()
      .references(() => cdrs.id),
    status: text("status").notNull(),
    comparedTotal: amount("compared_total"),
    comparison: jsonb("comparison"),
    reasonCode: text("reason_code"),
    checkedAt: instant("checked_at").notNull(),
  },
  (table) => [index("reconciliation_lane_idx").on(table.laneId)],
).enableRLS();

export const labScenarios = pgTable("lab_scenarios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  compilerVersion: integer("compiler_version").notNull().default(1),
  digest: text("digest").notNull().default(""),
  validationStatus: text("validation_status").notNull().default("valid"),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}).enableRLS();
export const labRuns = pgTable(
  "lab_runs",
  {
    id: text("id").primaryKey(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => labScenarios.id),
    status: text("status").notNull(),
    cursor: integer("cursor").notNull(),
    version: integer("version").notNull().default(0),
    traceOffsetMs: bigint("trace_offset_ms", { mode: "number" })
      .notNull()
      .default(0),
    speed: numeric("speed", { precision: 4, scale: 2 }).notNull().default("1"),
    scenarioDigest: text("scenario_digest").notNull().default(""),
    compiledSnapshot: jsonb("compiled_snapshot").notNull().default({}),
    guidance: jsonb("guidance"),
    corridorId: text("corridor_id"),
    laneBindings: jsonb("lane_bindings").notNull().default({}),
    replayOfRunId: text("replay_of_run_id"),
    awaiting: jsonb("awaiting"),
    failureCode: text("failure_code"),
    startedAt: instant("started_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (table) => [
    index("lab_run_scenario_idx").on(table.scenarioId),
    check("lab_run_cursor_nonnegative", sql`${table.cursor} >= 0`),
    check("lab_run_version_nonnegative", sql`${table.version} >= 0`),
    check("lab_run_trace_nonnegative", sql`${table.traceOffsetMs} >= 0`),
    check("lab_run_speed_valid", sql`${table.speed} in (0.25, 0.5, 1, 2, 4)`),
    check(
      "lab_run_status_valid",
      sql`${table.status} in ('initializing', 'ready', 'running', 'paused', 'awaiting_chain', 'completed', 'failed')`,
    ),
  ],
).enableRLS();
export const labRunEvents = pgTable(
  "lab_run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => labRuns.id),
    sequence: integer("sequence").notNull(),
    traceTime: instant("trace_time").notNull(),
    payload: jsonb("payload").notNull(),
    scenarioEventId: text("scenario_event_id").notNull().default(""),
    eventType: text("event_type").notNull().default(""),
    laneKey: text("lane_key"),
    laneId: text("lane_id"),
    traceOffsetMs: bigint("trace_offset_ms", { mode: "number" })
      .notNull()
      .default(0),
    status: text("status").notNull().default("pending"),
    commandId: text("command_id"),
    expectedLaneVersion: integer("expected_lane_version"),
    reasonCode: text("reason_code"),
    leaseUntil: instant("lease_until"),
    createdAt: instant("created_at").notNull().defaultNow(),
    completedAt: instant("completed_at"),
  },
  (table) => [
    uniqueIndex("lab_run_sequence_unique").on(table.runId, table.sequence),
    uniqueIndex("lab_run_event_identity_unique").on(
      table.runId,
      table.scenarioEventId,
    ),
    check("lab_event_trace_nonnegative", sql`${table.traceOffsetMs} >= 0`),
    check(
      "lab_event_status_valid",
      sql`${table.status} in ('pending', 'dispatching', 'completed', 'rejected', 'blocked', 'awaiting_chain', 'failed')`,
    ),
  ],
).enableRLS();

export const domainEvents = pgTable(
  "domain_events",
  {
    id: text("id").primaryKey(),
    ordinal: bigserial("ordinal", { mode: "number" }).notNull(),
    type: text("type").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    corridorId: text("corridor_id")
      .notNull()
      .references(() => corridors.id),
    laneId: text("lane_id").references(() => lanes.id),
    laneVersion: integer("lane_version"),
    occurredAt: instant("occurred_at").notNull(),
    traceTime: instant("trace_time"),
    causationId: text("causation_id"),
    correlationId: text("correlation_id").notNull(),
    reasonCode: text("reason_code"),
    payload: jsonb("payload").notNull(),
    evidenceHash: text("evidence_hash"),
    channelId: text("channel_id"),
    txHash: text("tx_hash"),
    cdrId: text("cdr_id"),
  },
  (table) => [
    uniqueIndex("event_ordinal_unique").on(table.ordinal),
    index("event_lane_order_idx").on(table.laneId, table.laneVersion),
    index("event_corridor_idx").on(table.corridorId),
  ],
).enableRLS();
export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => domainEvents.id),
    laneId: text("lane_id")
      .notNull()
      .references(() => lanes.id),
    effectType: text("effect_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull(),
    nextAttemptAt: instant("next_attempt_at").notNull(),
    leaseUntil: instant("lease_until"),
    leaseToken: text("lease_token"),
    lastError: text("last_error"),
    externalReference: text("external_reference"),
  },
  (table) => [
    index("outbox_due_idx").on(table.status, table.nextAttemptAt),
    index("outbox_lane_idx").on(table.laneId),
    check("outbox_attempts_nonnegative", sql`${table.attemptCount} >= 0`),
    check(
      "outbox_status_valid",
      sql`${table.status} in ('pending', 'processing', 'submitted', 'completed', 'failed')`,
    ),
  ],
).enableRLS();
export const auditProjection = pgTable(
  "audit_projection",
  {
    eventId: text("event_id")
      .primaryKey()
      .references(() => domainEvents.id),
    laneId: text("lane_id")
      .notNull()
      .references(() => lanes.id),
    corridorId: text("corridor_id")
      .notNull()
      .references(() => corridors.id),
    laneVersion: integer("lane_version").notNull(),
    state: text("state").notNull(),
    reasonCodes: jsonb("reason_codes").notNull(),
    summary: text("summary").notNull(),
    occurredAt: instant("occurred_at").notNull(),
  },
  (table) => [
    index("audit_lane_version_idx").on(table.laneId, table.laneVersion),
  ],
).enableRLS();
export const processedCommands = pgTable(
  "processed_commands",
  {
    commandId: text("command_id").primaryKey(),
    aggregateId: text("aggregate_id").notNull(),
    requestHash: text("request_hash").notNull(),
    outcome: jsonb("outcome").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (table) => [index("command_aggregate_idx").on(table.aggregateId)],
).enableRLS();

export const hostedInvites = pgTable("hosted_invites", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: instant("expires_at").notNull(),
  revoked: boolean("revoked").notNull().default(false),
  maxRedemptions: integer("max_redemptions").notNull(),
  maxRuns: integer("max_runs").notNull(),
  runsPerWorkspace: integer("runs_per_workspace").notNull(),
  fundingBudget: amount("funding_budget").notNull(),
  feeBudget: amount("fee_budget").notNull(),
}).enableRLS();
export const hostedSessions = pgTable(
  "hosted_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    capabilities: jsonb("capabilities")
      .notNull()
      .default(["inspect_owned", "execute_preset", "control_owned"]),
    inviteId: text("invite_id")
      .notNull()
      .references(() => hostedInvites.id),
    expiresAt: instant("expires_at").notNull(),
    revoked: boolean("revoked").notNull().default(false),
  },
  (table) => [index("hosted_session_workspace_idx").on(table.workspaceId)],
).enableRLS();
export const hostedAdmissions = pgTable(
  "hosted_admissions",
  {
    lastActivityAt: instant("last_activity_at").notNull().defaultNow(),
    runId: text("run_id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    inviteId: text("invite_id")
      .notNull()
      .references(() => hostedInvites.id),
    compiled: jsonb("compiled").notNull(),
    fundingReserved: amount("funding_reserved").notNull(),
    feesReserved: amount("fees_reserved").notNull(),
    gasLimit: amount("gas_limit").notNull(),
    maxFeePerGas: amount("max_fee_per_gas").notNull(),
    maxTransactions: integer("max_transactions").notNull(),
    status: text("status").notNull().default("queued"),
    createdAt: instant("created_at").notNull(),
  },
  (table) => [index("hosted_admission_workspace_idx").on(table.workspaceId)],
).enableRLS();
export const hostedSubmissions = pgTable("hosted_submissions", {
  effectKey: text("effect_key").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => hostedAdmissions.runId),
  laneId: text("lane_id").notNull(),
  effectType: text("effect_type").notNull(),
  funding: amount("funding").notNull(),
  fee: amount("fee").notNull(),
}).enableRLS();
export const publishedRuns = pgTable(
  "published_runs",
  {
    runId: text("run_id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    payment: text("payment").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    publishedAt: instant("published_at").notNull(),
  },
  () => [
    pgPolicy("published_runs_read", {
      for: "select",
      to: "public",
      using: sql`true`,
    }),
  ],
).enableRLS();
export const hostedRateLimits = pgTable("hosted_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: instant("window_start").notNull(),
  count: integer("count").notNull(),
}).enableRLS();

export const hostedScenarios = pgTable(
  "hosted_scenarios",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    digest: text("digest").notNull(),
    compiled: jsonb("compiled").notNull(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (table) => [index("hosted_scenario_workspace_idx").on(table.workspaceId)],
).enableRLS();
