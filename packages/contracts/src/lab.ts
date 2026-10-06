import { z } from "zod";
import {
  decimalSchema,
  idSchema,
  instantSchema,
  positiveDecimalSchema,
  protectionPolicySchema,
  tariffSchema,
  laneProjectionSchema,
} from "./charging.ts";

const offsetSchema = z.number().int().nonnegative().max(3_600_000);
const orderSchema = z.number().int().nonnegative().max(10_000);
const laneKeySchema = idSchema;
const empty = z.object({}).strict();
const reading = z.object({ cumulativeMilliWh: decimalSchema }).strict();

const timing = {
  id: idSchema,
  laneKey: laneKeySchema,
  traceOffsetMs: offsetSchema,
  sequence: orderSchema,
  durationMs: z.number().int().positive().max(3_600_000).nullable(),
};

export const labEventSchema = z.discriminatedUnion("type", [
  z
    .object({ ...timing, type: z.literal("session_start"), parameters: empty })
    .strict(),
  z
    .object({
      ...timing,
      type: z.literal("valid_reading"),
      parameters: reading,
    })
    .strict(),
  z
    .object({
      ...timing,
      type: z.literal("recovery_reading"),
      parameters: reading,
    })
    .strict(),
  z
    .object({
      ...timing,
      type: z.literal("corrupt_signature"),
      parameters: reading,
    })
    .strict(),
  z
    .object({ ...timing, type: z.literal("wrong_meter"), parameters: reading })
    .strict(),
  z
    .object({ ...timing, type: z.literal("replay_reading"), parameters: empty })
    .strict(),
  z
    .object({
      ...timing,
      type: z.literal("sequence_break"),
      parameters: reading,
    })
    .strict(),
  z
    .object({ ...timing, type: z.literal("evidence_gap"), parameters: empty })
    .strict(),
  z
    .object({
      ...timing,
      type: z.literal("signer_unavailable"),
      parameters: empty,
    })
    .strict(),
  z
    .object({
      ...timing,
      type: z.literal("signer_restored"),
      parameters: empty,
    })
    .strict(),
  z
    .object({ ...timing, type: z.literal("top_up_failure"), parameters: empty })
    .strict(),
  z
    .object({
      ...timing,
      type: z.literal("tempo_unavailable"),
      parameters: empty,
    })
    .strict(),
  z
    .object({ ...timing, type: z.literal("tempo_restored"), parameters: empty })
    .strict(),
  z
    .object({
      ...timing,
      type: z.literal("protection_tick"),
      parameters: empty,
    })
    .strict(),
]);

export const labLaneSchema = z
  .object({
    key: laneKeySchema,
    label: z.string().trim().min(1).max(80),
    powerClass: z.enum(["AC", "DC", "HPC"]),
    maxPowerWatts: positiveDecimalSchema,
    meterProfileId: idSchema,
    meterId: idSchema,
    chargerId: idSchema,
    sessionId: idSchema,
    expectedProofIntervalMs: z.number().int().positive().max(3_600_000),
    initialEnergyWh: decimalSchema,
  })
  .strict();

export const labScenarioV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    id: idSchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    traceEpoch: instantSchema,
    corridor: z
      .object({
        name: z.string().trim().min(1).max(160),
        payerEmsp: z.string().trim().min(1).max(160),
        payeeCpo: z.string().trim().min(1).max(160),
        settlementAssetId: idSchema,
        tempoNetwork: idSchema,
        tariff: tariffSchema,
        protectionPolicy: protectionPolicySchema,
        reservePolicy: z
          .object({
            initialDeposit: positiveDecimalSchema,
            topUpIncrement: positiveDecimalSchema,
          })
          .strict(),
        settlementPolicy: z
          .object({
            minimumIntervalMs: z.number().int().positive(),
            minimumUnsettledProtectedValue: positiveDecimalSchema,
          })
          .strict(),
      })
      .strict(),
    lanes: z.array(labLaneSchema).min(1).max(3),
    events: z.array(labEventSchema).min(1).max(200),
    terminalCondition: z.literal("after_recovery"),
  })
  .strict();

export const labAccountingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("matching") }).strict(),
  z
    .object({
      mode: z.literal("custom"),
      totalEnergyWh: decimalSchema,
      totalCost: decimalSchema,
    })
    .strict(),
]);
export const labScenarioV2Schema = labScenarioV1Schema
  .extend({
    schemaVersion: z.literal(2),
    terminalCondition: z.enum(["after_recovery", "after_trace"]),
    accountingByLane: z.record(idSchema, labAccountingSchema).optional(),
  })
  .strict();
export const labScenarioSchema = z.discriminatedUnion("schemaVersion", [
  labScenarioV1Schema,
  labScenarioV2Schema,
]);

export type LabScenario = z.infer<typeof labScenarioSchema>;
export type LabScenarioEvent = LabScenario["events"][number];
export type LabLaneDefinition = LabScenario["lanes"][number];

export const demoMilestoneIds = [
  "accepted",
  "top_up",
  "settled",
  "rejected",
  "risk",
  "pause",
  "recovered",
] as const;
export const demoMilestoneSchema = z
  .object({
    id: z.enum(demoMilestoneIds),
    laneId: idSchema,
    eventId: idSchema,
    traceOffsetMs: z.number().int().nonnegative(),
  })
  .strict();
export const guidanceSchema = z
  .object({
    mode: z.enum(["guided", "continuous"]),
    reached: z.array(demoMilestoneSchema).max(7),
    active: z.enum(demoMilestoneIds).nullable(),
  })
  .strict();
export type RunGuidance = z.infer<typeof guidanceSchema>;
export const scenarioReadinessSchema = z
  .object({
    ready: z.boolean(),
    paymentCompatible: z.boolean(),
    accountingCompatible: z.boolean(),
    message: z.string().nullable(),
  })
  .strict();

export const labTransportSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export const labGuidanceCommandSchema = labTransportSchema.extend({
  mode: z.enum(["guided", "continuous"]),
});
export const labSpeedSchema = labTransportSchema.extend({
  speed: z.union([
    z.literal(0.25),
    z.literal(0.5),
    z.literal(1),
    z.literal(2),
    z.literal(4),
  ]),
});
export const labStartRunSchema = z
  .object({
    scenarioId: idSchema,
    scenarioDigest: z.string().regex(/^[0-9a-f]{64}$/),
    runId: idSchema.optional(),
    playbackMode: z.enum(["guided", "continuous"]).optional(),
  })
  .strict();

export const labScenarioSummarySchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(160),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    schemaVersion: z.number().int().positive(),
    validationStatus: z.string().min(1).max(80),
  })
  .strict();

export const savedLabScenarioSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(160),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const labScenarioDetailSchema = z
  .object({
    definition: labScenarioSchema,
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    validationStatus: z.string().min(1).max(80),
  })
  .strict();

export const labRunViewSchema = z
  .object({
    recorded: z.boolean().optional(),
    run: z
      .object({
        id: idSchema,
        scenarioId: idSchema,
        scenarioDigest: z.string(),
        status: z.enum([
          "initializing",
          "ready",
          "running",
          "paused",
          "awaiting_chain",
          "completed",
          "failed",
        ]),
        version: z.number().int().nonnegative(),
        cursor: z.number().int().nonnegative(),
        traceOffsetMs: z.number().int().nonnegative(),
        speed: z.union([
          z.literal(0.25),
          z.literal(0.5),
          z.literal(1),
          z.literal(2),
          z.literal(4),
        ]),
        laneBindings: z.record(idSchema, idSchema),
        replayOfRunId: idSchema.nullable(),
        awaiting: z.unknown().nullable(),
        failureCode: z.string().nullable(),
        guidance: guidanceSchema.nullable().optional(),
        startedAt: instantSchema,
        updatedAt: instantSchema,
      })
      .strict(),
    scenario: labScenarioSchema,
    environment: z
      .object({
        physicalSource: z.literal("Digital twin"),
        evidence: z.string(),
        payment: z.string(),
        settlement: z.string(),
      })
      .strict(),
    lanes: z.array(
      z
        .object({
          definition: labLaneSchema,
          projection: laneProjectionSchema.nullable(),
        })
        .strict(),
    ),
    events: z.array(
      z
        .object({
          id: idSchema,
          sequence: z.number().int().nonnegative(),
          laneKey: idSchema.nullable(),
          type: z.string(),
          traceOffsetMs: z.number().int().nonnegative(),
          status: z.string(),
          reasonCode: z.string().nullable(),
          commandId: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type LabRunView = z.infer<typeof labRunViewSchema>;
