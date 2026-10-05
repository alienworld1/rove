import { tempoTransactionUrl } from "./payment-asset";

export function TempoTransactionLink({
  network,
  hash,
  operation,
}: {
  network: string;
  hash: string | null;
  operation: string;
}) {
  const url = tempoTransactionUrl(network, hash);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${operation} on Tempo testnet (opens in a new tab)`}
      className="inline-flex min-h-11 items-center text-xs text-info underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-info"
    >
      View on Tempo ↗
    </a>
  );
}
