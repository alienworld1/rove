"use client";
import { CorridorApiError } from "../corridor/api";
import { ControlledSessionGate } from "../corridor/controlled-session-gate";
import { LabTimeline } from "./lab-timeline";
import { LabReadingGenerator } from "./lab-reading-generator";
import { LabAdvancedJson } from "./lab-advanced-json";
import { LabWorkspaceToolbar } from "./lab-workspace-toolbar";
import { LabScenarioNavigation } from "./lab-scenario-navigation";
import { LabSettingsInspector } from "./lab-settings-inspector";
import { useLabWorkspaceModel } from "./use-lab-workspace-model";
export function LabWorkspace({
  hosted = false,
  remainingRuns,
}: {
  hosted?: boolean;
  remainingRuns?: number;
}) {
  const model = useLabWorkspaceModel({ hosted, remainingRuns });
  const {
    client,
    summaries,
    source,
    copy,
    draft,
    update,
    lane,
    eventId,
    setLaneKey,
    setEventId,
    setSection,
    addEvent,
  } = model;
  if (
    !hosted &&
    [summaries.error, source.error].some(
      (error) => error instanceof CorridorApiError && error.status === 403,
    )
  )
    return (
      <ControlledSessionGate
        onConnected={() => void client.invalidateQueries()}
      />
    );
  if (!draft)
    return (
      <section className="py-16">
        <h1 className="text-3xl font-semibold">Rove Lab</h1>
        <p role="status" className="mt-4 text-sm">
          {summaries.error?.message ??
            source.error?.message ??
            copy.error?.message ??
            (summaries.data?.length === 0
              ? "No starting scenario is available yet."
              : "Loading your scenario workspace…")}
        </p>
        <button
          className="mt-4 min-h-11 underline"
          onClick={() => {
            void summaries.refetch();
            void source.refetch();
            void copy.refetch();
          }}
        >
          Try again
        </button>
      </section>
    );
  const loaded = { ...model, draft, lane: lane! };
  return (
    <section className="pt-6" aria-label="Lab scenario authoring">
      <LabWorkspaceToolbar
        model={loaded}
        hosted={hosted}
        remainingRuns={remainingRuns}
      />
      <fieldset
        disabled={model.busy}
        className="grid min-w-0 border-y border-line-strong xl:grid-cols-[200px_minmax(0,1fr)_320px]"
      >
        <LabScenarioNavigation model={loaded} />
        <div className="min-w-0 p-5">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-ink-secondary">
              Scenario name
              <input
                id="field-name"
                className="mt-1 min-h-11 w-full border border-line bg-pure px-3 text-sm text-ink"
                value={draft.name}
                onChange={(event) =>
                  update({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label className="text-xs font-semibold text-ink-secondary">
              Description
              <input
                id="field-description"
                className="mt-1 min-h-11 w-full border border-line bg-pure px-3 text-sm text-ink"
                value={draft.description}
                onChange={(event) =>
                  update({ ...draft, description: event.target.value })
                }
              />
            </label>
          </div>
          <LabTimeline
            scenario={draft}
            laneKey={lane!.key}
            selectedEventId={eventId}
            onLane={(key) => {
              setLaneKey(key);
              setEventId(null);
              setSection("lane");
            }}
            onEvent={(id) => {
              setEventId(id);
              setSection("lane");
              setLaneKey(
                draft.events.find((event) => event.id === id)!.laneKey,
              );
            }}
            onChange={update}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              disabled={draft.events.length >= 200}
              className="min-h-11 border border-line-strong bg-pure px-4 text-sm font-semibold"
              onClick={addEvent}
            >
              + Add event / fault
            </button>
            <label className="flex items-center gap-2 text-xs text-ink-secondary">
              Finish trace
              <select
                className="min-h-11 border border-line bg-pure px-2 text-sm"
                value={draft.terminalCondition}
                onChange={(event) =>
                  update({
                    ...draft,
                    schemaVersion: 2,
                    terminalCondition: event.target.value as
                      "after_trace" | "after_recovery",
                  })
                }
              >
                <option value="after_recovery">
                  After protection recovery
                </option>
                <option value="after_trace">After final trace input</option>
              </select>
            </label>
          </div>
          <LabReadingGenerator
            key={lane!.key}
            scenario={draft}
            laneKey={lane!.key}
            onChange={update}
          />
          <LabAdvancedJson key={draft.id} scenario={draft} onChange={update} />
        </div>
        <LabSettingsInspector model={loaded} />
      </fieldset>
      <p className="mt-4 text-xs leading-relaxed text-ink-tertiary">
        Physical source: digital twin. Signed evidence, tariff calculations, and
        protection decisions use Rove’s engine.{" "}
        {hosted
          ? "Payments use funded Tempo testnet channels."
          : "Payment environment follows the selected scenario."}
      </p>
    </section>
  );
}
