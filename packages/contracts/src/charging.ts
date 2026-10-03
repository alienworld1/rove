import { z } from "zod";
import { laneStates } from "@rove/domain";

export const decimalSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const positiveDecimalSchema = decimalSchema.refine(
  (value) => BigInt(value) > BigInt(0),
);
export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const instantSchema = z.iso.datetime({ offset: true });

export const tariffSchema = z
  .object({
    perKwh: positiveDecimalSchema,
    tariffDecimals: z.number().int().min(0).max(36),
    assetDecimals: z.number().int().min(0).max(36),
  })
  .strict();

export const protectionPolicySchema = z
  .object({
    warningThreshold: decimalSchema,
    riskThreshold: decimalSchema,
    maxUnprotectedExposure: positiveDecimalSchema,
    evidenceMaxAgeMs: z.number().int().positive(),
    chainMaxAgeMs: z.number().int().positive(),
    zeroGrace: z.boolean(),
    lowHeadroomThreshold: decimalSchema,
  })
  .strict()
  .refine(
    (value) =>
      BigInt(value.warningThreshold) <= BigInt(value.riskThreshold) &&
      BigInt(value.riskThreshold) < BigInt(value.maxUnprotectedExposure),
    { message: "Protection thresholds must be ordered" },
  );

export const createCorridorSchema = z
  .object({
    commandId: idSchema,
    correlationId: idSchema,
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
    meters: z
      .array(
        z
          .object({
            meterId: idSchema,
            publicKeyHex: z.string().regex(/^[0-9a-fA-F]{128,400}$/),
            fingerprint: idSchema,
            source: z.enum(["meter", "controlled-fixture"]).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const startLaneSchema = z
  .object({
    commandId: idSchema,
    correlationId: idSchema,
    corridorId: idSchema,
    externalSessionId: idSchema,
    chargerId: idSchema,
    meterId: idSchema,
    maxPowerWatts: positiveDecimalSchema,
    expectedProofIntervalMs: z.number().int().positive(),
  })
  .strict();

export const laneCommandSchema = z
  .object({
    commandId: idSchema,
    correlationId: idSchema,
    causationId: idSchema.optional(),
    laneId: idSchema,
    expectedVersion: z.number().int().nonnegative(),
    now: instantSchema.optional(),
    payload: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("ObserveEvidence"),
          raw: z.string().min(1).max(65536),
          transportSessionId: idSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal("ObservePayment"),
          channelId: idSchema,
          network: idSchema,
          assetId: idSchema,
          observedAt: instantSchema,
          confirmedDeposit: decimalSchema,
          settledValue: decimalSchema,
          chainHeight: decimalSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal("PaymentUnavailable"),
          reason: z.enum([
            "PAYMENT_CHAIN_STATE_UNAVAILABLE",
            "PAYMENT_CHAIN_STATE_STALE",
          ]),
        })
        .strict(),
      z.object({ type: z.literal("TickProtectionClock") }).strict(),
      z.object({ type: z.literal("RequirePause") }).strict(),
      z.object({ type: z.literal("BeginRecovery") }).strict(),
    ]),
  })
  .strict();

export const laneProjectionSchema = z
  .object({
    id: idSchema,
    version: z.number().int().nonnegative(),
    corridorId: idSchema,
    externalSessionId: idSchema,
    chargerId: idSchema,
    meterId: idSchema,
    state: z.enum(laneStates),
    trustedEnergyWh: decimalSchema,
    trustedDeliveredValue: decimalSchema,
    authorizedValue: decimalSchema,
    settledValue: decimalSchema,
    confirmedDeposit: decimalSchema.nullable(),
    fundedHeadroom: decimalSchema.nullable(),
    protectedValue: decimalSchema,
    unverifiedServiceBound: decimalSchema,
    worstCaseDeliveredValue: decimalSchema,
    unprotectedExposureBound: decimalSchema,
    exposureRemaining: decimalSchema,
    maxUnprotectedExposure: positiveDecimalSchema,
    channelId: idSchema.nullable(),
    lastEvidenceHash: z.string().nullable(),
    lastTrustedEvidenceAt: instantSchema.nullable(),
    latestVoucherDigest: z.string().nullable(),
    operations: z.array(
      z
        .object({
          type: z.enum(["open", "voucher", "top_up", "settle"]),
          status: z.enum(["pending", "submitted", "confirmed", "failed"]),
          requestedAmount: decimalSchema,
          transactionHash: z.string().nullable(),
          reasonCode: z.string().nullable(),
        })
        .strict(),
    ),
    reasonCodes: z.array(z.string()),
    updatedAt: instantSchema,
    source: z.literal("stored-projection"),
    chainObservedAt: instantSchema.nullable(),
    paymentSource: z.enum(["tempo-adapter", "local-simulation"]).nullable(),
    meterSource: z.enum(["meter", "controlled-fixture"]),
    chainFreshness: z.enum(["current", "historical", "unknown"]),
    evidenceFreshness: z.enum(["current", "historical", "unknown"]),
    authorityCheckedAt: instantSchema,
  })
  .strict();

export type CreateCorridorInput = z.infer<typeof createCorridorSchema>;
export type StartLaneInput = z.infer<typeof startLaneSchema>;
export type LaneCommandInput = z.infer<typeof laneCommandSchema>;
export type LaneProjection = z.infer<typeof laneProjectionSchema>;

export const lanePresentationSnapshotSchema = laneProjectionSchema.pick({
  version: true,
  state: true,
  trustedEnergyWh: true,
  trustedDeliveredValue: true,
  authorizedValue: true,
  settledValue: true,
  confirmedDeposit: true,
  fundedHeadroom: true,
  protectedValue: true,
  unverifiedServiceBound: true,
  worstCaseDeliveredValue: true,
  unprotectedExposureBound: true,
  exposureRemaining: true,
  reasonCodes: true,
});

export const laneHistorySchema = z.array(
  z
    .object({
      id: idSchema,
      type: z.string(),
      version: z.number().int().nonnegative().nullable(),
      occurredAt: instantSchema,
      traceTime: instantSchema.nullable(),
      reasonCode: z.string().nullable(),
      evidenceHash: z.string().nullable(),
      channelId: z.string().nullable(),
      transactionHash: z.string().nullable(),
      summary: z
        .object({
          before: z
            .object({
              trusted: decimalSchema,
              protected: decimalSchema,
              exposure: decimalSchema,
            })
            .nullable(),
          after: z.object({
            trusted: decimalSchema,
            protected: decimalSchema,
            exposure: decimalSchema,
          }),
        })
        .nullable(),
      detail: z.object({ digest: z.string().nullable() }).nullable(),
      snapshot: lanePresentationSnapshotSchema.nullable().default(null),
    })
    .strict(),
);

export const paymentEffectPayloadSchema = z
  .object({
    laneId: idSchema,
    channelId: idSchema.optional(),
    amount: decimalSchema.optional(),
    priorDeposit: decimalSchema.optional(),
  })
  .passthrough();
export type LaneHistory = z.infer<typeof laneHistorySchema>;
