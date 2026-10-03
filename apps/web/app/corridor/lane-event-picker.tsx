import { eventLabelFor, type LaneTraceEvent } from "@rove/contracts";

export function LaneEventPicker({
  label,
  events,
  selectedEventId,
  onSelect,
}: {
  label: string;
  events: LaneTraceEvent[];
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
}) {
  return (
    <select
      aria-label={`${label} recorded events`}
      data-event-picker="true"
      value={selectedEventId ?? ""}
      onChange={(event) => {
        if (event.target.value) onSelect(event.target.value);
      }}
      className="absolute bottom-10 right-3 z-10 max-w-60 rounded-sm border border-line-strong bg-pure px-2 py-1 text-xs text-ink focus-visible:outline-2 focus-visible:outline-info"
    >
      <option value="" disabled>
        {events.length ? "Inspect a recorded event" : "No recorded events yet"}
      </option>
      {events.map((event, index) => (
        <option key={event.eventId} value={event.eventId}>
          {index + 1}. {eventLabelFor(event.eventType)}
        </option>
      ))}
    </select>
  );
}
