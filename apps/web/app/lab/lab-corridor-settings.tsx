"use client";
import type { LabScenario } from "@rove/contracts";
import { LabValueField } from "./lab-value-field";
export function LabCorridorSettings({
  scenario,
  onChange,
}: {
  scenario: LabScenario;
  onChange: (next: LabScenario) => void;
}) {
  const corridor = scenario.corridor;
  const decimals = corridor.tariff.assetDecimals;
  function patch<K extends keyof typeof corridor>(
    key: K,
    value: (typeof corridor)[K],
  ) {
    onChange({ ...scenario, corridor: { ...corridor, [key]: value } });
  }
  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-ink-secondary">
        These commercial and protection settings apply to every Lane in this
        Corridor.
      </p>
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold">Tariff</legend>
        <LabValueField
          label="Price per kWh"
          path="corridor.tariff.perKwh"
          value={corridor.tariff.perKwh}
          decimals={corridor.tariff.tariffDecimals}
          onChange={(value) =>
            patch("tariff", { ...corridor.tariff, perKwh: value })
          }
        />
        <p className="break-all text-xs text-ink-tertiary">
          {corridor.tempoNetwork} · {corridor.settlementAssetId}
        </p>
      </fieldset>
      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="text-sm font-semibold">Funding</legend>
        <LabValueField
          label="Initial reserve"
          path="corridor.reservePolicy.initialDeposit"
          value={corridor.reservePolicy.initialDeposit}
          decimals={decimals}
          onChange={(value) =>
            patch("reservePolicy", {
              ...corridor.reservePolicy,
              initialDeposit: value,
            })
          }
        />
        <LabValueField
          label="Top-up increment"
          path="corridor.reservePolicy.topUpIncrement"
          value={corridor.reservePolicy.topUpIncrement}
          decimals={decimals}
          onChange={(value) =>
            patch("reservePolicy", {
              ...corridor.reservePolicy,
              topUpIncrement: value,
            })
          }
        />
        <LabValueField
          label="Top-up trigger headroom"
          path="corridor.protectionPolicy.lowHeadroomThreshold"
          value={corridor.protectionPolicy.lowHeadroomThreshold}
          decimals={decimals}
          onChange={(value) =>
            patch("protectionPolicy", {
              ...corridor.protectionPolicy,
              lowHeadroomThreshold: value,
            })
          }
        />
      </fieldset>
      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="text-sm font-semibold">Protection</legend>
        {(
          [
            ["warningThreshold", "Warning exposure"],
            ["riskThreshold", "At-risk exposure"],
            ["maxUnprotectedExposure", "Maximum unprotected exposure"],
          ] as const
        ).map(([key, label]) => (
          <LabValueField
            key={key}
            label={label}
            path={`corridor.protectionPolicy.${key}`}
            value={corridor.protectionPolicy[key]}
            decimals={decimals}
            onChange={(value) =>
              patch("protectionPolicy", {
                ...corridor.protectionPolicy,
                [key]: value,
              })
            }
          />
        ))}
        {(
          [
            ["evidenceMaxAgeMs", "Evidence freshness (seconds)"],
            ["chainMaxAgeMs", "Payment-state freshness (seconds)"],
          ] as const
        ).map(([key, label]) => (
          <LabValueField
            key={key}
            label={label}
            path={`corridor.protectionPolicy.${key}`}
            value={corridor.protectionPolicy[key]}
            decimals={3}
            onChange={(value) =>
              patch("protectionPolicy", {
                ...corridor.protectionPolicy,
                [key]: Number(value),
              })
            }
          />
        ))}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={corridor.protectionPolicy.zeroGrace}
            onChange={(event) =>
              patch("protectionPolicy", {
                ...corridor.protectionPolicy,
                zeroGrace: event.target.checked,
              })
            }
          />{" "}
          Require immediate pause when protection fails
        </label>
      </fieldset>
      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="text-sm font-semibold">Partial settlement</legend>
        <LabValueField
          label="Minimum interval (seconds)"
          path="corridor.settlementPolicy.minimumIntervalMs"
          value={corridor.settlementPolicy.minimumIntervalMs}
          decimals={3}
          onChange={(value) =>
            patch("settlementPolicy", {
              ...corridor.settlementPolicy,
              minimumIntervalMs: Number(value),
            })
          }
        />
        <LabValueField
          label="Minimum unsettled protected value"
          path="corridor.settlementPolicy.minimumUnsettledProtectedValue"
          value={corridor.settlementPolicy.minimumUnsettledProtectedValue}
          decimals={decimals}
          onChange={(value) =>
            patch("settlementPolicy", {
              ...corridor.settlementPolicy,
              minimumUnsettledProtectedValue: value,
            })
          }
        />
      </fieldset>
    </div>
  );
}
