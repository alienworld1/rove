import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readBaseConfig, readAccountingConfig } from "@rove/config";
import { ChargingStore, LabStore } from "@rove/persistence";
import { CorridorLab } from "./corridor-lab.js";
import { createChargingEffectAdapter } from "./charging-effects.js";
import { processNextEffect } from "./outbox-worker.js";
import { recoverChargingLane } from "./recover-charging.js";

async function main() {
  const config = readBaseConfig();
  readAccountingConfig();
  const runId = process.argv[2];
  if (!config.DATABASE_URL || config.NODE_ENV !== "development" || !runId)
    throw new Error(
      "Use a completed Tempo Lab run ID with development database and accounting settings.",
    );
  let store = new ChargingStore(config.DATABASE_URL);
  const labStore = new LabStore(config.DATABASE_URL);
  try {
    let lab = new CorridorLab(store, labStore);
    const view = await lab.view(runId);
    assert.equal(view.run.status, "completed");
    assert.ok(
      view.lanes.every(
        (lane) => lane.projection?.paymentSource === "tempo-adapter",
      ),
    );
    for (const laneId of Object.values(view.run.laneBindings)) {
      let context = await store.getPaymentContext(laneId);
      let adapter = createChargingEffectAdapter(store);
      if (!context.lane.completion)
        await lab.finishLane({
          commandId: randomUUID(),
          correlationId: randomUUID(),
          laneId,
          expectedVersion: context.lane.version,
        });
      for (let attempt = 0; attempt < 90; attempt++) {
        const summary = await store.getCompletion(laneId);
        if (summary.completion?.status === "reconciled" && summary.canClose)
          break;
        if (summary.completion?.status === "closed") break;
        await processNextEffect(
          store,
          adapter,
          new Date().toISOString(),
          laneId,
        );
        await adapter.refresh(laneId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      let summary = await store.getCompletion(laneId);
      if (summary.completion?.status !== "closed") {
        assert.equal(summary.completion?.status, "reconciled");
        const observation = await adapter.observe(laneId);
        await store.advanceLane(
          {
            commandId: randomUUID(),
            correlationId: randomUUID(),
            laneId,
            expectedVersion: summary.version,
            now: observation.observedAt,
            payload: { type: "CloseChannel" },
          },
          "completion-proof",
          observation,
        );
        await processNextEffect(
          store,
          adapter,
          new Date().toISOString(),
          laneId,
        );
        // Restart after the durable close submission, before the terminal commit.
        await store.close();
        store = new ChargingStore(config.DATABASE_URL);
        store.recoveryEnforced = true;
        adapter = createChargingEffectAdapter(store);
        lab = new CorridorLab(store, labStore);
        for (let attempt = 0; attempt < 90; attempt++) {
          context = await store.getPaymentContext(laneId);
          await recoverChargingLane(store, context.lane, adapter);
          summary = await store.getCompletion(laneId);
          if (
            summary.completion?.status === "closed" &&
            summary.recovery.status === "ready"
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        store.recoveryEnforced = false;
      }
      summary = await store.getCompletion(laneId);
      assert.equal(summary.completion?.status, "closed");
      assert.equal(summary.completion.comparison?.status, "MATCH");
      assert.equal(
        summary.completion.closure?.confirmedRefund,
        summary.completion.closure?.expectedRefund,
      );
      assert.ok(summary.completion.closure?.transactionHash?.startsWith("0x"));
      const current = await store.getLane(laneId);
      assert.equal(current.settledValue, summary.completion.finalTrustedValue);
      process.stdout.write(
        `${JSON.stringify({ laneId, channelId: current.channelId, finalEnergyWh: summary.completion.finalTrustedEnergyWh, finalTotal: summary.completion.finalTrustedValue, comparison: summary.completion.comparison, closure: summary.completion.closure, recovery: summary.recovery })}\n`,
      );
    }
  } finally {
    await store.close();
    await labStore.close();
  }
}
void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Completion verification failed"}\n`,
  );
  process.exitCode = 1;
});
