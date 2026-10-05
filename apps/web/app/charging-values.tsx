import type { ChargingView } from "./charging-view";
import { paymentAssetLabel } from "./payment-asset";
import { formatOperationalValue } from "./corridor/format-operational-value";
import { paymentBalances } from "./corridor/payment-balances";

export function ChargingValues({ view }: { view: ChargingView }) {
  const { lane, assetId } = view;
  const unit = paymentAssetLabel(view.network, assetId);
  const balances = paymentBalances(lane);
  const primary = [
    ["Trusted delivered value", lane.trustedDeliveredValue],
    ["Protected value", lane.protectedValue],
    ["Unprotected exposure bound", lane.unprotectedExposureBound],
    ["Exposure remaining before pause", lane.exposureRemaining],
  ] as const;
  const detail = [
    ["Trusted energy", lane.trustedEnergyWh, "Wh"],
    ["Cumulative authorized value", lane.authorizedValue, unit],
    ["Settled value", lane.settledValue, unit],
    [
      lane.paymentSource === "local-simulation"
        ? "Simulated deposit"
        : "Confirmed deposit",
      lane.confirmedDeposit,
      unit,
    ],
    [
      lane.paymentSource === "local-simulation"
        ? "Simulated headroom"
        : "Funded headroom",
      balances.headroom,
      unit,
    ],
    ["Unverified service bound", lane.unverifiedServiceBound, unit],
    ["Escrow balance", balances.escrow, unit],
  ] as const;
  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-4 border-y border-line-strong py-5 sm:grid-cols-2 lg:grid-cols-4">
        {primary.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-secondary">{label}</dt>
            <dd className="mt-1 break-all font-mono text-xl tabular-nums text-ink">
              {formatOperationalValue(value, view.assetDecimals)}
            </dd>
            <p className="mt-1 break-all text-xs text-ink-tertiary">{unit}</p>
          </div>
        ))}
      </dl>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {detail.map(([label, value, suffix]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3 border-b border-line py-2"
          >
            <dt className="text-sm text-ink-secondary">{label}</dt>
            <dd className="break-all text-right font-mono text-xs tabular-nums text-ink">
              {value === null
                ? "Awaiting confirmation"
                : `${suffix === "Wh" ? value : formatOperationalValue(value, view.assetDecimals)} ${suffix}`}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-secondary">
        Exposure limit:{" "}
        <span className="font-mono tabular-nums">
          {formatOperationalValue(
            lane.maxUnprotectedExposure,
            view.assetDecimals,
          )}{" "}
          {unit}
        </span>
      </p>
    </div>
  );
}
