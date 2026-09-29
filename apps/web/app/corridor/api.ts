import {
  causalInspectorTraceSchema,
  corridorOperatingViewSchema,
  labRunViewSchema,
  labScenarioSchema,
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

export type ScenarioSummary = {
  id: string;
  name: string;
  digest: string;
  schemaVersion: number;
  validationStatus: string;
};

export async function readScenarios() {
  return (await readJson("/api/lab/scenarios")) as ScenarioSummary[];
}

export async function readScenario(id: string) {
  const value = (await readJson(
    `/api/lab/scenarios/${encodeURIComponent(id)}`,
  )) as { definition: unknown; digest: string };
  return {
    definition: labScenarioSchema.parse(value.definition),
    digest: value.digest,
  };
}

export async function saveScenario(definition: unknown) {
  return (await readJson("/api/lab/scenarios", definition)) as {
    digest: string;
    id: string;
  };
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
): Promise<CorridorOperatingView> {
  const response = await fetch(
    `/api/charging/corridors/${encodeURIComponent(corridorId)}`,
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
