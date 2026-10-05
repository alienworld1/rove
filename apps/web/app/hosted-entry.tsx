"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLabNavigation } from "./lab/lab-navigation";
import { clearPrivateWorkspace } from "./workspace-access-state";
import { readHostedSession, readPublishedRuns } from "./hosted-api";
import { AppShell } from "./corridor/app-shell";
import { PrivateRunWorkspace } from "./private-run-workspace";
import { WorkspaceAccessPrompt } from "./workspace-access-prompt";

const LabWorkspace = dynamic(() =>
  import("./lab/lab-workspace").then((module) => module.LabWorkspace),
);
const HostedRunViewer = dynamic(() =>
  import("./hosted-run-viewer").then((module) => module.HostedRunViewer),
);

export function HostedEntry({ children }: { children: ReactNode }) {
  const navigation = useLabNavigation();
  const selectedRunId = navigation.runId;
  const client = useQueryClient();
  const published = useQuery({
    queryKey: ["published-runs"],
    queryFn: readPublishedRuns,
    enabled: Boolean(selectedRunId),
  });
  const session = useQuery({
    queryKey: ["hosted-session"],
    queryFn: readHostedSession,
    refetchInterval: 15_000,
  });
  const wasAuthenticated = useRef(false);
  const expiresAt = session.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(
      () => {
        client.setQueryData(["hosted-session"], {
          authenticated: false,
          expiresAt: null,
          canRun: false,
          remainingRuns: 0,
          runs: [],
        });
      },
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt, client]);
  useEffect(() => {
    if (session.data?.authenticated === true) {
      wasAuthenticated.current = true;
      return;
    }
    if (session.data?.authenticated === false && wasAuthenticated.current) {
      wasAuthenticated.current = false;
      clearPrivateWorkspace(client);
    }
  }, [session.data?.authenticated, client]);

  const authenticated = session.data?.authenticated === true;
  const isPublic = published.data?.some((run) => run.id === selectedRunId);
  const owned = Boolean(
    authenticated &&
    session.data?.runs.some((run) => run.id === selectedRunId) &&
    !isPublic,
  );
  const accessPrompt = (
    <WorkspaceAccessPrompt
      scenarioBuilder={navigation.view === "lab"}
      loading={session.isPending}
      error={session.error}
      retry={() => void session.refetch()}
    />
  );

  if (navigation.view === "corridor" && !selectedRunId) return children;
  return (
    <main className="mx-auto w-full max-w-[1720px] px-5 py-5 sm:px-8 lg:px-12">
      {navigation.view === "lab" ? (
        <>
          <AppShell hosted connection="idle" checkedAt={null} />
          {authenticated ? (
            <LabWorkspace hosted remainingRuns={session.data!.remainingRuns} />
          ) : (
            accessPrompt
          )}
        </>
      ) : navigation.view === "workspace" ? (
        <>
          <AppShell hosted connection="idle" checkedAt={null} />
          {authenticated ? (
            <PrivateRunWorkspace session={session.data!} />
          ) : (
            accessPrompt
          )}
        </>
      ) : selectedRunId && (authenticated || isPublic) ? (
        <HostedRunViewer
          key={`${selectedRunId}:${owned}`}
          runId={selectedRunId}
          owned={owned}
        />
      ) : (
        <>
          <AppShell hosted connection="idle" checkedAt={null} />
          {published.isPending || session.isPending ? (
            <p role="status" className="mt-6 text-sm text-ink-secondary">
              Checking recorded example…
            </p>
          ) : (
            accessPrompt
          )}
        </>
      )}
    </main>
  );
}
