export const docsTopics = {
  introduction: "/docs",
  protection: "/docs/concepts/protection-window",
  pause: "/docs/concepts/protection-window#pause-required",
  vouchers: "/docs/integrate/tempo/channel-lifecycle#vouchers",
  topUps: "/docs/integrate/tempo/channel-lifecycle#top-ups",
  settlement: "/docs/integrate/tempo/channel-lifecycle#settlement",
  close: "/docs/integrate/tempo/channel-lifecycle#close-and-refund",
  completion: "/docs/integrate/cdr-reconciliation",
  scenario: "/docs/lab#scenario-builder",
  scenarioSchema: "/docs/lab/scenario-schema",
  reasons: "/docs/reference/reason-codes",
  events: "/docs/reference/domain-events",
} as const;
export type DocsTopic = keyof typeof docsTopics;

export const documentedReasons = [
  "CDR_ACCOUNTING_MISMATCH",
  "CDR_AUTHORIZATION_MISMATCH",
  "CDR_BINDING_INVALID",
  "CDR_CURRENCY_MAPPING_MISSING",
  "CDR_ENERGYWH_MISMATCH",
  "CDR_MISSING",
  "CDR_PRECISION_UNSUPPORTED",
  "CDR_SERVICE_MISMATCH",
  "CDR_SESSION_TIME_INVALID",
  "CDR_SETTLEMENT_MISMATCH",
  "CDR_TARIFF_UNSUPPORTED",
  "CDR_TOO_LARGE",
  "CHANNEL_CLOSED",
  "CONTROL_PAUSE_REQUIRED",
  "EFFECT_FAILED",
  "EVIDENCE_ENERGY_REGRESSION",
  "EVIDENCE_KEY_UNSUPPORTED",
  "EVIDENCE_PARSE_ERROR",
  "EVIDENCE_REPLAY",
  "EVIDENCE_RESULT_INVALID",
  "EVIDENCE_SEQUENCE_INVALID",
  "EVIDENCE_SESSION_MISMATCH",
  "EVIDENCE_SIGNATURE_INVALID",
  "EVIDENCE_SOURCE_MISMATCH",
  "EVIDENCE_STALE",
  "EVIDENCE_UNTRUSTED",
  "EVIDENCE_UNTRUSTED_OR_STALE",
  "EVIDENCE_ZERO_GRACE_EXHAUSTED",
  "EXPOSURE_RISK_THRESHOLD",
  "EXPOSURE_WARNING_THRESHOLD",
  "FINAL_AUTHORIZATION_PENDING",
  "FINAL_EVIDENCE_CONTEXT_REQUIRED",
  "FINAL_EVIDENCE_MISSING",
  "FINAL_SETTLEMENT_PENDING",
  "PAYMENT_AMOUNT_INVALID",
  "PAYMENT_AUTHORIZATION_INVALID",
  "PAYMENT_BINDING_INVALID",
  "PAYMENT_CHAIN_STATE_STALE",
  "PAYMENT_CHAIN_STATE_UNAVAILABLE",
  "PAYMENT_CLOSURE_INVALID",
  "PAYMENT_ENVIRONMENT_UNSUPPORTED",
  "PAYMENT_LIMIT_INVALID",
  "PAYMENT_OUTCOME_UNKNOWN",
  "PAYMENT_REFUND_UNVERIFIED",
  "PAYMENT_SETTLEMENT_FAILED",
  "PAYMENT_SIGNER_UNAVAILABLE",
  "PAYMENT_TOPUP_FAILED",
  "PAYMENT_TRANSACTION_FAILED",
  "PROTECTION_AWAITING_TRUST_AND_FUNDING",
  "PROTECTION_READY",
  "RECOVERY_CHECKS_PENDING",
  "RECOVERY_NOT_REQUIRED",
  "RISK_WINDOW_EXHAUSTED",
  "SESSION_TOTALS_MATCH",
] as const;

export function reasonDocsPath(reason: string | null | undefined) {
  return documentedReasons.some((known) => known === reason)
    ? `${docsTopics.reasons}#${reason!.toLowerCase().replaceAll("_", "-")}`
    : docsTopics.reasons;
}

export function publicOrigin(
  value: string | undefined,
  name: string,
  localDefault: string,
  development: boolean,
) {
  const input = value ?? (development ? localDefault : undefined);
  try {
    if (!input) throw new Error();
    const url = new URL(input);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(
      `${name} must be an explicit HTTP(S) origin without credentials, path, query, or fragment.`,
    );
  }
}

export function eventDocsPath(event: string) {
  const events: Record<string, string> = {
    "payment.voucher_verified": docsTopics.vouchers,
    "payment.voucher_requested": docsTopics.vouchers,
    "payment.top_up_requested": docsTopics.topUps,
    "payment.top_up_submitted": docsTopics.topUps,
    "payment.top_up_completed": docsTopics.topUps,
    "payment.settlement_requested": docsTopics.settlement,
    "payment.settlement_submitted": docsTopics.settlement,
    "payment.settlement_completed": docsTopics.settlement,
    "payment.close_requested": docsTopics.close,
    "payment.close_submitted": docsTopics.close,
    "payment.close_completed": docsTopics.close,
    "payment.channel_closed": docsTopics.close,
  };
  return Object.hasOwn(events, event) ? events[event] : docsTopics.events;
}
