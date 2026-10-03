import { DocsLink } from "../docs-link";
import type { ConnectionState } from "./use-corridor-stream";
import { MotionPreferenceToggle } from "./motion-preference-toggle";

const connectionCopy: Record<ConnectionState | "idle", string> = {
  idle: "Ready",
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  stale: "Updates unavailable",
};

export function AppShell({
  connection,
  checkedAt,
}: {
  connection: ConnectionState | "idle";
  checkedAt: string | null;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line-strong pb-4">
      <div className="flex items-baseline gap-4">
        <p className="text-2xl font-semibold tracking-tight text-ink">Rove</p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary">
          Charging assurance
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-secondary">
        <DocsLink>Docs</DocsLink>
        <MotionPreferenceToggle />
        <span
          className="h-2 w-2 rounded-full bg-current"
          data-state={connection}
          aria-hidden="true"
        />
        <span>{connectionCopy[connection]}</span>
        {checkedAt ? (
          <time dateTime={checkedAt} className="tabular-nums text-ink-tertiary">
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
