import { ChargingStore } from "@rove/persistence";

export type EffectStatus = "submitted" | "pending" | "completed";
export type EffectReceipt = {
  status: EffectStatus;
  externalReference?: string;
};
export type EffectLookup =
  EffectReceipt | { status: "not_found" } | { status: "unknown" };
export type EffectAdapter = {
  reconcile: (
    effectType: string,
    idempotencyKey: string,
    externalReference?: string,
  ) => Promise<EffectLookup>;
  submit: (
    effectType: string,
    idempotencyKey: string,
    payload: unknown,
  ) => Promise<EffectReceipt>;
};

export async function processNextEffect(
  store: ChargingStore,
  adapter: EffectAdapter,
  now = new Date().toISOString(),
) {
  const job = await store.claimOutbox(now, 30_000);
  if (!job) return false;
  const backoff = Math.min(300_000, 1_000 * 2 ** Math.min(job.attemptCount, 8));
  const nextAttemptAt = new Date(Date.parse(now) + backoff).toISOString();
  try {
    const reconciled = await adapter.reconcile(
      job.effectType,
      job.idempotencyKey,
      job.externalReference ?? undefined,
    );
    const receipt =
      reconciled.status === "not_found"
        ? await adapter.submit(job.effectType, job.idempotencyKey, job.payload)
        : reconciled.status === "unknown"
          ? {
              status:
                job.previousStatus === "submitted"
                  ? ("submitted" as const)
                  : ("pending" as const),
              externalReference: job.externalReference ?? undefined,
            }
          : reconciled;
    await store.finishOutbox(
      job.id,
      job.leaseToken!,
      receipt.status,
      nextAttemptAt,
      receipt.externalReference,
      reconciled.status === "unknown" ? "EFFECT_STATUS_UNAVAILABLE" : undefined,
    );
  } catch {
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
