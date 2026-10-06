import { finishCompletionTransition } from "./completion.js";
import type { Lane, TransitionResult, VerifiedObservation } from "@rove/domain";
import {
  conservativeTariffBound,
  maxEnergyWh,
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
  physicalNow: string = now,
  chainNow: string = now,
): TransitionResult {
  const currentTime = milliseconds(now);
  const physicalTime = milliseconds(physicalNow);
  const chainTime = milliseconds(chainNow);
  const lane: Lane = {
    ...previous,
    reasonCodes: [...previous.reasonCodes],
    completion: previous.completion
      ? structuredClone(previous.completion)
      : null,
    updatedAt: now,
  };
  const events: TransitionResult["events"] = [];
  const effects: TransitionResult["effects"] = [];
  let evidenceRejection: string | undefined;
  let paymentFailure: string | undefined;

  if (observation.type === "ServiceEnded") {
    if (
      lane.completion?.status === "closed" ||
      milliseconds(observation.endedAt) > currentTime ||
      milliseconds(observation.endedAt) <
        milliseconds(observation.startedAt ?? lane.createdAt)
    )
      throw new RangeError("SERVICE_END_INVALID");
    if (lane.completion) {
      if (
        lane.completion.serviceEndedAt !== observation.endedAt ||
        lane.completion.serviceStartedAt !==
          (observation.startedAt ?? lane.createdAt) ||
        lane.completion.endSource !== observation.source
      )
        throw new RangeError("SERVICE_END_INVALID");
      events.push(event("lane.completion_checked"));
    } else {
      lane.completion = {
        status: "awaiting_end_evidence",
        serviceStartedAt: observation.startedAt ?? lane.createdAt,
        serviceEndedAt: observation.endedAt,
        endSource: observation.source,
        finalVoucherDigest: null,
        finalEvidenceHash: null,
        finalEvidenceSequence: null,
        finalTrustedEnergyWh: null,
        finalTrustedValue: null,
        finalAuthorizedValue: null,
        finalSettledValue: null,
        cdr: null,
        comparison: null,
        closure: null,
        reasonCodes: ["FINAL_EVIDENCE_MISSING"],
      };
      events.push(event("lane.service_ended"));
    }
  } else if (observation.type === "ChannelClosed") {
    const completion = lane.completion;
    const closure = completion?.closure;
    if (
      !completion ||
      !closure ||
      completion.status !== "closing" ||
      completion.comparison?.status !== "MATCH" ||
      observation.channelId !== lane.channelId ||
      observation.network !== lane.tempoNetwork ||
      observation.assetId !== lane.settlementAssetId ||
      observation.finalSettledValue !== completion.finalTrustedValue ||
      observation.depositBeforeClose !== closure.depositBeforeClose ||
      observation.confirmedRefund !== closure.expectedRefund ||
      !observation.transactionHash ||
      !observation.closeEventReference ||
      milliseconds(observation.observedAt) > chainTime
    )
      throw new RangeError("PAYMENT_CLOSURE_INVALID");
    completion.status = "closed";
    completion.finalSettledValue = observation.finalSettledValue;
    completion.closure = {
      ...closure,
      confirmedRefund: observation.confirmedRefund,
      transactionHash: observation.transactionHash,
      receiptBlock: observation.receiptBlock,
      closeEventReference: observation.closeEventReference,
      refundEvidenceReference: observation.closeEventReference,
      observedAt: observation.observedAt,
    };
    completion.reasonCodes = ["CHANNEL_CLOSED"];
    lane.state = "CLOSED";
    lane.reasonCodes = ["CHANNEL_CLOSED"];
    lane.version = previous.version + 1;
    lane.lastChainObservedAt = observation.observedAt;
    events.push({
      ...event("payment.channel_closed", undefined, {
        confirmedRefund: observation.confirmedRefund,
        finalSettledValue: observation.finalSettledValue,
      }),
      txHash: observation.transactionHash,
      channelId: observation.channelId,
    });
    return { lane, events, effects };
  } else if (previous.state === "CLOSED") {
    if (observation.type !== "ClockTick")
      throw new RangeError("SESSION_ALREADY_CLOSED");
    lane.version = previous.version + 1;
    return { lane, events: [event("lane.completion_checked")], effects };
  } else if (observation.type === "EvidenceObserved") {
    if (
      lane.completion &&
      (!observation.final || lane.completion.finalEvidenceHash)
    )
      throw new RangeError("FINAL_EVIDENCE_CONTEXT_REQUIRED");
    if (observation.evidenceHash === previous.lastEvidenceHash) {
      events.push(event("meter.evidence_rejected", "EVIDENCE_REPLAY"));
      lane.evidenceHealth = "untrusted";
      evidenceRejection = "EVIDENCE_REPLAY";
    } else if (!observation.accepted) {
      lane.evidenceHealth = "untrusted";
      evidenceRejection = observation.reasonCode ?? "EVIDENCE_UNTRUSTED";
      events.push({
        ...event(
          "meter.evidence_rejected",
          observation.reasonCode ?? "EVIDENCE_UNTRUSTED",
        ),
        evidenceHash: observation.evidenceHash,
      });
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
      if (lane.completion && observation.final) {
        lane.completion.finalEvidenceHash = observation.evidenceHash;
        lane.completion.finalEvidenceSequence = observation.sequence;
        lane.completion.finalTrustedEnergyWh = lane.trustedEnergyWh;
        lane.completion.finalTrustedValue = lane.trustedDeliveredValue;
      }
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
      observedAt > chainTime ||
      elapsedMs(chainTime, observedAt) > BigInt(lane.policy.chainMaxAgeMs)
    )
      throw new RangeError("PAYMENT_CHAIN_STATE_STALE");
    const deposit = nonnegativeInteger(observation.confirmedDeposit);
    const settlement = nonnegativeInteger(observation.settledValue);
    if (
      nonnegativeInteger(lane.authorizedValue) > deposit ||
      settlement > nonnegativeInteger(lane.authorizedValue) ||
      settlement < nonnegativeInteger(lane.settledValue)
    )
      throw new RangeError("PAYMENT_LIMIT_INVALID");
    lane.channelId = observation.channelId;
    lane.confirmedDeposit = deposit.toString();
    lane.settledValue = settlement.toString();
    lane.lastChainObservedAt = observation.observedAt;
    lane.chainHealth = "fresh";
    events.push({
      ...event("payment.chain_observed", undefined, {
        source: observation.source,
        chainHeight: observation.chainHeight,
        settledValue: lane.settledValue,
      }),
      channelId: observation.channelId,
      txHash: observation.transactionHash,
    });
  } else if (observation.type === "VoucherVerified") {
    const amount = nonnegativeInteger(observation.cumulativeAmount);
    if (
      !lane.channelId ||
      lane.confirmedDeposit === null ||
      (amount <= nonnegativeInteger(lane.authorizedValue) &&
        !(
          amount === 0n &&
          lane.completion?.finalTrustedValue === "0" &&
          !lane.completion.finalVoucherDigest
        )) ||
      amount > nonnegativeInteger(lane.trustedDeliveredValue) ||
      amount > nonnegativeInteger(lane.confirmedDeposit)
    )
      throw new RangeError("PAYMENT_AUTHORIZATION_INVALID");
    lane.authorizedValue = amount.toString();
    if (lane.completion)
      lane.completion.finalVoucherDigest = observation.digest;
    lane.signerHealth = "ready";
    events.push({
      ...event("payment.voucher_verified", undefined, {
        cumulativeAmount: lane.authorizedValue,
        digest: observation.digest,
      }),
      channelId: lane.channelId,
    });
  } else if (observation.type === "PaymentUnavailable") {
    lane.chainHealth = "unavailable";
    events.push(event("payment.chain_unavailable", observation.reasonCode));
  } else if (observation.type === "SignerUnavailable") {
    lane.signerHealth = "unavailable";
    events.push(
      event("payment.signer_unavailable", "PAYMENT_SIGNER_UNAVAILABLE"),
    );
  } else if (observation.type === "SignerRestored") {
    lane.signerHealth = "ready";
    events.push(event("payment.signer_restored"));
  } else if (observation.type === "PaymentEffectFailed") {
    paymentFailure = observation.reasonCode;
    events.push(event("payment.operation_failed", observation.reasonCode));
  } else if (observation.type === "RecoveryBegun") {
    if (lane.completion) throw new RangeError("SERVICE_ALREADY_ENDED");
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
    elapsedMs(physicalTime, milliseconds(lane.lastTrustedEvidenceAt)) >
      BigInt(lane.policy.evidenceMaxAgeMs) &&
    lane.evidenceHealth === "fresh"
  )
    lane.evidenceHealth = "stale";
  if (
    lane.lastChainObservedAt &&
    elapsedMs(chainTime, milliseconds(lane.lastChainObservedAt)) >
      BigInt(lane.policy.chainMaxAgeMs) &&
    lane.chainHealth === "fresh"
  )
    lane.chainHealth = "stale";
  if (
    !lane.completion &&
    !lane.serviceStarted &&
    lane.evidenceHealth === "fresh" &&
    lane.chainHealth === "fresh" &&
    lane.confirmedDeposit !== null &&
    nonnegativeInteger(lane.confirmedDeposit) > 0n &&
    nonnegativeInteger(lane.authorizedValue) >=
      nonnegativeInteger(lane.trustedDeliveredValue) &&
    nonnegativeInteger(lane.trustedDeliveredValue) > 0n
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
          elapsedMs(
            lane.completion
              ? Math.min(
                  physicalTime,
                  milliseconds(lane.completion.serviceEndedAt),
                )
              : physicalTime,
            milliseconds(lane.lastTrustedEvidenceAt),
          ),
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

  const boundApplied =
    lane.serviceStarted &&
    lane.evidenceHealth !== "fresh" &&
    lane.lastTrustedEvidenceAt !== null;
  const evaluatedAt =
    lane.completion &&
    physicalTime > milliseconds(lane.completion.serviceEndedAt)
      ? lane.completion.serviceEndedAt
      : physicalNow;
  const elapsed = lane.lastTrustedEvidenceAt
    ? elapsedMs(
        milliseconds(evaluatedAt),
        milliseconds(lane.lastTrustedEvidenceAt),
      )
    : 0n;
  const limit = nonnegativeInteger(lane.policy.maxUnprotectedExposure);
  const calculation = {
    evaluatedAt,
    lastTrustedEvidenceAt: lane.lastTrustedEvidenceAt,
    lastTrustedValue: lane.trustedDeliveredValue,
    elapsedUnverifiedMs: elapsed.toString(),
    maxPowerWatts: lane.maxPowerWatts,
    upperBoundEnergyWh: (boundApplied
      ? maxEnergyWh(lane.maxPowerWatts, elapsed)
      : 0n
    ).toString(),
    unverifiedServiceBound: lane.unverifiedServiceBound,
    worstCaseDeliveredValue: lane.worstCaseDeliveredValue,
    protectedValue: lane.protectedValue,
    exposureBound: lane.unprotectedExposureBound,
    exposureLimit: limit.toString(),
    remainingMargin: (exposure < limit ? limit - exposure : 0n).toString(),
    boundApplied,
  };

  if (lane.completion)
    return {
      ...finishCompletionTransition(lane, previous, observation, events, now),
      calculation,
    };

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
    (previous.state === "PAUSE_REQUIRED" &&
      observation.type === "EvidenceObserved" &&
      observation.accepted) ||
    ((previous.state === "RECOVERING" ||
      observation.type === "RecoveryBegun") &&
      (lane.evidenceHealth !== "fresh" ||
        lane.chainHealth !== "fresh" ||
        protectedValue < trusted))
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
  if (paymentFailure) reasons.unshift(paymentFailure);
  lane.reasonCodes = [...new Set(reasons)];
  if (lane.state !== previous.state)
    events.push(
      event(`lane.${lane.state.toLowerCase()}`, lane.reasonCodes[0], {
        version: previous.version + 1,
      }),
    );
  if (previous.state === "RECOVERING" && lane.state === "PROTECTED")
    events.push(event("lane.protection_restored", "PROTECTION_READY"));
  if (lane.state === "PAUSE_REQUIRED" && previous.state !== "PAUSE_REQUIRED") {
    effects.push({
      type: "pause.requested",
      idempotencyKey: effectKey,
      payload: { laneId: lane.id, reasonCode: "CONTROL_PAUSE_REQUIRED" },
    });
    events.push(event("pause.requested", "CONTROL_PAUSE_REQUIRED"));
  }
  if (
    lane.channelId &&
    lane.confirmedDeposit !== null &&
    lane.chainHealth === "fresh"
  ) {
    const target = trusted < deposit! ? trusted : deposit!;
    if (target > authorized)
      effects.push({
        type: "payment.voucher_requested",
        idempotencyKey: `${lane.id}:voucher:${target}`,
        payload: {
          laneId: lane.id,
          channelId: lane.channelId,
          amount: target.toString(),
        },
      });
    if (
      lane.fundedHeadroom !== null &&
      nonnegativeInteger(lane.fundedHeadroom) <=
        nonnegativeInteger(lane.policy.lowHeadroomThreshold)
    )
      effects.push({
        type: "payment.top_up_requested",
        idempotencyKey: `${lane.id}:top-up:${deposit}`,
        payload: {
          laneId: lane.id,
          channelId: lane.channelId,
          amount: lane.reservePolicy.topUpIncrement,
          priorDeposit: deposit!.toString(),
        },
      });
    if (
      protectedValue - nonnegativeInteger(lane.settledValue) >=
      nonnegativeInteger(lane.settlementPolicy.minimumUnsettledProtectedValue)
    )
      effects.push({
        type: "payment.settlement_requested",
        idempotencyKey: `${lane.id}:settle:${authorized}`,
        payload: {
          laneId: lane.id,
          channelId: lane.channelId,
          amount: authorized.toString(),
        },
      });
  }
  if (events.length === 0)
    events.push(event("lane.protection_checked", lane.reasonCodes[0]));
  lane.version = previous.version + 1;
  return { lane, events, effects, calculation };
}
