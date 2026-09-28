import { parseAbi } from "viem";

export const reserveAddress =
  "0x4d50500000000000000000000000000000000000" as const;
export const channelAbi = parseAbi([
  "function open(address payee,address operator,address token,uint96 deposit,bytes32 salt,address authorizedSigner) returns (bytes32 channelId)",
  "function topUp((address payer,address payee,address operator,address token,bytes32 salt,address authorizedSigner,bytes32 expiringNonceHash) descriptor,uint96 additionalDeposit)",
  "function settle((address payer,address payee,address operator,address token,bytes32 salt,address authorizedSigner,bytes32 expiringNonceHash) descriptor,uint96 cumulativeAmount,bytes signature)",
  "function close((address payer,address payee,address operator,address token,bytes32 salt,address authorizedSigner,bytes32 expiringNonceHash) descriptor,uint96 cumulativeAmount,uint96 captureAmount,bytes signature)",
  "function getChannelState(bytes32 channelId) view returns ((uint96 settled,uint96 deposit,uint32 closeRequestedAt) state)",
  "function computeChannelId(address payer,address payee,address operator,address token,bytes32 salt,address authorizedSigner,bytes32 expiringNonceHash) view returns (bytes32)",
  "function getVoucherDigest(bytes32 channelId,uint96 cumulativeAmount) view returns (bytes32)",
  "event ChannelOpened(bytes32 indexed channelId,address indexed payer,address indexed payee,address operator,address token,address authorizedSigner,bytes32 salt,bytes32 expiringNonceHash,uint96 deposit)",
  "event TopUp(bytes32 indexed channelId,address indexed payer,address indexed payee,uint96 additionalDeposit,uint96 newDeposit)",
  "event Settled(bytes32 indexed channelId,address indexed payer,address indexed payee,uint96 cumulativeAmount,uint96 deltaPaid,uint96 newSettled)",
  "event ChannelClosed(bytes32 indexed channelId,address indexed payer,address indexed payee,uint96 settledToPayee,uint96 refundedToPayer)",
]);

export const voucherDomain = (chainId: number) =>
  ({
    name: "TIP20 Channel Reserve",
    version: "1",
    chainId,
    verifyingContract: reserveAddress,
  }) as const;

export const voucherTypes = {
  Voucher: [
    { name: "channelId", type: "bytes32" },
    { name: "cumulativeAmount", type: "uint96" },
  ],
} as const;
