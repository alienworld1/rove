import {
  createPublicClient,
  createWalletClient,
  defineChain,
  hashTypedData,
  http,
  keccak256,
  parseAbiItem,
  parseEventLogs,
  recoverTypedDataAddress,
  toHex,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { TempoProofConfig } from "./proof.js";
import {
  channelAbi,
  reserveAddress,
  voucherDomain,
  voucherTypes,
} from "./protocol.js";

export type TempoChannelConfig = Omit<
  TempoProofConfig,
  | "initialDeposit"
  | "topUpAmount"
  | "firstVoucherAmount"
  | "secondVoucherAmount"
>;
export type ChannelDescriptor = {
  payer: Address;
  payee: Address;
  operator: Address;
  token: Address;
  salt: Hash;
  authorizedSigner: Address;
  expiringNonceHash: Hash;
};
export type ChannelObservation = {
  channelId: Hash;
  network: string;
  assetId: string;
  observedAt: string;
  confirmedDeposit: string;
  settledValue: string;
  chainHeight: string;
  transactionHash?: Hash;
  descriptor?: ChannelDescriptor;
};
export type ChannelLookup =
  | { status: "pending" | "not_found" | "unknown"; externalReference?: Hash }
  | { status: "failed"; externalReference: Hash; reasonCode: string }
  | {
      status: "completed";
      externalReference: Hash;
      observation: ChannelObservation;
    };

const openedEvent = parseAbiItem(
  "event ChannelOpened(bytes32 indexed channelId,address indexed payer,address indexed payee,address operator,address token,address authorizedSigner,bytes32 salt,bytes32 expiringNonceHash,uint96 deposit)",
);

function descriptorFromEvent(args: {
  payer: Address;
  payee: Address;
  operator: Address;
  token: Address;
  salt: Hash;
  authorizedSigner: Address;
  expiringNonceHash: Hash;
}): ChannelDescriptor {
  return {
    payer: args.payer,
    payee: args.payee,
    operator: args.operator,
    token: args.token,
    salt: args.salt,
    authorizedSigner: args.authorizedSigner,
    expiringNonceHash: args.expiringNonceHash,
  };
}

export function createTempoChannelAdapter(config: TempoChannelConfig) {
  const payer = privateKeyToAccount(config.payerPrivateKey);
  const payee = privateKeyToAccount(config.payeePrivateKey);
  const signer = privateKeyToAccount(config.voucherSignerPrivateKey);
  if (
    payer.address.toLowerCase() !== config.payerAddress.toLowerCase() ||
    payee.address.toLowerCase() !== config.payeeAddress.toLowerCase() ||
    signer.address.toLowerCase() !== config.voucherSignerAddress.toLowerCase()
  )
    throw new Error("CONFIG_INVALID");
  const chain = defineChain({
    id: config.chainId,
    name: "Tempo Moderato",
    nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const transport = http(config.rpcUrl, { timeout: 5_000 });
  const client = createPublicClient({ chain, transport });
  const payerClient = createWalletClient({ account: payer, chain, transport });
  const payeeClient = createWalletClient({ account: payee, chain, transport });

  async function assertDescriptor(
    channelId: Hash,
    descriptor: ChannelDescriptor,
  ) {
    if (
      descriptor.payer.toLowerCase() !== payer.address.toLowerCase() ||
      descriptor.payee.toLowerCase() !== payee.address.toLowerCase() ||
      descriptor.token.toLowerCase() !== config.assetAddress.toLowerCase() ||
      descriptor.authorizedSigner.toLowerCase() !==
        signer.address.toLowerCase() ||
      descriptor.operator !== zeroAddress
    )
      throw new Error("PAYMENT_CHANNEL_MISMATCH");
    const actualId = await client.readContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "computeChannelId",
      args: [
        descriptor.payer,
        descriptor.payee,
        descriptor.operator,
        descriptor.token,
        descriptor.salt,
        descriptor.authorizedSigner,
        descriptor.expiringNonceHash,
      ],
    });
    if (actualId.toLowerCase() !== channelId.toLowerCase())
      throw new Error("PAYMENT_CHANNEL_MISMATCH");
  }

  async function readChannel(
    channelId: Hash,
    transactionHash?: Hash,
    descriptor?: ChannelDescriptor,
  ): Promise<ChannelObservation> {
    const [state, chainHeight] = await Promise.all([
      client.readContract({
        address: reserveAddress,
        abi: channelAbi,
        functionName: "getChannelState",
        args: [channelId],
      }),
      client.getBlockNumber(),
    ]);
    if (state.closeRequestedAt !== 0 || state.deposit === 0n)
      throw new Error("PAYMENT_CHANNEL_INACTIVE");
    return {
      channelId,
      network: `eip155:${config.chainId}`,
      assetId: config.assetAddress.toLowerCase(),
      observedAt: new Date().toISOString(),
      confirmedDeposit: state.deposit.toString(),
      settledValue: state.settled.toString(),
      chainHeight: chainHeight.toString(),
      transactionHash,
      descriptor,
    };
  }

  async function receipt(hash: Hash) {
    try {
      const result = await client.getTransactionReceipt({ hash });
      if (result.status !== "success")
        return {
          status: "failed" as const,
          externalReference: hash,
          reasonCode: "PAYMENT_TRANSACTION_FAILED",
        };
      if (result.to?.toLowerCase() !== reserveAddress.toLowerCase())
        return {
          status: "failed" as const,
          externalReference: hash,
          reasonCode: "PAYMENT_TRANSACTION_MISMATCH",
        };
      return { status: "confirmed" as const, receipt: result };
    } catch {
      try {
        await client.getBlockNumber();
        return { status: "pending" as const, externalReference: hash };
      } catch {
        return { status: "unknown" as const, externalReference: hash };
      }
    }
  }

  async function findOpen(key: string) {
    const salt = keccak256(toHex(key));
    const logs = await client.getLogs({
      address: reserveAddress,
      event: openedEvent,
      args: { payer: payer.address, payee: payee.address },
      fromBlock: 0n,
    });
    return (
      logs.find((log) => log.args.salt?.toLowerCase() === salt.toLowerCase()) ??
      null
    );
  }

  async function reconcileOpen(
    key: string,
    reference?: Hash,
  ): Promise<ChannelLookup> {
    try {
      if (!reference) {
        const found = await findOpen(key);
        if (!found?.transactionHash) return { status: "not_found" };
        reference = found.transactionHash;
      }
      const result = await receipt(reference);
      if (result.status !== "confirmed") return result;
      const opened = parseEventLogs({
        abi: channelAbi,
        logs: result.receipt.logs,
        eventName: "ChannelOpened",
        strict: true,
      }).find(
        (event) =>
          event.args.salt.toLowerCase() === keccak256(toHex(key)).toLowerCase(),
      );
      if (
        !opened ||
        opened.address.toLowerCase() !== reserveAddress.toLowerCase()
      )
        return { status: "unknown", externalReference: reference };
      if (
        opened.args.payer.toLowerCase() !== payer.address.toLowerCase() ||
        opened.args.payee.toLowerCase() !== payee.address.toLowerCase() ||
        opened.args.token.toLowerCase() !== config.assetAddress.toLowerCase() ||
        opened.args.authorizedSigner.toLowerCase() !==
          signer.address.toLowerCase()
      )
        return { status: "unknown", externalReference: reference };
      return {
        status: "completed",
        externalReference: reference,
        observation: await readChannel(
          opened.args.channelId,
          reference,
          descriptorFromEvent(opened.args),
        ),
      };
    } catch {
      return { status: "unknown", externalReference: reference };
    }
  }

  async function submitOpen(key: string, amount: bigint) {
    const hash = await payerClient.writeContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "open",
      args: [
        payee.address,
        zeroAddress,
        config.assetAddress,
        amount,
        keccak256(toHex(key)),
        signer.address,
      ],
    });
    return { status: "submitted" as const, externalReference: hash };
  }

  async function signVoucher(channelId: Hash, amount: bigint) {
    if (amount <= 0n || amount >= 2n ** 96n)
      throw new Error("PAYMENT_AUTHORIZATION_INVALID");
    const domain = voucherDomain(config.chainId);
    const message = { channelId, cumulativeAmount: amount };
    const signature = await signer.signTypedData({
      domain,
      types: voucherTypes,
      primaryType: "Voucher",
      message,
    });
    const [recovered, chainDigest] = await Promise.all([
      recoverTypedDataAddress({
        domain,
        types: voucherTypes,
        primaryType: "Voucher",
        message,
        signature,
      }),
      client.readContract({
        address: reserveAddress,
        abi: channelAbi,
        functionName: "getVoucherDigest",
        args: [channelId, amount],
      }),
    ]);
    const digest = hashTypedData({
      domain,
      types: voucherTypes,
      primaryType: "Voucher",
      message,
    });
    if (
      recovered.toLowerCase() !== signer.address.toLowerCase() ||
      digest.toLowerCase() !== chainDigest.toLowerCase()
    )
      throw new Error("PAYMENT_AUTHORIZATION_INVALID");
    return {
      channelId,
      cumulativeAmount: amount.toString(),
      digest,
      signature,
      signerRef: signer.address,
      domainRef: `${config.chainId}:${reserveAddress}`,
    };
  }

  async function submitTopUp(
    channelId: Hash,
    descriptor: ChannelDescriptor,
    amount: bigint,
  ) {
    await assertDescriptor(channelId, descriptor);
    const hash = await payerClient.writeContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "topUp",
      args: [descriptor, amount],
    });
    return { status: "submitted" as const, externalReference: hash };
  }

  async function submitSettlement(
    channelId: Hash,
    descriptor: ChannelDescriptor,
    amount: bigint,
    signature: Hex,
  ) {
    await assertDescriptor(channelId, descriptor);
    const hash = await payeeClient.writeContract({
      address: reserveAddress,
      abi: channelAbi,
      functionName: "settle",
      args: [descriptor, amount, signature],
    });
    return { status: "submitted" as const, externalReference: hash };
  }

  async function reconcileTransaction(
    operation: "top_up" | "settle",
    channelId: Hash,
    amount: bigint,
    reference?: Hash,
  ): Promise<ChannelLookup> {
    if (!reference) return { status: "not_found" };
    const result = await receipt(reference);
    if (result.status !== "confirmed") return result;
    try {
      const eventName = operation === "top_up" ? "TopUp" : "Settled";
      const event = parseEventLogs({
        abi: channelAbi,
        logs: result.receipt.logs,
        eventName,
        strict: true,
      }).find(
        (item) => item.args.channelId.toLowerCase() === channelId.toLowerCase(),
      );
      if (
        !event ||
        event.address.toLowerCase() !== reserveAddress.toLowerCase() ||
        (operation === "top_up" &&
          eventName === "TopUp" &&
          "additionalDeposit" in event.args &&
          event.args.additionalDeposit !== amount) ||
        (operation === "settle" &&
          eventName === "Settled" &&
          "cumulativeAmount" in event.args &&
          event.args.cumulativeAmount !== amount)
      )
        return { status: "unknown", externalReference: reference };
      return {
        status: "completed",
        externalReference: reference,
        observation: await readChannel(channelId, reference),
      };
    } catch {
      return { status: "unknown", externalReference: reference };
    }
  }

  return {
    readChannel,
    reconcileOpen,
    submitOpen,
    signVoucher,
    submitTopUp,
    submitSettlement,
    reconcileTransaction,
  };
}
