import type { LaneProjection } from "@rove/contracts";
import { tempoTransactionUrl } from "./payment-asset";

type Operation = LaneProjection["operations"][number];

export function paymentOperationStatus(
  operation: Pick<Operation, "type" | "status">,
  source: LaneProjection["paymentSource"],
) {
  if (operation.status === "failed") return "Needs checking";
  if (operation.status === "pending" || operation.status === "submitted")
    return "Awaiting confirmation";
  if (operation.type === "voucher") return "Verified offchain";
  if (source === "local-simulation")
    return "Simulated · no network confirmation";
  return "Confirmed";
}

export function paymentOperationUrl(
  operation: Pick<Operation, "type" | "transactionHash">,
  source: LaneProjection["paymentSource"],
  network: string,
) {
  return source === "tempo-adapter" && operation.type !== "voucher"
    ? tempoTransactionUrl(network, operation.transactionHash)
    : null;
}

export function orderPaymentOperations(
  operations: Operation[],
  transactionOrder: string[],
) {
  const positions = new Map(
    transactionOrder.map((hash, index) => [hash, index]),
  );
  const position = (operation: Operation) =>
    operation.type === "open"
      ? -1
      : operation.type === "close"
        ? Number.MAX_SAFE_INTEGER
        : (positions.get(operation.transactionHash ?? "") ??
          transactionOrder.length);
  return operations
    .filter((operation) => operation.type !== "voucher")
    .sort((left, right) => position(left) - position(right));
}
