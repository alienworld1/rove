"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LabRunView } from "@rove/contracts";
import { DemoGuide } from "./demo-guide";
import { useCorridorSelection } from "./corridor/corridor-selection";
import { controlGuidance, controlRun } from "./corridor/api";
export function LiveRunControls({
  run,
  connected,
}: {
  run: LabRunView["run"];
  connected: boolean;
}) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: "play" | "pause" | "step" | "check") =>
      controlRun(run, action),
    onSuccess: (next) => {
      client.setQueryData(["run", run.id], next);
      void client.invalidateQueries({ queryKey: ["corridor"] });
    },
  });
  const guidance = useMutation({
    mutationFn: (mode: "guided" | "continuous") => controlGuidance(run, mode),
    onSuccess: (next) => client.setQueryData(["run", run.id], next),
    onError: () => {
      void client.invalidateQueries({ queryKey: ["run", run.id] });
    },
  });
  const ready = ["ready", "paused"].includes(run.status);
  return (
    <section
      aria-label="Live run controls"
      className="mt-6 border-t border-line py-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm text-ink-secondary">
          {run.status === "awaiting_chain" || run.awaiting
            ? "Waiting for Tempo confirmation"
            : run.status === "completed"
              ? "Scenario events complete. Rove is checking final totals and returning reserves for matching sessions."
              : run.status === "initializing"
                ? "Preparing payment channels…"
                : run.status === "running"
                  ? "Running on Tempo testnet"
                  : "Ready to continue"}
        </p>
        {(
          [
            run.status === "running" ? "pause" : "play",
            "step",
            "check",
          ] as const
        ).map((action) => (
          <button
            key={action}
            onClick={() => mutation.mutate(action)}
            disabled={
              !connected ||
              mutation.isPending ||
              guidance.isPending ||
              (action === "play" && !ready) ||
              (action === "step" && !ready) ||
              (action === "pause" && run.status !== "running")
            }
            className="min-h-11 rounded-sm border border-line-strong px-4 py-2 text-sm text-ink disabled:opacity-40"
          >
            {action === "play"
              ? "Continue run"
              : action === "pause"
                ? "Pause run"
                : action === "step"
                  ? "Next event"
                  : "Check payment state"}
          </button>
        ))}
      </div>
      <DemoGuide
        guidance={run.guidance}
        busy={!connected || mutation.isPending || guidance.isPending}
        onMode={(mode) => guidance.mutate(mode)}
        onInspect={(laneId, eventId) => {
          useCorridorSelection.getState().setTrace(null);
          useCorridorSelection.getState().setEvent(laneId, eventId);
        }}
      />
      {guidance.error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {guidance.error.message}
        </p>
      ) : null}
      {mutation.error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {mutation.error.message}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-ink-tertiary">
        These controls execute your scenario with testnet payments. Pause run
        holds upcoming scenario events; it is separate from a charging pause
        required by the exposure policy. Paused runs continue after 15 minutes
        without interaction so completion can proceed. Check the checklist for
        returned reserves; accounting differences can keep funds reserved.
      </p>
    </section>
  );
}
