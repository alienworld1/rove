import type { LaneProjection } from "@rove/contracts";

const names = {
  open: "Initial funding",
  voucher: "Cumulative voucher",
  top_up: "Top-up",
  settle: "Settlement",
};

export function ChargingOperations({
  operations,
  paymentSource,
}: {
  operations: LaneProjection["operations"];
  paymentSource: LaneProjection["paymentSource"];
}) {
  if (operations.length === 0) return null;
  return (
    <section
      aria-labelledby="charging-operations-title"
      className="border-t border-line pt-5"
    >
      <h4
        id="charging-operations-title"
        className="text-sm font-semibold text-ink"
      >
        Payment operations
      </h4>
      <ul className="mt-3 space-y-2">
        {operations.map((operation, index) => (
          <li
            key={`${operation.type}-${index}`}
            className="flex flex-wrap justify-between gap-x-5 gap-y-1 border-b border-line py-2 text-sm"
          >
            <span>{names[operation.type]}</span>
            <span className="text-ink-secondary">
              {paymentSource === "local-simulation"
                ? "Local simulation — no network confirmation"
                : operation.status === "submitted" ||
                    operation.status === "pending"
                  ? `${names[operation.type]} awaiting confirmation`
                  : operation.status === "confirmed"
                    ? `${names[operation.type]} confirmed`
                    : `${names[operation.type]} needs checking`}
            </span>
            {operation.transactionHash ? (
              <span className="w-full break-all font-mono text-xs text-ink-tertiary">
                {operation.transactionHash}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
