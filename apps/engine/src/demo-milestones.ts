import type { LaneHistory, RunGuidance } from "@rove/contracts";

export function collectDemoMilestones(
  histories: { laneId: string; history: LaneHistory }[],
  traceEpoch: string,
  traceEndMs: number,
): RunGuidance["reached"] {
  const candidates: RunGuidance["reached"] = [];
  for (const { laneId, history } of histories) {
    let previous = history[0]?.snapshot;
    let offset = 0;
    let rejectedVersion: number | null | undefined;
    for (const event of history) {
      const snapshot = event.snapshot;
      if (!snapshot) continue;
      const time = event.traceTime
        ? Date.parse(event.traceTime) - Date.parse(traceEpoch)
        : offset;
      if (time >= 0 && time <= traceEndMs && !event.type.startsWith("payment."))
        offset = Math.max(offset, time);
      const add = (id: RunGuidance["reached"][number]["id"]) =>
        candidates.push({
          id,
          laneId,
          eventId: event.id,
          traceOffsetMs: offset,
        });
      if (
        event.type === "payment.voucher_verified" &&
        BigInt(snapshot.protectedValue) > 0n
      )
        add("accepted");
      if (event.type === "payment.chain_observed" && previous) {
        if (
          snapshot.confirmedDeposit !== null &&
          previous.confirmedDeposit !== null &&
          BigInt(snapshot.confirmedDeposit) > BigInt(previous.confirmedDeposit)
        )
          add("top_up");
        if (BigInt(snapshot.settledValue) > BigInt(previous.settledValue))
          add("settled");
      }
      if (event.type === "meter.evidence_rejected") {
        add("rejected");
        rejectedVersion = event.version;
      }
      if (
        snapshot.state === "AT_RISK" &&
        event.version !== rejectedVersion &&
        BigInt(snapshot.unprotectedExposureBound) > 0n
      )
        add("risk");
      if (event.type === "pause.requested") add("pause");
      if (event.type === "lane.protection_restored") add("recovered");
      previous = snapshot;
    }
  }
  const seen = new Set<string>();
  return candidates
    .sort((a, b) => a.traceOffsetMs - b.traceOffsetMs)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}
