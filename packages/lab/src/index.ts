import { createHash } from "node:crypto";
import {
  labScenarioSchema,
  type LabScenario,
  type LabScenarioEvent,
} from "@rove/contracts";

export const LAB_COMPILER_VERSION = 1;
export type LabIssue = { path: string; message: string };
export type CompiledLabScenario = {
  definition: LabScenario;
  events: LabScenarioEvent[];
  digest: string;
  compilerVersion: number;
  warnings: string[];
};

export class LabValidationError extends Error {
  constructor(public issues: LabIssue[]) {
    super("Scenario validation failed");
  }
}

function duplicate(values: string[], path: string, issues: LabIssue[]) {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value))
      issues.push({
        path: `${path}.${index}`,
        message: "Choose a unique identity.",
      });
    seen.add(value);
  }
}

export function compileLabScenario(
  input: unknown,
  approvedProfiles: ReadonlySet<string>,
): CompiledLabScenario {
  const parsed = labScenarioSchema.safeParse(input);
  if (!parsed.success)
    throw new LabValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message:
          issue.path[0] === "schemaVersion"
            ? "This scenario version isn't supported yet."
            : issue.message,
      })),
    );
  const definition = parsed.data;
  const issues: LabIssue[] = [];
  duplicate(
    definition.lanes.map((lane) => lane.key),
    "lanes",
    issues,
  );
  duplicate(
    definition.lanes.map((lane) => lane.meterId),
    "lanes",
    issues,
  );
  duplicate(
    definition.lanes.map((lane) => lane.chargerId),
    "lanes",
    issues,
  );
  duplicate(
    definition.lanes.map((lane) => lane.sessionId),
    "lanes",
    issues,
  );
  duplicate(
    definition.events.map((event) => event.id),
    "events",
    issues,
  );
  const laneKeys = new Set(definition.lanes.map((lane) => lane.key));
  const energyByLane = new Map(
    definition.lanes.map((lane) => [
      lane.key,
      { milliWh: BigInt(lane.initialEnergyWh) * 1000n, offsetMs: 0 },
    ]),
  );
  for (const [index, lane] of definition.lanes.entries())
    if (!approvedProfiles.has(lane.meterProfileId))
      issues.push({
        path: `lanes.${index}.meterProfileId`,
        message: "Choose a registered meter for this Lane.",
      });
  const events = [...definition.events].sort(
    (a, b) =>
      a.traceOffsetMs - b.traceOffsetMs ||
      a.sequence - b.sequence ||
      a.id.localeCompare(b.id),
  );
  const faults = new Map<string, number>();
  const recovered = new Set<string>();
  let nextSequence = Math.max(...events.map((event) => event.sequence)) + 1;
  const generated: LabScenarioEvent[] = [];
  for (const [index, event] of events.entries()) {
    if (!laneKeys.has(event.laneKey))
      issues.push({
        path: `events.${index}.laneKey`,
        message: "Choose a Lane in this scenario.",
      });
    if (
      index > 0 &&
      events[index - 1].traceOffsetMs === event.traceOffsetMs &&
      events[index - 1].sequence === event.sequence
    )
      issues.push({
        path: `events.${index}.sequence`,
        message: "Events at the same trace time need a unique order.",
      });
    if (
      event.durationMs !== null &&
      !["evidence_gap", "signer_unavailable", "tempo_unavailable"].includes(
        event.type,
      )
    )
      issues.push({
        path: `events.${index}.durationMs`,
        message: "Duration is only available for temporary faults.",
      });
    if (
      [
        "corrupt_signature",
        "wrong_meter",
        "replay_reading",
        "sequence_break",
        "evidence_gap",
      ].includes(event.type)
    )
      faults.set(event.laneKey, event.traceOffsetMs);
    if (event.type === "evidence_gap" && event.durationMs === null)
      issues.push({
        path: `events.${index}.durationMs`,
        message: "Choose how long evidence is unavailable.",
      });
    if (
      (event.type === "signer_unavailable" ||
        event.type === "tempo_unavailable") &&
      event.durationMs === null
    ) {
      const restore =
        event.type === "signer_unavailable"
          ? "signer_restored"
          : "tempo_restored";
      if (
        !events.some(
          (next) =>
            next.laneKey === event.laneKey &&
            next.type === restore &&
            next.traceOffsetMs > event.traceOffsetMs,
        )
      )
        issues.push({
          path: `events.${index}.durationMs`,
          message: "Add a duration or a later restore event.",
        });
    }
    if (
      event.durationMs !== null &&
      ["evidence_gap", "signer_unavailable", "tempo_unavailable"].includes(
        event.type,
      )
    ) {
      const end = event.traceOffsetMs + event.durationMs;
      if (end > 3_600_000)
        issues.push({
          path: `events.${index}.durationMs`,
          message: "Fault ends beyond the supported trace duration.",
        });
      else
        generated.push({
          id: `${event.id}:restore`,
          laneKey: event.laneKey,
          traceOffsetMs: end,
          sequence: nextSequence++,
          durationMs: null,
          parameters: {},
          type:
            event.type === "signer_unavailable"
              ? "signer_restored"
              : event.type === "tempo_unavailable"
                ? "tempo_restored"
                : "protection_tick",
        });
    }
    if (event.type === "recovery_reading") {
      const faultAt = faults.get(event.laneKey);
      if (faultAt === undefined || event.traceOffsetMs <= faultAt)
        issues.push({
          path: `events.${index}.traceOffsetMs`,
          message: "Recovery must occur after the fault begins.",
        });
      recovered.add(event.laneKey);
    }
    if (event.type === "valid_reading" || event.type === "recovery_reading") {
      const lane = definition.lanes.find(
        (candidate) => candidate.key === event.laneKey,
      );
      const prior = energyByLane.get(event.laneKey);
      if (lane && prior) {
        const energy = BigInt(event.parameters.cumulativeMilliWh);
        const maximumIncrease =
          (BigInt(lane.maxPowerWatts) *
            BigInt(event.traceOffsetMs - prior.offsetMs) +
            3599n) /
          3600n;
        if (energy < prior.milliWh)
          issues.push({
            path: `events.${index}.parameters.cumulativeMilliWh`,
            message: "Meter energy cannot move backward.",
          });
        else if (energy - prior.milliWh > maximumIncrease)
          issues.push({
            path: `events.${index}.parameters.cumulativeMilliWh`,
            message:
              "This reading exceeds the Lane power limit for its trace interval.",
          });
        energyByLane.set(event.laneKey, {
          milliWh: energy,
          offsetMs: event.traceOffsetMs,
        });
      }
    }
  }
  if (recovered.size === 0)
    issues.push({
      path: "events",
      message: "Add a recovery reading after the fault.",
    });
  if (issues.length) throw new LabValidationError(issues);
  const normalized = {
    ...definition,
    lanes: [...definition.lanes].sort((a, b) => a.key.localeCompare(b.key)),
    events,
  };
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        compilerVersion: LAB_COMPILER_VERSION,
        definition: normalized,
      }),
    )
    .digest("hex");
  const compiledEvents = [...events, ...generated].sort(
    (a, b) =>
      a.traceOffsetMs - b.traceOffsetMs ||
      a.sequence - b.sequence ||
      a.id.localeCompare(b.id),
  );
  return {
    definition: normalized,
    events: compiledEvents,
    digest,
    compilerVersion: LAB_COMPILER_VERSION,
    warnings: [],
  };
}

export function traceInstant(
  scenario: CompiledLabScenario,
  offsetMs: number,
): string {
  return new Date(
    Date.parse(scenario.definition.traceEpoch) + offsetMs,
  ).toISOString();
}

export function nextEventDelayMs(
  currentOffsetMs: number,
  nextOffsetMs: number,
  speed: 0.25 | 0.5 | 1 | 2 | 4,
) {
  if (nextOffsetMs < currentOffsetMs) return 0;
  return (nextOffsetMs - currentOffsetMs) / speed;
}

export async function runHeadlessScenario<T>(
  scenario: CompiledLabScenario,
  dispatch: (event: LabScenarioEvent, index: number) => Promise<T>,
) {
  const results: T[] = [];
  for (const [index, event] of scenario.events.entries())
    results.push(await dispatch(event, index));
  return results;
}
