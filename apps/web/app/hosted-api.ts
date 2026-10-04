import {
  hostedSessionSchema,
  publishedRunSchema,
  labRunViewSchema,
} from "@rove/contracts";
import { CorridorApiError } from "./corridor/api";
export async function hostedJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(50_000),
  });
  const value = await response.json();
  if (!response.ok)
    throw new CorridorApiError(
      value.message ?? "Rove couldn't load. Please try again.",
      response.status,
    );
  return value;
}
export async function readHostedSession() {
  return hostedSessionSchema.parse(await hostedJson("/api/access/session"));
}
export async function readPublishedRuns() {
  return publishedRunSchema
    .array()
    .parse(await hostedJson("/api/published-runs"));
}
export async function redeemInvite(code: string) {
  return hostedSessionSchema.parse(
    await hostedJson("/api/access/invite", { code }),
  );
}
export async function startHostedRun(runId: string) {
  return labRunViewSchema.parse(
    await hostedJson("/api/access/runs", { runId }),
  );
}
