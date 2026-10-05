import { randomUUID } from "node:crypto";
import { readPaymentConfig } from "@rove/config";
import type { LabScenario } from "@rove/contracts";
import { createPresentationScenario } from "@rove/lab/scenarios/northstar-voltway-presentation";

export function createLiveLabScenario(): LabScenario {
  const config = readPaymentConfig();
  if (config.TEMPO_SESSION_BACKEND !== "precompile")
    throw new Error("PAYMENT_ENVIRONMENT_UNSUPPORTED");
  const scenario = createPresentationScenario(config.TEMPO_ASSET_DECIMALS);
  return {
    ...scenario,
    id: `northstar-voltway-tempo-${randomUUID()}`,
    name: "Northstar Mobility ↔ Voltway · Tempo testnet",
    description:
      "Three digital-twin charging sessions use independent Tempo testnet channels, signed meter readings, and protection recovery.",
    traceEpoch: new Date().toISOString(),
    corridor: {
      ...scenario.corridor,
      settlementAssetId: config.TEMPO_ASSET_ADDRESS.toLowerCase(),
      tempoNetwork: `eip155:${config.TEMPO_CHAIN_ID}`,
    },
  };
}
