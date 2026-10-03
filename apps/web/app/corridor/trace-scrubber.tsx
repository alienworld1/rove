"use client";

import { useRef } from "react";
import { useDrag } from "@use-gesture/react";
import type { CorridorOperatingView } from "@rove/contracts";

export function TraceScrubber({
  run,
  committedOffsets,
  selectedOffsetMs,
  onChange,
}: {
  run: NonNullable<CorridorOperatingView["activeRun"]>;
  committedOffsets: number[];
  selectedOffsetMs: number | null;
  onChange: (offsetMs: number | null) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const selected = selectedOffsetMs ?? run.traceOffsetMs;
  const points = [
    ...new Set([
      0,
      ...committedOffsets.filter((offset) => offset <= run.traceOffsetMs),
    ]),
  ];
  const nearest = (offset: number) =>
    points.reduce(
      (best, point) =>
        Math.abs(point - offset) < Math.abs(best - offset) ? point : best,
      points[0],
    );
  const commitFromPointer = (clientX: number) => {
    const bounds = track.current?.getBoundingClientRect();
    if (!bounds || run.traceEndMs <= 0) return;
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width),
    );
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
        <button
          type="button"
          onClick={() =>
            run.faultTraceOffsetMs !== null &&
            onChange(nearest(run.faultTraceOffsetMs))
          }
          disabled={
            run.faultTraceOffsetMs === null ||
            !points.includes(run.faultTraceOffsetMs)
          }
          className="min-h-11 rounded-sm border border-line-strong px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-info disabled:text-ink-disabled"
        >
          Jump to fault
        </button>
        <button
          type="button"
          onClick={() =>
            run.recoveryTraceOffsetMs !== null &&
            onChange(nearest(run.recoveryTraceOffsetMs))
          }
          disabled={
            run.recoveryTraceOffsetMs === null ||
            !points.includes(run.recoveryTraceOffsetMs)
          }
          className="min-h-11 rounded-sm border border-line-strong px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-info disabled:text-ink-disabled"
        >
          Jump to recovery
        </button>
        {selectedOffsetMs !== null ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-11 rounded-sm border border-line px-3 py-1.5 text-xs text-ink-secondary focus-visible:outline-2 focus-visible:outline-info"
          >
            Return to live trace
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
        <div
          className="absolute top-1 h-6 w-px bg-info"
          style={{
            left: `${run.traceEndMs > 0 ? (selected / run.traceEndMs) * 100 : 0}%`,
          }}
        />
      </div>
      <input
        aria-label="Inspect recorded trace point"
        type="range"
        min={0}
        max={Math.max(1, points.length - 1)}
        step={1}
        value={points.indexOf(nearest(selected))}
        aria-valuetext={`${selected / 1000} seconds into the recorded trace`}
        onChange={(event) => onChange(points[Number(event.target.value)] ?? 0)}
        className="sr-only focus:not-sr-only focus:mt-2 focus:w-full focus:accent-info"
      />
      <p className="text-[11px] text-ink-tertiary">
        Inspection changes only the recorded view. It does not move the run or
        payment confirmation. Fault and recovery become available after they are
        recorded.
      </p>
    </section>
  );
}
