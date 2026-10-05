import type { LaneProjection } from "@rove/contracts";

export function paymentBalances(
  lane: Pick<
    LaneProjection,
    "state" | "confirmedDeposit" | "settledValue" | "fundedHeadroom"
  >,
) {
  if (lane.state === "CLOSED") return { escrow: "0", headroom: "0" };
  return {
    escrow:
      lane.confirmedDeposit === null
        ? null
        : (
            BigInt(lane.confirmedDeposit) - BigInt(lane.settledValue)
          ).toString(),
    headroom: lane.fundedHeadroom,
  };
}
