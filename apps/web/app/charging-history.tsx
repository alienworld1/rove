import type { LaneHistory } from "@rove/contracts";

const labels: Record<string, string> = {
  "lane.initializing": "Charging protection started",
  "meter.evidence_accepted": "Meter reading accepted",
  "meter.evidence_rejected": "Meter reading rejected",
  "payment.chain_observed": "Payment channel checked",
  "payment.voucher_verified": "Cumulative protection advanced",
  "payment.chain_unavailable": "Payment status needs checking",
  "lane.pause_required": "Charging should pause",
  "lane.at_risk": "Protection needs attention",
  "lane.watch": "Protection is being watched",
  "lane.protected": "Protection is ready",
  "lane.protection_checked": "Protection bounds checked",
  "lane.protection_restored": "Protection restored",
  "lane.recovering": "Restoring protection",
  "pause.requested": "Charging pause requested",
  "payment.open_submitted": "Initial funding submitted",
  "payment.open_completed": "Initial funding confirmed",
  "payment.top_up_submitted": "Top-up submitted",
  "payment.top_up_completed": "Top-up confirmed",
  "payment.settlement_submitted": "Settlement submitted",
  "payment.settlement_completed": "Settlement confirmed",
  "payment.top_up_failed": "Top-up needs checking",
  "payment.settlement_failed": "Settlement needs checking",
};

export function ChargingHistory({ history }: { history: LaneHistory }) {
  return (
    <section
      aria-labelledby="charging-history-title"
      className="border-t border-line-strong pt-5"
    >
      <h4
        id="charging-history-title"
        className="text-sm font-semibold text-ink"
      >
        Causal history
      </h4>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-ink-secondary">
          No protection events have been recorded yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-0">
          {history.map((item) => (
            <li
              key={item.id}
              className="grid gap-2 border-t border-line py-3 text-sm sm:grid-cols-[11rem_1fr]"
            >
              <time
                dateTime={item.occurredAt}
                className="text-xs text-ink-tertiary"
              >
                {new Date(item.occurredAt).toLocaleString()}
              </time>
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {labels[item.type] ?? item.type.replaceAll(".", " ")}
                </p>
                {item.reasonCode ? (
                  <p className="mt-1 text-xs text-ink-secondary">
                    Reason: {item.reasonCode.replaceAll("_", " ").toLowerCase()}
                  </p>
                ) : null}
                {item.summary ? (
                  <p className="mt-1 font-mono text-xs tabular-nums text-ink-secondary">
                    Protected {item.summary.before?.protected ?? "—"} →{" "}
                    {item.summary.after.protected} · Exposure{" "}
                    {item.summary.before?.exposure ?? "—"} →{" "}
                    {item.summary.after.exposure}
                  </p>
                ) : null}
                {item.evidenceHash ? (
                  <p className="mt-1 break-all font-mono text-xs text-ink-tertiary">
                    Evidence hash: {item.evidenceHash}
                  </p>
                ) : null}
                {item.detail?.digest ? (
                  <p className="mt-1 break-all font-mono text-xs text-ink-tertiary">
                    Voucher digest: {item.detail.digest}
                  </p>
                ) : null}
                {item.channelId ? (
                  <p className="mt-1 break-all font-mono text-xs text-ink-tertiary">
                    Channel: {item.channelId}
                  </p>
                ) : null}
                {item.transactionHash ? (
                  <p className="mt-1 break-all font-mono text-xs text-ink-tertiary">
                    Transaction: {item.transactionHash}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
