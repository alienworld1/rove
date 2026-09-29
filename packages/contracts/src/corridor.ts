import { z } from "zod";
import { laneStates } from "@rove/domain";
import {
  decimalSchema,
  idSchema,
  instantSchema,
  laneProjectionSchema,
  positiveDecimalSchema,
  protectionPolicySchema,
  tariffSchema,
} from "./charging.ts";

export const traceOutcomeSchema = z.enum([
  "accepted",
  "rejected",
  "pending",
  "confirmed",
  "failed",
  "informational",
]);

export const laneTraceEventSchema = z
  .object({
    eventId: idSchema,
    eventType: z.string().min(1).max(120),
    occurredAt: instantSchema,
    traceTime: instantSchema.nullable(),
    traceOffsetMs: z.number().int().nonnegative().nullable(),
    laneVersion: z.number().int().nonnegative().nullable(),
    reasonCode: z.string().min(1).max(120).nullable(),
    outcome: traceOutcomeSchema,
    references: z
      .object({
        evidenceHash: z.string().max(256).nullable(),
        channelId: idSchema.nullable(),
        transactionHash: z.string().max(256).nullable(),
      })
      .strict(),
    values: z
      .object({
        before: z
          .object({
            trusted: decimalSchema,
            protected: decimalSchema,
            exposure: decimalSchema,
          })
          .strict()
          .nullable(),
        after: z
          .object({
            trusted: decimalSchema,
            protected: decimalSchema,
            exposure: decimalSchema,
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();

export const laneOperatingViewSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    powerClass: z.string().trim().min(1).max(80),
    projection: laneProjectionSchema,
    trace: z.array(laneTraceEventSchema).max(100),
    scale: z
      .object({
        valueDomainMax: positiveDecimalSchema,
        traceStartMs: z.number().int().nonnegative(),
        traceEndMs: z.number().int().nonnegative(),
      })
      .strict()
      .refine((value) => value.traceEndMs >= value.traceStartMs, {
        message: "Trace scale must be ordered",
      }),
  })
  .strict();

export const corridorOperatingViewSchema = z
  .object({
    corridor: z
      .object({
        id: idSchema,
        name: z.string().trim().min(1).max(160),
        payerEmsp: z.string().trim().min(1).max(160),
        payeeCpo: z.string().trim().min(1).max(160),
        settlementAssetId: idSchema,
        tempoNetwork: idSchema,
        tariff: tariffSchema,
        protectionPolicy: protectionPolicySchema,
      })
      .strict(),
    projectionVersion: z.number().int().nonnegative(),
    checkedAt: instantSchema,
    laneOrder: z.array(idSchema).max(3),
    lanes: z.array(laneOperatingViewSchema).max(3),
    aggregate: z
      .object({
        activeLaneCount: z.number().int().nonnegative(),
        attentionLaneIds: z.array(idSchema).max(3),
        state: z.union([z.enum(laneStates), z.literal("MIXED")]),
        trustedDeliveredValue: decimalSchema,
        protectedValue: decimalSchema,
        settledValue: decimalSchema,
        unprotectedExposureBound: decimalSchema,
        unusedFundedHeadroom: decimalSchema.nullable(),
      })
      .strict(),
    environment: z
      .object({
        physicalSource: z.string().trim().min(1).max(120),
        evidence: z.string().trim().min(1).max(160),
        payment: z.string().trim().min(1).max(160),
        settlement: z.string().trim().min(1).max(160),
      })
      .strict(),
    activeRun: z
      .object({
        id: idSchema,
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
        traceEndMs: z.number().int().nonnegative(),
        speed: z.union([
          z.literal(0.25),
          z.literal(0.5),
          z.literal(1),
          z.literal(2),
          z.literal(4),
        ]),
        faultTraceOffsetMs: z.number().int().nonnegative().nullable(),
        recoveryTraceOffsetMs: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((view, context) => {
    if (new Set(view.laneOrder).size !== view.laneOrder.length)
      context.addIssue({
        code: "custom",
        path: ["laneOrder"],
        message: "Lane order must be unique",
      });
    const laneIds = new Set(view.lanes.map((lane) => lane.projection.id));
    if (
      view.laneOrder.some((id) => !laneIds.has(id)) ||
      view.laneOrder.length !== view.lanes.length
    )
      context.addIssue({
        code: "custom",
        path: ["laneOrder"],
        message: "Lane order must match the included Lanes",
      });
  });

const causalStepStatusSchema = z.enum([
  "complete",
  "rejected",
  "pending",
  "not_applicable",
  "unavailable",
]);

export const causalInspectorTraceSchema = z
  .object({
    corridorId: idSchema,
    laneId: idSchema,
    eventId: idSchema,
    eventType: z.string().min(1).max(120),
    occurredAt: instantSchema,
    traceTime: instantSchema.nullable(),
    reasonCode: z.string().min(1).max(120).nullable(),
    reasonText: z.string().min(1).max(240).nullable(),
    evidence: z
      .object({
        evidenceHash: z.string().max(256),
        source: z.string().min(1).max(120),
        meterId: idSchema.nullable(),
        sessionId: idSchema.nullable(),
        timestamp: instantSchema.nullable(),
        sequence: z.number().int().nonnegative().nullable(),
        cumulativeWh: decimalSchema.nullable(),
        verifierVersion: z.string().min(1).max(120),
        accepted: z.boolean(),
        checks: z
          .object({
            signature: z.enum(["verified", "rejected", "unavailable"]),
            identity: z.enum(["verified", "rejected", "unavailable"]),
            continuity: z.enum(["verified", "rejected", "unavailable"]),
            replay: z.enum(["verified", "rejected", "unavailable"]),
            freshness: z.enum(["verified", "rejected", "unavailable"]),
          })
          .strict(),
        raw: z
          .object({ content: z.string().max(16_384), truncated: z.boolean() })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
    calculation: z
      .object({
        tariffPerKwh: decimalSchema,
        tariffDecimals: z.number().int().nonnegative(),
        assetDecimals: z.number().int().nonnegative(),
        priorTrustedValue: decimalSchema,
        nextTrustedValue: decimalSchema,
        priorProtectedValue: decimalSchema,
        nextProtectedValue: decimalSchema,
        priorExposureBound: decimalSchema,
        nextExposureBound: decimalSchema,
      })
      .strict()
      .nullable(),
    voucher: z
      .object({
        cumulativeAmount: decimalSchema,
        digest: z.string().max(256),
        signatureSummary: z.string().max(160),
        verificationStatus: z.string().max(80),
        verifiedAt: instantSchema.nullable(),
        signerRef: z.string().max(160),
        domainRef: z.string().max(160),
      })
      .strict()
      .nullable(),
    payment: z
      .object({
        channelId: idSchema,
        payer: z.string().min(1).max(160),
        payee: z.string().min(1).max(160),
        assetId: idSchema,
        network: idSchema,
        confirmedDeposit: decimalSchema.nullable(),
        authorizedValue: decimalSchema,
        settledValue: decimalSchema,
        fundedHeadroom: decimalSchema.nullable(),
        operationType: z.string().min(1).max(80).nullable(),
        operationStatus: z
          .enum(["pending", "submitted", "confirmed", "failed"])
          .nullable(),
        transactionHash: z.string().max(256).nullable(),
        confirmedAt: instantSchema.nullable(),
      })
      .strict()
      .nullable(),
    result: z
      .object({
        laneVersion: z.number().int().nonnegative().nullable(),
        state: z.enum(laneStates),
        reasonCodes: z.array(z.string().max(120)),
        before: z
          .object({
            trusted: decimalSchema,
            protected: decimalSchema,
            exposure: decimalSchema,
          })
          .strict()
          .nullable(),
        after: z
          .object({
            trusted: decimalSchema,
            protected: decimalSchema,
            exposure: decimalSchema,
          })
          .strict(),
      })
      .strict(),
    causalSteps: z
      .array(
        z
          .object({
            type: z.enum([
              "evidence",
              "verification",
              "calculation",
              "voucher",
              "payment",
              "result",
            ]),
            label: z.string().min(1).max(120),
            status: causalStepStatusSchema,
            reference: z.string().max(256).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();

export const realtimePresentationEventSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.enum([
      "corridor_projection_changed",
      "lane_projection_changed",
      "lab_run_changed",
      "resync_required",
    ]),
    corridorId: idSchema,
    laneId: idSchema.nullable(),
    runId: idSchema.nullable(),
    projectionVersion: z.number().int().nonnegative(),
    reasonCode: z.string().max(120).nullable(),
    occurredAt: instantSchema,
    payload: z
      .object({
        eventType: z.string().max(120).nullable(),
        laneVersion: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

export type CorridorOperatingView = z.infer<typeof corridorOperatingViewSchema>;
export type LaneOperatingView = z.infer<typeof laneOperatingViewSchema>;
export type LaneTraceEvent = z.infer<typeof laneTraceEventSchema>;
export type CausalInspectorTrace = z.infer<typeof causalInspectorTraceSchema>;
export type RealtimePresentationEvent = z.infer<
  typeof realtimePresentationEventSchema
>;
