"use client";
import {
  displayLabDecimal,
  labEventLabels,
  orderLabEvents,
  resequenceLabEvents,
  type LabScenario,
} from "@rove/contracts";
import { LabTimelineMarker } from "./lab-timeline-marker";
export function LabTimeline({
  scenario,
  laneKey,
  selectedEventId,
  onLane,
  onEvent,
  onChange,
}: {
  scenario: LabScenario;
  laneKey: string;
  selectedEventId: string | null;
  onLane: (key: string) => void;
  onEvent: (id: string) => void;
  onChange: (next: LabScenario) => void;
}) {
  const duration =
    Math.max(
      1000,
      ...scenario.events.map(
        (event) => event.traceOffsetMs + (event.durationMs ?? 0),
      ),
    ) * 1.08;
  const events = orderLabEvents(scenario.events);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-tertiary">
            Authored trace · Digital twin
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            Place failure. Shape recovery.
          </h2>
        </div>
        <p className="max-w-64 text-xs leading-relaxed text-ink-secondary">
          Select a marker to inspect it. Drag to move, or enter an exact trace
          time.
        </p>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="min-w-[540px] px-6">
          <div className="ml-28 flex justify-between py-5 font-mono text-xs text-ink-tertiary">
            {[0, 0.25, 0.5, 0.75, 1].map((value) => (
              <span key={value}>{((duration * value) / 1000).toFixed(2)}s</span>
            ))}
          </div>
          {scenario.lanes.map((lane) => (
            <div
              key={lane.key}
              className={`flex items-center border-y border-line-faint ${lane.key === laneKey ? "bg-pure" : ""}`}
            >
              <button
                className="min-h-24 w-28 shrink-0 text-left focus-visible:outline-2 focus-visible:outline-info"
                onClick={() => onLane(lane.key)}
                aria-pressed={lane.key === laneKey}
              >
                <span className="block text-sm font-semibold">
                  {lane.label}
                </span>
                <span className="mt-1 block font-mono text-xs text-ink-tertiary">
                  {displayLabDecimal(lane.maxPowerWatts, 3)} kW
                </span>
              </button>
              <div className="relative h-24 flex-1">
                <div className="absolute inset-x-0 top-10 h-px bg-line-strong" />
                {events
                  .filter(
                    (event) =>
                      event.laneKey === lane.key && event.durationMs !== null,
                  )
                  .map((event) => (
                    <div
                      key={`${event.id}-span`}
                      style={{
                        left: `${(event.traceOffsetMs / duration) * 100}%`,
                        width: `${(event.durationMs! / duration) * 100}%`,
                      }}
                      className="absolute top-8 h-4 border-x border-risk bg-risk-soft"
                      aria-hidden="true"
                    />
                  ))}
                {events
                  .filter((event) => event.laneKey === lane.key)
                  .map((event) => (
                    <LabTimelineMarker
                      key={event.id}
                      event={event}
                      duration={duration}
                      selected={event.id === selectedEventId}
                      onSelect={() => onEvent(event.id)}
                      onMove={(offset) =>
                        onChange({
                          ...scenario,
                          events: resequenceLabEvents(
                            scenario.events.map((item) =>
                              item.id === event.id
                                ? { ...item, traceOffsetMs: offset }
                                : item,
                            ),
                          ),
                        })
                      }
                    />
                  ))}
                {events
                  .filter(
                    (event) =>
                      event.laneKey === lane.key && event.durationMs !== null,
                  )
                  .map((event) => (
                    <button
                      key={`${event.id}-restore`}
                      onClick={() => onEvent(event.id)}
                      style={{
                        left: `${((event.traceOffsetMs + event.durationMs!) / duration) * 100}%`,
                      }}
                      className="absolute top-14 min-h-10 -translate-x-1/2 whitespace-nowrap px-2 font-mono text-xs text-protected focus-visible:outline-2 focus-visible:outline-info"
                      aria-label={`Availability restoration at ${(event.traceOffsetMs + event.durationMs!) / 1000} seconds, edit parent fault`}
                    >
                      ↳ restore
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-5 border-b border-line pb-5 text-xs text-ink-secondary">
        <span>● Signed input</span>
        <span className="text-critical">◆ Fault</span>
        <span className="text-protected">│ Recovery / restoration</span>
        <span className="text-risk-deep">▬ Unavailable interval</span>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Event list ·{" "}
          {scenario.lanes.find((lane) => lane.key === laneKey)?.label}
        </h3>
        <span className="font-mono text-xs text-ink-tertiary">
          {scenario.events.length} / 200 events
        </span>
      </div>
      <ol className="mt-3 max-h-80 overflow-y-auto divide-y divide-line-faint">
        {events
          .filter((event) => event.laneKey === laneKey)
          .map((event) => (
            <li key={event.id}>
              <button
                aria-pressed={event.id === selectedEventId}
                onClick={() => onEvent(event.id)}
                className={`flex min-h-11 w-full items-center gap-4 px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-info ${event.id === selectedEventId ? "bg-info-soft" : "hover:bg-selection"}`}
              >
                <span className="w-20 shrink-0 font-mono text-xs">
                  {displayLabDecimal(String(event.traceOffsetMs), 3)}s
                </span>
                <span>{labEventLabels[event.type]}</span>
                {"cumulativeMilliWh" in event.parameters ? (
                  <span className="ml-auto font-mono text-xs text-ink-tertiary">
                    {displayLabDecimal(event.parameters.cumulativeMilliWh, 6)}{" "}
                    kWh
                  </span>
                ) : null}
              </button>
            </li>
          ))}
      </ol>
    </div>
  );
}
