import type { RealtimePresentationEvent } from "@rove/contracts";

export type RealtimeCursor = {
  projectionVersion: number;
  announcedEventIds: ReadonlySet<string>;
};

export function acceptRealtimeEvent(
  state: RealtimeCursor,
  event: RealtimePresentationEvent,
) {
  const announcementKey =
    event.type === "lab_run_changed"
      ? `${event.runId}:${event.payload.eventType}`
      : event.id;
  if (
    event.type !== "resync_required" &&
    (state.announcedEventIds.has(announcementKey) ||
      (event.type !== "lab_run_changed" &&
        event.projectionVersion <= state.projectionVersion))
  )
    return { state, accepted: false, resync: false };
  const announcedEventIds = new Set(state.announcedEventIds);
  announcedEventIds.add(announcementKey);
  if (announcedEventIds.size > 100)
    announcedEventIds.delete(announcedEventIds.values().next().value!);
  return {
    state: {
      projectionVersion: Math.max(
        state.projectionVersion,
        event.projectionVersion,
      ),
      announcedEventIds,
    },
    accepted: true,
    resync: event.type === "resync_required",
  };
}
