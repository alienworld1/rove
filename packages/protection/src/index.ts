export type ExposureState = "within_limit" | "at_limit" | "over_limit";

export function nonnegativeInteger(value: number | bigint | string): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
    throw new RangeError("VALUE_INVALID");
  if (typeof value === "string" && !/^(0|[1-9][0-9]*)$/.test(value))
    throw new RangeError("VALUE_INVALID");
  const result = BigInt(value);
  if (result < 0n) throw new RangeError("VALUE_INVALID");
  return result;
}

function divisor(decimals: number): bigint {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36)
    throw new RangeError("VALUE_INVALID");
  return 10n ** BigInt(decimals);
}

function ceilDivide(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

export function formatKwh(whInput: number | bigint | string): string {
  const wh = nonnegativeInteger(whInput);
  return `${wh / 1000n}.${(wh % 1000n).toString().padStart(3, "0")}`;
}

export function tariffValue(
  whInput: number | bigint | string,
  tariffPerKwhInput: number | bigint | string,
  tariffDecimals: number,
  assetDecimals: number,
): bigint {
  const wh = nonnegativeInteger(whInput);
  const tariff = nonnegativeInteger(tariffPerKwhInput);
  const numerator = wh * tariff * divisor(assetDecimals);
  const denominator = 1000n * divisor(tariffDecimals);
  return numerator / denominator;
}

export function maxEnergyWh(
  powerWattsInput: number | bigint | string,
  elapsedMsInput: number | bigint | string,
): bigint {
  return ceilDivide(
    nonnegativeInteger(powerWattsInput) * nonnegativeInteger(elapsedMsInput),
    3_600_000n,
  );
}

export function conservativeTariffBound(
  powerWattsInput: number | bigint | string,
  elapsedMsInput: number | bigint | string,
  tariffPerKwhInput: number | bigint | string,
  tariffDecimals: number,
  assetDecimals: number,
): bigint {
  const numerator =
    nonnegativeInteger(powerWattsInput) *
    nonnegativeInteger(elapsedMsInput) *
    nonnegativeInteger(tariffPerKwhInput) *
    divisor(assetDecimals);
  const denominator = 3_600_000_000n * divisor(tariffDecimals);
  return ceilDivide(numerator, denominator);
}

export function exposureState(
  exposureInput: number | bigint | string,
  limitInput: number | bigint | string,
): ExposureState {
  const exposure = nonnegativeInteger(exposureInput);
  const limit = nonnegativeInteger(limitInput);
  return exposure < limit
    ? "within_limit"
    : exposure === limit
      ? "at_limit"
      : "over_limit";
}
