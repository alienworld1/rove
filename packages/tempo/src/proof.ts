import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  hashTypedData,
  http,
  parseAbi,
  parseEventLogs,
  recoverTypedDataAddress,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { probePaymentEnvironment } from "./index.js";
import {
  channelAbi,
  reserveAddress,
  voucherDomain,
  voucherTypes,
} from "./protocol.js";

const tokenAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

export type TempoProofConfig = {
  rpcUrl: string;
  chainId: number;
  assetAddress: Address;
  assetDecimals: number;
  payerAddress: Address;
  payeeAddress: Address;
  voucherSignerAddress: Address;
  payerPrivateKey: Hex;
  payeePrivateKey: Hex;
  voucherSignerPrivateKey: Hex;
  initialDeposit: bigint;
  topUpAmount: bigint;
  firstVoucherAmount: bigint;
  secondVoucherAmount: bigint;
};

export type TempoProofStep = {
  operation: string;
  state: "submitted" | "pending" | "confirmed" | "failed";
  channelId?: Hash;
  transactionHash?: Hash;
  proofReference?: Hash;
  deposit?: string;
  settled?: string;
  refunded?: string;
  remaining?: string;
  cumulativeAmount?: string;
  network?: string;
  assetAddress?: Address;
  reasonCode?: string;
};

export class TempoProofError extends Error {
  constructor(
    readonly reasonCode: string,
    readonly reference?: Hash,
  ) {
    super(reasonCode);
  }
}

function requireAmount(condition: boolean) {
  if (!condition) throw new TempoProofError("PAYMENT_AUTHORIZATION_INVALID");
}

export async function runTempoProof(
  config: TempoProofConfig,
  emit: (step: TempoProofStep) => void,
) {
  const probe = await probePaymentEnvironment({
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    assetAddress: config.assetAddress,
    assetDecimals: config.assetDecimals,
  });
  if (probe.state !== "ready")
    throw new TempoProofError(
      probe.reasonCode ?? "PAYMENT_ENVIRONMENT_UNSUPPORTED",
    );
  emit({
    operation: "verify_payment_environment",
    state: "confirmed",
    network: `eip155:${config.chainId}`,
    assetAddress: config.assetAddress,
  });
  requireAmount(
    config.initialDeposit > 0n &&
      config.topUpAmount > 0n &&
      config.firstVoucherAmount > 0n &&
      config.firstVoucherAmount < config.secondVoucherAmount &&
      config.secondVoucherAmount <= config.initialDeposit &&
      config.initialDeposit + config.topUpAmount < 2n ** 96n,
  );

  const payer = privateKeyToAccount(config.payerPrivateKey);
  const payee = privateKeyToAccount(config.payeePrivateKey);
  const voucherSigner = privateKeyToAccount(config.voucherSignerPrivateKey);
  if (
    payer.address.toLowerCase() !== config.payerAddress.toLowerCase() ||
    payee.address.toLowerCase() !== config.payeeAddress.toLowerCase() ||
    voucherSigner.address.toLowerCase() !==
      config.voucherSignerAddress.toLowerCase()
  )
    throw new TempoProofError("CONFIG_INVALID");
  if (payer.address.toLowerCase() === payee.address.toLowerCase())
    throw new TempoProofError("CONFIG_INVALID");

  const chain = defineChain({
    id: config.chainId,
    name: "Tempo Moderato",
    nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const client = createPublicClient({
    chain,
    transport: http(config.rpcUrl, { timeout: 5000 }),
  });
  const payerClient = createWalletClient({
    account: payer,
    chain,
    transport: http(config.rpcUrl, { timeout: 5000 }),
  });
  const payeeClient = createWalletClient({
    account: payee,
    chain,
    transport: http(config.rpcUrl, { timeout: 5000 }),
  });

  async function tokenBalance(address: Address) {
    try {
      return await client.readContract({
        address: config.assetAddress,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [address],
      });
    } catch {
      throw new TempoProofError("PAYMENT_CHAIN_STATE_UNAVAILABLE");
    }
  }

  const payerBalance = await tokenBalance(config.payerAddress);
  const payeeBalance = await tokenBalance(config.payeeAddress);
  if (payerBalance < config.initialDeposit + config.topUpAmount + 1_000_000n)
    throw new TempoProofError("PAYMENT_FUNDS_INSUFFICIENT");
  if (payeeBalance < 1_000_000n)
    throw new TempoProofError("PAYMENT_FUNDS_INSUFFICIENT");
  try {
    await client.readContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "getVoucherDigest",
      args: [`0x${"00".repeat(32)}`, 1n],
    });
  } catch {
    throw new TempoProofError("PAYMENT_ENVIRONMENT_UNSUPPORTED");
  }

  async function confirm(
    operation: string,
    transactionHash: Hash,
  ): Promise<TransactionReceipt> {
    emit({ operation, state: "submitted", transactionHash });
    let receipt: TransactionReceipt;
    try {
      receipt = await client.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: 1,
        timeout: 45_000,
      });
    } catch {
      try {
        receipt = await client.getTransactionReceipt({ hash: transactionHash });
      } catch {
        try {
          await client.getBlockNumber();
        } catch {
          throw new TempoProofError(
            "PAYMENT_CHAIN_STATE_UNAVAILABLE",
            transactionHash,
          );
        }
        emit({
          operation,
          state: "pending",
          transactionHash,
          reasonCode: "PAYMENT_CONFIRMATION_PENDING",
        });
        throw new TempoProofError(
          "PAYMENT_CONFIRMATION_PENDING",
          transactionHash,
        );
      }
    }
    if (receipt.status !== "success") {
      emit({
        operation,
        state: "failed",
        transactionHash,
        reasonCode: "PAYMENT_TRANSACTION_FAILED",
      });
      throw new TempoProofError("PAYMENT_TRANSACTION_FAILED", transactionHash);
    }
    emit({ operation, state: "confirmed", transactionHash });
    return receipt;
  }

  async function channelState(channelId: Hash) {
    try {
      return await client.readContract({
        address: reserveAddress,
        abi: channelAbi,
        functionName: "getChannelState",
        args: [channelId],
      });
    } catch {
      throw new TempoProofError("PAYMENT_CHAIN_STATE_UNAVAILABLE", channelId);
    }
  }

  const salt = `0x${randomBytes(32).toString("hex")}` as Hash;
  let openHash: Hash;
  try {
    openHash = await payerClient.writeContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "open",
      args: [
        config.payeeAddress,
        zeroAddress,
        config.assetAddress,
        config.initialDeposit,
        salt,
        config.voucherSignerAddress,
      ],
    });
  } catch {
    throw new TempoProofError("PAYMENT_OPEN_FAILED");
  }
  const openReceipt = await confirm("open_channel", openHash);
  const opened = parseEventLogs({
    abi: channelAbi,
    logs: openReceipt.logs,
    eventName: "ChannelOpened",
    strict: true,
  })[0];
  if (!opened || opened.address.toLowerCase() !== reserveAddress.toLowerCase())
    throw new TempoProofError("PAYMENT_CHAIN_STATE_UNAVAILABLE", openHash);
  const channelId = opened.args.channelId;
  const descriptor = {
    payer: opened.args.payer,
    payee: opened.args.payee,
    operator: opened.args.operator,
    token: opened.args.token,
    salt: opened.args.salt,
    authorizedSigner: opened.args.authorizedSigner,
    expiringNonceHash: opened.args.expiringNonceHash,
  };
  if (
    descriptor.payer.toLowerCase() !== config.payerAddress.toLowerCase() ||
    descriptor.payee.toLowerCase() !== config.payeeAddress.toLowerCase() ||
    descriptor.token.toLowerCase() !== config.assetAddress.toLowerCase() ||
    descriptor.authorizedSigner.toLowerCase() !==
      config.voucherSignerAddress.toLowerCase()
  )
    throw new TempoProofError("PAYMENT_CHANNEL_MISMATCH", channelId);
  let state = await channelState(channelId);
  if (state.deposit !== config.initialDeposit || state.settled !== 0n)
    throw new TempoProofError("PAYMENT_CHAIN_STATE_UNAVAILABLE", channelId);
  emit({
    operation: "verify_funding",
    state: "confirmed",
    channelId,
    transactionHash: openHash,
    deposit: state.deposit.toString(),
    settled: state.settled.toString(),
    remaining: (state.deposit - state.settled).toString(),
  });

  const domain = voucherDomain(config.chainId);
  const types = voucherTypes;
  async function voucher(amount: bigint, operation: string) {
    const message = { channelId, cumulativeAmount: amount };
    const signature = await voucherSigner.signTypedData({
      domain,
      types,
      primaryType: "Voucher",
      message,
    });
    const recovered = await recoverTypedDataAddress({
      domain,
      types,
      primaryType: "Voucher",
      message,
      signature,
    });
    if (recovered.toLowerCase() !== config.voucherSignerAddress.toLowerCase())
      throw new TempoProofError("PAYMENT_AUTHORIZATION_INVALID", channelId);
    const proofReference = hashTypedData({
      domain,
      types,
      primaryType: "Voucher",
      message,
    });
    let chainDigest: Hash;
    try {
      chainDigest = await client.readContract({
        address: reserveAddress,
        abi: channelAbi,
        functionName: "getVoucherDigest",
        args: [channelId, amount],
      });
    } catch {
      throw new TempoProofError("PAYMENT_CHAIN_STATE_UNAVAILABLE", channelId);
    }
    if (proofReference.toLowerCase() !== chainDigest.toLowerCase())
      throw new TempoProofError("PAYMENT_ENVIRONMENT_UNSUPPORTED", channelId);
    emit({
      operation,
      state: "confirmed",
      channelId,
      proofReference,
      cumulativeAmount: amount.toString(),
    });
    return signature;
  }

  await voucher(config.firstVoucherAmount, "verify_first_voucher");
  const secondSignature = await voucher(
    config.secondVoucherAmount,
    "verify_higher_voucher",
  );

  let topUpHash: Hash;
  try {
    topUpHash = await payerClient.writeContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "topUp",
      args: [descriptor, config.topUpAmount],
    });
  } catch {
    throw new TempoProofError("PAYMENT_TOP_UP_FAILED", channelId);
  }
  await confirm("top_up", topUpHash);
  state = await channelState(channelId);
  if (
    state.deposit !== config.initialDeposit + config.topUpAmount ||
    state.settled !== 0n
  )
    throw new TempoProofError("PAYMENT_CHAIN_STATE_UNAVAILABLE", channelId);
  emit({
    operation: "verify_capacity",
    state: "confirmed",
    channelId,
    transactionHash: topUpHash,
    deposit: state.deposit.toString(),
    settled: state.settled.toString(),
    remaining: (state.deposit - state.settled).toString(),
  });

  let settleHash: Hash;
  try {
    settleHash = await payeeClient.writeContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "settle",
      args: [descriptor, config.secondVoucherAmount, secondSignature],
    });
  } catch {
    throw new TempoProofError("PAYMENT_SETTLEMENT_FAILED", channelId);
  }
  await confirm("partial_settlement", settleHash);
  state = await channelState(channelId);
  if (
    state.settled !== config.secondVoucherAmount ||
    state.deposit !== config.initialDeposit + config.topUpAmount
  )
    throw new TempoProofError("PAYMENT_CHAIN_STATE_UNAVAILABLE", channelId);
  emit({
    operation: "verify_settlement",
    state: "confirmed",
    channelId,
    transactionHash: settleHash,
    deposit: state.deposit.toString(),
    settled: state.settled.toString(),
    remaining: (state.deposit - state.settled).toString(),
  });

  const payerBeforeClose = await tokenBalance(config.payerAddress);
  let closeHash: Hash;
  try {
    closeHash = await payeeClient.writeContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "close",
      args: [
        descriptor,
        config.secondVoucherAmount,
        config.secondVoucherAmount,
        secondSignature,
      ],
    });
  } catch {
    throw new TempoProofError("PAYMENT_CLOSE_FAILED", channelId);
  }
  const closeReceipt = await confirm("cooperative_close", closeHash);
  const closed = parseEventLogs({
    abi: channelAbi,
    logs: closeReceipt.logs,
    eventName: "ChannelClosed",
    strict: true,
  }).find(
    (event) => event.args.channelId.toLowerCase() === channelId.toLowerCase(),
  );
  if (!closed || closed.address.toLowerCase() !== reserveAddress.toLowerCase())
    throw new TempoProofError("PAYMENT_CHAIN_STATE_UNAVAILABLE", closeHash);
  const expectedRefund =
    config.initialDeposit + config.topUpAmount - config.secondVoucherAmount;
  const payerAfterClose = await tokenBalance(config.payerAddress);
  state = await channelState(channelId);
  if (
    closed.args.refundedToPayer !== expectedRefund ||
    payerAfterClose - payerBeforeClose !== expectedRefund ||
    state.deposit !== 0n ||
    state.settled !== 0n
  )
    throw new TempoProofError("PAYMENT_REFUND_UNVERIFIED", closeHash);
  emit({
    operation: "verify_refund",
    state: "confirmed",
    channelId,
    transactionHash: closeHash,
    refunded: expectedRefund.toString(),
    deposit: "0",
    settled: config.secondVoucherAmount.toString(),
    remaining: "0",
  });
  return { channelId, openHash, topUpHash, settleHash, closeHash };
}
