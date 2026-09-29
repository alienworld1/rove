import type { CorridorOperatingView } from "@rove/contracts";

export function validateSelection(
  view: CorridorOperatingView,
  laneId: string | null,
  eventId: string | null,
  traceOffsetMs: number | null,
) {
  const lane = laneId
    ? view.lanes.find((candidate) => candidate.projection.id === laneId)
    : null;
  const event = eventId
    ? lane?.trace.find((candidate) => candidate.eventId === eventId)
    : null;
  const validTrace =
    traceOffsetMs !== null &&
    view.activeRun !== null &&
    traceOffsetMs >= 0 &&
    traceOffsetMs <= view.activeRun.traceOffsetMs;
  return {
    laneId: lane?.projection.id ?? null,
    eventId: event?.eventId ?? null,
    traceOffsetMs: validTrace ? traceOffsetMs : null,
    changed:
      (laneId !== null && !lane) ||
      (eventId !== null && !event) ||
      (traceOffsetMs !== null && !validTrace),
  };
}
