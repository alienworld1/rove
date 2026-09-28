export const laneStates = [
  "INITIALIZING",
  "PROTECTED",
  "WATCH",
  "AT_RISK",
  "PAUSE_REQUIRED",
  "RECOVERING",
  "COMPLETING",
  "RECONCILED",
  "CLOSED",
] as const;

export type LaneState = (typeof laneStates)[number];
export type EvidenceHealth = "unknown" | "fresh" | "stale" | "untrusted";
export type ChainHealth = "unknown" | "fresh" | "stale" | "unavailable";
export type SignerHealth = "ready" | "unavailable";

export type FixedTariff = {
  perKwh: string;
  tariffDecimals: number;
  assetDecimals: number;
};

export type ProtectionPolicy = {
  warningThreshold: string;
  riskThreshold: string;
  maxUnprotectedExposure: string;
  evidenceMaxAgeMs: number;
  chainMaxAgeMs: number;
  zeroGrace: boolean;
  lowHeadroomThreshold: string;
};

export type CorridorConfig = {
  id: string;
  name: string;
  payerEmsp: string;
  payeeCpo: string;
  settlementAssetId: string;
  tempoNetwork: string;
  tariff: FixedTariff;
  protectionPolicy: ProtectionPolicy;
  reservePolicy: { initialDeposit: string; topUpIncrement: string };
  settlementPolicy: {
    minimumIntervalMs: number;
    minimumUnsettledProtectedValue: string;
  };
  status: "ACTIVE" | "PAUSED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
};

export type Lane = {
  id: string;
  version: number;
  corridorId: string;
  externalSessionId: string;
  chargerId: string;
  meterId: string;
  maxPowerWatts: string;
  expectedProofIntervalMs: number;
  tariff: FixedTariff;
  policy: ProtectionPolicy;
  reservePolicy: CorridorConfig["reservePolicy"];
  settlementPolicy: CorridorConfig["settlementPolicy"];
  settlementAssetId: string;
  tempoNetwork: string;
  state: LaneState;
  serviceStarted: boolean;
  evidenceHealth: EvidenceHealth;
  chainHealth: ChainHealth;
  signerHealth: SignerHealth;
  trustedEnergyWh: string;
  trustedDeliveredValue: string;
  authorizedValue: string;
  settledValue: string;
  confirmedDeposit: string | null;
  fundedHeadroom: string | null;
  lastTrustedEvidenceAt: string | null;
  lastChainObservedAt: string | null;
  lastEvidenceHash: string | null;
  lastEvidenceSequence: number | null;
  channelId: string | null;
  unverifiedServiceBound: string;
  worstCaseDeliveredValue: string;
  protectedValue: string;
  protectedWatermark: string;
  unprotectedExposureBound: string;
  reasonCodes: string[];
  finalCdrId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LaneCommand =
  | { type: "ObserveEvidence"; raw: string; transportSessionId: string }
  | {
      type: "ObservePayment";
      channelId: string;
      network: string;
      assetId: string;
      observedAt: string;
      confirmedDeposit: string;
      settledValue: string;
      chainHeight: string;
      transactionHash?: string;
    }
  | {
      type: "PaymentUnavailable";
      reason: "PAYMENT_CHAIN_STATE_UNAVAILABLE" | "PAYMENT_CHAIN_STATE_STALE";
    }
  | { type: "TickProtectionClock" }
  | { type: "RequirePause" }
  | { type: "BeginRecovery" };

export type CommandEnvelope<T> = {
  commandId: string;
  actor: string;
  correlationId: string;
  causationId?: string;
  laneId: string;
  expectedVersion: number;
  now: string;
  payload: T;
};

export type TransitionEffect =
  | {
      type: "pause.requested";
      idempotencyKey: string;
      payload: { laneId: string; reasonCode: string };
    }
  | {
      type: "payment.voucher_requested";
      idempotencyKey: string;
      payload: { laneId: string; channelId: string; amount: string };
    }
  | {
      type: "payment.top_up_requested";
      idempotencyKey: string;
      payload: {
        laneId: string;
        channelId: string;
        amount: string;
        priorDeposit: string;
      };
    }
  | {
      type: "payment.settlement_requested";
      idempotencyKey: string;
      payload: { laneId: string; channelId: string; amount: string };
    };
export type TransitionResult = {
  lane: Lane;
  events: {
    type: string;
    reasonCode?: string;
    payload: Record<string, unknown>;
    traceTime?: string;
    evidenceHash?: string;
    channelId?: string;
    txHash?: string;
  }[];
  effects: TransitionEffect[];
};

export type VerifiedObservation =
  | {
      type: "EvidenceObserved";
      evidenceHash: string;
      accepted: boolean;
      reasonCode?: string;
      observedAt?: string;
      sequence?: number;
      cumulativeWh?: string;
    }
  | {
      type: "PaymentObserved";
      source: "tempo-adapter" | "local-simulation";
      channelId: string;
      network: string;
      assetId: string;
      observedAt: string;
      confirmedDeposit: string;
      settledValue: string;
      chainHeight: string;
      transactionHash?: string;
    }
  | { type: "VoucherVerified"; cumulativeAmount: string; digest: string }
  | {
      type: "PaymentUnavailable";
      reasonCode:
        "PAYMENT_CHAIN_STATE_UNAVAILABLE" | "PAYMENT_CHAIN_STATE_STALE";
    }
  | { type: "ClockTick" }
  | { type: "SignerUnavailable" }
  | {
      type: "PaymentEffectFailed";
      reasonCode: "PAYMENT_TOPUP_FAILED" | "PAYMENT_SETTLEMENT_FAILED";
    }
  | { type: "PauseRequired" }
  | { type: "RecoveryBegun" };
