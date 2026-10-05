import {
  paymentOperationStatus,
  paymentOperationUrl,
  orderPaymentOperations,
} from "./payment-operation-presentation";
import type { LaneProjection } from "@rove/contracts";
import { TempoTransactionLink } from "./tempo-transaction-link";
import { paymentAssetLabel } from "./payment-asset";
import { formatOperationalValue } from "./corridor/format-operational-value";

const names = {
  open: "Initial funding",
  voucher: "Offchain authorization",
  top_up: "Top-up",
  settle: "Settlement",
  close: "Channel closure",
};

export function ChargingOperations({
  operations,
  paymentSource,
  network,
  assetId,
  assetDecimals,
  transactionOrder = [],
}: {
  operations: LaneProjection["operations"];
  paymentSource: LaneProjection["paymentSource"];
  network: string;
  assetId: string;
  assetDecimals: number;
  transactionOrder?: string[];
}) {
  const transactions = orderPaymentOperations(operations, transactionOrder);
  if (transactions.length === 0) return null;
  return (
    <section
      aria-label="Payment operations"
      className="border-t border-line pt-5"
    >
      <h4 className="text-sm font-semibold text-ink">Payment operations</h4>
      <p className="mt-1 text-xs text-ink-tertiary">
        Value is authorized offchain between payments. Settlements show the
        cumulative amount collected.
      </p>
      <ul className="mt-3 space-y-2">
        {transactions.map((operation, index) => (
          <li
            key={`${operation.type}-${index}`}
            className="flex flex-wrap justify-between gap-x-5 gap-y-1 border-b border-line py-2 text-sm"
          >
            <span>{names[operation.type]}</span>
            <span className="tabular-nums">
              {operation.type === "close" ? "Final collected · " : null}
              {formatOperationalValue(
                operation.requestedAmount,
                assetDecimals,
              )}{" "}
              {paymentAssetLabel(network, assetId)}
            </span>
            <span className="text-ink-secondary">
              {paymentOperationStatus(operation, paymentSource)}
            </span>
            {paymentOperationUrl(operation, paymentSource, network) ? (
              <TempoTransactionLink
                network={network}
                hash={operation.transactionHash}
                operation={names[operation.type]}
              />
            ) : null}
            {operation.transactionHash ? (
              <details className="w-full text-xs text-ink-tertiary">
                <summary className="cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-info">
                  Transaction reference
                </summary>
                <p className="break-all select-all font-mono">
                  {operation.transactionHash}
                </p>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
