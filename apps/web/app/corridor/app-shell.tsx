"use client";
import { navigateLab, useLabNavigation } from "../lab/lab-navigation";
import { DocsLink } from "../docs-link";
import type { ConnectionState } from "./use-corridor-stream";
import { MotionPreferenceToggle } from "./motion-preference-toggle";

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
}: {
  connection: ConnectionState | "idle" | "recorded";
  checkedAt: string | null;
}) {
  const navigation = useLabNavigation();
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line-strong pb-4">
      <div className="flex items-baseline gap-4">
        <p className="text-2xl font-semibold tracking-tight text-ink">Rove</p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary">
          Charging assurance
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-ink-secondary">
        <nav
          aria-label="Main navigation"
          className="flex items-center gap-3 text-sm"
        >
          <button
            className="min-h-11 px-2 aria-[current=page]:font-semibold"
            aria-current={navigation.view === "corridor" ? "page" : undefined}
            onClick={() => navigateLab("corridor", { copy: null })}
          >
            Corridor
          </button>
          <button
            className="min-h-11 px-2 aria-[current=page]:font-semibold"
            aria-current={navigation.view === "lab" ? "page" : undefined}
            onClick={() => navigateLab("lab", { copy: null })}
          >
            Lab
          </button>
          <DocsLink>Docs</DocsLink>
        </nav>
        <MotionPreferenceToggle />
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-current"
          data-state={connection}
          aria-hidden="true"
        />
        <span>{connectionCopy[connection]}</span>
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
