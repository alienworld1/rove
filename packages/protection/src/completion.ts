import type { Lane, TransitionResult, VerifiedObservation } from "@rove/domain";

export function finishCompletionTransition(
  lane: Lane,
  previous: Lane,
  observation: VerifiedObservation,
  events: TransitionResult["events"],
  now: string,
): TransitionResult {
  const completion = lane.completion!;
  const effects: TransitionResult["effects"] = [];
  if (completion.finalEvidenceHash) {
    completion.finalAuthorizedValue = lane.authorizedValue;
    completion.finalSettledValue = lane.lastChainObservedAt
      ? lane.settledValue
      : null;
  }
  lane.version = previous.version + 1;
  if (completion.status === "closed")
    return {
      lane,
      events: events.length
        ? events
        : [{ type: "lane.completion_checked", payload: {} }],
      effects,
    };
  const reasons: string[] = [];
  if (!completion.finalEvidenceHash) {
    completion.status = "awaiting_end_evidence";
    reasons.push("FINAL_EVIDENCE_MISSING");
  } else if (!completion.cdr) {
    completion.status = "awaiting_cdr";
    reasons.push("CDR_MISSING");
  } else if (
    completion.cdr.totalEnergyWh !== completion.finalTrustedEnergyWh ||
    completion.cdr.normalizedTotal !== completion.finalTrustedValue
  ) {
    completion.status = "mismatch";
    reasons.push("CDR_SERVICE_MISMATCH");
  } else if (
    lane.chainHealth !== "fresh" ||
    !lane.lastChainObservedAt ||
    Date.parse(now) - Date.parse(lane.lastChainObservedAt) >
      lane.policy.chainMaxAgeMs
  ) {
    reasons.push("PAYMENT_CHAIN_STATE_UNAVAILABLE");
  } else {
    const target = BigInt(completion.finalTrustedValue!);
    const deposit =
      lane.confirmedDeposit === null ? null : BigInt(lane.confirmedDeposit);
    completion.finalAuthorizedValue = lane.authorizedValue;
    completion.finalSettledValue = lane.settledValue;
    if (
      BigInt(lane.authorizedValue) !== target ||
      (target === 0n && !completion.finalVoucherDigest)
    ) {
      completion.status = "awaiting_authorization";
      reasons.push("FINAL_AUTHORIZATION_PENDING");
      if (deposit !== null && deposit < target)
        effects.push({
          type: "payment.top_up_requested",
          idempotencyKey: `${lane.id}:top-up:${deposit}`,
          payload: {
            laneId: lane.id,
            channelId: lane.channelId!,
            amount: lane.reservePolicy.topUpIncrement,
            priorDeposit: deposit.toString(),
          },
        });
      else if (
        deposit !== null &&
        lane.channelId &&
        lane.signerHealth === "ready"
      )
        effects.push({
          type: "payment.voucher_requested",
          idempotencyKey: `${lane.id}:voucher:${target}`,
          payload: {
            laneId: lane.id,
            channelId: lane.channelId,
            amount: target.toString(),
          },
        });
    } else if (BigInt(lane.settledValue) !== target) {
      completion.status = "awaiting_settlement";
      reasons.push("FINAL_SETTLEMENT_PENDING");
      if (BigInt(lane.settledValue) < target && lane.channelId)
        effects.push({
          type: "payment.settlement_requested",
          idempotencyKey: `${lane.id}:settle:${target}`,
          payload: {
            laneId: lane.id,
            channelId: lane.channelId,
            amount: target.toString(),
          },
        });
      else {
        completion.status = "mismatch";
        reasons.push("CDR_SETTLEMENT_MISMATCH");
      }
    } else if (completion.status !== "closing") {
      completion.status = "reconciled";
      reasons.push("SESSION_TOTALS_MATCH");
    }
  }
  completion.reasonCodes = reasons;
  lane.reasonCodes = [
    ...new Set([
      ...reasons,
      ...events
        .map((event) => event.reasonCode)
        .filter((code): code is string => Boolean(code)),
    ]),
  ];
  lane.state =
    completion.status === "closing" || completion.status === "reconciled"
      ? "RECONCILED"
      : "COMPLETING";
  if (lane.state !== previous.state)
    events.push({ type: `lane.${lane.state.toLowerCase()}`, payload: {} });
  if (!events.length)
    events.push({ type: "lane.completion_checked", payload: {} });
  return { lane, events, effects };
}
