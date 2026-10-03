import {
  causalInspectorTraceSchema,
  completionSummarySchema,
  corridorOperatingViewSchema,
  labRunViewSchema,
  labScenarioDetailSchema,
  labScenarioSummarySchema,
  savedLabScenarioSchema,
  type CausalInspectorTrace,
  type CorridorOperatingView,
  type LabRunView,
  type LabScenario,
} from "@rove/contracts";

export class CorridorApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

async function readJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const value = (await response.json()) as {
    message?: string;
    issues?: { path: string; message: string }[];
  };
  if (!response.ok)
    throw new CorridorApiError(
      value.message ?? "Corridor state couldn't be refreshed.",
      response.status,
      value.issues,
    );
  return value;
}

export type ScenarioSummary = ReturnType<typeof labScenarioSummarySchema.parse>;

export async function readScenarios() {
  return labScenarioSummarySchema
    .array()
    .parse(await readJson("/api/lab/scenarios"));
}

export async function readScenario(id: string) {
  return labScenarioDetailSchema.parse(
    await readJson(`/api/lab/scenarios/${encodeURIComponent(id)}`),
  );
}

export async function saveScenario(definition: unknown) {
  return savedLabScenarioSchema.parse(
    await readJson("/api/lab/scenarios", definition),
  );
}

export async function readRun(id: string): Promise<LabRunView> {
  return labRunViewSchema.parse(
    await readJson(`/api/lab/runs/${encodeURIComponent(id)}`),
  );
}

export async function startRun(
  scenario: LabScenario,
  digest: string,
): Promise<LabRunView> {
  return labRunViewSchema.parse(
    await readJson("/api/lab/runs", {
      scenarioId: scenario.id,
      scenarioDigest: digest,
    }),
  );
}

export async function controlRun(
  run: LabRunView["run"],
  action: "play" | "pause" | "step" | "reset" | "check" | "speed",
  speed?: number,
) {
  return labRunViewSchema.parse(
    await readJson(`/api/lab/runs/${encodeURIComponent(run.id)}/${action}`, {
      expectedVersion: run.version,
      ...(speed === undefined ? {} : { speed }),
    }),
  );
}

export async function readCorridor(
  corridorId: string,
  signal?: AbortSignal,
  traceOffsetMs: number | null = null,
): Promise<CorridorOperatingView> {
  const response = await fetch(
    `/api/charging/corridors/${encodeURIComponent(corridorId)}${traceOffsetMs === null ? "" : `?trace=${traceOffsetMs}`}`,
    { cache: "no-store", signal: signal ?? AbortSignal.timeout(10_000) },
  );
  const value = (await response.json()) as { message?: string };
  if (!response.ok)
    throw new CorridorApiError(
      value.message ?? "Corridor state couldn't be refreshed.",
      response.status,
    );
  return corridorOperatingViewSchema.parse(value);
}

export async function readInspector(
  laneId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<CausalInspectorTrace> {
  const query = new URLSearchParams({ event: eventId });
  const response = await fetch(
    `/api/charging/lanes/${encodeURIComponent(laneId)}/inspector?${query}`,
    { cache: "no-store", signal: signal ?? AbortSignal.timeout(10_000) },
  );
  const value = (await response.json()) as { message?: string };
  if (!response.ok)
    throw new CorridorApiError(
      value.message ?? "Event details are unavailable right now. Try again.",
      response.status,
    );
  return causalInspectorTraceSchema.parse(value);
}

export async function readCompletion(laneId: string) {
  return completionSummarySchema.parse(
    await readJson(
      `/api/charging/lanes/${encodeURIComponent(laneId)}/completion`,
    ),
  );
}
export async function controlCompletion(
  laneId: string,
  expectedVersion: number,
  action: "complete" | "check" | "close",
) {
  return completionSummarySchema.parse(
    await readJson(
      `/api/charging/lanes/${encodeURIComponent(laneId)}/${action}`,
      {
        commandId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        laneId,
        expectedVersion,
      },
    ),
  );
}
export async function readAccountingRecord(laneId: string) {
  return readJson(
    `/api/charging/lanes/${encodeURIComponent(laneId)}/accounting`,
  );
}
