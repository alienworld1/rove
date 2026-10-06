"use client";

import { DemoGuide } from "./demo-guide";
import { useEffect, useState } from "react";
import type { LabRunView } from "@rove/contracts";

const speeds = [0.25, 0.5, 1, 2, 4] as const;

export function LabPlaybackControls({
  run,
  busy,
  onAction,
  onSpeed,
  onCheck,
  onMode,
  onInspect,
}: {
  run: LabRunView["run"];
  busy: boolean;
  onAction: (action: "play" | "pause" | "step" | "reset") => void;
  onSpeed: (speed: number) => void;
  onCheck: () => void;
  onMode?: (mode: "guided" | "continuous") => void;
  onInspect?: (laneId: string, eventId: string) => void;
}) {
  const [now, setNow] = useState(0);
  const waiting =
    run.awaiting &&
    typeof run.awaiting === "object" &&
    "startedAt" in run.awaiting &&
    typeof run.awaiting.startedAt === "string"
      ? run.awaiting.startedAt
      : null;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);
  const finished = run.status === "completed" || run.status === "failed";
  const trace = new Date(run.traceOffsetMs).toISOString().slice(14, 19);
  return (
    <section aria-label="Playback" className="border-b border-line-strong py-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto font-mono text-base tabular-nums text-ink">
          Trace time {trace}
        </p>
        <span className="text-sm text-ink-secondary">
          {run.status === "running"
            ? "Running"
            : run.status === "completed"
              ? "Trace recovered. Review the completion checklist for session totals and reserve returns."
              : run.status === "failed"
                ? "This run needs attention. Check again or replay it."
                : run.status === "awaiting_chain"
                  ? "Waiting on payment confirmation"
                  : run.status === "paused"
                    ? `Paused at ${trace}`
                    : run.status === "initializing"
                      ? "Preparing protected charging sessions…"
                      : "Ready"}
        </span>
        {run.status === "running" ? (
          <button
            type="button"
            onClick={() => onAction("pause")}
            disabled={busy}
            className="min-h-11 rounded-sm border border-line-strong bg-raised px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAction("play")}
            disabled={busy || finished || run.status === "initializing"}
            className="min-h-11 rounded-sm border border-line-strong bg-ink px-4 py-2 text-sm font-semibold text-pure focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            {run.guidance?.active ? "Continue" : "Play"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onAction("step")}
          disabled={
            busy ||
            finished ||
            run.status === "running" ||
            run.status === "initializing"
          }
          className="min-h-11 rounded-sm border border-line-strong bg-raised px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          Step event
        </button>
        <button
          type="button"
          onClick={() => onAction("reset")}
          disabled={busy}
          className="min-h-11 rounded-sm border border-line-strong bg-raised px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          Replay
        </button>
        {run.status === "awaiting_chain" || run.status === "failed" ? (
          <button
            type="button"
            onClick={onCheck}
            disabled={busy}
            className="min-h-11 rounded-sm border border-line-strong bg-raised px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            Check again
          </button>
        ) : null}
      </div>
      {waiting ? (
        <p className="mt-3 text-sm text-info">
          Chain wait · Payment confirmation is pending ·{" "}
          {Math.max(0, Math.floor((now - Date.parse(waiting)) / 1000))} s
          elapsed
        </p>
      ) : null}
      <fieldset
        className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-secondary"
        disabled={busy || finished}
      >
        <legend className="float-left mr-3 py-1">Playback speed</legend>
        {speeds.map((speed) => (
          <label
            key={speed}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1"
          >
            <input
              type="radio"
              name="lab-speed"
              value={speed}
              checked={run.speed === speed}
              onChange={() => onSpeed(speed)}
              className="accent-ink"
            />
            {speed}×
          </label>
        ))}
      </fieldset>
      <DemoGuide
        guidance={run.guidance}
        busy={busy}
        onMode={onMode}
        onInspect={onInspect}
      />
      <p className="mt-2 text-xs text-ink-tertiary">
        Speed changes the time between trace events. Payment confirmation
        follows the network.
      </p>
    </section>
  );
}
