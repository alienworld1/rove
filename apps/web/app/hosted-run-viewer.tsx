"use client";
import { navigateLab } from "./lab/lab-navigation";
import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { readRun, readCorridor } from "./corridor/api";
import { AppShell } from "./corridor/app-shell";
import { CorridorViewport } from "./corridor/corridor-viewport";
import { CorridorSkeleton } from "./corridor/corridor-skeleton";
import { SourceDisclosure } from "./corridor/source-disclosure";
import { SessionCompletionPanel } from "./corridor/session-completion-panel";
import { useCorridorStream } from "./corridor/use-corridor-stream";
import { useCorridorSelection } from "./corridor/corridor-selection";
import { LiveRunControls } from "./live-run-controls";
export function HostedRunViewer({
  runId,
  owned,
}: {
  runId: string;
  owned: boolean;
}) {
  const replace = useCorridorSelection((state) => state.replace);
  useEffect(() => {
    const sync = () => {
      const url = new URL(window.location.href);
      const trace = url.searchParams.get("trace");
      replace(
        url.searchParams.get("lane"),
        url.searchParams.get("event"),
        trace && /^[0-9]+$/.test(trace) ? Number(trace) : null,
      );
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [replace, runId]);
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: ({ signal }) => readRun(runId, signal),
    refetchInterval: (query) =>
      owned && query.state.data?.run.status === "initializing" ? 1500 : false,
  });
  const corridorId = run.data?.lanes.find((lane) => lane.projection)?.projection
    ?.corridorId;
  const corridor = useQuery({
    queryKey: ["corridor", corridorId],
    queryFn: ({ signal }) => readCorridor(corridorId!, signal),
    enabled: Boolean(corridorId),
  });
  const recorded = run.data?.recorded === true;
  const live = owned && !recorded;
  const stream = useCorridorStream(
    live && corridor.data ? corridorId! : null,
    live ? runId : null,
    corridor.data?.projectionVersion ?? 0,
  );
  const current =
    recorded ||
    (live && stream.connection === "live" && !corridor.isError && !run.isError);
  return (
    <>
      <AppShell
        connection={
          live ? stream.connection : recorded ? "recorded" : "connecting"
        }
        checkedAt={corridor.data?.checkedAt ?? null}
      />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="min-h-11 text-sm text-ink underline">
          Explore runs and workspace
        </Link>
        <button
          className="min-h-11 border border-line-strong px-4 text-sm font-semibold"
          onClick={() => navigateLab("lab", { copy: runId })}
        >
          Edit a copy in Lab
        </button>
        <p className="text-sm text-ink-secondary">
          {live
            ? "Private workspace · Tempo testnet"
            : recorded
              ? "Recorded run · Read-only analysis"
              : "Checking workspace access"}
        </p>
      </div>
      {run.isPending || (corridorId && corridor.isPending) ? (
        <CorridorSkeleton />
      ) : null}
      {run.error || corridor.error ? (
        <div
          role="alert"
          className="mt-6 border-l-4 border-risk bg-risk-faint p-4 text-sm text-ink"
        >
          <p>{run.error?.message ?? corridor.error?.message}</p>
          <button
            onClick={() => {
              void run.refetch();
              void corridor.refetch();
            }}
            className="mt-3 min-h-11 underline"
          >
            Try again
          </button>
          <p className="mt-2">
            <Link href="/" className="underline">
              Return to published runs or use an invite
            </Link>
          </p>
        </div>
      ) : null}
      {run.data && !corridorId ? (
        <p role="status" className="py-12 text-sm text-ink-secondary">
          Preparing your Corridor. You can leave this page and resume the same
          run from your workspace.
        </p>
      ) : null}
      {corridor.data ? (
        <>
          <SourceDisclosure environment={corridor.data.environment} />
          {live && !current ? (
            <p
              role="status"
              className="mt-4 border-l-4 border-risk bg-risk-faint p-3 text-sm text-risk-deep"
            >
              Live updates are unavailable. Showing the last checked state;
              actions resume when current reads succeed.
            </p>
          ) : null}
          <CorridorViewport
            view={corridor.data}
            current={current}
            recorded={recorded}
          />
          <SessionCompletionPanel
            view={corridor.data}
            connected={current}
            readOnly={!live}
          />
          {live && run.data ? (
            <LiveRunControls run={run.data.run} connected={current} />
          ) : null}
          {recorded ? (
            <p className="mt-5 text-sm text-ink-secondary">
              Select a Lane or event to inspect its evidence and payment record.
              Use the trace timeline to analyze committed states; the original
              run remains unchanged.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
