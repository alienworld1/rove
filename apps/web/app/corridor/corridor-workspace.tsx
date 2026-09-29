"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { idSchema, labScenarioSchema } from "@rove/contracts";
import { AppShell } from "./app-shell";
import {
  controlRun,
  CorridorApiError,
  readCorridor,
  readRun,
  readScenario,
  readScenarios,
  saveScenario,
  startRun,
} from "./api";
import { CorridorSkeleton } from "./corridor-skeleton";
import { CorridorErrorState } from "./corridor-error-state";
import { ControlledSessionGate } from "./controlled-session-gate";
import { CorridorViewport } from "./corridor-viewport";
import { ScenarioLaunchPanel } from "./scenario-launch-panel";
import { SourceDisclosure } from "./source-disclosure";
import { useCorridorStream } from "./use-corridor-stream";
import { useCorridorSelection } from "./corridor-selection";
import { LabPlaybackControls } from "../lab-playback-controls";
import { LabScenarioBuilder } from "../lab-scenario-builder";

function validId(value: string | null) {
  return value && idSchema.safeParse(value).success ? value : null;
}

export function CorridorWorkspace({
  controlledMode,
  initialRunId,
  initialScenarioId,
  initialCorridorId,
}: {
  controlledMode: boolean;
  initialRunId: string | null;
  initialScenarioId: string | null;
  initialCorridorId: string | null;
}) {
  const queryClient = useQueryClient();
  const replaceSelection = useCorridorSelection((state) => state.replace);
  const [runId, setRunId] = useState(initialRunId);
  const [scenarioId, setScenarioId] = useState(initialScenarioId ?? "");
  const [urlCorridorId, setUrlCorridorId] = useState(initialCorridorId);
  const [message, setMessage] = useState("");
  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [savedDigest, setSavedDigest] = useState<string | null>(null);
  const summaries = useQuery({
    queryKey: ["scenarios"],
    queryFn: readScenarios,
  });
  const effectiveScenarioId = scenarioId || summaries.data?.[0]?.id || "";
  const scenario = useQuery({
    queryKey: ["scenario", effectiveScenarioId],
    queryFn: () => readScenario(effectiveScenarioId),
    enabled: effectiveScenarioId.length > 0 && runId === null,
  });
  const draft =
    draftOverride ??
    (scenario.data ? JSON.stringify(scenario.data.definition, null, 2) : "");
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => readRun(runId!),
    enabled: runId !== null,
    refetchInterval: (query) =>
      query.state.data?.run.status === "initializing" ? 1_500 : false,
  });
  const corridorId = useMemo(
    () =>
      run.data?.lanes.find((lane) => lane.projection)?.projection?.corridorId ??
      urlCorridorId,
    [run.data, urlCorridorId],
  );
  const corridor = useQuery({
    queryKey: ["corridor", corridorId],
    queryFn: ({ signal }) => readCorridor(corridorId!, signal),
    enabled: corridorId !== null,
  });
  const realtime = useCorridorStream(
    corridorId,
    runId,
    corridor.data?.projectionVersion ?? 0,
  );
  const start = useMutation({
    mutationFn: () => {
      const definition = savedDigest
        ? labScenarioSchema.parse(JSON.parse(draft) as unknown)
        : scenario.data!.definition;
      return startRun(definition, savedDigest ?? scenario.data!.digest);
    },
    onSuccess: (next) => {
      setRunId(next.run.id);
      queryClient.setQueryData(["run", next.run.id], next);
      const nextCorridorId = next.lanes.find((lane) => lane.projection)
        ?.projection?.corridorId;
      const url = new URL(window.location.href);
      url.searchParams.set("run", next.run.id);
      url.searchParams.set("scenario", next.scenario.id);
      if (nextCorridorId) url.searchParams.set("corridor", nextCorridorId);
      setUrlCorridorId(nextCorridorId ?? null);
      window.history.pushState(null, "", url);
      setMessage("Run ready");
    },
    onError: (error) =>
      setMessage(
        error instanceof Error ? error.message : "This run couldn't start.",
      ),
  });
  const validate = useMutation({
    mutationFn: () => saveScenario(JSON.parse(draft) as unknown),
    onSuccess: async (saved) => {
      setSavedDigest(saved.digest);
      setIssues([]);
      setMessage("Scenario ready");
      await queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
    onError: (error) => {
      const detail = error as Error & {
        issues?: { path: string; message: string }[];
      };
      setIssues(
        detail.issues ?? [
          {
            path: "definition",
            message:
              error instanceof SyntaxError
                ? "Check the scenario format."
                : detail.message,
          },
        ],
      );
      setMessage("Review the scenario settings.");
    },
  });
  const transport = useMutation({
    mutationFn: ({
      action,
      speed,
    }: {
      action: "play" | "pause" | "step" | "reset" | "check" | "speed";
      speed?: number;
    }) => controlRun(run.data!.run, action, speed),
    onSuccess: (next, variables) => {
      if (next.run.id !== runId) {
        setRunId(next.run.id);
        const url = new URL(window.location.href);
        url.searchParams.set("run", next.run.id);
        const nextCorridorId = next.lanes.find((lane) => lane.projection)
          ?.projection?.corridorId;
        if (nextCorridorId) {
          url.searchParams.set("corridor", nextCorridorId);
          setUrlCorridorId(nextCorridorId);
        }
        window.history.pushState(null, "", url);
      }
      queryClient.setQueryData(["run", next.run.id], next);
      void queryClient.invalidateQueries({ queryKey: ["corridor"] });
      setMessage(
        next.run.status === "completed"
          ? "Protection restored"
          : variables.action === "play"
            ? "Running"
            : variables.action === "pause"
              ? "Paused"
              : variables.action === "step"
                ? "One recorded event committed"
                : variables.action === "speed"
                  ? "Playback speed updated"
                  : variables.action === "check"
                    ? "Latest payment state checked"
                    : "Replay ready",
      );
    },
    onError: async (error) => {
      setMessage(
        error instanceof CorridorApiError && error.status === 409
          ? "This run changed. Latest state loaded."
          : error instanceof Error
            ? error.message
            : "This run couldn't continue.",
      );
      if (runId)
        await queryClient.invalidateQueries({ queryKey: ["run", runId] });
      if (corridorId)
        await queryClient.invalidateQueries({
          queryKey: ["corridor", corridorId],
        });
    },
  });
  useEffect(() => {
    const syncSelection = () => {
      const url = new URL(window.location.href);
      const trace = url.searchParams.get("trace");
      replaceSelection(
        url.searchParams.get("lane"),
        url.searchParams.get("event"),
        trace && /^[0-9]+$/.test(trace) ? Number(trace) : null,
      );
      setRunId(validId(url.searchParams.get("run")));
      setUrlCorridorId(validId(url.searchParams.get("corridor")));
    };
    syncSelection();
    window.addEventListener("popstate", syncSelection);
    return () => window.removeEventListener("popstate", syncSelection);
  }, [replaceSelection]);

  const denied = [
    summaries.error,
    scenario.error,
    run.error,
    corridor.error,
  ].some((error) => error instanceof CorridorApiError && error.status === 403);
  const stale = realtime.connection === "stale";
  const loadingRun = runId !== null && (run.isLoading || corridor.isLoading);
  return (
    <main className="mx-auto w-full max-w-[1720px] px-5 py-5 sm:px-8 lg:px-12">
      <AppShell
        connection={corridorId ? realtime.connection : "idle"}
        checkedAt={corridor.data?.checkedAt ?? null}
      />
      {denied ? (
        controlledMode ? (
          <ControlledSessionGate
            onConnected={() => void queryClient.invalidateQueries()}
          />
        ) : (
          <p className="py-20 text-center text-sm text-ink-secondary">
            This Corridor isn&apos;t available in this session.
          </p>
        )
      ) : runId === null ? (
        summaries.isLoading || scenario.isLoading ? (
          <CorridorSkeleton />
        ) : summaries.error || scenario.error ? (
          <CorridorErrorState
            message="The Corridor couldn't load right now. Please try again."
            onRetry={() => {
              void summaries.refetch();
              void scenario.refetch();
            }}
          />
        ) : summaries.data?.length ? (
          <>
            <ScenarioLaunchPanel
              summaries={summaries.data}
              selectedId={effectiveScenarioId}
              scenario={scenario.data?.definition ?? null}
              busy={start.isPending}
              onSelect={(id) => {
                setScenarioId(id);
                setDraftOverride(null);
                setSavedDigest(null);
                setIssues([]);
                const url = new URL(window.location.href);
                url.searchParams.set("scenario", id);
                window.history.replaceState(null, "", url);
              }}
              onStart={() => {
                if (draftOverride !== null && savedDigest === null) {
                  setMessage("Validate your changes before starting the run.");
                  return;
                }
                start.mutate();
              }}
            />
            <LabScenarioBuilder
              draft={draft}
              onChange={(value) => {
                setDraftOverride(value);
                setSavedDigest(null);
              }}
              onValidate={() => validate.mutate()}
              busy={validate.isPending}
              issues={issues}
            />
          </>
        ) : (
          <p className="py-20 text-center text-sm text-ink-secondary">
            No active charging Lanes.
          </p>
        )
      ) : loadingRun ? (
        <CorridorSkeleton />
      ) : run.error && !run.data ? (
        <CorridorErrorState
          message="This run couldn't load right now. Please try again."
          onRetry={() => void run.refetch()}
        />
      ) : corridor.error && !corridor.data ? (
        <CorridorErrorState
          message="Corridor state couldn't be refreshed."
          onRetry={() => void corridor.refetch()}
        />
      ) : corridor.data ? (
        <>
          <SourceDisclosure environment={corridor.data.environment} />
          {stale || corridor.error ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-risk bg-risk-faint px-4 py-3 text-sm text-risk-deep">
              <p>
                Live updates are unavailable. Values last checked{" "}
                {new Date(corridor.data.checkedAt).toLocaleTimeString()}.
              </p>
              <button
                type="button"
                onClick={() =>
                  void Promise.all([corridor.refetch(), run.refetch()])
                }
                className="rounded-sm border border-risk px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-risk"
              >
                Check latest state
              </button>
            </div>
          ) : null}
          <CorridorViewport view={corridor.data} />
          {run.data ? (
            <LabPlaybackControls
              run={run.data.run}
              busy={
                transport.isPending ||
                realtime.connection === "reconnecting" ||
                stale
              }
              onAction={(action) => transport.mutate({ action })}
              onSpeed={(speed) => transport.mutate({ action: "speed", speed })}
              onCheck={() => transport.mutate({ action: "check" })}
            />
          ) : null}
          <details className="mt-8 border-t border-line-strong pt-5">
            <summary className="cursor-pointer text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-info">
              Environment and scenario
            </summary>
            <p className="mt-3 max-w-3xl text-sm text-ink-secondary">
              {run.data?.scenario.description}
            </p>
          </details>
        </>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className="mt-4 min-h-5 text-sm text-ink-secondary"
      >
        {realtime.restored
          ? "Live updates restored"
          : run.data?.run.status === "completed"
            ? "Scenario completed through recovery."
            : message}
      </p>
    </main>
  );
}
