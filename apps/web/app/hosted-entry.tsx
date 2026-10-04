"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { readHostedSession, readPublishedRuns } from "./hosted-api";
import { AppShell } from "./corridor/app-shell";
import { DocsLink } from "./docs-link";
import { PublishedRunList } from "./published-run-list";
import { InviteAccessForm } from "./invite-access-form";
import { PrivateRunWorkspace } from "./private-run-workspace";
import { HostedRunViewer } from "./hosted-run-viewer";
export function HostedEntry({ runId }: { runId: string | null }) {
  const client = useQueryClient();
  const published = useQuery({
    queryKey: ["published-runs"],
    queryFn: readPublishedRuns,
  });
  const session = useQuery({
    queryKey: ["hosted-session"],
    queryFn: readHostedSession,
    refetchInterval: 15_000,
  });
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
    if (session.data?.authenticated === false) {
      for (const key of [
        "run",
        "corridor",
        "corridor-trace",
        "inspector",
        "completion",
      ])
        client.removeQueries({ queryKey: [key] });
    }
  }, [session.data?.authenticated, client]);
  const owned = Boolean(
    session.data?.authenticated &&
    session.data.runs.some((run) => run.id === runId) &&
    !published.data?.some((run) => run.id === runId),
  );
  return (
    <main className="mx-auto w-full max-w-[1720px] px-5 py-5 sm:px-8 lg:px-12">
      {runId ? (
        <HostedRunViewer
          key={`${runId}:${owned}`}
          runId={runId}
          owned={owned}
        />
      ) : (
        <>
          <AppShell connection="idle" checkedAt={null} />
          <section className="py-12 sm:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary">
              Meter-backed payment protection
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Keep charging service within a funded protection boundary.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-secondary">
              Rove connects verified meter readings to rolling payment
              protection between charging networks. Follow three charging Lanes
              to see protection advance, uncertainty grow, and control intervene
              before exposure crosses its limit.
            </p>
            <nav className="mt-7 flex flex-wrap items-center gap-5 text-sm">
              <a
                href="#published-runs"
                className="min-h-11 rounded-sm bg-ink px-5 py-3 font-semibold text-pure"
              >
                Explore runs
              </a>
              <a
                href="#invite-access"
                className="min-h-11 py-3 text-ink underline"
              >
                Use an invite
              </a>
              <DocsLink>Docs</DocsLink>
            </nav>
          </section>
          {published.isPending ? (
            <p role="status" className="py-8 text-sm text-ink-secondary">
              Loading published runs…
            </p>
          ) : published.error ? (
            <div
              role="alert"
              className="border-t border-line py-8 text-sm text-ink-secondary"
            >
              <p>Published runs are unavailable right now.</p>
              <button
                onClick={() => void published.refetch()}
                className="mt-3 min-h-11 underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <PublishedRunList runs={published.data ?? []} />
          )}
          {session.data?.authenticated ? (
            <PrivateRunWorkspace session={session.data} />
          ) : null}
          <InviteAccessForm />
        </>
      )}
    </main>
  );
}
