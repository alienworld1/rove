import { z } from "zod";
import {
  completionCommandSchema,
  laneCommandSchema,
  labScenarioSchema,
  realtimePresentationEventSchema,
} from "@rove/contracts";
import { accountingRecordSchema } from "@rove/ocpi";
import { northstarVoltwayScenario } from "@rove/lab/scenarios/northstar-voltway";
import { laneStates } from "@rove/domain";
import notes from "./reason-notes.json";
import { reasonInventory, sourceStrings } from "./reference-sources";

export const schemaReferences = {
  labScenarioSchema,
  completionCommandSchema,
  laneCommandSchema,
  realtimePresentationEventSchema,
  accountingRecordSchema,
};
export const completionExample = {
  commandId: "finish-example",
  correlationId: "request-example",
  laneId: "lane-example",
  expectedVersion: 3,
};
export const accountingExample = {
  externalCdrId: "record-123",
  externalSessionId: "session-123",
  sourcePartyId: "controlled-cpo",
  meterId: "meter-123",
  chargerId: "charger-123",
  startedAt: "2026-10-03T12:00:00Z",
  endedAt: "2026-10-03T12:01:00Z",
  currency: "USD",
  totalEnergyKwh: "1.000",
  totalCost: "0.500000",
  tariffBasis: { perKwh: "500000", tariffDecimals: 6, assetDecimals: 6 },
  chargeType: "energy_only_tax_free",
};
export function jsonExample(value: unknown) {
  return `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\n`;
}
export function schemaBlock(name: keyof typeof schemaReferences) {
  return `\n\n### ${name}\n\nCurrent structural JSON Schema; semantic source checks still apply.\n${jsonExample(z.toJSONSchema(schemaReferences[name], { target: "draft-7" }))}`;
}
export function reasonBlock() {
  return reasonInventory()
    .filter(([id]) => id !== "EVIDENCE_SIGNATURE_INVALID")
    .map(([id, source]) => {
      const meaning = notes[id as keyof typeof notes];
      if (!meaning) throw new Error(`Missing reviewed reason: ${id}`);
      const kind =
        (source.includes("ocpi") && !id.endsWith("MISMATCH")) ||
        [
          "EVIDENCE_RESULT_INVALID",
          "FINAL_EVIDENCE_CONTEXT_REQUIRED",
          "PAYMENT_AUTHORIZATION_INVALID",
          "PAYMENT_BINDING_INVALID",
          "PAYMENT_CLOSURE_INVALID",
          "PAYMENT_LIMIT_INVALID",
          "RECOVERY_NOT_REQUIRED",
        ].includes(id)
          ? "Adapter/transition validation"
          : "Recorded protection/completion/operation reason";
      return `### ${id.toLowerCase().replaceAll("_", " ")}\n\n\`${id}\` — ${kind}. ${meaning}\n\nSource: \`${source}\`.\n`;
    })
    .join("\n");
}
const eventNotes: Record<string, string> = {
  "corridor.created": "Corridor configuration committed.",
  "lane.initializing": "Lane binding and initial funding intent retained.",
  "lane.service_ended":
    "Authenticated service cessation recorded; uncertainty is capped at end time.",
  "lane.completion_checked":
    "Completion prerequisites inspected; no successful match is implied.",
  "meter.evidence_accepted":
    "Verified cumulative reading accepted; payload includes trusted energy/value context.",
  "meter.evidence_rejected":
    "Reading rejected with reason/hash; no trusted advancement.",
  "payment.chain_observed":
    "Bound authoritative deposit/settlement observation retained.",
  "payment.voucher_verified":
    "Cumulative authorization verified with amount/digest.",
  "payment.chain_unavailable": "Channel authority unavailable or stale.",
  "payment.signer_unavailable": "Voucher signer unavailable.",
  "payment.signer_restored":
    "Signer available again; invariants still gate advancement.",
  "payment.operation_failed": "Known effect failure supplied to transition.",
  "lane.recovering": "Recovery began; prerequisites may remain pending.",
  "lane.pause_required": "Protection boundary or explicit pause reached.",
  "lane.protection_restored": "Normal invariants restored after degradation.",
  "lane.protection_checked":
    "Protection evaluated without a different causal event.",
  "pause.requested":
    "External pause requirement queued; this does not prove physical enforcement.",
  "payment.channel_closed":
    "Canonical close/refund fact accepted; historical final settlement retained.",
  "session.reconciled": "Exact four-total and energy comparison matched.",
  "session.accounting_mismatch":
    "Comparison differs; payload links comparison/CDR and signed deltas.",
  "payment.operation_rechecked":
    "Existing failed completion work rechecked through supported recovery.",
  "payment.close_requested": "Close intent queued after final prerequisites.",
};
export const eventSources = [
  "packages/protection/src/transition.ts",
  "packages/protection/src/completion.ts",
  "packages/persistence/src/index.ts",
];
export function eventBlock() {
  const entries = new Map<string, { source: string; behavior: string }>();
  for (const source of eventSources)
    for (const id of sourceStrings(source)) {
      if (eventNotes[id]) entries.set(id, { source, behavior: eventNotes[id] });
    }
  for (const state of laneStates)
    entries.set(`lane.${state.toLowerCase()}`, {
      source: "packages/protection/src/transition.ts",
      behavior: `Projection changed to ${state}; reason and exposure/protected values describe its condition.`,
    });
  const rows = [...entries]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, entry]) =>
        `| \`${id}\` | ${entry.behavior} | \`${entry.source}\` |`,
    );
  rows.push(
    "| `payment.{open,top_up,settlement,close,voucher}_{status}` | Persisted outbox status transition (pending, submitted, completed, failed, or processing as actually recorded), not a universal receipt payload. | `packages/persistence/src/index.ts` → finishEffect | ",
  );
  return `| Event | Emission / payload boundary | Source |\n| --- | --- | --- |\n${rows.join("\n")}`;
}
export const apiEntries = [
  [
    "GET",
    "/health",
    "Public readiness; 200 ready / 503 blocked",
    "readinessSchema",
  ],
  [
    "GET / POST",
    "/api/corridors",
    "List / create; POST 201, idempotent command",
    "createCorridorSchema",
  ],
  [
    "GET",
    "/api/corridors/:id",
    "Safe current or trace projection",
    "corridorOperatingViewSchema",
  ],
  [
    "POST",
    "/api/lanes",
    "Start bound Lane, configured live payment adapter required; 201",
    "startLaneSchema",
  ],
  ["GET", "/api/lanes/:id", "Current Lane projection", "laneProjectionSchema"],
  [
    "GET",
    "/api/lanes/:id/inspector",
    "Safe history or selected event (?event=ID)",
    "causalInspectorTraceSchema",
  ],
  [
    "POST",
    "/api/lanes/:id/evidence",
    "ObserveEvidence only; 200 committed projection",
    "laneCommandSchema",
  ],
  [
    "POST",
    "/api/lanes/:id/commands",
    "TickProtectionClock, RequirePause, BeginRecovery, PaymentUnavailable only",
    "laneCommandSchema",
  ],
  [
    "GET",
    "/api/lanes/:id/completion",
    "Summary, readiness, allowed controls",
    "completionSummarySchema",
  ],
  [
    "GET",
    "/api/lanes/:id/accounting",
    "Retained immutable source text and normalized accounting",
    "accountingRecordSchema",
  ],
  [
    "POST",
    "/api/lanes/:id/complete",
    "Controlled server-supplied final evidence/accounting; 202",
    "completionCommandSchema",
  ],
  [
    "POST",
    "/api/lanes/:id/check",
    "Inspect/recover retained work; 202",
    "completionCommandSchema",
  ],
  [
    "POST",
    "/api/lanes/:id/close",
    "Request canonical final close; 202",
    "completionCommandSchema",
  ],
  [
    "POST",
    "/api/lanes/:id/end",
    "External CompleteLane with external_adapter cessation; 202",
    "laneCommandSchema",
  ],
  [
    "POST",
    "/api/lanes/:id/cdr",
    "External ReceiveCDR with raw immutable record; 202",
    "laneCommandSchema",
  ],
  [
    "GET / POST",
    "/api/lab/scenarios",
    "List / validate and save definition (201)",
    "labScenarioSchema",
  ],
  [
    "GET",
    "/api/lab/scenarios/:id",
    "Definition, digest, validation status",
    "labScenarioDetailSchema",
  ],
  [
    "POST",
    "/api/lab/runs",
    "Start saved scenario and digest; 201",
    "labStartRunSchema",
  ],
  [
    "GET",
    "/api/lab/runs/:id",
    "Run, Lane projections, environment, dispatch events",
    "labRunViewSchema",
  ],
  [
    "POST",
    "/api/lab/runs/:id/{play,pause,step,reset,check}",
    "Versioned playback or check; reset retains prior history",
    "labTransportSchema",
  ],
  [
    "POST",
    "/api/lab/runs/:id/speed",
    "Version plus speed 0.25 / 0.5 / 1 / 2 / 4",
    "labSpeedSchema",
  ],
  [
    "GET",
    "/api/events/stream",
    "Presentation SSE; query/cursor bounds and connection limit",
    "realtimePresentationEventSchema",
  ],
];
export function apiBlock() {
  return `Source for every engine row: \`apps/engine/src/server.ts\`. Schemas: \`packages/contracts/src\` (accounting: \`packages/ocpi/src/index.ts\`).\n\n| Method | Engine path | Behavior / output | Input or output contract |\n| --- | --- | --- | --- |\n${apiEntries.map(([method, path, behavior, schema]) => `| ${method} | \`${path}\` | ${behavior} | \`${schema}\` |`).join("\n")}`;
}
export function referenceBlocks() {
  return new Map([
    ["<ScenarioFixture />", jsonExample(northstarVoltwayScenario)],
    ["<CompletionExample />", jsonExample(completionExample)],
    ["<AccountingExample />", jsonExample(accountingExample)],
    ["<ReasonReference />", reasonBlock()],
    ["<EventReference />", eventBlock()],
    ["<ApiReference />", apiBlock()],
    ...Object.keys(schemaReferences).map(
      (name) =>
        [
          `<SchemaReference name="${name}" />`,
          schemaBlock(name as keyof typeof schemaReferences),
        ] as [string, string],
    ),
  ]);
}
