"use client";
import { useState } from "react";
import { labScenarioSchema, type LabScenario } from "@rove/contracts";
export function LabAdvancedJson({
  scenario,
  onChange,
}: {
  scenario: LabScenario;
  onChange: (next: LabScenario) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  function apply() {
    try {
      const parsed = labScenarioSchema.parse(JSON.parse(text));
      onChange({ ...parsed, id: scenario.id });
      setError("");
    } catch {
      setError(
        "This definition could not be applied. Check its JSON format and scenario fields. Your structured draft is unchanged.",
      );
    }
  }
  return (
    <details
      className="mt-6 border-t border-line pt-4"
      onToggle={(event) => {
        if (event.currentTarget.open && !text)
          setText(JSON.stringify(scenario, null, 2));
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Advanced · Scenario JSON
      </summary>
      <p className="mt-3 text-xs text-ink-secondary">
        Import loads JSON for review. Apply JSON replaces the draft’s settings
        and events; Save scenario checks the complete scenario. Export draft
        downloads your current settings.
      </p>
      <textarea
        aria-label="Scenario JSON"
        spellCheck={false}
        rows={12}
        className="mt-3 w-full border border-line-strong bg-pure p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-info"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          className="min-h-11 border border-line px-3 text-sm"
          onClick={apply}
        >
          Apply JSON
        </button>
        <button
          className="min-h-11 border border-line px-3 text-sm"
          onClick={() => setText(JSON.stringify(scenario, null, 2))}
        >
          Load current draft
        </button>
        <label className="flex min-h-11 cursor-pointer items-center border border-line px-3 text-sm">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 70_000) {
                setError("Choose a scenario file smaller than 70 KB.");
                return;
              }
              setText(await file.text());
            }}
          />
        </label>
        <button
          className="min-h-11 border border-line px-3 text-sm"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(scenario, null, 2)], {
                type: "application/json",
              }),
            );
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${scenario.id}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export draft
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      ) : null}
    </details>
  );
}
