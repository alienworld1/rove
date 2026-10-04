"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LabRunView } from "@rove/contracts";
import { controlRun } from "./corridor/api";
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
              ? "Protection restored. Final accounting and channel closure continue automatically."
              : run.status === "initializing"
                ? "Preparing three payment channels…"
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
              (action === "play" && !ready) ||
              (action === "step" && !ready) ||
              (action === "pause" && run.status !== "running")
            }
            className="min-h-11 rounded-sm border border-line-strong px-4 py-2 text-sm text-ink disabled:opacity-40"
          >
            {action === "play"
              ? "Continue run"
              : action === "pause"
                ? "Pause"
                : action === "step"
                  ? "Next event"
                  : "Check payment state"}
          </button>
        ))}
      </div>
      {mutation.error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {mutation.error.message}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-ink-tertiary">
        Live controls process the approved scenario. After the channels close,
        start a new run from your workspace to replay. Unattended paused runs
        continue after 15 minutes so their reserve can be returned.
      </p>
    </section>
  );
}
