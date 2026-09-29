const reasons: Record<string, string> = {
  PROTECTION_READY: "Protection is ready.",
  PROTECTION_AWAITING_TRUST_AND_FUNDING:
    "Waiting for trusted readings and confirmed funding.",
  EVIDENCE_SIGNATURE_INVALID: "The meter signature could not be verified.",
  EVIDENCE_SOURCE_MISMATCH: "The reading came from a different meter.",
  EVIDENCE_REPLAY: "This reading was already received.",
  EVIDENCE_SEQUENCE_INVALID: "The meter reading order is incomplete.",
  EVIDENCE_STALE: "The meter reading is too old.",
  EVIDENCE_UNTRUSTED_OR_STALE: "Meter evidence needs checking.",
  PAYMENT_CHAIN_STATE_UNAVAILABLE: "Payment status needs checking.",
  PAYMENT_SIGNER_UNAVAILABLE: "Payment signing is unavailable.",
  PAYMENT_TOPUP_FAILED: "The top-up could not be confirmed.",
  LOW_FUNDED_HEADROOM: "Funded headroom is running low.",
  RISK_WINDOW_EXHAUSTED: "The exposure bound has reached its limit.",
  CONTROL_PAUSE_REQUIRED: "Charging should pause until protection is restored.",
  RECOVERY_CHECKS_PENDING: "Protection is still being restored.",
};

export function labReasonText(reason: string | null | undefined) {
  return reason
    ? (reasons[reason] ?? "The latest protection check is recorded.")
    : "—";
}
