"use client";
import { useDrag } from "@use-gesture/react";
import { labEventLabels, type LabScenarioEvent } from "@rove/contracts";
export function LabTimelineMarker({
  event,
  duration,
  selected,
  onSelect,
  onMove,
}: {
  event: LabScenarioEvent;
  duration: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (offset: number) => void;
}) {
  const bind = useDrag(
    ({ movement: [x], last, tap, event: pointer }) => {
      if (last && !tap) {
        const width =
          (
            pointer.currentTarget as HTMLElement
          ).parentElement?.getBoundingClientRect().width ?? 1;
        onMove(
          Math.max(
            0,
            Math.min(
              3_600_000,
              Math.round(event.traceOffsetMs + (x / width) * duration),
            ),
          ),
        );
      }
    },
    { filterTaps: true },
  );
  const fault = [
    "corrupt_signature",
    "wrong_meter",
    "replay_reading",
    "sequence_break",
    "evidence_gap",
    "signer_unavailable",
    "top_up_failure",
    "tempo_unavailable",
  ].includes(event.type);
  const recovery = [
    "recovery_reading",
    "signer_restored",
    "tempo_restored",
  ].includes(event.type);
  return (
    <button
      {...bind()}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${labEventLabels[event.type]} at ${event.traceOffsetMs / 1000} seconds. Select to edit timing.`}
      title={`${labEventLabels[event.type]} · ${event.traceOffsetMs / 1000}s`}
      style={{
        left: `${(event.traceOffsetMs / duration) * 100}%`,
        touchAction: "none",
      }}
      className={`absolute top-5 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info ${selected ? "bg-info-soft outline-2 outline-info" : "hover:bg-selection"} ${fault ? "text-critical" : recovery ? "text-protected" : "text-ink-secondary"}`}
    >
      <span
        className={`block ${fault ? "h-3 w-3 rotate-45 bg-current" : recovery ? "h-4 w-1 bg-current" : "h-2 w-2 rounded-full bg-current"}`}
        aria-hidden="true"
      />
    </button>
  );
}
