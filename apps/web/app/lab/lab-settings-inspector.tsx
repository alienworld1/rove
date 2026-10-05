"use client";
import { LabCorridorSettings } from "./lab-corridor-settings";
import { LabLaneSettings } from "./lab-lane-settings";
import { LabEventSettings } from "./lab-event-settings";
import type { LoadedLabModel } from "./use-lab-workspace-model";
export function LabSettingsInspector({ model }: { model: LoadedLabModel }) {
  const {
    section,
    selectedEvent,
    lane,
    draft,
    update,
    setEventId,
    duplicateLane,
  } = model;
  return (
    <aside className="border-t border-line bg-raised p-5 xl:border-t-0 xl:border-l">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {section === "corridor"
            ? "Corridor settings"
            : selectedEvent
              ? "Event settings"
              : lane?.label}
        </h2>
        {selectedEvent ? (
          <button
            className="min-h-11 text-xs underline"
            onClick={() => setEventId(null)}
          >
            Lane settings
          </button>
        ) : null}
      </div>
      {section === "corridor" ? (
        <>
          <div className="mb-5 space-y-3">
            {(
              [
                ["payerEmsp", "Mobility provider"],
                ["payeeCpo", "Charge point operator"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="block text-xs font-semibold text-ink-secondary"
              >
                {label}
                <input
                  className="mt-1 min-h-11 w-full border border-line bg-pure px-3 text-sm"
                  value={draft.corridor[key]}
                  onChange={(event) =>
                    update({
                      ...draft,
                      corridor: {
                        ...draft.corridor,
                        [key]: event.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
            <label className="block text-xs font-semibold text-ink-secondary">
              Trace start (UTC)
              <input
                className="mt-1 min-h-11 w-full border border-line bg-pure px-3 font-mono text-xs"
                value={draft.traceEpoch}
                onChange={(event) =>
                  update({ ...draft, traceEpoch: event.target.value })
                }
              />
            </label>
          </div>
          <LabCorridorSettings scenario={draft} onChange={update} />
        </>
      ) : selectedEvent ? (
        <LabEventSettings
          key={selectedEvent.id}
          scenario={draft}
          event={selectedEvent}
          onChange={update}
          onSelect={setEventId}
        />
      ) : lane ? (
        <>
          <LabLaneSettings
            key={lane.key}
            scenario={draft}
            lane={lane}
            onChange={update}
          />
          <div className="mt-5 flex gap-2 border-t border-line pt-4">
            <button
              disabled={draft.lanes.length >= 3}
              onClick={duplicateLane}
              className="min-h-11 flex-1 border border-line px-2 text-xs disabled:opacity-40"
            >
              Duplicate Lane
            </button>
            <button
              disabled={draft.lanes.length <= 1}
              className="min-h-11 flex-1 border border-critical px-2 text-xs text-critical disabled:opacity-40"
              onClick={() => {
                if (!window.confirm(`Remove ${lane.label} and all its events?`))
                  return;
                const accounting =
                  draft.schemaVersion === 2
                    ? { ...draft.accountingByLane }
                    : {};
                delete accounting[lane.key];
                update({
                  ...draft,
                  schemaVersion: 2,
                  accountingByLane: accounting,
                  lanes: draft.lanes.filter((item) => item.key !== lane.key),
                  events: draft.events.filter(
                    (event) => event.laneKey !== lane.key,
                  ),
                });
                setEventId(null);
              }}
            >
              Remove Lane
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
