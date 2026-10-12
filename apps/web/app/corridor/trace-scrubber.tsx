"use client";
import { milestoneLabels } from "../demo-guide";

import { useEffect, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import type { CorridorOperatingView } from "@rove/contracts";

export function TraceScrubber({
  run,
  committedOffsets,
  selectedOffsetMs,
  onChange,
  onInspect,
  recorded = false,
  pauseOffsetMs = null,
}: {
  run: NonNullable<CorridorOperatingView["activeRun"]>;
  committedOffsets: number[];
  selectedOffsetMs: number | null;
  onChange: (offsetMs: number | null) => void;
  onInspect: (laneId: string, eventId: string) => void;
  recorded?: boolean;
  pauseOffsetMs?: number | null;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const selected = selectedOffsetMs ?? run.traceOffsetMs;
  const points = [
    ...new Set([
      0,
      ...committedOffsets.filter((offset) => offset <= run.traceOffsetMs),
    ]),
  ];
  points.sort((a, b) => a - b);
  const nearest = (offset: number) =>
    points.reduce(
      (best, point) =>
        Math.abs(point - offset) < Math.abs(best - offset) ? point : best,
      points[0],
    );
  const faultMilestone = run.guidance?.reached.find(
    (item) => item.id === "rejected",
  );
  const recoveryMilestone = run.guidance?.reached.find(
    (item) => item.id === "recovered",
  );
  const pauseMilestone = run.guidance?.reached.find(
    (item) => item.id === "pause",
  );
  const nextOffset = points.find((point) => point > selected);
  useEffect(() => {
    if (!playing || !recorded) return;
    const timer = window.setTimeout(() => {
      if (nextOffset === undefined) setPlaying(false);
      else onChange(nextOffset);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playing, recorded, nextOffset, onChange]);
  const commitFromPointer = (clientX: number) => {
    const bounds = track.current?.getBoundingClientRect();
    if (!bounds || run.traceEndMs <= 0) return;
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width),
    );
    setPlaying(false);
    onChange(nearest(Math.round(ratio * run.traceEndMs)));
  };
  const bind = useDrag(({ xy: [clientX] }) => commitFromPointer(clientX), {
    axis: "x",
    pointer: { touch: true },
  });
  return (
    <section
      aria-label="Recorded trace"
      className="border-b border-line-strong py-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-xs text-ink-secondary">
          Inspect recorded trace ·{" "}
          <span className="font-mono tabular-nums text-ink">
            {new Date(selected).toISOString().slice(14, 23)}
          </span>
        </p>
        {recorded ? (
          <button
            type="button"
            onClick={() => {
              if (!playing && nextOffset === undefined) onChange(points[0]);
              setPlaying(!playing);
            }}
            className="min-h-11 rounded-sm border border-line-strong px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-info"
          >
            {playing ? "Pause recording" : "Play recording"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            if (faultMilestone)
              onInspect(faultMilestone.laneId, faultMilestone.eventId);
            else if (run.faultTraceOffsetMs !== null)
              onChange(nearest(run.faultTraceOffsetMs));
          }}
          disabled={
            !faultMilestone &&
            (run.faultTraceOffsetMs === null ||
              !points.includes(run.faultTraceOffsetMs))
          }
          className="min-h-11 rounded-sm border border-line-strong px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-info disabled:text-ink-disabled"
        >
          Jump to fault
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            if (recoveryMilestone)
              onInspect(recoveryMilestone.laneId, recoveryMilestone.eventId);
            else if (run.recoveryTraceOffsetMs !== null)
              onChange(nearest(run.recoveryTraceOffsetMs));
          }}
          disabled={
            !recoveryMilestone &&
            (run.recoveryTraceOffsetMs === null ||
              !points.includes(run.recoveryTraceOffsetMs))
          }
          className="min-h-11 rounded-sm border border-line-strong px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-info disabled:text-ink-disabled"
        >
          Jump to recovery
        </button>
        <button
          type="button"
          disabled={
            !pauseMilestone &&
            (pauseOffsetMs === null || !points.includes(pauseOffsetMs))
          }
          onClick={() => {
            setPlaying(false);
            if (pauseMilestone)
              onInspect(pauseMilestone.laneId, pauseMilestone.eventId);
            else if (pauseOffsetMs !== null) onChange(pauseOffsetMs);
          }}
          className="min-h-11 rounded-sm border border-line-strong px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-info disabled:text-ink-disabled"
        >
          Jump to pause
        </button>
        {selectedOffsetMs !== null ? (
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              onChange(null);
            }}
            className="min-h-11 rounded-sm border border-line px-3 py-1.5 text-xs text-ink-secondary focus-visible:outline-2 focus-visible:outline-info"
          >
            {recorded ? "Show completed run" : "Return to live trace"}
          </button>
        ) : null}
      </div>
      <div
        {...bind()}
        ref={track}
        className="relative mt-3 h-8 touch-none cursor-ew-resize"
        aria-hidden="true"
      >
        <div className="absolute left-0 right-0 top-3.5 h-px bg-line-strong" />
        {(run.guidance?.reached ?? []).map((item) => (
          <span
            key={item.id}
            title={milestoneLabels[item.id]}
            className="absolute top-2 h-3 w-1 bg-ink-secondary"
            style={{
              left: `${run.traceEndMs > 0 ? (item.traceOffsetMs / run.traceEndMs) * 100 : 0}%`,
            }}
          />
        ))}
        <div
          className="absolute top-1 h-6 w-px bg-info"
          style={{
            left: `${run.traceEndMs > 0 ? (selected / run.traceEndMs) * 100 : 0}%`,
          }}
        />
      </div>
      <nav
        aria-label="Recorded milestones"
        className="mb-2 flex flex-wrap gap-2"
      >
        {(run.guidance?.reached ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setPlaying(false);
              onInspect(item.laneId, item.eventId);
            }}
            className="min-h-11 border-b border-line px-2 text-xs text-ink-secondary focus-visible:outline-2 focus-visible:outline-info"
          >
            {milestoneLabels[item.id]} · {item.traceOffsetMs / 1000}s
          </button>
        ))}
      </nav>
      <input
        aria-label="Inspect recorded trace point"
        type="range"
        min={0}
        max={Math.max(1, points.length - 1)}
        step={1}
        value={points.indexOf(nearest(selected))}
        aria-valuetext={`${selected / 1000} seconds into the recorded trace`}
        onChange={(event) => {
          setPlaying(false);
          onChange(points[Number(event.target.value)] ?? 0);
        }}
        className="sr-only focus:not-sr-only focus:mt-2 focus:w-full focus:accent-info"
      />
      <p className="text-[11px] text-ink-tertiary">
        The timeline shows recorded session states. Selecting a point opens that
        moment for inspection without changing the running scenario or its
        payments. Fault, pause, and recovery shortcuts become available when
        those events have been recorded.
      </p>
    </section>
  );
}
