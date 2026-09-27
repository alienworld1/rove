import { readPaymentConfig } from "@rove/config";
import { runTempoProof, TempoProofError } from "@rove/tempo";

try {
  const config = readPaymentConfig();
  if (config.TEMPO_SESSION_BACKEND !== "precompile")
    throw new TempoProofError("PAYMENT_ENVIRONMENT_UNSUPPORTED");
  await runTempoProof(
    {
      rpcUrl: config.TEMPO_RPC_URL,
      chainId: config.TEMPO_CHAIN_ID,
      assetAddress: config.TEMPO_ASSET_ADDRESS.toLowerCase() as `0x${string}`,
      assetDecimals: config.TEMPO_ASSET_DECIMALS,
      payerAddress: config.TEMPO_PAYER_ADDRESS.toLowerCase() as `0x${string}`,
      payeeAddress: config.TEMPO_PAYEE_ADDRESS.toLowerCase() as `0x${string}`,
      voucherSignerAddress:
        config.TEMPO_VOUCHER_SIGNER_ADDRESS.toLowerCase() as `0x${string}`,
      payerPrivateKey: config.TEMPO_PAYER_PRIVATE_KEY as `0x${string}`,
      payeePrivateKey: config.TEMPO_PAYEE_PRIVATE_KEY as `0x${string}`,
      voucherSignerPrivateKey:
        config.TEMPO_VOUCHER_SIGNER_PRIVATE_KEY as `0x${string}`,
      initialDeposit: BigInt(config.TEMPO_INITIAL_DEPOSIT),
      topUpAmount: BigInt(config.TEMPO_TOP_UP_AMOUNT),
      firstVoucherAmount: BigInt(config.TEMPO_FIRST_VOUCHER_AMOUNT),
      secondVoucherAmount: BigInt(config.TEMPO_SECOND_VOUCHER_AMOUNT),
    },
    (step) => process.stdout.write(`${JSON.stringify(step)}\n`),
  );
} catch (error) {
  const reasonCode =
    error instanceof TempoProofError
      ? error.reasonCode
      : error instanceof Error && error.message.startsWith("CONFIG_INVALID")
        ? "CONFIG_INVALID"
        : "PAYMENT_PROOF_FAILED";
  const reference =
    error instanceof TempoProofError ? error.reference : undefined;
  process.stderr.write(
    `${JSON.stringify({ operation: "payment_proof", state: "failed", reasonCode, reference })}\n`,
  );
  process.exitCode = 1;
}
