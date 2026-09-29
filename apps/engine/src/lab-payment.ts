import { createHash } from "node:crypto";
import { ChargingStore, type VerifiedVoucher } from "@rove/persistence";
import type { EffectAdapter, EffectReceipt } from "./outbox-worker.js";

const stableId = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function createLocalLabPaymentAdapter(
  store: ChargingStore,
  traceEpoch: string,
): EffectAdapter {
  async function receipt(
    type: string,
    key: string,
    payload: unknown,
  ): Promise<EffectReceipt> {
    if (type === "pause.requested") return { status: "completed" };
    const request = payload as {
      laneId: string;
      amount?: string;
      channelId?: string;
      priorDeposit?: string;
    };
    const current = await store.getPaymentContext(request.laneId);
    if (current.lane.tempoNetwork !== "local-simulation")
      throw new Error("PAYMENT_BINDING_INVALID");
    const channelId =
      request.channelId ??
      `local-${stableId(`${request.laneId}:channel`).slice(0, 40)}`;
    if (type === "payment.voucher_requested") {
      const voucher: VerifiedVoucher = {
        channelId,
        cumulativeAmount: request.amount!,
        digest: `0x${stableId(`${channelId}:${request.amount}`)}`,
        signature: `0x${"11".repeat(65)}`,
        signerRef: "local-simulation",
        domainRef: "local-simulation",
      };
      return { status: "completed", observation: voucher };
    }
    const confirmedDeposit =
      type === "payment.open_requested"
        ? request.amount!
        : type === "payment.top_up_requested"
          ? (BigInt(request.priorDeposit!) + BigInt(request.amount!)).toString()
          : current.lane.confirmedDeposit!;
    return {
      status: "completed",
      observation: {
        channelId,
        network: "local-simulation",
        assetId: current.lane.settlementAssetId,
        observedAt: traceEpoch,
        confirmedDeposit,
        settledValue:
          type === "payment.settlement_requested"
            ? request.amount!
            : current.lane.settledValue,
        chainHeight: type === "payment.open_requested" ? "1" : "2",
      },
    };
  }

  return {
    async reconcile(type, key, _reference, payload) {
      if (type === "pause.requested") return { status: "completed" };
      const request = payload as {
        laneId: string;
        amount?: string;
        priorDeposit?: string;
      };
      const current = await store.getPaymentContext(request.laneId);
      if (
        type === "payment.open_requested" &&
        current.lane.confirmedDeposit !== null
      )
        return { status: "completed" };
      if (
        type === "payment.voucher_requested" &&
        BigInt(current.lane.authorizedValue) >= BigInt(request.amount!)
      )
        return { status: "completed" };
      if (
        type === "payment.top_up_requested" &&
        BigInt(current.lane.confirmedDeposit ?? "0") >=
          BigInt(request.priorDeposit!) + BigInt(request.amount!)
      )
        return { status: "completed" };
      if (
        type === "payment.settlement_requested" &&
        BigInt(current.lane.settledValue) >= BigInt(request.amount!)
      )
        return { status: "completed" };
      return receipt(type, key, payload);
    },
    submit: receipt,
    async confirm(laneId, type, observation, key) {
      if (type === "pause.requested" || !observation) return;
      const current = await store.getLane(laneId);
      const voucher =
        type === "payment.voucher_requested"
          ? (observation as VerifiedVoucher)
          : undefined;
      const channel = voucher
        ? undefined
        : (observation as {
            channelId: string;
            network: string;
            assetId: string;
            observedAt: string;
            confirmedDeposit: string;
            settledValue: string;
            chainHeight: string;
          });
      await store.advanceLane(
        {
          commandId: stableId(`${key}:confirmed`),
          correlationId: stableId(key),
          laneId,
          expectedVersion: current.version,
          now: traceEpoch,
          payload: { type: "TickProtectionClock" },
        },
        "local-simulation",
        voucher
          ? {
              type: "VoucherVerified",
              cumulativeAmount: voucher.cumulativeAmount,
              digest: voucher.digest,
            }
          : {
              type: "PaymentObserved",
              source: "local-simulation",
              channelId: channel!.channelId,
              network: channel!.network,
              assetId: channel!.assetId,
              observedAt: channel!.observedAt,
              confirmedDeposit: channel!.confirmedDeposit,
              settledValue: channel!.settledValue,
              chainHeight: channel!.chainHeight,
            },
        undefined,
        undefined,
        voucher,
      );
    },
  };
}
