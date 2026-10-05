"use client";
import { copyLabScenario, resequenceLabEvents } from "@rove/contracts";
import { useLabDraft } from "./lab-draft-store";
import { readScenario } from "../corridor/api";
import type { LoadedLabModel } from "./use-lab-workspace-model";
export function LabScenarioNavigation({ model }: { model: LoadedLabModel }) {
  const {
    draft,
    selectedScenario,
    setSelectedScenario,
    replace,
    report,
    summaries,
    template,
    section,
    setSection,
    setEventId,
    setLaneKey,
    lane,
    update,
  } = model;
  return (
    <aside className="border-b border-line bg-raised p-4 xl:border-r xl:border-b-0">
      <label className="block text-xs font-semibold text-ink-secondary">
        Saved scenarios
        <select
          className="mt-2 min-h-11 w-full border border-line bg-pure px-2 text-sm"
          value={selectedScenario}
          onChange={async (event) => {
            const id = event.target.value;
            if (!id) return;
            try {
              const saved = await readScenario(id);
              const editable = id.startsWith("scenario-");
              if (
                !replace(
                  editable
                    ? saved.definition
                    : copyLabScenario(
                        saved.definition,
                        `scenario-${crypto.randomUUID()}`,
                      ),
                )
              )
                return;
              if (editable)
                model.state.saved(
                  saved.digest,
                  useLabDraft.getState().revision,
                );
              setSelectedScenario(id);
            } catch (error) {
              report(error);
            }
          }}
        >
          <option value="">Choose a scenario…</option>
          {summaries.data?.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 space-y-2">
        <button
          className="min-h-11 w-full border border-line px-2 text-left text-sm"
          onClick={() => template(false)}
        >
          New scenario · Protection demo
        </button>
        <button
          className="min-h-11 w-full border border-line px-2 text-left text-sm"
          onClick={() => template(true)}
        >
          New scenario · Healthy trace
        </button>
        <button
          className="min-h-11 w-full border border-line px-2 text-left text-sm"
          onClick={() =>
            replace(copyLabScenario(draft, `scenario-${crypto.randomUUID()}`))
          }
        >
          Edit a copy
        </button>
      </div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-ink-tertiary">
        Configure
      </p>
      <button
        aria-pressed={section === "corridor"}
        className={`mt-2 min-h-11 w-full px-3 text-left text-sm ${section === "corridor" ? "bg-selection font-semibold" : ""}`}
        onClick={() => {
          setSection("corridor");
          setEventId(null);
        }}
      >
        Corridor policy
      </button>
      {draft.lanes.map((item) => (
        <button
          key={item.key}
          aria-pressed={section === "lane" && lane?.key === item.key}
          className={`min-h-11 w-full px-3 text-left text-sm ${section === "lane" && lane?.key === item.key ? "bg-selection font-semibold" : ""}`}
          onClick={() => {
            setLaneKey(item.key);
            setSection("lane");
            setEventId(null);
          }}
        >
          {item.label}
          <span className="ml-2 font-mono text-xs text-ink-tertiary">
            {item.powerClass}
          </span>
        </button>
      ))}
      <button
        disabled={draft.lanes.length >= 3}
        className="mt-3 min-h-11 w-full border border-line px-3 text-left text-sm disabled:opacity-40"
        onClick={() => {
          const suffix = crypto.randomUUID();
          const key = `lane-${suffix}`;
          const base = draft.lanes[0];
          update({
            ...draft,
            lanes: [
              ...draft.lanes,
              {
                ...base,
                key,
                label: `Lane ${draft.lanes.length + 1}`,
                meterId: `meter-${suffix}`,
                chargerId: `charger-${suffix}`,
                sessionId: `session-${suffix}`,
              },
            ],
            events: resequenceLabEvents([
              ...draft.events,
              {
                id: `start-${suffix}`,
                laneKey: key,
                traceOffsetMs: 0,
                sequence: 10_000,
                type: "session_start",
                parameters: {},
                durationMs: null,
              },
            ]),
          });
          setLaneKey(key);
          setEventId(null);
          setSection("lane");
        }}
      >
        + Add Lane
      </button>
    </aside>
  );
}
