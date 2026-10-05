"use client";
import { navigateLab } from "./lab/lab-navigation";
import Link from "next/link";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { HostedSession } from "@rove/contracts";
import { startHostedRun } from "./hosted-api";
import { CorridorApiError } from "./corridor/api";
export function PrivateRunWorkspace({ session }: { session: HostedSession }) {
  const intent = useRef<string | null>(null);
  const client = useQueryClient();
  const start = useMutation({
    mutationFn: () => {
      intent.current ??= crypto.randomUUID();
      return startHostedRun(intent.current);
    },
    onSuccess: (run) => {
      intent.current = null;
      client.setQueryData(["run", run.run.id], run);
      void client.invalidateQueries({ queryKey: ["hosted-session"] });
      navigateLab("corridor", { run: run.run.id });
    },
    onError: (error) => {
      if (
        error instanceof CorridorApiError &&
        [400, 403, 404, 409].includes(error.status)
      )
        intent.current = null;
      if (error instanceof CorridorApiError && error.status === 403) {
        client.removeQueries({ queryKey: ["run"] });
        client.removeQueries({ queryKey: ["corridor"] });
      }
      void client.invalidateQueries({ queryKey: ["hosted-session"] });
    },
  });
  return (
    <section
      className="border-t border-line-strong py-8"
      aria-labelledby="workspace-title"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h1
          id="workspace-title"
          className="text-3xl font-semibold tracking-tight text-ink"
        >
          Your workspace
        </h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
        Run three independent simulated charging sessions with signed meter
        readings and real Tempo testnet payments. The approved scenario shows an
        invalid reading, a protection pause, and recovery.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          onClick={() => start.mutate()}
          disabled={start.isPending || !session.canRun}
          className="min-h-11 rounded-sm bg-ink px-5 py-2 text-sm font-semibold text-pure disabled:opacity-50"
        >
          {start.isPending ? "Preparing…" : "Run on Tempo testnet"}
        </button>
        <button
          className="min-h-11 border border-line-strong px-4 text-sm font-semibold"
          onClick={() => navigateLab("lab")}
        >
          Build a custom scenario
        </button>
        <p className="text-sm text-ink-secondary">
          {session.remainingRuns} {session.remainingRuns === 1 ? "run" : "runs"}{" "}
          remaining · Each new run uses your allowance.
        </p>
      </div>
      {!session.canRun ? (
        <p role="status" className="mt-4 text-sm text-ink-secondary">
          You can still inspect your existing examples. Starting another
          scenario requires available run allowance and funded test assets.
        </p>
      ) : null}
      {start.error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {start.error.message}
          {!(start.error instanceof CorridorApiError) ||
          start.error.status >= 500
            ? " Retry to check the same request safely."
            : ""}
        </p>
      ) : null}
      <ul className="mt-6 divide-y divide-line">
        {session.runs.map((run) => (
          <li
            key={run.id}
            className="flex flex-wrap justify-between gap-3 py-3 text-sm"
          >
            <Link
              href={`/?run=${encodeURIComponent(run.id)}`}
              className="text-ink underline"
            >
              Open scenario · {new Date(run.createdAt).toLocaleString()}
            </Link>
            <span className="text-ink-secondary">
              {run.status.replaceAll("_", " ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
