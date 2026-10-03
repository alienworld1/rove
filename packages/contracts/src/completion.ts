import { z } from "zod";
import { decimalSchema, idSchema, instantSchema } from "./charging.ts";

export const completionCommandSchema = z
  .object({
    commandId: idSchema,
    correlationId: idSchema,
    laneId: idSchema,
    expectedVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const signedInteger = z.string().regex(/^-?(0|[1-9][0-9]*)$/);
export const sessionCompletionSchema = z
  .object({
    status: z.enum([
      "awaiting_end_evidence",
      "awaiting_cdr",
      "awaiting_authorization",
      "awaiting_settlement",
      "mismatch",
      "reconciled",
      "closing",
      "closed",
    ]),
    serviceStartedAt: instantSchema,
    serviceEndedAt: instantSchema,
    endSource: z.enum(["controlled_twin", "external_adapter"]),
    finalVoucherDigest: z.string().nullable().default(null),
    finalEvidenceHash: z.string().nullable(),
    finalEvidenceSequence: z.number().int().nonnegative().nullable(),
    finalTrustedEnergyWh: decimalSchema.nullable(),
    finalTrustedValue: decimalSchema.nullable(),
    finalAuthorizedValue: decimalSchema.nullable(),
    finalSettledValue: decimalSchema.nullable(),
    cdr: z
      .object({
        id: idSchema,
        contentHash: z.string(),
        totalEnergyWh: decimalSchema,
        normalizedTotal: decimalSchema,
        currency: z.string(),
        sourcePartyId: idSchema,
        source: z.enum(["controlled_fixture", "external_adapter"]),
      })
      .strict()
      .nullable(),
    comparison: z
      .object({
        id: idSchema,
        laneVersion: z.number().int(),
        checkedAt: instantSchema,
        status: z.enum(["MATCH", "MISMATCH"]),
        deltas: z
          .object({
            energyWh: signedInteger,
            accounting: signedInteger,
            authorization: signedInteger,
            settlement: signedInteger,
          })
          .strict(),
        reasonCodes: z.array(z.string()),
        references: z
          .object({
            evidenceHash: z.string(),
            voucherDigest: z.string().nullable(),
            chainObservedAt: instantSchema.nullable(),
            cdrId: idSchema,
          })
          .strict(),
      })
      .strict()
      .nullable(),
    closure: z
      .object({
        depositBeforeClose: decimalSchema,
        settledBeforeClose: decimalSchema,
        expectedRefund: decimalSchema,
        confirmedRefund: decimalSchema.nullable(),
        transactionHash: z.string().nullable(),
        receiptBlock: decimalSchema.nullable(),
        closeEventReference: z.string().nullable(),
        refundEvidenceReference: z.string().nullable(),
        observedAt: instantSchema.nullable(),
      })
      .strict()
      .nullable(),
    reasonCodes: z.array(z.string()),
  })
  .strict();
export const completionSummarySchema = z
  .object({
    laneId: idSchema,
    version: z.number().int().nonnegative(),
    externalSessionId: idSchema,
    completion: sessionCompletionSchema.nullable(),
    recovery: z
      .object({
        status: z.enum(["pending", "ready", "blocked"]),
        checkedAt: instantSchema.nullable(),
        reasonCodes: z.array(z.string()),
      })
      .strict(),
    failedOperations: z
      .array(
        z
          .object({ operation: z.string(), reasonCode: z.string().nullable() })
          .strict(),
      )
      .default([]),
    canFinish: z.boolean(),
    canClose: z.boolean(),
    paymentSource: z.enum(["tempo-adapter", "local-simulation"]).nullable(),
    evidenceEventId: idSchema.nullable(),
    paymentEventId: idSchema.nullable(),
  })
  .strict();
export type CompletionSummary = z.infer<typeof completionSummarySchema>;
export type CompletionCommand = z.infer<typeof completionCommandSchema>;
