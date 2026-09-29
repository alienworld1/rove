import type { LaneOperatingView } from "./corridor.ts";

export type LaneGeometryInput = Pick<LaneOperatingView, "scale"> & {
  protectedValue: string;
  worstCaseDeliveredValue: string;
  maxUnprotectedExposure: string;
  unprotectedExposureBound: string;
  pauseRequired: boolean;
};

export type LaneGeometry = {
  frontier: number;
  physical: number;
  riskStart: number;
  riskEnd: number;
  riskWidth: number;
  protectionLimit: number;
};

function normalized(value: bigint, domainMax: bigint) {
  const zero = BigInt(0);
  if (domainMax <= zero) return 0;
  const clamped = value < zero ? zero : value > domainMax ? domainMax : value;
  return Number((clamped * BigInt(1_000_000)) / domainMax) / 1_000_000;
}

function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeLaneGeometry(input: LaneGeometryInput): LaneGeometry {
  const domainMax = BigInt(input.scale.valueDomainMax);
  const frontier = normalized(BigInt(input.protectedValue), domainMax);
  const protectionLimit = normalized(
    BigInt(input.protectedValue) + BigInt(input.maxUnprotectedExposure),
    domainMax,
  );
  const rawPhysical = normalized(
    BigInt(input.worstCaseDeliveredValue),
    domainMax,
  );
  const physical = input.pauseRequired
    ? Math.min(rawPhysical, protectionLimit)
    : rawPhysical;
  const riskStart = frontier;
  const riskEnd = Math.max(
    frontier,
    Math.min(
      physical,
      normalized(
        BigInt(input.protectedValue) + BigInt(input.unprotectedExposureBound),
        domainMax,
      ),
    ),
  );
  return {
    frontier,
    physical,
    riskStart,
    riskEnd,
    riskWidth: rounded(Math.max(0, riskEnd - riskStart)),
    protectionLimit,
  };
}

export function normalizeTracePosition(
  traceOffsetMs: number | null,
  traceStartMs: number,
  traceEndMs: number,
) {
  if (traceOffsetMs === null || traceEndMs <= traceStartMs) return 0;
  return Math.min(
    1,
    Math.max(0, (traceOffsetMs - traceStartMs) / (traceEndMs - traceStartMs)),
  );
}
