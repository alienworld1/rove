const reasonText = {
  EVIDENCE_SIGNATURE_INVALID: "Meter signature could not be verified.",
  EVIDENCE_SOURCE_MISMATCH: "The reading came from a different meter.",
  EVIDENCE_SESSION_MISMATCH: "The reading belongs to a different session.",
  EVIDENCE_REPLAY: "This meter reading was already processed.",
  EVIDENCE_SEQUENCE_INVALID: "The meter reading sequence is not continuous.",
  EVIDENCE_STALE: "The latest trusted meter reading is stale.",
  EVIDENCE_PARSE_ERROR: "The meter reading could not be decoded safely.",
  PAYMENT_INSUFFICIENT_HEADROOM: "Funded protection needs to be extended.",
  PAYMENT_TOPUP_PENDING: "Top-up awaiting confirmation.",
  PAYMENT_TOPUP_FAILED: "The protection top-up did not confirm.",
  PAYMENT_SIGNER_UNAVAILABLE:
    "Payment authorization is temporarily unavailable.",
  PAYMENT_CHAIN_STATE_UNAVAILABLE: "Current payment state is unavailable.",
  PAYMENT_CHAIN_STATE_STALE: "Payment state needs to be checked again.",
  PAYMENT_VOUCHER_INVALID: "The payment authorization could not be verified.",
  PAYMENT_SETTLEMENT_PENDING: "Settlement awaiting confirmation.",
  RISK_WINDOW_WARNING: "Remaining protection capacity is narrowing.",
  RISK_WINDOW_EXHAUSTED: "The protection limit has been reached.",
  CONTROL_PAUSE_REQUIRED: "Charging should pause until protection is restored.",
  PROTECTION_AWAITING_TRUST_AND_FUNDING:
    "Waiting for trusted readings and confirmed funding.",
} as const;

export function reasonTextFor(code: string | null | undefined) {
  if (!code) return null;
  return (
    reasonText[code as keyof typeof reasonText] ?? "Protection needs attention."
  );
}

export function eventLabelFor(type: string) {
  if (type.includes("evidence_accepted")) return "Meter reading accepted";
  if (type.includes("evidence_rejected")) return "Meter reading rejected";
  if (type.includes("voucher")) return "Protection advanced";
  if (type.includes("top_up_submitted")) return "Top-up submitted";
  if (type.includes("top_up_completed") || type.includes("top_up_confirmed"))
    return "Top-up confirmed";
  if (type.includes("settlement_submitted")) return "Settlement submitted";
  if (
    type.includes("settlement_completed") ||
    type.includes("settlement_confirmed")
  )
    return "Settlement confirmed";
  if (type.includes("pause")) return "Protection limit reached";
  if (type.includes("recover")) return "Protection restored";
  if (type.includes("initializing")) return "Preparing protection";
  return "Protection state updated";
}
