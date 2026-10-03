import { createHash, randomUUID } from "node:crypto";
import { readPaymentConfig } from "@rove/config";
import { paymentEffectPayloadSchema } from "@rove/contracts";
import { ChargingStore, type VerifiedVoucher } from "@rove/persistence";
import {
  createTempoChannelAdapter,
  type ClosureObservation,
  type ChannelDescriptor,
  type ChannelObservation,
} from "@rove/tempo";
import type { EffectLookup, EffectReceipt } from "./outbox-worker.js";

const stableCommandId = (key: string) =>
  createHash("sha256").update(key).digest("hex");

export function createConfiguredTempoChannelAdapter(
  settings = readPaymentConfig(),
) {
  if (settings.TEMPO_SESSION_BACKEND !== "precompile")
    throw new Error("PAYMENT_ENVIRONMENT_UNSUPPORTED");
  return createTempoChannelAdapter({
    rpcUrl: settings.TEMPO_RPC_URL,
    chainId: settings.TEMPO_CHAIN_ID,
    assetAddress: settings.TEMPO_ASSET_ADDRESS.toLowerCase() as `0x${string}`,
    assetDecimals: settings.TEMPO_ASSET_DECIMALS,
    payerAddress: settings.TEMPO_PAYER_ADDRESS.toLowerCase() as `0x${string}`,
    payeeAddress: settings.TEMPO_PAYEE_ADDRESS.toLowerCase() as `0x${string}`,
    voucherSignerAddress:
      settings.TEMPO_VOUCHER_SIGNER_ADDRESS.toLowerCase() as `0x${string}`,
    payerPrivateKey: settings.TEMPO_PAYER_PRIVATE_KEY as `0x${string}`,
    payeePrivateKey: settings.TEMPO_PAYEE_PRIVATE_KEY as `0x${string}`,
    voucherSignerPrivateKey:
      settings.TEMPO_VOUCHER_SIGNER_PRIVATE_KEY as `0x${string}`,
  });
}

export function createChargingEffectAdapter(store: ChargingStore) {
  const settings = readPaymentConfig();
  const tempo = createConfiguredTempoChannelAdapter(settings);

  async function context(payload: unknown) {
    const request = paymentEffectPayloadSchema.parse(payload);
    const current = await store.getPaymentContext(request.laneId);
    if (
      current.lane.tempoNetwork !== `eip155:${settings.TEMPO_CHAIN_ID}` ||
      current.lane.settlementAssetId.toLowerCase() !==
        settings.TEMPO_ASSET_ADDRESS.toLowerCase()
    )
      throw new Error("PAYMENT_BINDING_INVALID");
    return { request, current };
  }

  async function reconcile(
    type: string,
    key: string,
    reference?: string,
    payload?: unknown,
    attemptCount?: number,
    effectCreatedAt?: string,
  ): Promise<EffectLookup> {
    if (type === "pause.requested") return { status: "completed" };
    const { request, current } = await context(payload);
    if (type === "payment.voucher_requested") {
      if (
        current.voucher &&
        BigInt(current.voucher.cumulativeAmount) >= BigInt(request.amount!)
      )
        return { status: "completed" };
      return { status: "not_found" };
    }
    if (type === "payment.open_requested") {
      if (!reference && attemptCount === 1) return { status: "not_found" };
      const result = await tempo.reconcileOpen(
        key,
        reference as `0x${string}` | undefined,
        effectCreatedAt,
      );
      if (
        result.status === "completed" &&
        (result.observation.confirmedDeposit !== request.amount ||
          result.observation.settledValue !== "0")
      )
        return {
          status: "unknown",
          externalReference: result.externalReference,
        };
      return result;
    }
    if (!request.channelId || !current.channel?.descriptor)
      return { status: "unknown", externalReference: reference };
    if (type === "payment.close_requested") {
      if (!reference && attemptCount === 1) return { status: "not_found" };
      return tempo.reconcileClose(
        request.channelId as `0x${string}`,
        current.channel.descriptor as ChannelDescriptor,
        BigInt(request.amount!),
        BigInt(request.priorDeposit!),
        reference as `0x${string}` | undefined,
        effectCreatedAt,
      );
    }
    if (!reference && attemptCount === 1) return { status: "not_found" };
    const result = await tempo.reconcileTransaction(
      type === "payment.top_up_requested" ? "top_up" : "settle",
      request.channelId as `0x${string}`,
      BigInt(request.amount!),
      reference as `0x${string}` | undefined,
      effectCreatedAt,
      request.priorDeposit ? BigInt(request.priorDeposit) : undefined,
    );
    if (result.status !== "completed") return result;
    if (
      type === "payment.top_up_requested" &&
      BigInt(result.observation.confirmedDeposit) <
        BigInt(request.priorDeposit!) + BigInt(request.amount!)
    )
      return { status: "unknown", externalReference: result.externalReference };
    if (
      type === "payment.settlement_requested" &&
      BigInt(result.observation.settledValue) < BigInt(request.amount!)
    )
      return { status: "unknown", externalReference: result.externalReference };
    return result;
  }

  async function submit(
    type: string,
    key: string,
    payload: unknown,
  ): Promise<EffectReceipt> {
    if (type === "pause.requested") return { status: "completed" };
    const { request, current } = await context(payload);
    if (!request.amount) throw new Error("PAYMENT_AMOUNT_INVALID");
    if (current.lane.completion?.status === "mismatch")
      throw new Error("CDR_SERVICE_MISMATCH");
    if (type === "payment.open_requested")
      return tempo.submitOpen(key, BigInt(request.amount));
    if (
      !current.channel ||
      !request.channelId ||
      current.channel.channelId !== request.channelId
    )
      throw new Error("PAYMENT_BINDING_INVALID");
    if (type === "payment.voucher_requested") {
      if (
        BigInt(request.amount) > BigInt(current.lane.trustedDeliveredValue) ||
        current.lane.confirmedDeposit === null ||
        BigInt(request.amount) > BigInt(current.lane.confirmedDeposit)
      )
        throw new Error("PAYMENT_AUTHORIZATION_INVALID");
      return {
        status: "completed",
        observation: await tempo.signVoucher(
          request.channelId as `0x${string}`,
          BigInt(request.amount),
        ),
      };
    }
    const descriptor = current.channel.descriptor as ChannelDescriptor;
    if (type === "payment.top_up_requested")
      return tempo.submitTopUp(
        request.channelId as `0x${string}`,
        descriptor,
        BigInt(request.amount),
      );
    if (
      type === "payment.settlement_requested" ||
      type === "payment.close_requested"
    ) {
      if (
        !current.voucher ||
        current.voucher.cumulativeAmount !== request.amount ||
        !current.voucher.signature
      )
        throw new Error("PAYMENT_AUTHORIZATION_INVALID");
      if (type === "payment.close_requested") {
        if (
          current.lane.completion?.status !== "closing" ||
          current.lane.completion.comparison?.status !== "MATCH"
        )
          throw new Error("PAYMENT_CLOSURE_INVALID");
        return tempo.submitClose(
          request.channelId as `0x${string}`,
          descriptor,
          BigInt(request.amount),
          BigInt(request.priorDeposit!),
          current.voucher.signature as `0x${string}`,
        );
      }
      return tempo.submitSettlement(
        request.channelId as `0x${string}`,
        descriptor,
        BigInt(request.amount),
        current.voucher.signature as `0x${string}`,
      );
    }
    throw new Error("EFFECT_UNSUPPORTED");
  }

  async function confirm(
    laneId: string,
    type: string,
    observation: unknown,
    key: string,
  ) {
    if (type === "pause.requested" || !observation) return;
    const voucher =
      type === "payment.voucher_requested"
        ? (observation as VerifiedVoucher)
        : undefined;
    const closure =
      type === "payment.close_requested"
        ? (observation as ClosureObservation)
        : undefined;
    const channel =
      voucher || closure ? undefined : (observation as ChannelObservation);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const projection = await store.getLane(laneId);
      if (closure && projection.state === "CLOSED") return;
      if (
        voucher &&
        (BigInt(voucher.cumulativeAmount) > 0n
          ? BigInt(projection.authorizedValue) >=
            BigInt(voucher.cumulativeAmount)
          : projection.latestVoucherDigest === voucher.digest)
      )
        return;
      if (
        channel &&
        projection.channelId === channel.channelId &&
        projection.confirmedDeposit === channel.confirmedDeposit &&
        projection.settledValue === channel.settledValue
      )
        return;
      try {
        await store.advanceLane(
          {
            commandId: stableCommandId(`${key}:confirmed`),
            correlationId: stableCommandId(key),
            laneId,
            expectedVersion: projection.version,
            now: voucher
              ? new Date().toISOString()
              : (closure?.observedAt ?? channel!.observedAt),
            payload: { type: "TickProtectionClock" },
          },
          "tempo-adapter",
          closure ??
            (voucher
              ? {
                  type: "VoucherVerified",
                  cumulativeAmount: voucher.cumulativeAmount,
                  digest: voucher.digest,
                }
              : {
                  type: "PaymentObserved",
                  source: "tempo-adapter",
                  channelId: channel!.channelId,
                  network: channel!.network,
                  assetId: channel!.assetId,
                  observedAt: channel!.observedAt,
                  confirmedDeposit: channel!.confirmedDeposit,
                  settledValue: channel!.settledValue,
                  chainHeight: channel!.chainHeight,
                  transactionHash: channel!.transactionHash,
                }),
          undefined,
          undefined,
          voucher,
          channel?.descriptor,
        );
        return;
      } catch (error) {
        if (
          !(error instanceof Error && error.message === "VERSION_CONFLICT") ||
          attempt === 2
        )
          throw error;
      }
    }
  }

  async function refresh(laneId: string) {
    const current = await store.getPaymentContext(laneId);
    if (!current.channel || current.lane.confirmedDeposit === null) return;
    if (current.lane.completion?.closure) {
      const terminal = current.lane.completion.closure;
      const projection = await store.getLane(laneId);
      const closeReference =
        terminal.transactionHash ??
        projection.operations.find((operation) => operation.type === "close")
          ?.transactionHash;
      const result = await tempo.reconcileClose(
        current.channel.channelId as `0x${string}`,
        current.channel.descriptor as ChannelDescriptor,
        BigInt(current.lane.completion.finalTrustedValue!),
        BigInt(terminal.depositBeforeClose),
        closeReference as `0x${string}` | undefined,
        current.lane.completion.serviceEndedAt,
      );
      if (result.status === "completed") {
        await confirm(
          laneId,
          "payment.close_requested",
          result.observation,
          `${laneId}:close`,
        );
        return;
      }
      if (result.status !== "failed" || current.lane.state === "CLOSED")
        throw new Error("PAYMENT_REFUND_UNVERIFIED");
    }
    const observation = await tempo.readChannel(
      current.channel.channelId as `0x${string}`,
    );

    const projection = await store.getLane(laneId);
    await store.advanceLane(
      {
        commandId: randomUUID(),
        correlationId: stableCommandId(`${laneId}:chain`),
        laneId,
        expectedVersion: projection.version,
        now: observation.observedAt,
        payload: { type: "TickProtectionClock" },
      },
      "tempo-adapter",
      {
        type: "PaymentObserved",
        source: "tempo-adapter",
        channelId: observation.channelId,
        network: observation.network,
        assetId: observation.assetId,
        observedAt: observation.observedAt,
        confirmedDeposit: observation.confirmedDeposit,
        settledValue: observation.settledValue,
        chainHeight: observation.chainHeight,
      },
    );
  }

  async function fail(laneId: string, type: string, key: string) {
    const observation =
      type === "payment.voucher_requested"
        ? { type: "SignerUnavailable" as const }
        : type === "payment.top_up_requested"
          ? {
              type: "PaymentEffectFailed" as const,
              reasonCode: "PAYMENT_TOPUP_FAILED" as const,
            }
          : type === "payment.settlement_requested"
            ? {
                type: "PaymentEffectFailed" as const,
                reasonCode: "PAYMENT_SETTLEMENT_FAILED" as const,
              }
            : null;
    if (!observation) return;
    const projection = await store.getLane(laneId);
    await store.advanceLane(
      {
        commandId: stableCommandId(`${key}:failed:${projection.version}`),
        correlationId: stableCommandId(key),
        laneId,
        expectedVersion: projection.version,
        now: new Date().toISOString(),
        payload: { type: "TickProtectionClock" },
      },
      "tempo-adapter",
      observation,
    );
  }

  async function observe(laneId: string) {
    const current = await store.getPaymentContext(laneId);
    if (!current.channel?.descriptor)
      throw new Error("PAYMENT_BINDING_INVALID");
    const observation = await tempo.readChannel(
      current.channel.channelId as `0x${string}`,
    );
    return {
      type: "PaymentObserved" as const,
      source: "tempo-adapter" as const,
      ...observation,
    };
  }
  return { reconcile, submit, confirm, fail, refresh, observe };
}
