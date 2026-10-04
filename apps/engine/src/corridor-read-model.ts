import {
  corridorOperatingViewSchema,
  type CorridorOperatingView,
  type LaneHistory,
  type LaneProjection,
  type LabRunView,
  type LaneTraceEvent,
} from "@rove/contracts";
import { conservativeTariffBound } from "@rove/protection";
import { ChargingStore, StoreError } from "@rove/persistence";
import { CorridorLab } from "./corridor-lab.js";

const severity: Record<LaneProjection["state"], number> = {
  PAUSE_REQUIRED: 6,
  AT_RISK: 5,
  RECOVERING: 4,
  WATCH: 3,
  INITIALIZING: 2,
  COMPLETING: 1,
  RECONCILED: 0,
  CLOSED: 0,
  PROTECTED: 0,
};

function sum(values: string[]) {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
}

function max(values: bigint[]) {
  return values.reduce(
    (highest, value) => (value > highest ? value : highest),
    1n,
  );
}

function eventOutcome(event: LaneHistory[number]): LaneTraceEvent["outcome"] {
  if (event.type.includes("rejected")) return "rejected";
  if (event.type.includes("failed")) return "failed";
  if (event.type.includes("submitted") || event.type.includes("pending"))
    return "pending";
  if (event.type.includes("accepted") || event.type.includes("verified"))
    return "accepted";
  if (event.type.includes("confirmed") || event.type.includes("completed"))
    return "confirmed";
  return "informational";
}

function traceEvent(
  event: LaneHistory[number],
  traceEpoch: string | null,
  precedingOffsetMs: number,
  traceEndMs: number,
): LaneTraceEvent {
  const candidate =
    traceEpoch && event.traceTime
      ? Math.max(0, Date.parse(event.traceTime) - Date.parse(traceEpoch))
      : precedingOffsetMs;
  // Chain receipt clocks remain real wall time. They inherit the preceding
  // scenario position rather than moving a short recorded trace to its end.
  const traceOffsetMs = candidate <= traceEndMs ? candidate : precedingOffsetMs;
  return {
    eventId: event.id,
    eventType: event.type,
    occurredAt: event.occurredAt,
    traceTime: event.traceTime,
    traceOffsetMs,
    laneVersion: event.version,
    snapshot: event.snapshot,
    reasonCode: event.reasonCode,
    outcome: eventOutcome(event),
    references: {
      evidenceHash: event.evidenceHash,
      channelId: event.channelId,
      transactionHash: event.transactionHash,
    },
    values: {
      before: event.summary?.before ?? null,
      after: event.summary?.after ?? null,
    },
  };
}

export function projectLaneTrace(
  history: LaneHistory,
  traceEpoch: string | null,
  traceEndMs: number,
) {
  return history.reduce<LaneTraceEvent[]>((trace, event) => {
    const previousOffset = trace.at(-1)?.traceOffsetMs ?? 0;
    const next = traceEvent(event, traceEpoch, previousOffset, traceEndMs);
    trace.push({
      ...next,
      traceOffsetMs: Math.max(previousOffset, next.traceOffsetMs ?? 0),
    });
    return trace;
  }, []);
}

export function summarizeCorridor(lanes: LaneProjection[]) {
  const orderedAttention = lanes
    .filter((lane) => severity[lane.state] > 0)
    .sort((left, right) => severity[right.state] - severity[left.state]);
  const states = new Set(lanes.map((lane) => lane.state));
  const headrooms = lanes.map((lane) =>
    lane.state === "CLOSED" ? "0" : lane.fundedHeadroom,
  );
  return {
    activeLaneCount: lanes.filter(
      (lane) => !["COMPLETING", "RECONCILED", "CLOSED"].includes(lane.state),
    ).length,
    attentionLaneIds: orderedAttention.map((lane) => lane.id),
    state: states.size === 1 && lanes[0] ? lanes[0].state : ("MIXED" as const),
    trustedDeliveredValue: sum(lanes.map((lane) => lane.trustedDeliveredValue)),
    protectedValue: sum(lanes.map((lane) => lane.protectedValue)),
    settledValue: sum(lanes.map((lane) => lane.settledValue)),
    unprotectedExposureBound: sum(
      lanes.map((lane) => lane.unprotectedExposureBound),
    ),
    unusedFundedHeadroom: headrooms.some((value) => value === null)
      ? null
      : sum(headrooms as string[]),
  };
}

function runSummary(view: LabRunView | null) {
  if (!view) return null;
  const fault = view.scenario.events.find((event) =>
    [
      "corrupt_signature",
      "wrong_meter",
      "replay_reading",
      "sequence_break",
      "evidence_gap",
      "top_up_failure",
      "signer_unavailable",
      "tempo_unavailable",
    ].includes(event.type),
  );
  const recovery = view.scenario.events.find(
    (event) => event.type === "recovery_reading",
  );
  return {
    id: view.run.id,
    status: view.run.status,
    version: view.run.version,
    cursor: view.run.cursor,
    traceOffsetMs: view.run.traceOffsetMs,
    traceEndMs: Math.max(
      0,
      ...view.scenario.events.map((event) => event.traceOffsetMs),
    ),
    speed: view.run.speed,
    faultTraceOffsetMs: fault?.traceOffsetMs ?? null,
    recoveryTraceOffsetMs: recovery?.traceOffsetMs ?? null,
  };
}

async function composeCorridorOperatingViewOnce(
  store: ChargingStore,
  labView: LabRunView | null,
  corridorId: string,
): Promise<CorridorOperatingView> {
  const [corridor, laneIds, projectionVersion] = await Promise.all([
    store.getCorridor(corridorId),
    store.listLanes(corridorId),
    store.getLatestEventOrdinal(corridorId),
  ]);
  const laneData = await Promise.all(
    laneIds.map(async (laneId) => {
      const [projection, history] = await Promise.all([
        store.getLane(laneId),
        store.getHistory(laneId),
      ]);
      return { projection, history };
    }),
  );
  const definitionByLaneId = new Map(
    (labView?.lanes ?? []).flatMap((lane) => {
      const laneId = labView?.run.laneBindings[lane.definition.key];
      return laneId ? [[laneId, lane.definition] as const] : [];
    }),
  );
  const orderIndex = new Map(
    (labView?.scenario.lanes ?? []).flatMap((definition, index) => {
      const laneId = labView?.run.laneBindings[definition.key];
      return laneId ? [[laneId, index] as const] : [];
    }),
  );
  const ordered = [...laneData].sort(
    (left, right) =>
      (orderIndex.get(left.projection.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(right.projection.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const traceStart = labView?.scenario.traceEpoch ?? null;
  const traceEndMs = Math.max(
    0,
    ...(labView?.scenario.events.map((event) => event.traceOffsetMs) ?? [0]),
  );
  return corridorOperatingViewSchema.parse({
    corridor: {
      id: corridor.id,
      name: corridor.name,
      payerEmsp: corridor.payerEmsp,
      payeeCpo: corridor.payeeCpo,
      settlementAssetId: corridor.settlementAssetId,
      tempoNetwork: corridor.tempoNetwork,
      tariff: corridor.tariff,
      protectionPolicy: corridor.protectionPolicy,
    },
    projectionVersion,
    checkedAt: new Date().toISOString(),
    laneOrder: ordered.map(({ projection }) => projection.id),
    lanes: ordered.map(({ projection, history }, index) => {
      const definition = definitionByLaneId.get(projection.id);
      const plannedDomain = definition
        ? conservativeTariffBound(
            definition.maxPowerWatts,
            traceEndMs + corridor.protectionPolicy.evidenceMaxAgeMs,
            corridor.tariff.perKwh,
            corridor.tariff.tariffDecimals,
            corridor.tariff.assetDecimals,
          ) + BigInt(projection.maxUnprotectedExposure)
        : 0n;
      const valueDomainMax = max([
        plannedDomain,
        BigInt(projection.worstCaseDeliveredValue),
        BigInt(projection.protectedValue) +
          BigInt(projection.maxUnprotectedExposure),
        BigInt(projection.confirmedDeposit ?? "0"),
      ]).toString();
      return {
        label: definition?.label ?? `Lane ${index + 1}`,
        powerClass: definition
          ? `${definition.powerClass} ${Number(definition.maxPowerWatts) / 1000} kW`
          : "Charging Lane",
        projection,
        fundedCapacityValue:
          projection.fundedHeadroom === null
            ? null
            : (
                BigInt(projection.authorizedValue) +
                BigInt(projection.fundedHeadroom)
              ).toString(),
        trace: projectLaneTrace(history, traceStart, traceEndMs),
        scale: { valueDomainMax, traceStartMs: 0, traceEndMs },
      };
    }),
    aggregate: summarizeCorridor(ordered.map(({ projection }) => projection)),
    environment: labView?.environment ?? {
      physicalSource: "Configured charging source",
      evidence: "Verified signed meter readings",
      payment:
        ordered[0]?.projection.paymentSource === "local-simulation"
          ? "Local deterministic payment"
          : corridor.tempoNetwork === "eip155:42431"
            ? "Tempo testnet"
            : "Tempo",
      settlement: "Partial settlement",
    },
    activeRun: runSummary(labView),
  });
}

export async function composeCorridorOperatingView(
  store: ChargingStore,
  lab: CorridorLab | null,
  corridorId: string,
  inspectionTraceOffsetMs: number | null = null,
): Promise<CorridorOperatingView> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const labView = (await lab?.viewForCorridor(corridorId)) ?? null;
    const view = await store.consistentRead((snapshot) =>
      composeCorridorOperatingViewOnce(snapshot, labView, corridorId),
    );
    if (
      labView &&
      (await lab?.runVersion(labView.run.id)) !== labView.run.version
    )
      continue;
    return inspectionTraceOffsetMs === null
      ? view
      : inspectCommittedTrace(view, inspectionTraceOffsetMs);
  }
  throw new StoreError("INCONSISTENT_PROJECTION");
}

export function inspectCommittedTrace(
  view: CorridorOperatingView,
  offsetMs: number,
): CorridorOperatingView {
  if (
    !Number.isSafeInteger(offsetMs) ||
    offsetMs < 0 ||
    !view.activeRun ||
    offsetMs > view.activeRun.traceOffsetMs ||
    !view.lanes.some((lane) =>
      lane.trace.some(
        (event) => event.traceOffsetMs === offsetMs && event.snapshot,
      ),
    )
  )
    throw new StoreError("VALIDATION");
  const lanes = view.lanes.map((lane) => {
    const event = [...lane.trace]
      .reverse()
      .find(
        (event) =>
          event.traceOffsetMs !== null &&
          event.traceOffsetMs <= offsetMs &&
          event.snapshot,
      );
    if (!event?.snapshot) throw new StoreError("NOT_FOUND");
    const reading = [...lane.trace]
      .reverse()
      .find(
        (candidate) =>
          candidate.traceOffsetMs !== null &&
          candidate.traceOffsetMs <= offsetMs &&
          candidate.eventType === "meter.evidence_accepted",
      );
    return {
      ...lane,
      fundedCapacityValue:
        event.snapshot.fundedHeadroom === null
          ? null
          : (
              BigInt(event.snapshot.authorizedValue) +
              BigInt(event.snapshot.fundedHeadroom)
            ).toString(),
      projection: {
        ...lane.projection,
        ...event.snapshot,
        operations: [],
        latestVoucherDigest: null,
        lastEvidenceHash: reading?.references.evidenceHash ?? null,
        lastTrustedEvidenceAt: reading?.traceTime ?? null,
        channelId: event.references.channelId,
        updatedAt: event.occurredAt,
        evidenceFreshness: "historical" as const,
        chainFreshness: "historical" as const,
      },
    };
  });
  return corridorOperatingViewSchema.parse({
    ...view,
    inspectionTraceOffsetMs: offsetMs,
    lanes,
    aggregate: summarizeCorridor(lanes.map((lane) => lane.projection)),
  });
}
