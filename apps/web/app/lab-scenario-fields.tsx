"use client";

import type { LabScenario } from "@rove/contracts";

export function LabScenarioFields({
  scenario,
  onChange,
}: {
  scenario: LabScenario;
  onChange: (next: LabScenario) => void;
}) {
  const field =
    "mt-1 block w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
  function changeLane(
    index: number,
    patch: Partial<LabScenario["lanes"][number]>,
  ) {
    onChange({
      ...scenario,
      lanes: scenario.lanes.map((lane, position) =>
        position === index ? { ...lane, ...patch } : lane,
      ),
    });
  }
  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-ink-secondary">
          Scenario name
          <input
            className={field}
            value={scenario.name}
            onChange={(event) =>
              onChange({ ...scenario, name: event.target.value })
            }
          />
        </label>
        <label className="text-sm text-ink-secondary">
          Trace start (UTC)
          <input
            className={field}
            value={scenario.traceEpoch}
            onChange={(event) =>
              onChange({ ...scenario, traceEpoch: event.target.value })
            }
          />
        </label>
        <label className="text-sm text-ink-secondary sm:col-span-2">
          Description
          <input
            className={field}
            value={scenario.description}
            onChange={(event) =>
              onChange({ ...scenario, description: event.target.value })
            }
          />
        </label>
        <label className="text-sm text-ink-secondary">
          Mobility provider
          <input
            className={field}
            value={scenario.corridor.payerEmsp}
            onChange={(event) =>
              onChange({
                ...scenario,
                corridor: {
                  ...scenario.corridor,
                  payerEmsp: event.target.value,
                },
              })
            }
          />
        </label>
        <label className="text-sm text-ink-secondary">
          Charge point operator
          <input
            className={field}
            value={scenario.corridor.payeeCpo}
            onChange={(event) =>
              onChange({
                ...scenario,
                corridor: {
                  ...scenario.corridor,
                  payeeCpo: event.target.value,
                },
              })
            }
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scenario.lanes.map((lane, index) => (
          <fieldset
            key={lane.key}
            className="rounded-sm border border-line p-3"
          >
            <legend className="px-1 text-sm font-semibold text-ink">
              {lane.label}
            </legend>
            <label className="mt-2 block text-sm text-ink-secondary">
              Lane name
              <input
                className={field}
                value={lane.label}
                onChange={(event) =>
                  changeLane(index, { label: event.target.value })
                }
              />
            </label>
            <label className="mt-3 block text-sm text-ink-secondary">
              Power class
              <select
                className={field}
                value={lane.powerClass}
                onChange={(event) =>
                  changeLane(index, {
                    powerClass: event.target.value as typeof lane.powerClass,
                  })
                }
              >
                <option value="AC">AC</option>
                <option value="DC">DC</option>
                <option value="HPC">HPC</option>
              </select>
            </label>
            <label className="mt-3 block text-sm text-ink-secondary">
              Maximum power (W)
              <input
                className={field}
                inputMode="numeric"
                value={lane.maxPowerWatts}
                onChange={(event) =>
                  changeLane(index, { maxPowerWatts: event.target.value })
                }
              />
            </label>
            <label className="mt-3 block text-sm text-ink-secondary">
              Meter profile
              <input
                className={field}
                value={lane.meterProfileId}
                onChange={(event) =>
                  changeLane(index, { meterProfileId: event.target.value })
                }
              />
            </label>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
