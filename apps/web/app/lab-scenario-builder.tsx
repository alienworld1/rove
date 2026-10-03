"use client";

import { DocsLink } from "./docs-link";

import type { LabScenario } from "@rove/contracts";
import { LabFaultEditor } from "./lab-fault-editor";
import { LabScenarioFields } from "./lab-scenario-fields";

export function LabScenarioBuilder({
  draft,
  onChange,
  onValidate,
  busy,
  issues,
}: {
  draft: string;
  onChange: (value: string) => void;
  onValidate: () => void;
  busy: boolean;
  issues: { path: string; message: string }[];
}) {
  let scenario: LabScenario | null = null;
  try {
    scenario = JSON.parse(draft) as LabScenario;
  } catch {}
  function change(next: LabScenario) {
    onChange(
      JSON.stringify(
        next.id === "northstar-voltway"
          ? { ...next, id: `scenario-${crypto.randomUUID()}` }
          : next,
        null,
        2,
      ),
    );
  }
  return (
    <details className="border-t border-line py-7">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-ink-secondary focus-visible:outline-2 focus-visible:outline-ink">
        Scenario builder
      </summary>
      <p className="mt-3 text-sm text-ink-secondary">
        Review the scenario before starting a run. Settings and source faults
        are checked before they can change a saved scenario.
      </p>
      <div className="mt-3 flex gap-4">
        <DocsLink topic="scenario">Scenario guide</DocsLink>
        <DocsLink topic="scenarioSchema">Scenario schema</DocsLink>
      </div>
      {scenario?.id === "northstar-voltway" ? (
        <p className="mt-2 text-xs text-ink-secondary">
          Changing a field creates an editable copy of this built-in scenario.
        </p>
      ) : null}
      {scenario?.lanes?.length ? (
        <>
          <LabScenarioFields scenario={scenario} onChange={change} />
          <LabFaultEditor scenario={scenario} onChange={change} />
        </>
      ) : null}
      <label
        htmlFor="lab-scenario-definition"
        className="mt-6 block text-sm font-semibold text-ink"
      >
        Scenario definition
      </label>
      <p className="mt-1 text-xs text-ink-secondary">
        Edit parties, Lane identities, policy, and trace events as structured
        data.
      </p>
      <textarea
        id="lab-scenario-definition"
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={issues.length > 0}
        aria-describedby={issues.length ? "lab-scenario-errors" : undefined}
        spellCheck={false}
        rows={18}
        className="mt-2 w-full rounded-sm border border-line-strong bg-pure p-3 font-mono text-xs leading-5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
      {issues.length ? (
        <div
          id="lab-scenario-errors"
          role="alert"
          className="mt-3 border-l-2 border-critical pl-3 text-sm text-critical"
        >
          <p>Review the highlighted settings.</p>
          <ul className="mt-2 list-disc pl-5">
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                {issue.path ? `${issue.path}: ` : ""}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onValidate}
        disabled={busy || !scenario}
        className="mt-4 rounded-sm border border-line-strong bg-ink px-4 py-2 text-sm font-semibold text-pure focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
      >
        {busy ? "Checking scenario…" : "Validate scenario"}
      </button>
    </details>
  );
}
