import type { CausalInspectorTrace } from "@rove/contracts";
import { formatOperationalValue } from "./format-operational-value";

const operationCopy = {
  open: "Open channel",
  voucher: "Authorize value",
  top_up: "Top-up",
  settle: "Partial settlement",
} as const;

export function PaymentInspector({
  trace,
  assetDecimals,
}: {
  trace: CausalInspectorTrace;
  assetDecimals: number;
}) {
  const payment = trace.payment;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
        Payment Inspector
      </p>
      <h3 className="mt-2 text-lg font-semibold text-ink">
        Payment protection
      </h3>
      {payment ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-ink-tertiary">Channel</dt>
            <dd className="mt-0.5 break-all font-mono text-ink">
              {payment.channelId}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Network · asset</dt>
            <dd className="mt-0.5 text-ink">
              {payment.network} · {payment.assetId}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Payer</dt>
            <dd className="mt-0.5 text-ink">{payment.payer}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Payee</dt>
            <dd className="mt-0.5 text-ink">{payment.payee}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Confirmed deposit</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {formatOperationalValue(payment.confirmedDeposit, assetDecimals)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Authorized</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {formatOperationalValue(payment.authorizedValue, assetDecimals)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Settled</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {formatOperationalValue(payment.settledValue, assetDecimals)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Funded headroom</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {formatOperationalValue(payment.fundedHeadroom, assetDecimals)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Operation</dt>
            <dd className="mt-0.5 text-ink">
              {payment.operationType
                ? (operationCopy[
                    payment.operationType as keyof typeof operationCopy
                  ] ?? "Payment operation")
                : "No linked operation"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Status</dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {payment.operationStatus ?? "Unavailable"}
            </dd>
          </div>
          {payment.transactionHash ? (
            <div className="col-span-2">
              <dt className="text-ink-tertiary">
                {payment.operationStatus === "confirmed"
                  ? "Confirmed transaction reference"
                  : "Transaction reference"}
              </dt>
              <dd className="mt-0.5 break-all font-mono text-ink">
                {payment.transactionHash}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-ink-secondary">
          No payment operation is linked to this event.
        </p>
      )}
      {trace.voucher ? (
        <div className="mt-4 border-t border-line pt-3 text-xs">
          <p className="font-semibold text-ink-secondary">
            Cumulative authorization
          </p>
          <p className="mt-2 tabular-nums text-ink">
            {formatOperationalValue(
              trace.voucher.cumulativeAmount,
              assetDecimals,
            )}
          </p>
          <p className="mt-1 break-all font-mono text-ink-tertiary">
            {trace.voucher.digest}
          </p>
          <p className="mt-2 text-ink-secondary">
            {trace.voucher.verificationStatus} ·{" "}
            {trace.voucher.signatureSummary}
          </p>
        </div>
      ) : null}
    </div>
  );
}
