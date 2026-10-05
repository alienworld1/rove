import type { LaneHistory, LaneProjection } from "@rove/contracts";

export type ChargingView = {
  name: string;
  payerEmsp: string;
  payeeCpo: string;
  assetId: string;
  network: string;
  assetDecimals: number;
  lane: LaneProjection;
  history: LaneHistory;
};
