"use client";
import { useState } from "react";
import {
  displayLabDecimal,
  parseLabDecimal,
  generateLabReadings,
  type LabScenario,
  type LabScenarioEvent,
} from "@rove/contracts";
export function LabReadingGenerator({
  scenario,
  laneKey,
  onChange,
}: {
  scenario: LabScenario;
  laneKey: string;
  onChange: (next: LabScenario) => void;
}) {
  const lane = scenario.lanes.find((item) => item.key === laneKey)!;
  const [power, setPower] = useState(displayLabDecimal(lane.maxPowerWatts, 3));
  const [duration, setDuration] = useState(
    displayLabDecimal(
      String(
        Math.max(
          1000,
          ...scenario.events.map(
            (event) => event.traceOffsetMs + (event.durationMs ?? 0),
          ),
        ),
      ),
      3,
    ),
  );
  const [preview, setPreview] = useState<{
    events: LabScenarioEvent[];
    source: LabScenario;
  } | null>(null);
  const [message, setMessage] = useState("");
  const field =
    "mt-1 min-h-11 w-full border border-line-strong bg-pure px-3 font-mono text-sm";
  return (
    <details className="mt-5 border-t border-line py-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Generate readings
      </summary>
      <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
        Replace this Lane’s ordinary readings with a constant-power schedule.
        Faults stay at their current times; recovery uses a conservative
        cumulative reading. The simulated charger still pauses when the exposure
        policy requires it.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs">
          Delivery power (kW)
          <input
            inputMode="decimal"
            className={field}
            value={power}
            onChange={(event) => {
              setPower(event.target.value);
              setPreview(null);
            }}
          />
        </label>
        <label className="text-xs">
          Trace end (seconds)
          <input
            inputMode="decimal"
            className={field}
            value={duration}
            onChange={(event) => {
              setDuration(event.target.value);
              setPreview(null);
            }}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-ink-secondary">
        Reading interval:{" "}
        {displayLabDecimal(String(lane.expectedProofIntervalMs), 3)} seconds
      </p>
      <button
        className="mt-3 min-h-11 border border-line-strong px-3 text-sm"
        onClick={() => {
          try {
            setPreview({
              events: generateLabReadings(
                scenario,
                laneKey,
                parseLabDecimal(power, 3),
                Number(parseLabDecimal(duration, 3)),
              ),
              source: scenario,
            });
            setMessage("");
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Check the generation settings.",
            );
          }
        }}
      >
        Preview replacement
      </button>
      {preview && preview.source === scenario ? (
        <div className="mt-3 border-l-2 border-info pl-3">
          <p className="text-xs">
            Replace{" "}
            {
              scenario.events.filter(
                (event) =>
                  event.laneKey === laneKey && event.type === "valid_reading",
              ).length
            }{" "}
            readings with{" "}
            {
              preview.events.filter(
                (event) =>
                  event.laneKey === laneKey && event.type === "valid_reading",
              ).length
            }
            . Fault and recovery times stay fixed.
          </p>
          <ol className="mt-3 max-h-40 overflow-y-auto font-mono text-xs">
            {preview.events
              .filter(
                (event) =>
                  event.laneKey === laneKey &&
                  "cumulativeMilliWh" in event.parameters,
              )
              .map((event) => (
                <li key={event.id} className="flex justify-between gap-3 py-1">
                  <span>
                    {displayLabDecimal(String(event.traceOffsetMs), 3)}s ·{" "}
                    {event.type === "recovery_reading"
                      ? "Recovery"
                      : event.type === "valid_reading"
                        ? "Reading"
                        : "Fault input"}
                  </span>
                  <span>
                    {"cumulativeMilliWh" in event.parameters
                      ? displayLabDecimal(event.parameters.cumulativeMilliWh, 6)
                      : ""}{" "}
                    kWh
                  </span>
                </li>
              ))}
          </ol>
          <button
            className="mt-3 min-h-11 bg-ink px-3 text-sm font-semibold text-pure"
            onClick={() => {
              onChange({ ...scenario, events: preview.events });
              setPreview(null);
            }}
          >
            Apply generated readings
          </button>
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="mt-2 text-xs text-critical">
          {message}
        </p>
      ) : null}
    </details>
  );
}
