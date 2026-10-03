import { createHash } from "node:crypto";
import { z } from "zod";
import { idSchema, instantSchema, tariffSchema } from "@rove/contracts";
import type { FixedTariff } from "@rove/domain";
import { nonnegativeInteger } from "@rove/protection";

const sourceDecimal = z
  .string()
  .max(120)
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/);
export const accountingRecordSchema = z
  .object({
    externalCdrId: idSchema,
    externalSessionId: idSchema,
    sourcePartyId: idSchema,
    meterId: idSchema,
    chargerId: idSchema,
    startedAt: instantSchema,
    endedAt: instantSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    totalEnergyKwh: sourceDecimal,
    totalCost: sourceDecimal,
    tariffBasis: tariffSchema,
    chargeType: z.literal("energy_only_tax_free"),
  })
  .strict();
export type AccountingRecord = z.infer<typeof accountingRecordSchema>;
export type AccountingContext = {
  externalSessionId: string;
  sourcePartyId: string;
  meterId: string;
  chargerId: string;
  startedAt: string;
  endedAt: string;
  currency: string;
  settlementAssetId: string;
  tariff: FixedTariff;
};

function exactUnits(value: string, decimals: number) {
  const [whole, fraction = ""] = value.split(".");
  if (/[^0]/.test(fraction.slice(decimals)))
    throw new RangeError("CDR_PRECISION_UNSUPPORTED");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.slice(0, decimals).padEnd(decimals, "0") || "0")
  ).toString();
}

export function normalizeAccountingRecord(
  raw: string,
  context: AccountingContext,
  now: string,
) {
  if (Buffer.byteLength(raw) > 60000) throw new RangeError("CDR_TOO_LARGE");
  const record = accountingRecordSchema.parse(JSON.parse(raw));
  if (!/^[A-Z]{3}$/.test(context.currency) || !context.settlementAssetId)
    throw new RangeError("CDR_CURRENCY_MAPPING_MISSING");
  for (const key of [
    "externalSessionId",
    "sourcePartyId",
    "meterId",
    "chargerId",
    "currency",
  ] as const)
    if (record[key] !== context[key])
      throw new RangeError("CDR_BINDING_INVALID");
  if (
    record.tariffBasis.perKwh !== context.tariff.perKwh ||
    record.tariffBasis.tariffDecimals !== context.tariff.tariffDecimals ||
    record.tariffBasis.assetDecimals !== context.tariff.assetDecimals
  )
    throw new RangeError("CDR_TARIFF_UNSUPPORTED");
  const start = Date.parse(record.startedAt),
    end = Date.parse(record.endedAt);
  if (
    start > end ||
    end > Date.parse(now) ||
    start !== Date.parse(context.startedAt) ||
    end !== Date.parse(context.endedAt)
  )
    throw new RangeError("CDR_SESSION_TIME_INVALID");
  return {
    record,
    raw,
    contentHash: createHash("sha256").update(raw).digest("hex"),
    totalEnergyWh: exactUnits(record.totalEnergyKwh, 3),
    normalizedTotal: exactUnits(record.totalCost, context.tariff.assetDecimals),
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    settlementAssetId: context.settlementAssetId,
  };
}

export function compareSessionTotals(input: {
  trustedEnergyWh: string;
  cdrEnergyWh: string;
  trustedValue: string;
  cdrTotal: string;
  authorizedValue: string;
  settledValue: string;
}) {
  const difference = (a: string, b: string) =>
    (nonnegativeInteger(a) - nonnegativeInteger(b)).toString();
  const deltas = {
    energyWh: difference(input.cdrEnergyWh, input.trustedEnergyWh),
    accounting: difference(input.cdrTotal, input.trustedValue),
    authorization: difference(input.authorizedValue, input.trustedValue),
    settlement: difference(input.settledValue, input.trustedValue),
  };
  const reasonCodes = Object.entries(deltas)
    .filter(([, value]) => value !== "0")
    .map(([key]) => `CDR_${key.toUpperCase()}_MISMATCH`);
  return {
    status: reasonCodes.length ? ("MISMATCH" as const) : ("MATCH" as const),
    deltas,
    reasonCodes,
  };
}
