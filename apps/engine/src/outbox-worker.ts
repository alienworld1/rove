import { ChargingStore } from "@rove/persistence";

export type EffectStatus = "submitted" | "pending" | "completed" | "failed";
export type EffectReceipt = {
  status: EffectStatus;
  externalReference?: string;
  observation?: unknown;
  reasonCode?: string;
};
export type EffectLookup =
  | EffectReceipt
  | { status: "not_found" }
  | { status: "unknown"; externalReference?: string };
export type EffectAdapter = {
  reconcile: (
    effectType: string,
    idempotencyKey: string,
    externalReference?: string,
    payload?: unknown,
    attemptCount?: number,
    effectCreatedAt?: string,
  ) => Promise<EffectLookup>;
  submit: (
    effectType: string,
    idempotencyKey: string,
    payload: unknown,
  ) => Promise<EffectReceipt>;
  confirm?: (
    laneId: string,
    effectType: string,
    observation: unknown,
    idempotencyKey: string,
  ) => Promise<void>;
  fail?: (
    laneId: string,
    effectType: string,
    idempotencyKey: string,
  ) => Promise<void>;
};

export async function processNextEffect(
  store: ChargingStore,
  adapter: EffectAdapter,
  now = new Date().toISOString(),
  laneId?: string,
  excludeLab = false,
) {
  const job = await store.claimOutbox(now, 30_000, laneId, excludeLab);
  if (!job) return false;
  const backoff = Math.min(300_000, 1_000 * 2 ** Math.min(job.attemptCount, 8));
  const nextAttemptAt = new Date(Date.parse(now) + backoff).toISOString();
  try {
    const reconciled = await adapter.reconcile(
      job.effectType,
      job.idempotencyKey,
      job.externalReference ?? undefined,
      job.payload,
      job.attemptCount,
      job.effectCreatedAt,
    );
    const receipt =
      reconciled.status === "not_found" &&
      (job.attemptCount === 1 ||
        job.effectType === "payment.voucher_requested" ||
        job.effectType === "payment.open_requested")
        ? await adapter.submit(job.effectType, job.idempotencyKey, job.payload)
        : reconciled.status === "unknown" || reconciled.status === "not_found"
          ? {
              status:
                job.previousStatus === "submitted"
                  ? ("submitted" as const)
                  : ("pending" as const),
              externalReference: job.externalReference ?? undefined,
            }
          : reconciled;
    if (receipt.status === "completed" && adapter.confirm)
      await adapter.confirm(
        job.laneId,
        job.effectType,
        receipt.observation,
        job.idempotencyKey,
      );
    if (receipt.status === "failed" && adapter.fail)
      await adapter.fail(job.laneId, job.effectType, job.idempotencyKey);
    await store.finishOutbox(
      job.id,
      job.leaseToken!,
      receipt.status,
      nextAttemptAt,
      receipt.externalReference,
      receipt.status === "failed"
        ? (receipt.reasonCode ?? "EFFECT_FAILED")
        : reconciled.status === "unknown"
          ? "EFFECT_STATUS_UNAVAILABLE"
          : undefined,
    );
  } catch {
    if (adapter.fail)
      await adapter
        .fail(job.laneId, job.effectType, job.idempotencyKey)
        .catch(() => undefined);
    await store.finishOutbox(
      job.id,
      job.leaseToken!,
      "failed",
      nextAttemptAt,
      job.externalReference ?? undefined,
      "EFFECT_STATUS_UNAVAILABLE",
    );
  }
  return true;
}
