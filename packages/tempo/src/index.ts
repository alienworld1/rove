import { encodeFunctionData, hashTypedData, parseAbi } from "viem";

export type PaymentOperationState =
  "idle" | "submitted" | "pending" | "confirmed" | "failed";

export { runTempoProof, TempoProofError } from "./proof.js";
export type { TempoProofConfig, TempoProofStep } from "./proof.js";

export type PaymentProbeResult = {
  state: "ready" | "blocked";
  reasonCode?:
    "PAYMENT_CHAIN_STATE_UNAVAILABLE" | "PAYMENT_ENVIRONMENT_UNSUPPORTED";
  chainId?: number;
  assetDecimals?: number;
};

type ProbeConfig = {
  rpcUrl: string;
  chainId: number;
  assetAddress: string;
  assetDecimals?: number;
};

async function rpc<T>(
  url: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("PAYMENT_CHAIN_STATE_UNAVAILABLE");
  const body = (await response.json()) as { result?: T; error?: unknown };
  if (body.error || body.result === undefined)
    throw new Error("PAYMENT_CHAIN_STATE_UNAVAILABLE");
  return body.result;
}

export async function probePaymentEnvironment(
  config: ProbeConfig,
): Promise<PaymentProbeResult> {
  try {
    const chainHex = await rpc<string>(config.rpcUrl, "eth_chainId", []);
    const chainId = Number(BigInt(chainHex));
    if (chainId !== config.chainId || chainId !== 42431)
      return {
        state: "blocked",
        reasonCode: "PAYMENT_ENVIRONMENT_UNSUPPORTED",
        chainId,
      };
    const decimalsHex = await rpc<string>(config.rpcUrl, "eth_call", [
      { to: config.assetAddress, data: "0x313ce567" },
      "latest",
    ]);
    const assetDecimals = Number(BigInt(decimalsHex));
    if (
      config.assetDecimals !== undefined &&
      assetDecimals !== config.assetDecimals
    )
      return {
        state: "blocked",
        reasonCode: "PAYMENT_ENVIRONMENT_UNSUPPORTED",
        chainId,
        assetDecimals,
      };
    const reserveAddress = "0x4d50500000000000000000000000000000000000";
    const channelId = `0x${"00".repeat(32)}` as const;
    const digestCall = encodeFunctionData({
      abi: parseAbi([
        "function getVoucherDigest(bytes32 channelId,uint96 cumulativeAmount) view returns (bytes32)",
      ]),
      functionName: "getVoucherDigest",
      args: [channelId, 1n],
    });
    const chainDigest = await rpc<string>(config.rpcUrl, "eth_call", [
      { to: reserveAddress, data: digestCall },
      "latest",
    ]);
    const localDigest = hashTypedData({
      domain: {
        name: "TIP20 Channel Reserve",
        version: "1",
        chainId,
        verifyingContract: reserveAddress,
      },
      types: {
        Voucher: [
          { name: "channelId", type: "bytes32" },
          { name: "cumulativeAmount", type: "uint96" },
        ],
      },
      primaryType: "Voucher",
      message: { channelId, cumulativeAmount: 1n },
    });
    if (chainDigest.toLowerCase() !== localDigest.toLowerCase())
      return {
        state: "blocked",
        reasonCode: "PAYMENT_ENVIRONMENT_UNSUPPORTED",
        chainId,
        assetDecimals,
      };
    return { state: "ready", chainId, assetDecimals };
  } catch {
    return { state: "blocked", reasonCode: "PAYMENT_CHAIN_STATE_UNAVAILABLE" };
  }
}
