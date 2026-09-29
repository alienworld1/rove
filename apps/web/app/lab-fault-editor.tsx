"use client";

import { useState } from "react";
import type { LabScenario } from "@rove/contracts";

const faults = [
  ["corrupt_signature", "Corrupt signature"],
  ["wrong_meter", "Wrong meter"],
  ["replay_reading", "Replay reading"],
  ["sequence_break", "Sequence break"],
  ["evidence_gap", "Evidence gap"],
  ["signer_unavailable", "Signer unavailable"],
  ["top_up_failure", "Top-up failure"],
  ["tempo_unavailable", "Tempo unavailable"],
] as const;

export function LabFaultEditor({
  scenario,
  onChange,
}: {
  scenario: LabScenario;
  onChange: (next: LabScenario) => void;
}) {
  const [laneKey, setLaneKey] = useState(
    scenario.lanes[2]?.key ?? scenario.lanes[0].key,
  );
  const [fault, setFault] =
    useState<(typeof faults)[number][0]>("corrupt_signature");
  const [traceOffsetMs, setTraceOffsetMs] = useState(1000);
  const [durationMs, setDurationMs] = useState(500);
  const [recoveryOffsetMs, setRecoveryOffsetMs] = useState(2100);
  const [message, setMessage] = useState("");

  function addFault() {
    const existing = scenario.events.filter(
      (event) =>
        event.laneKey === laneKey &&
        event.traceOffsetMs <= traceOffsetMs &&
        "cumulativeMilliWh" in event.parameters,
    );
    const previous = existing
      .sort(
        (a, b) => a.traceOffsetMs - b.traceOffsetMs || a.sequence - b.sequence,
      )
      .at(-1);
    const energy =
      previous && "cumulativeMilliWh" in previous.parameters
        ? previous.parameters.cumulativeMilliWh
        : "0";
    const parameters = [
      "corrupt_signature",
      "wrong_meter",
      "sequence_break",
    ].includes(fault)
      ? { cumulativeMilliWh: energy }
      : {};
    const temporary = [
      "evidence_gap",
      "signer_unavailable",
      "tempo_unavailable",
    ].includes(fault);
    const recovery = [
      "corrupt_signature",
      "wrong_meter",
      "replay_reading",
      "sequence_break",
      "evidence_gap",
    ].includes(fault)
      ? [
          {
            id: `recovery-${crypto.randomUUID()}`,
            laneKey,
            traceOffsetMs: recoveryOffsetMs,
            sequence:
              Math.max(...scenario.events.map((event) => event.sequence)) + 2,
            type: "recovery_reading",
            parameters: { cumulativeMilliWh: energy },
            durationMs: null,
          },
        ]
      : [];
    const next = {
      ...scenario,
      events: [
        ...scenario.events,
        {
          id: `fault-${crypto.randomUUID()}`,
          laneKey,
          traceOffsetMs,
          sequence:
            Math.max(...scenario.events.map((event) => event.sequence)) + 1,
          type: fault,
          parameters,
          durationMs: temporary ? durationMs : null,
        },
        ...recovery,
      ],
    } as LabScenario;
    onChange(next);
    setMessage(
      "Fault added to the draft. Validate the scenario before starting a run.",
    );
  }

  return (
    <fieldset className="mt-6 border-t border-line pt-5">
      <legend className="text-sm font-semibold text-ink">Add fault</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-ink-secondary">
          Lane
          <select
            value={laneKey}
            onChange={(event) => setLaneKey(event.target.value)}
            className="mt-1 block w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-ink"
          >
            {scenario.lanes.map((lane) => (
              <option key={lane.key} value={lane.key}>
                {lane.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-secondary">
          Fault
          <select
            value={fault}
            onChange={(event) => setFault(event.target.value as typeof fault)}
            className="mt-1 block w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-ink"
          >
            {faults.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-secondary">
          Trace time (ms)
          <input
            type="number"
            min="0"
            max="3600000"
            value={traceOffsetMs}
            onChange={(event) => setTraceOffsetMs(Number(event.target.value))}
            className="mt-1 block w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-ink"
          />
        </label>
        {(
          [
            "evidence_gap",
            "signer_unavailable",
            "tempo_unavailable",
          ] as string[]
        ).includes(fault) ? (
          <label className="text-sm text-ink-secondary">
            Duration (ms)
            <input
              type="number"
              min="1"
              max="3600000"
              value={durationMs}
              onChange={(event) => setDurationMs(Number(event.target.value))}
              className="mt-1 block w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-ink"
            />
          </label>
        ) : null}
        {(
          [
            "corrupt_signature",
            "wrong_meter",
            "replay_reading",
            "sequence_break",
            "evidence_gap",
          ] as string[]
        ).includes(fault) ? (
          <label className="text-sm text-ink-secondary">
            Recovery time (ms)
            <input
              type="number"
              min="1"
              max="3600000"
              value={recoveryOffsetMs}
              onChange={(event) =>
                setRecoveryOffsetMs(Number(event.target.value))
              }
              className="mt-1 block w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-ink"
            />
          </label>
        ) : null}
      </div>
      <button
        type="button"
        onClick={addFault}
        className="mt-4 rounded-sm border border-line-strong bg-raised px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Add fault
      </button>
      {message ? (
        <p role="status" className="mt-2 text-sm text-ink-secondary">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
