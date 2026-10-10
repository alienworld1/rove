import {
  causalInspectorTraceSchema,
  scenarioReadinessSchema,
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

function parseRead<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new CorridorApiError(
      "Corridor state couldn't be displayed safely. Check again.",
      502,
    );
  return result.data;
}

async function readJson(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(50_000)])
      : AbortSignal.timeout(50_000),
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

export async function readScenarios({ signal }: { signal?: AbortSignal } = {}) {
  return parseRead(
    labScenarioSummarySchema.array(),
    await readJson("/api/lab/scenarios", undefined, signal),
  );
}

export async function readScenario(id: string, signal?: AbortSignal) {
  return parseRead(
    labScenarioDetailSchema,
    await readJson(
      `/api/lab/scenarios/${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),
  );
}

export async function saveScenario(definition: unknown) {
  return savedLabScenarioSchema.parse(
    await readJson("/api/lab/scenarios", definition),
  );
}

export async function readRun(
  id: string,
  signal?: AbortSignal,
): Promise<LabRunView> {
  const view = parseRead(
    labRunViewSchema,
    await readJson(
      `/api/lab/runs/${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),
  );
  if (view.run.id !== id)
    throw new CorridorApiError("That selection is no longer available.", 502);
  return view;
}

export async function startRun(
  scenario: LabScenario,
  digest: string,
  runId: string,
): Promise<LabRunView> {
  return labRunViewSchema.parse(
    await readJson("/api/lab/runs", {
      scenarioId: scenario.id,
      scenarioDigest: digest,
      runId,
      playbackMode: "guided",
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
    {
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(50_000)])
        : AbortSignal.timeout(50_000),
    },
  );
  const value = (await response.json()) as { message?: string };
  if (!response.ok)
    throw new CorridorApiError(
      value.message ?? "Corridor state couldn't be refreshed.",
      response.status,
    );
  const view = parseRead(corridorOperatingViewSchema, value);
  if (view.corridor.id !== corridorId)
    throw new CorridorApiError("That selection is no longer available.", 502);
  return view;
}

export async function readInspector(
  laneId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<CausalInspectorTrace> {
  const query = new URLSearchParams({ event: eventId });
  const response = await fetch(
    `/api/charging/lanes/${encodeURIComponent(laneId)}/inspector?${query}`,
    {
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(50_000)])
        : AbortSignal.timeout(50_000),
    },
  );
  const value = (await response.json()) as { message?: string };
  if (!response.ok)
    throw new CorridorApiError(
      value.message ?? "Event details are unavailable right now. Try again.",
      response.status,
    );
  const trace = parseRead(causalInspectorTraceSchema, value);
  if (trace.laneId !== laneId || trace.eventId !== eventId)
    throw new CorridorApiError("That selection is no longer available.", 502);
  return trace;
}

export async function readCompletion(laneId: string, signal?: AbortSignal) {
  const summary = parseRead(
    completionSummarySchema,
    await readJson(
      `/api/charging/lanes/${encodeURIComponent(laneId)}/completion`,
      undefined,
      signal,
    ),
  );
  if (summary.laneId !== laneId)
    throw new CorridorApiError("That selection is no longer available.", 502);
  return summary;
}
export async function controlCompletion(
  laneId: string,
  expectedVersion: number,
  action: "complete" | "check" | "close",
  intent = {
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
  },
) {
  return completionSummarySchema.parse(
    await readJson(
      `/api/charging/lanes/${encodeURIComponent(laneId)}/${action}`,
      {
        ...intent,
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

export async function readScenarioReadiness(id: string, signal?: AbortSignal) {
  return parseRead(
    scenarioReadinessSchema,
    await readJson(
      `/api/lab/scenarios/${encodeURIComponent(id)}/readiness`,
      undefined,
      signal,
    ),
  );
}
export async function controlGuidance(
  run: LabRunView["run"],
  mode: "guided" | "continuous",
) {
  return labRunViewSchema.parse(
    await readJson(`/api/lab/runs/${encodeURIComponent(run.id)}/guidance`, {
      expectedVersion: run.version,
      mode,
    }),
  );
}
