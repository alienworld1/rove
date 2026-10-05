import type { PublishedRun } from "@rove/contracts";

export function newestTempoRecording(runs: PublishedRun[]) {
  return runs
    .filter((run) => run.payment === "Tempo testnet")
    .reduce<PublishedRun | null>(
      (newest, run) =>
        !newest || Date.parse(run.publishedAt) > Date.parse(newest.publishedAt)
          ? run
          : newest,
      null,
    );
}
