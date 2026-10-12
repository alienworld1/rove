import { DocsLink } from "../docs-link";
import type { CausalInspectorTrace } from "@rove/contracts";
import { formatOperationalValue } from "./format-operational-value";
import { TempoTransactionLink } from "../tempo-transaction-link";
import { paymentNetworkLabel } from "../payment-asset";
import { paymentBalances } from "./payment-balances";

const operationCopy = {
  open: "Open channel",
  voucher: "Payment authorization",
  top_up: "Top-up",
  settle: "Settlement",
  close: "Close channel",
} as const;

export function PaymentInspector({
  trace,
  assetDecimals,
  assetUnit,
}: {
  trace: CausalInspectorTrace;
  assetDecimals: number;
  assetUnit: string;
}) {
  const payment = trace.payment;
  const balances = payment
    ? paymentBalances({ ...payment, state: trace.result.state })
    : null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
        Payment Inspector
      </p>
      <h3 className="mt-2 text-lg font-semibold text-ink">
        Payment protection · {assetUnit}
      </h3>
      <div className="mt-3 flex flex-wrap gap-3">
        <DocsLink event={trace.eventType}>How this payment works</DocsLink>
        <DocsLink topic="topUps">How top-ups work</DocsLink>
        <DocsLink topic="close">How settlement and refunds work</DocsLink>
      </div>
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
              {paymentNetworkLabel(payment.network)} · {assetUnit}
              <span className="mt-1 block break-all font-mono text-ink-tertiary">
                {payment.assetId}
              </span>
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
            <dt className="text-ink-tertiary">Confirmed cumulative funding</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {formatOperationalValue(payment.confirmedDeposit, assetDecimals)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Escrow balance</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {formatOperationalValue(balances!.escrow, assetDecimals)}
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
            <dt className="text-ink-tertiary">Unused funded headroom</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {formatOperationalValue(balances!.headroom, assetDecimals)}
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
              {payment.operationType === "voucher" &&
              payment.operationStatus === "confirmed"
                ? "Verified offchain"
                : payment.operationStatus === "submitted" ||
                    payment.operationStatus === "pending"
                  ? "Awaiting confirmation"
                  : (payment.operationStatus ?? "Unavailable")}
            </dd>
          </div>
          {payment.closure ? (
            <>
              <div>
                <dt className="text-ink-tertiary">Expected refund</dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {formatOperationalValue(
                    payment.closure.expectedRefund,
                    assetDecimals,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ink-tertiary">Confirmed refund</dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {formatOperationalValue(
                    payment.closure.confirmedRefund,
                    assetDecimals,
                  )}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ink-tertiary">
                  Receipt block · close event
                </dt>
                <dd className="mt-0.5 break-all font-mono text-ink">
                  {payment.closure.receiptBlock ?? "Unavailable"} ·{" "}
                  {payment.closure.closeEventReference ?? "Unavailable"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ink-tertiary">Refund evidence</dt>
                <dd className="mt-0.5 break-all font-mono text-ink">
                  {payment.closure.refundEvidenceReference ?? "Unavailable"}
                </dd>
              </div>
            </>
          ) : null}
          {payment.transactionHash ? (
            <div className="col-span-2">
              <dt className="text-ink-tertiary">
                {payment.operationStatus === "confirmed"
                  ? "Confirmed transaction reference"
                  : "Transaction reference"}
              </dt>
              <dd className="mt-0.5 break-all select-all font-mono text-ink">
                {payment.transactionHash}
                {payment.operationType !== "voucher" ? (
                  <div>
                    <TempoTransactionLink
                      network={payment.network}
                      hash={payment.transactionHash}
                      operation={
                        operationCopy[
                          payment.operationType as keyof typeof operationCopy
                        ] ?? "payment"
                      }
                    />
                  </div>
                ) : null}
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
            Cumulative payment authorization · {assetUnit}
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
