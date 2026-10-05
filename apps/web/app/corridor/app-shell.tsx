"use client";
import { navigateLab, useLabNavigation } from "../lab/lab-navigation";
import { DocsLink } from "../docs-link";
import type { ConnectionState } from "./use-corridor-stream";
import { MotionPreferenceToggle } from "./motion-preference-toggle";
import Link from "next/link";
import { EndAccessButton } from "../end-access-button";

const connectionCopy: Record<ConnectionState | "idle" | "recorded", string> = {
  idle: "Ready",
  recorded: "Recorded",
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  stale: "Updates unavailable",
};

export function AppShell({
  connection,
  checkedAt,
  hosted = false,
}: {
  connection: ConnectionState | "idle" | "recorded";
  checkedAt: string | null;
  hosted?: boolean;
}) {
  const navigation = useLabNavigation();
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line-strong pb-4">
      <div className="flex items-baseline gap-4">
        <Link
          href="/"
          aria-label="Rove home"
          className="text-2xl font-semibold tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-info"
        >
          Rove
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary">
          Charging assurance
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-ink-secondary">
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-3 text-sm"
        >
          {hosted ? (
            <Link
              href="/"
              className="inline-flex min-h-11 items-center px-2 focus-visible:outline-2 focus-visible:outline-info"
            >
              Home
            </Link>
          ) : null}
          {hosted ? (
            <Link
              href="/?view=workspace"
              aria-current={
                navigation.view === "workspace" ? "page" : undefined
              }
              className="inline-flex min-h-11 items-center px-2 aria-[current=page]:font-semibold focus-visible:outline-2 focus-visible:outline-info"
            >
              Your workspace
            </Link>
          ) : (
            <button
              className="min-h-11 px-2 aria-[current=page]:font-semibold"
              aria-current={navigation.view === "corridor" ? "page" : undefined}
              onClick={() => navigateLab("corridor", { copy: null })}
            >
              Corridor
            </button>
          )}
          <button
            className="min-h-11 px-2 aria-[current=page]:font-semibold"
            aria-current={navigation.view === "lab" ? "page" : undefined}
            onClick={() => navigateLab("lab", { copy: null })}
          >
            {hosted ? "Scenario builder" : "Lab"}
          </button>
          <DocsLink>Docs</DocsLink>
        </nav>
        {hosted ? <EndAccessButton /> : null}
        <MotionPreferenceToggle />
        {connection !== "idle" ? (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-current"
              data-state={connection}
              aria-hidden="true"
            />
            <span>{connectionCopy[connection]}</span>
          </>
        ) : null}
        {checkedAt ? (
          <time
            dateTime={checkedAt}
            className="whitespace-nowrap tabular-nums text-ink-tertiary"
          >
            Checked{" "}
            {new Date(checkedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </time>
        ) : null}
      </div>
    </header>
  );
}
