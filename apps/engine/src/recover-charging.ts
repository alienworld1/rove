import { randomUUID } from "node:crypto";
import type { ChargingStore } from "@rove/persistence";
import type { Lane } from "@rove/domain";
import type { EffectAdapter } from "./outbox-worker.js";
import { processNextEffect } from "./outbox-worker.js";

export async function recoverChargingLane(
  store: ChargingStore,
  lane: Lane,
  adapter:
    (EffectAdapter & { refresh: (laneId: string) => Promise<void> }) | null,
) {
  store.recovery.set(lane.id, {
    status: "pending",
    checkedAt: null,
    reasonCodes: ["RECOVERY_CHECKS_PENDING"],
  });
  try {
    if (lane.tempoNetwork === "local-simulation") {
      store.recovery.set(lane.id, {
        status: "ready",
        checkedAt: new Date().toISOString(),
        reasonCodes: [],
      });
      return;
    }
    if (!adapter) throw new Error("PAYMENT_ENVIRONMENT_UNSUPPORTED");
    await store.requestEffectCheck(lane.id);
    for (let index = 0; index < 12; index++) {
      if (
        !(await processNextEffect(
          store,
          adapter,
          new Date().toISOString(),
          lane.id,
          false,
          true,
        ))
      )
        break;
    }
    if (await store.hasUnresolvedSubmission(lane.id))
      throw new Error("PAYMENT_OUTCOME_UNKNOWN");
    if (lane.channelId) await adapter.refresh(lane.id);
    else if (lane.confirmedDeposit !== null)
      throw new Error("PAYMENT_BINDING_INVALID");
    const projection = await store.getLane(lane.id);
    if (projection.state !== "CLOSED")
      await store.advanceLane(
        {
          commandId: randomUUID(),
          correlationId: randomUUID(),
          laneId: lane.id,
          expectedVersion: projection.version,
          now: new Date().toISOString(),
          payload: { type: "TickProtectionClock" },
        },
        "engine-recovery",
      );
    store.recovery.set(lane.id, {
      status: "ready",
      checkedAt: new Date().toISOString(),
      reasonCodes: [],
    });
  } catch (error) {
    store.recovery.set(lane.id, {
      status: "blocked",
      checkedAt: new Date().toISOString(),
      reasonCodes: [
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : "PAYMENT_CHAIN_STATE_UNAVAILABLE",
      ],
    });
  }
}

export async function recoverCharging(
  store: ChargingStore,
  adapter:
    (EffectAdapter & { refresh: (laneId: string) => Promise<void> }) | null,
) {
  store.recoveryEnforced = true;
  await store.health();
  const lanes = await store.listRecoveryLanes();
  for (const lane of lanes)
    store.recovery.set(lane.id, {
      status: "pending",
      checkedAt: null,
      reasonCodes: ["RECOVERY_CHECKS_PENDING"],
    });
  for (const lane of lanes) await recoverChargingLane(store, lane, adapter);
}
