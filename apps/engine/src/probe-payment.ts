import { readPaymentProbeConfig } from "@rove/config";
import { probePaymentEnvironment } from "@rove/tempo";

const config = readPaymentProbeConfig();
const result = await probePaymentEnvironment({
  rpcUrl: config.TEMPO_RPC_URL,
  chainId: config.TEMPO_CHAIN_ID,
  assetAddress: config.TEMPO_ASSET_ADDRESS,
});
process.stdout.write(
  `${JSON.stringify({ operation: "check_payment_environment", ...result })}\n`,
);
if (result.state !== "ready") process.exitCode = 1;
