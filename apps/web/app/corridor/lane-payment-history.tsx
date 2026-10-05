import type { CorridorOperatingView } from "@rove/contracts";
import { ChargingOperations } from "../charging-operations";
import { formatOperationalValue } from "./format-operational-value";
import { paymentBalances } from "./payment-balances";
import { paymentAssetLabel } from "../payment-asset";

export function LanePaymentHistory({
  lane,
  corridor,
}: {
  lane: CorridorOperatingView["lanes"][number];
  corridor: CorridorOperatingView["corridor"];
}) {
  const balances = paymentBalances(lane.projection);
  const unit = paymentAssetLabel(
    corridor.tempoNetwork,
    corridor.settlementAssetId,
  );
  return (
    <section
      aria-label={`${lane.label} payment records`}
      className="mt-5 border-t border-line pt-4"
    >
      <h2 className="text-sm font-semibold text-ink">
        {lane.label} · Payment protection
      </h2>
      <p className="mt-2 text-xs text-ink-secondary">
        Funding grows with verified consumption plus a small buffer; you don’t
        reserve the whole expected session upfront.
      </p>
      <dl className="my-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-ink-secondary">Escrow balance</dt>
          <dd className="mt-1 tabular-nums">
            {formatOperationalValue(
              balances.escrow,
              corridor.tariff.assetDecimals,
            )}{" "}
            {unit}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-secondary">Unused funded headroom</dt>
          <dd className="mt-1 tabular-nums">
            {formatOperationalValue(
              balances.headroom,
              corridor.tariff.assetDecimals,
            )}{" "}
            {unit}
          </dd>
        </div>
      </dl>
      <p className="mb-4 text-xs text-ink-tertiary">
        Escrow is funding still held in the channel. Headroom is funding
        available for further authorization.
      </p>
      <ChargingOperations
        operations={lane.projection.operations}
        transactionOrder={lane.trace.flatMap((event) =>
          event.references.transactionHash
            ? [event.references.transactionHash]
            : [],
        )}
        paymentSource={lane.projection.paymentSource}
        network={corridor.tempoNetwork}
        assetId={corridor.settlementAssetId}
        assetDecimals={corridor.tariff.assetDecimals}
      />
    </section>
  );
}
