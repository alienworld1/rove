import type { PublishedSnapshot } from "@rove/persistence";
import {
  HostedAccessError,
  HostedStore,
  ChargingStore,
} from "@rove/persistence";
import { CorridorLab } from "./corridor-lab.js";
import {
  composeCorridorOperatingView,
  inspectCommittedTrace,
} from "./corridor-read-model.js";
import { createChargingEffectAdapter } from "./charging-effects.js";

export async function capturePublishedRun(
  store: ChargingStore,
  lab: CorridorLab,
  runId: string,
): Promise<PublishedSnapshot> {
  const run = await lab.view(runId);
  if (
    run.run.status !== "completed" ||
    run.lanes.length !== 3 ||
    run.lanes.some((lane) => !lane.projection)
  )
    throw new HostedAccessError(
      409,
      "Complete the three-Lane run before publishing it.",
    );
  const corridor = await composeCorridorOperatingView(
    store,
    lab,
    run.lanes[0].projection!.corridorId,
  );
  const inspectors: PublishedSnapshot["inspectors"] = {};
  const completions: PublishedSnapshot["completions"] = {};
  const accounting: PublishedSnapshot["accounting"] = {};
  for (const lane of corridor.lanes) {
    completions[lane.projection.id] = await store.getCompletion(
      lane.projection.id,
    );
    accounting[lane.projection.id] = await store.getAccountingRecord(
      lane.projection.id,
    );
    for (const event of lane.trace)
      inspectors[`${lane.projection.id}:${event.eventId}`] =
        await store.getInspector(lane.projection.id, event.eventId);
  }
  const traces: PublishedSnapshot["traces"] = {};
  for (const offset of new Set(
    corridor.lanes.flatMap((lane) =>
      lane.trace.flatMap((event) =>
        event.snapshot && event.traceOffsetMs !== null
          ? [event.traceOffsetMs]
          : [],
      ),
    ),
  )) {
    traces[String(offset)] = inspectCommittedTrace(corridor, offset);
  }
  return {
    run: { ...run, recorded: true },
    corridor,
    traces,
    inspectors,
    completions,
    accounting,
  };
}

export async function publishVerifiedTempoRun(
  access: HostedStore,
  store: ChargingStore,
  lab: CorridorLab,
  runId: string,
) {
  const run = await lab.view(runId);
  if (
    run.scenario.corridor.tempoNetwork !== "eip155:42431" ||
    run.lanes.some(
      (lane) =>
        lane.projection?.paymentSource !== "tempo-adapter" ||
        lane.projection.state !== "CLOSED",
    )
  )
    throw new HostedAccessError(
      409,
      "Publish a completed Tempo testnet run with all three channels closed.",
    );
  const adapter = createChargingEffectAdapter(store, access);
  for (const lane of run.lanes) await adapter.refresh(lane.projection!.id);
  const snapshot = await capturePublishedRun(store, lab, runId);
  assertPublishableSnapshot(snapshot);
  await access.publish(runId, snapshot);
  return { runId, published: true };
}

export function assertPublishableSnapshot(snapshot: PublishedSnapshot) {
  if (
    snapshot.run.recorded !== true ||
    snapshot.run.run.status !== "completed" ||
    snapshot.corridor.corridor.tempoNetwork !== "eip155:42431" ||
    snapshot.corridor.lanes.length !== 3 ||
    snapshot.corridor.lanes.some(
      (lane) =>
        lane.projection.state !== "CLOSED" ||
        lane.projection.paymentSource !== "tempo-adapter",
    )
  )
    throw new HostedAccessError(
      409,
      "Publish a completed three-Lane Tempo testnet recording.",
    );
  const histories = snapshot.corridor.lanes.flatMap((lane) => lane.trace);
  if (
    !histories.some(
      (event) => event.reasonCode === "EVIDENCE_SIGNATURE_INVALID",
    ) ||
    !histories.some((event) => event.snapshot?.state === "PAUSE_REQUIRED") ||
    !histories.some((event) => event.eventType === "lane.protection_restored")
  )
    throw new HostedAccessError(
      409,
      "The published run must include rejected evidence, a protection pause, and recovery.",
    );
  for (const completion of Object.values(snapshot.completions)) {
    const record = completion.completion;
    if (
      record?.status !== "closed" ||
      record.comparison?.status !== "MATCH" ||
      !record.closure?.transactionHash ||
      record.closure.confirmedRefund !== record.closure.expectedRefund
    )
      throw new HostedAccessError(
        409,
        "Confirm final accounting, channel close, and reserve recovery before publishing.",
      );
  }
  const operations = snapshot.corridor.lanes.flatMap(
    (lane) => lane.projection.operations,
  );
  if (
    !operations.some(
      (operation) =>
        operation.type === "top_up" && operation.status === "confirmed",
    ) ||
    !snapshot.corridor.lanes.some((lane) =>
      lane.projection.operations.some(
        (operation) =>
          operation.type === "settle" &&
          operation.status === "confirmed" &&
          BigInt(operation.requestedAmount) > 0n &&
          BigInt(operation.requestedAmount) <
            BigInt(lane.projection.settledValue),
      ),
    )
  )
    throw new HostedAccessError(
      409,
      "Confirm a top-up and partial settlement before publishing.",
    );
}
