"use client";
import type { LabScenario, LabLaneDefinition } from "@rove/contracts";
import { LabValueField } from "./lab-value-field";
export function LabLaneSettings({
  scenario,
  lane,
  onChange,
}: {
  scenario: LabScenario;
  lane: LabLaneDefinition;
  onChange: (next: LabScenario) => void;
}) {
  const path = `lanes.${lane.key}`;
  function patch(value: Partial<LabLaneDefinition>) {
    onChange({
      ...scenario,
      lanes: scenario.lanes.map((item) =>
        item.key === lane.key ? { ...item, ...value } : item,
      ),
    });
  }
  const field =
    "mt-1.5 min-h-11 w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-info";
  const accounting =
    scenario.schemaVersion === 2
      ? scenario.accountingByLane?.[lane.key]
      : undefined;
  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold text-ink-secondary">
        Lane name
        <input
          id={`field-${path}.label`}
          className={field}
          value={lane.label}
          onChange={(event) => patch({ label: event.target.value })}
        />
      </label>
      <label className="block text-xs font-semibold text-ink-secondary">
        Power class
        <select
          className={field}
          value={lane.powerClass}
          onChange={(event) =>
            patch({
              powerClass: event.target.value as LabLaneDefinition["powerClass"],
            })
          }
        >
          {["AC", "DC", "HPC"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <LabValueField
        label="Maximum power (kW)"
        path={`${path}.maxPowerWatts`}
        value={lane.maxPowerWatts}
        decimals={3}
        onChange={(value) => patch({ maxPowerWatts: value })}
      />
      <LabValueField
        label="Proof cadence (seconds)"
        path={`${path}.expectedProofIntervalMs`}
        value={lane.expectedProofIntervalMs}
        decimals={3}
        onChange={(value) => patch({ expectedProofIntervalMs: Number(value) })}
        help="Expected evidence cadence. Use Generate readings to change the source schedule."
      />
      {lane.expectedProofIntervalMs >
      scenario.corridor.protectionPolicy.evidenceMaxAgeMs ? (
        <p className="border-l-2 border-risk pl-3 text-xs text-risk-deep">
          This cadence exceeds the freshness limit. Evidence can become stale
          between readings.
        </p>
      ) : null}
      <label className="block text-xs font-semibold text-ink-secondary">
        Signed meter profile
        <select
          id={`field-${path}.meterProfileId`}
          className={field}
          value={lane.meterProfileId}
          onChange={(event) => patch({ meterProfileId: event.target.value })}
        >
          <option value="controlled-ac">AC · Signed digital twin</option>
          <option value="controlled-dc">DC · Signed digital twin</option>
          <option value="controlled-hpc">HPC · Signed digital twin</option>
        </select>
      </label>
      <LabValueField
        label="Starting meter energy (kWh)"
        path={`${path}.initialEnergyWh`}
        value={lane.initialEnergyWh}
        decimals={3}
        onChange={(value) => patch({ initialEnergyWh: value })}
      />
      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="text-sm font-semibold">Final accounting</legend>
        <label className="block text-xs font-semibold text-ink-secondary">
          CDR totals
          <select
            className={field}
            value={accounting?.mode ?? "matching"}
            onChange={(event) =>
              onChange({
                ...scenario,
                schemaVersion: 2,
                accountingByLane: {
                  ...(scenario.schemaVersion === 2
                    ? scenario.accountingByLane
                    : {}),
                  [lane.key]:
                    event.target.value === "custom"
                      ? { mode: "custom", totalEnergyWh: "0", totalCost: "0" }
                      : { mode: "matching" },
                },
              })
            }
          >
            <option value="matching">Match accepted final evidence</option>
            <option value="custom">
              Custom totals · Exercise reconciliation
            </option>
          </select>
        </label>
        {accounting?.mode === "custom" ? (
          <>
            <LabValueField
              label="CDR energy (kWh)"
              path={`accountingByLane.${lane.key}.totalEnergyWh`}
              value={accounting.totalEnergyWh}
              decimals={3}
              onChange={(value) =>
                onChange({
                  ...scenario,
                  schemaVersion: 2,
                  accountingByLane: {
                    ...(scenario.schemaVersion === 2
                      ? scenario.accountingByLane
                      : {}),
                    [lane.key]: { ...accounting, totalEnergyWh: value },
                  },
                })
              }
            />
            <LabValueField
              label="CDR cost"
              path={`accountingByLane.${lane.key}.totalCost`}
              value={accounting.totalCost}
              decimals={scenario.corridor.tariff.assetDecimals}
              onChange={(value) =>
                onChange({
                  ...scenario,
                  schemaVersion: 2,
                  accountingByLane: {
                    ...(scenario.schemaVersion === 2
                      ? scenario.accountingByLane
                      : {}),
                    [lane.key]: { ...accounting, totalCost: value },
                  },
                })
              }
            />
            <p className="text-xs leading-relaxed text-risk-deep">
              A mismatch keeps the Lane unresolved and can retain its funded
              reserve. Rove will not change a payment to match these totals.
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-secondary">
            Final totals derive from accepted evidence when you finish the Lane.
          </p>
        )}
      </fieldset>
      <details className="border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Meter and session identities
        </summary>
        <div className="mt-3 space-y-3">
          {(["meterId", "chargerId", "sessionId"] as const).map((key) => (
            <label
              key={key}
              className="block text-xs font-semibold text-ink-secondary"
            >
              {key === "meterId"
                ? "Meter identity"
                : key === "chargerId"
                  ? "Charger identity"
                  : "Session identity"}
              <input
                id={`field-${path}.${key}`}
                className={field}
                value={lane[key]}
                onChange={(event) => patch({ [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
