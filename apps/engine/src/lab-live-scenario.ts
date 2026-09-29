import { randomUUID } from "node:crypto";
import { readPaymentConfig } from "@rove/config";
import type { LabScenario } from "@rove/contracts";
import { northstarVoltwayScenario } from "@rove/lab/scenarios/northstar-voltway";

export function createLiveLabScenario(): LabScenario {
  const config = readPaymentConfig();
  if (config.TEMPO_SESSION_BACKEND !== "precompile")
    throw new Error("PAYMENT_ENVIRONMENT_UNSUPPORTED");
  return {
    ...northstarVoltwayScenario,
    id: `northstar-voltway-tempo-${randomUUID()}`,
    name: "Northstar Mobility ↔ Voltway · Tempo testnet",
    description:
      "Three digital-twin charging sessions use independent Tempo testnet channels, signed meter readings, and protection recovery.",
    traceEpoch: new Date().toISOString(),
    corridor: {
      ...northstarVoltwayScenario.corridor,
      settlementAssetId: config.TEMPO_ASSET_ADDRESS.toLowerCase(),
      tempoNetwork: `eip155:${config.TEMPO_CHAIN_ID}`,
      tariff: {
        ...northstarVoltwayScenario.corridor.tariff,
        tariffDecimals: config.TEMPO_ASSET_DECIMALS,
        assetDecimals: config.TEMPO_ASSET_DECIMALS,
      },
      protectionPolicy: {
        ...northstarVoltwayScenario.corridor.protectionPolicy,
        evidenceMaxAgeMs: 600_000,
        chainMaxAgeMs: 600_000,
      },
    },
  };
}
