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
    payerEmsp: idSchema,
    payeeCpo: idSchema,
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
      .object({ minimumIntervalMs: z.number().int().positive() })
      .strict(),
    meters: z
      .array(
        z
          .object({
            meterId: idSchema,
            publicKeyHex: z.string().regex(/^[0-9a-fA-F]{128,400}$/),
            fingerprint: idSchema,
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
          authorizedValue: decimalSchema,
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
    reasonCodes: z.array(z.string()),
    updatedAt: instantSchema,
    source: z.literal("stored-projection"),
    chainObservedAt: instantSchema.nullable(),
    paymentSource: z.enum(["tempo-adapter", "local-simulation"]).nullable(),
    chainFreshness: z.enum(["current", "historical", "unknown"]),
    evidenceFreshness: z.enum(["current", "historical", "unknown"]),
    authorityCheckedAt: instantSchema,
  })
  .strict();

export type CreateCorridorInput = z.infer<typeof createCorridorSchema>;
export type StartLaneInput = z.infer<typeof startLaneSchema>;
export type LaneCommandInput = z.infer<typeof laneCommandSchema>;
export type LaneProjection = z.infer<typeof laneProjectionSchema>;
