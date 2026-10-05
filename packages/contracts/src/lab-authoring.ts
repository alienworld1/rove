import type { LabScenario, LabScenarioEvent } from "./lab.ts";

/** Exact base-10 parsing; never pass financial amounts through Number. */
export function parseLabDecimal(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new Error("Choose a supported precision.");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > decimals)
    throw new Error(
      `Enter a non-negative amount with at most ${decimals} decimal places.`,
    );
  return BigInt(
    `${match[1]}${(match[2] ?? "").padEnd(decimals, "0")}`,
  ).toString();
}
export function displayLabDecimal(value: string, decimals: number): string {
  if (!/^\d+$/.test(value)) return value;
  const padded = value.padStart(decimals + 1, "0");
  if (!decimals) return padded;
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${padded.slice(0, -decimals)}${fraction ? `.${fraction}` : ""}`;
}
export const labEventLabels = {
  session_start: "Session start",
  valid_reading: "Signed reading",
  recovery_reading: "Evidence recovery",
  corrupt_signature: "Invalid signature",
  wrong_meter: "Wrong meter",
  replay_reading: "Replay reading",
  sequence_break: "Sequence break",
  evidence_gap: "Evidence gap",
  signer_unavailable: "Signer unavailable",
  signer_restored: "Signer restored",
  top_up_failure: "Top-up failure",
  tempo_unavailable: "Tempo unavailable",
  tempo_restored: "Tempo restored",
  protection_tick: "Protection check",
} satisfies Record<LabScenarioEvent["type"], string>;
export const labFaultDescriptions: Partial<
  Record<LabScenarioEvent["type"], string>
> = {
  corrupt_signature:
    "The signature check fails. This reading cannot advance trusted value.",
  wrong_meter:
    "The reading comes from a different meter and fails identity checks.",
  replay_reading:
    "Resubmit the previous reading. It cannot authorize payment twice.",
  sequence_break:
    "The reading skips the expected sequence and fails continuity checks.",
  evidence_gap:
    "Signed evidence is unavailable. Physical uncertainty grows until fresh evidence returns.",
  signer_unavailable:
    "Trusted evidence may advance while payment authorization is unavailable.",
  top_up_failure:
    "The next funding attempt cannot supply additional payment headroom.",
  tempo_unavailable:
    "Payment state is unavailable. Funding and settlement cannot be treated as confirmed.",
};
export function orderLabEvents(events: LabScenarioEvent[]) {
  return [...events].sort(
    (a, b) =>
      a.traceOffsetMs - b.traceOffsetMs ||
      a.sequence - b.sequence ||
      a.id.localeCompare(b.id),
  );
}
export function resequenceLabEvents(events: LabScenarioEvent[]) {
  return orderLabEvents(events).map((event, sequence) => ({
    ...event,
    sequence,
  }));
}
export function copyLabScenario(source: LabScenario, id: string): LabScenario {
  return {
    ...structuredClone(source),
    schemaVersion: 2,
    id,
    name: `${source.name} · Copy`,
  };
}

/** Conservative input trace: hold cumulative energy while evidence is faulty. */
export function generateLabReadings(
  scenario: LabScenario,
  laneKey: string,
  powerWatts: string,
  durationMs: number,
): LabScenarioEvent[] {
  const lane = scenario.lanes.find((item) => item.key === laneKey);
  if (!lane) throw new Error("Choose a Lane.");
  const power = BigInt(powerWatts);
  if (power <= BigInt(0) || power > BigInt(lane.maxPowerWatts))
    throw new Error(
      "Delivery power must be positive and within the Lane maximum.",
    );
  if (
    !Number.isInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > 3_600_000
  )
    throw new Error("Choose a trace duration between 0 and 3,600 seconds.");
  const cadence = lane.expectedProofIntervalMs;
  if (!Number.isInteger(cadence) || cadence <= 0)
    throw new Error("Choose a positive proof cadence.");
  const retained = scenario.events.filter(
    (event) => event.laneKey !== laneKey || event.type !== "valid_reading",
  );
  const controls = orderLabEvents(
    retained.filter((event) => event.laneKey === laneKey),
  );
  const start = controls.find((event) => event.type === "session_start");
  if (!start || durationMs <= start.traceOffsetMs)
    throw new Error("The trace must end after this Lane starts.");
  if (
    controls.some(
      (event) => event.traceOffsetMs + (event.durationMs ?? 0) > durationMs,
    )
  )
    throw new Error(
      "Extend the trace to include all faults and recovery points.",
    );
  const count = Math.ceil((durationMs - start.traceOffsetMs) / cadence);
  if (count + retained.length > 200)
    throw new Error(
      "This cadence would exceed 200 events. Increase cadence or shorten the trace.",
    );
  const readingOffsets = new Set<number>([durationMs]);
  for (let at = start.traceOffsetMs + cadence; at < durationMs; at += cadence)
    readingOffsets.add(at);
  const offsets = new Set(readingOffsets);
  for (const event of controls) offsets.add(event.traceOffsetMs);
  let milliWh = BigInt(lane.initialEnergyWh) * BigInt(1000);
  let numerator = BigInt(0);
  let previous = start.traceOffsetMs;
  let suspended = false;
  const replacements = new Map<string, LabScenarioEvent>();
  const generated: LabScenarioEvent[] = [];
  for (const at of [...offsets].sort((a, b) => a - b)) {
    if (at < start.traceOffsetMs) continue;
    if (!suspended) {
      numerator += power * BigInt(at - previous);
      milliWh =
        BigInt(lane.initialEnergyWh) * BigInt(1000) + numerator / BigInt(3600);
    }
    previous = at;
    const here = controls.filter((event) => event.traceOffsetMs === at);
    for (const event of here) {
      if (
        [
          "corrupt_signature",
          "wrong_meter",
          "replay_reading",
          "sequence_break",
          "evidence_gap",
        ].includes(event.type)
      )
        suspended = true;
      if (event.type === "recovery_reading") suspended = false;
      if ("cumulativeMilliWh" in event.parameters)
        replacements.set(event.id, {
          ...event,
          parameters: { cumulativeMilliWh: milliWh.toString() },
        } as LabScenarioEvent);
    }
    if (
      at > start.traceOffsetMs &&
      readingOffsets.has(at) &&
      !suspended &&
      !here.some((event) => "cumulativeMilliWh" in event.parameters)
    ) {
      generated.push({
        id: `reading-${laneKey}-${at}`,
        laneKey,
        traceOffsetMs: at,
        sequence: 10_000,
        type: "valid_reading",
        durationMs: null,
        parameters: { cumulativeMilliWh: milliWh.toString() },
      } as LabScenarioEvent);
    }
  }
  return resequenceLabEvents([
    ...retained.map((event) => replacements.get(event.id) ?? event),
    ...generated,
  ]);
}
