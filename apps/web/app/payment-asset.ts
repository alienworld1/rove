const tempoTestnet = "eip155:42431";
const pathUsd = "0x20c0000000000000000000000000000000000000";

const assetRegistry = new Map([
  [`${tempoTestnet}:${pathUsd}`, "PathUSD"],
  ["local-simulation:test_asset", "Simulation units"],
]);

export function paymentAssetLabel(network: string, assetId: string): string {
  return (
    assetRegistry.get(`${network}:${assetId.toLowerCase()}`) ??
    `Asset ${assetId}`
  );
}

export function paymentNetworkLabel(network: string): string {
  if (network === tempoTestnet) return "Tempo testnet";
  if (network === "local-simulation") return "Local simulation";
  return network;
}

export function tempoTransactionUrl(network: string, hash: string | null) {
  return network === tempoTestnet && hash && /^0x[0-9a-fA-F]{64}$/.test(hash)
    ? `https://explore.testnet.tempo.xyz/tx/${hash}`
    : null;
}
