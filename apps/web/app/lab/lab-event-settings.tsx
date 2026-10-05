"use client";
import {
  labEventLabels,
  labFaultDescriptions,
  orderLabEvents,
  resequenceLabEvents,
  type LabScenario,
  type LabScenarioEvent,
} from "@rove/contracts";
import { LabValueField } from "./lab-value-field";
const readingTypes = new Set([
  "valid_reading",
  "recovery_reading",
  "corrupt_signature",
  "wrong_meter",
  "sequence_break",
]);
export function LabEventSettings({
  scenario,
  event,
  onChange,
  onSelect,
}: {
  scenario: LabScenario;
  event: LabScenarioEvent;
  onChange: (next: LabScenario) => void;
  onSelect: (id: string | null) => void;
}) {
  function patch(value: {
    type?: LabScenarioEvent["type"];
    parameters?: { cumulativeMilliWh: string } | Record<string, never>;
    durationMs?: number | null;
    traceOffsetMs?: number;
    laneKey?: string;
  }) {
    onChange({
      ...scenario,
      events: resequenceLabEvents(
        scenario.events.map((item) =>
          item.id === event.id
            ? ({ ...item, ...value } as LabScenarioEvent)
            : item,
        ),
      ),
    });
  }
  function addRecovery() {
    const previous = orderLabEvents(scenario.events)
      .filter(
        (item) =>
          item.laneKey === event.laneKey &&
          item.traceOffsetMs < event.traceOffsetMs &&
          ["valid_reading", "recovery_reading"].includes(item.type),
      )
      .at(-1);
    const energy =
      previous && "cumulativeMilliWh" in previous.parameters
        ? previous.parameters.cumulativeMilliWh
        : String(
            BigInt(
              scenario.lanes.find((lane) => lane.key === event.laneKey)!
                .initialEnergyWh,
            ) * BigInt(1000),
          );
    const next = {
      id: `event-${crypto.randomUUID()}`,
      laneKey: event.laneKey,
      traceOffsetMs: Math.min(
        3_600_000,
        event.traceOffsetMs + (event.durationMs ?? 0) + 100,
      ),
      sequence: 10_000,
      type: "recovery_reading" as const,
      durationMs: null,
      parameters: { cumulativeMilliWh: energy },
    };
    onChange({
      ...scenario,
      events: resequenceLabEvents([...scenario.events, next]),
    });
    onSelect(next.id);
  }
  const temporary = [
    "evidence_gap",
    "signer_unavailable",
    "tempo_unavailable",
  ].includes(event.type);
  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold text-ink-secondary">
        Event
        <select
          className="mt-1.5 min-h-11 w-full border border-line-strong bg-pure px-3 text-sm text-ink"
          value={event.type}
          onChange={(change) => {
            const type = change.target.value as LabScenarioEvent["type"];
            patch({
              type,
              parameters: readingTypes.has(type)
                ? {
                    cumulativeMilliWh:
                      "cumulativeMilliWh" in event.parameters
                        ? event.parameters.cumulativeMilliWh
                        : "0",
                  }
                : {},
              durationMs: [
                "evidence_gap",
                "signer_unavailable",
                "tempo_unavailable",
              ].includes(type)
                ? 500
                : null,
            });
          }}
        >
          {Object.entries(labEventLabels).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {labFaultDescriptions[event.type] ? (
        <p className="border-l-2 border-risk pl-3 text-sm leading-relaxed text-ink-secondary">
          {labFaultDescriptions[event.type]}
        </p>
      ) : null}
      <LabValueField
        label="Trace time (seconds)"
        path={`events.${event.id}.traceOffsetMs`}
        value={event.traceOffsetMs}
        decimals={3}
        onChange={(value) => patch({ traceOffsetMs: Number(value) })}
      />
      <label className="block text-xs font-semibold text-ink-secondary">
        Lane
        <select
          className="mt-1.5 min-h-11 w-full border border-line-strong bg-pure px-3 text-sm text-ink"
          value={event.laneKey}
          onChange={(change) => patch({ laneKey: change.target.value })}
        >
          {scenario.lanes.map((lane) => (
            <option key={lane.key} value={lane.key}>
              {lane.label}
            </option>
          ))}
        </select>
      </label>
      {"cumulativeMilliWh" in event.parameters ? (
        <LabValueField
          label="Cumulative meter energy (kWh)"
          path={`events.${event.id}.parameters.cumulativeMilliWh`}
          value={event.parameters.cumulativeMilliWh}
          decimals={6}
          onChange={(value) =>
            patch({ parameters: { cumulativeMilliWh: value } })
          }
        />
      ) : null}
      {temporary ? (
        <>
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={event.durationMs !== null}
              onChange={(change) =>
                patch({ durationMs: change.target.checked ? 500 : null })
              }
              disabled={event.type === "evidence_gap"}
            />{" "}
            Restore availability after a duration
          </label>
          {event.durationMs !== null ? (
            <LabValueField
              label="Duration (seconds)"
              path={`events.${event.id}.durationMs`}
              value={event.durationMs}
              decimals={3}
              onChange={(value) => patch({ durationMs: Number(value) })}
              help="The restoration marker is generated by the compiler. Evidence recovery still needs a signed reading."
            />
          ) : (
            <p className="text-xs text-ink-secondary">
              Add an explicit restoration event later in the trace.
            </p>
          )}
        </>
      ) : null}
      {[
        "corrupt_signature",
        "wrong_meter",
        "sequence_break",
        "replay_reading",
        "evidence_gap",
      ].includes(event.type) ? (
        <button
          className="min-h-11 w-full border border-line-strong px-3 text-sm font-semibold"
          onClick={addRecovery}
          disabled={scenario.events.length >= 200}
        >
          Place recovery after fault
        </button>
      ) : null}
      <div className="flex gap-2 border-t border-line pt-4">
        <button
          className="min-h-11 flex-1 border border-line px-3 text-sm"
          disabled={
            scenario.events.length >= 200 || event.type === "session_start"
          }
          onClick={() => {
            const duplicate = {
              ...event,
              id: `event-${crypto.randomUUID()}`,
              traceOffsetMs: Math.min(3_600_000, event.traceOffsetMs + 100),
              sequence: 10_000,
            };
            onChange({
              ...scenario,
              events: resequenceLabEvents([...scenario.events, duplicate]),
            });
            onSelect(duplicate.id);
          }}
        >
          Duplicate
        </button>
        <button
          className="min-h-11 flex-1 border border-critical px-3 text-sm text-critical"
          onClick={() => {
            onChange({
              ...scenario,
              events: scenario.events.filter((item) => item.id !== event.id),
            });
            onSelect(null);
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
