import type { LabScenario } from "@rove/contracts";
import type { ScenarioSummary } from "./api";

export function ScenarioLaunchPanel({
  summaries,
  selectedId,
  scenario,
  busy,
  onSelect,
  onStart,
}: {
  summaries: ScenarioSummary[];
  selectedId: string;
  scenario: LabScenario | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onStart: () => void;
}) {
  return (
    <section
      className="mt-8 border-y border-line-strong py-6"
      aria-labelledby="start-corridor-title"
    >
      <div className="flex flex-wrap items-end gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
            Digital twin
          </p>
          <h1
            id="start-corridor-title"
            className="mt-1 text-3xl font-semibold text-ink"
          >
            Open a protected charging Corridor
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
            Start a controlled run to observe signed meter evidence, funded
            protection, a bounded fault, and recovery across independent
            charging Lanes.
          </p>
        </div>
        <label className="w-64 text-xs text-ink-secondary">
          Scenario
          <select
            value={selectedId}
            onChange={(event) => onSelect(event.target.value)}
            disabled={busy}
            className="mt-1 block w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-info"
          >
            {summaries.map((summary) => (
              <option key={summary.id} value={summary.id}>
                {summary.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onStart}
          disabled={busy || !scenario}
          className="rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-pure focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:bg-ink-disabled"
        >
          {busy ? "Preparing…" : "Start run"}
        </button>
      </div>
      {scenario ? (
        <details className="mt-5 border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-info">
            Scenario configuration
          </summary>
          <p className="mt-3 text-sm text-ink-secondary">
            {scenario.description}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {scenario.lanes.map((lane) => (
              <p
                key={lane.key}
                className="border-l-2 border-line-strong pl-3 text-sm text-ink-secondary"
              >
                <strong className="block text-ink">{lane.label}</strong>
                {lane.powerClass} {Number(lane.maxPowerWatts) / 1000} kW ·{" "}
                {lane.meterId}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
