import type { Lane, TransitionResult, VerifiedObservation } from "@rove/domain";
import {
  conservativeTariffBound,
  nonnegativeInteger,
  tariffValue,
} from "./index.js";

function milliseconds(value: string): number {
  const time = Date.parse(value);
  if (!Number.isSafeInteger(time)) throw new RangeError("TIME_INVALID");
  return time;
}

function elapsedMs(now: number, earlier: number): bigint {
  const duration = BigInt(now) - BigInt(earlier);
  return duration > 0n ? duration : 0n;
}

function event(
  type: string,
  reasonCode?: string,
  payload: Record<string, unknown> = {},
) {
  return { type, reasonCode, payload };
}

export function transitionLane(
  previous: Lane,
  observation: VerifiedObservation,
  now: string,
  effectKey: string,
): TransitionResult {
  const currentTime = milliseconds(now);
  const lane: Lane = {
    ...previous,
    reasonCodes: [...previous.reasonCodes],
    updatedAt: now,
  };
  const events: TransitionResult["events"] = [];
  const effects: TransitionResult["effects"] = [];
  let evidenceRejection: string | undefined;

  if (observation.type === "EvidenceObserved") {
    if (observation.evidenceHash === previous.lastEvidenceHash) {
      events.push(event("meter.evidence_rejected", "EVIDENCE_REPLAY"));
      lane.evidenceHealth = "untrusted";
      evidenceRejection = "EVIDENCE_REPLAY";
    } else if (!observation.accepted) {
      lane.evidenceHealth = "untrusted";
      evidenceRejection = observation.reasonCode ?? "EVIDENCE_UNTRUSTED";
      events.push(
        event(
          "meter.evidence_rejected",
          observation.reasonCode ?? "EVIDENCE_UNTRUSTED",
        ),
      );
    } else {
      if (
        !observation.cumulativeWh ||
        !observation.observedAt ||
        observation.sequence === undefined
      )
        throw new RangeError("EVIDENCE_RESULT_INVALID");
      const energy = nonnegativeInteger(observation.cumulativeWh);
      if (energy < nonnegativeInteger(previous.trustedEnergyWh))
        throw new RangeError("EVIDENCE_ENERGY_REGRESSION");
      if (milliseconds(observation.observedAt) > currentTime)
        throw new RangeError("TIME_INVALID");
      lane.trustedEnergyWh = energy.toString();
      lane.trustedDeliveredValue = tariffValue(
        energy,
        lane.tariff.perKwh,
        lane.tariff.tariffDecimals,
        lane.tariff.assetDecimals,
      ).toString();
      lane.lastTrustedEvidenceAt = observation.observedAt;
      lane.lastEvidenceHash = observation.evidenceHash;
      lane.lastEvidenceSequence = observation.sequence;
      lane.evidenceHealth = "fresh";
      events.push({
        ...event("meter.evidence_accepted", undefined, {
          cumulativeWh: lane.trustedEnergyWh,
          trustedValue: lane.trustedDeliveredValue,
        }),
        evidenceHash: observation.evidenceHash,
        traceTime: observation.observedAt,
      });
    }
  } else if (observation.type === "PaymentObserved") {
    if (
      observation.assetId !== lane.settlementAssetId ||
      observation.network !== lane.tempoNetwork ||
      (lane.channelId && observation.channelId !== lane.channelId) ||
      !observation.channelId
    )
      throw new RangeError("PAYMENT_BINDING_INVALID");
    const observedAt = milliseconds(observation.observedAt);
    if (
      observedAt > currentTime ||
      elapsedMs(currentTime, observedAt) > BigInt(lane.policy.chainMaxAgeMs)
    )
      throw new RangeError("PAYMENT_CHAIN_STATE_STALE");
    const deposit = nonnegativeInteger(observation.confirmedDeposit);
    const authorization = nonnegativeInteger(observation.authorizedValue);
    const settlement = nonnegativeInteger(observation.settledValue);
    if (
      authorization > nonnegativeInteger(lane.trustedDeliveredValue) ||
      authorization > deposit ||
      settlement > authorization ||
      authorization < nonnegativeInteger(lane.authorizedValue) ||
      settlement < nonnegativeInteger(lane.settledValue)
    )
      throw new RangeError("PAYMENT_LIMIT_INVALID");
    lane.channelId = observation.channelId;
    lane.confirmedDeposit = deposit.toString();
    lane.authorizedValue = authorization.toString();
    lane.settledValue = settlement.toString();
    lane.lastChainObservedAt = observation.observedAt;
    lane.chainHealth = "fresh";
    events.push({
      ...event("payment.chain_observed", undefined, {
        source: observation.source,
        chainHeight: observation.chainHeight,
        authorizedValue: lane.authorizedValue,
        settledValue: lane.settledValue,
      }),
      channelId: observation.channelId,
    });
  } else if (observation.type === "PaymentUnavailable") {
    lane.chainHealth = "unavailable";
    events.push(event("payment.chain_unavailable", observation.reasonCode));
  } else if (observation.type === "RecoveryBegun") {
    if (previous.state !== "PAUSE_REQUIRED" && previous.state !== "AT_RISK")
      throw new RangeError("RECOVERY_NOT_REQUIRED");
    lane.state = "RECOVERING";
    events.push(event("lane.recovering", "RECOVERY_CHECKS_PENDING"));
  } else if (observation.type === "PauseRequired") {
    if (!previous.serviceStarted) throw new RangeError("SERVICE_NOT_STARTED");
    lane.state = "PAUSE_REQUIRED";
    events.push(event("lane.pause_required", "CONTROL_PAUSE_REQUIRED"));
  }

  if (
    lane.lastTrustedEvidenceAt &&
    elapsedMs(currentTime, milliseconds(lane.lastTrustedEvidenceAt)) >
      BigInt(lane.policy.evidenceMaxAgeMs) &&
    lane.evidenceHealth === "fresh"
  )
    lane.evidenceHealth = "stale";
  if (
    lane.lastChainObservedAt &&
    elapsedMs(currentTime, milliseconds(lane.lastChainObservedAt)) >
      BigInt(lane.policy.chainMaxAgeMs) &&
    lane.chainHealth === "fresh"
  )
    lane.chainHealth = "stale";
  if (
    !lane.serviceStarted &&
    lane.evidenceHealth === "fresh" &&
    lane.chainHealth === "fresh" &&
    lane.confirmedDeposit !== null &&
    nonnegativeInteger(lane.confirmedDeposit) > 0n
  )
    lane.serviceStarted = true;

  const trusted = nonnegativeInteger(lane.trustedDeliveredValue);
  const authorized = nonnegativeInteger(lane.authorizedValue);
  const deposit =
    lane.confirmedDeposit === null
      ? null
      : nonnegativeInteger(lane.confirmedDeposit);
  if (
    authorized > trusted ||
    (deposit !== null && authorized > deposit) ||
    nonnegativeInteger(lane.settledValue) > authorized
  )
    throw new RangeError("PAYMENT_LIMIT_INVALID");
  const protectedValue = trusted < authorized ? trusted : authorized;
  const priorWatermark = nonnegativeInteger(previous.protectedWatermark);
  if (protectedValue < priorWatermark)
    throw new RangeError("PROTECTED_WATERMARK_REGRESSION");
  lane.protectedValue = protectedValue.toString();
  lane.protectedWatermark = protectedValue.toString();
  lane.fundedHeadroom =
    deposit === null ? null : (deposit - authorized).toString();
  const unverified =
    lane.serviceStarted &&
    lane.evidenceHealth !== "fresh" &&
    lane.lastTrustedEvidenceAt
      ? conservativeTariffBound(
          lane.maxPowerWatts,
          elapsedMs(currentTime, milliseconds(lane.lastTrustedEvidenceAt)),
          lane.tariff.perKwh,
          lane.tariff.tariffDecimals,
          lane.tariff.assetDecimals,
        )
      : 0n;
  const worstCase = trusted + unverified;
  const exposure = worstCase > protectedValue ? worstCase - protectedValue : 0n;
  lane.unverifiedServiceBound = unverified.toString();
  lane.worstCaseDeliveredValue = worstCase.toString();
  lane.unprotectedExposureBound = exposure.toString();

  const reasons: string[] = [];
  if (!lane.serviceStarted) {
    lane.state = "INITIALIZING";
    reasons.push("PROTECTION_AWAITING_TRUST_AND_FUNDING");
  } else if (
    observation.type === "PauseRequired" ||
    (lane.policy.zeroGrace && lane.evidenceHealth !== "fresh") ||
    exposure >= nonnegativeInteger(lane.policy.maxUnprotectedExposure)
  ) {
    lane.state = "PAUSE_REQUIRED";
    if (exposure >= nonnegativeInteger(lane.policy.maxUnprotectedExposure))
      reasons.push("RISK_WINDOW_EXHAUSTED");
    if (lane.policy.zeroGrace && lane.evidenceHealth !== "fresh")
      reasons.push("EVIDENCE_ZERO_GRACE_EXHAUSTED");
    reasons.push("CONTROL_PAUSE_REQUIRED");
  } else if (
    (previous.state === "RECOVERING" || observation.type === "RecoveryBegun") &&
    (lane.evidenceHealth !== "fresh" ||
      lane.chainHealth !== "fresh" ||
      protectedValue < trusted)
  ) {
    lane.state = "RECOVERING";
    reasons.push("RECOVERY_CHECKS_PENDING");
  } else if (
    lane.evidenceHealth !== "fresh" ||
    lane.chainHealth !== "fresh" ||
    lane.signerHealth !== "ready" ||
    exposure >= nonnegativeInteger(lane.policy.riskThreshold)
  ) {
    lane.state = "AT_RISK";
    if (lane.evidenceHealth !== "fresh")
      reasons.push("EVIDENCE_UNTRUSTED_OR_STALE");
    if (lane.chainHealth !== "fresh")
      reasons.push("PAYMENT_CHAIN_STATE_UNAVAILABLE");
    if (lane.signerHealth !== "ready")
      reasons.push("PAYMENT_SIGNER_UNAVAILABLE");
    if (exposure >= nonnegativeInteger(lane.policy.riskThreshold))
      reasons.push("EXPOSURE_RISK_THRESHOLD");
  } else if (
    exposure > 0n ||
    exposure >= nonnegativeInteger(lane.policy.warningThreshold) ||
    (lane.fundedHeadroom !== null &&
      nonnegativeInteger(lane.fundedHeadroom) <=
        nonnegativeInteger(lane.policy.lowHeadroomThreshold))
  ) {
    lane.state = "WATCH";
    reasons.push(
      exposure > 0n &&
        exposure < nonnegativeInteger(lane.policy.warningThreshold)
        ? "TRUSTED_VALUE_NOT_FULLY_PROTECTED"
        : exposure >= nonnegativeInteger(lane.policy.warningThreshold)
          ? "EXPOSURE_WARNING_THRESHOLD"
          : "LOW_FUNDED_HEADROOM",
    );
  } else {
    lane.state = "PROTECTED";
    reasons.push("PROTECTION_READY");
  }
  if (evidenceRejection) reasons.unshift(evidenceRejection);
  lane.reasonCodes = [...new Set(reasons)];
  if (lane.state !== previous.state)
    events.push(
      event(`lane.${lane.state.toLowerCase()}`, lane.reasonCodes[0], {
        version: previous.version + 1,
      }),
    );
  if (lane.state === "PAUSE_REQUIRED" && previous.state !== "PAUSE_REQUIRED")
    effects.push({
      type: "pause.requested",
      idempotencyKey: effectKey,
      payload: { laneId: lane.id, reasonCode: "CONTROL_PAUSE_REQUIRED" },
    });
  if (events.length === 0)
    events.push(event("lane.protection_checked", lane.reasonCodes[0]));
  lane.version = previous.version + 1;
  return { lane, events, effects };
}
