import type { CausalInspectorTrace } from "@rove/contracts";
import {
  formatEnergy,
  formatOperationalValue,
} from "./format-operational-value";

export function ProtectionCalculation({
  calculation,
  assetUnit,
}: {
  calculation: CausalInspectorTrace["calculation"];
  assetUnit: string;
}) {
  const snapshot = calculation?.snapshot;
  if (!snapshot || !calculation)
    return (
      <p className="mt-3 text-xs text-ink-secondary">
        The inputs for this calculation are unavailable for this event.
      </p>
    );
  const money = (value: string) =>
    `${formatOperationalValue(value, calculation.assetDecimals)} ${assetUnit}`;
  const time = (value: string) => new Date(value).toISOString().slice(11, 23);
  return (
    <section
      aria-label="Protection calculation"
      className="mt-4 border-t border-line pt-3 text-xs text-ink-secondary"
    >
      <h4 className="font-semibold text-ink">
        Why this Lane can continue or must pause
      </h4>
      <p className="mt-2">
        Last trusted service: {money(snapshot.lastTrustedValue)} at{" "}
        {snapshot.lastTrustedEvidenceAt
          ? `${time(snapshot.lastTrustedEvidenceAt)} (trace clock)`
          : "an unavailable reading time"}
        . Evaluated at {time(snapshot.evaluatedAt)}.
      </p>
      <dl className="mt-3 space-y-2 font-mono tabular-nums">
        <div>
          <dt>Maximum power × time since trusted reading</dt>
          <dd className="text-ink">
            {formatOperationalValue(snapshot.maxPowerWatts, 3)} kW ×{" "}
            {formatOperationalValue(snapshot.elapsedUnverifiedMs, 3)} s
          </dd>
        </div>
        <div>
          <dt>Upper-bound energy · conservatively rounded</dt>
          <dd className="text-ink">
            {formatEnergy(snapshot.upperBoundEnergyWh)}
          </dd>
        </div>
        <div>
          <dt>Upper-bound energy × tariff</dt>
          <dd className="text-ink">
            {formatOperationalValue(
              calculation.tariffPerKwh,
              calculation.tariffDecimals,
            )}{" "}
            {assetUnit}/kWh → {money(snapshot.unverifiedServiceBound)}
          </dd>
        </div>
        <div>
          <dt>Worst-case service = trusted + upper bound</dt>
          <dd className="text-ink">
            {money(snapshot.lastTrustedValue)} +{" "}
            {money(snapshot.unverifiedServiceBound)} ={" "}
            {money(snapshot.worstCaseDeliveredValue)}
          </dd>
        </div>
        <div>
          <dt>Exposure = max(0, worst-case − protected)</dt>
          <dd className="text-ink">
            {money(snapshot.worstCaseDeliveredValue)} −{" "}
            {money(snapshot.protectedValue)} → {money(snapshot.exposureBound)}
          </dd>
        </div>
        <div>
          <dt>Exposure limit · remaining margin</dt>
          <dd className="text-ink">
            {money(snapshot.exposureLimit)} · {money(snapshot.remainingMargin)}
          </dd>
        </div>
      </dl>
      <p className="mt-3">
        {snapshot.boundApplied
          ? "The bound is possible additional service, not verified consumption. Its monetary value uses the exact power and time inputs before conservative rounding."
          : "Evidence is trusted here, so no unverified-service bound is applied."}
      </p>
      {snapshot.remainingMargin === "0" ? (
        <p className="mt-2 font-semibold text-critical">
          The exposure limit has been reached. Rove requires charging to pause;
          the simulated charger obeys this requirement.
        </p>
      ) : null}
    </section>
  );
}
