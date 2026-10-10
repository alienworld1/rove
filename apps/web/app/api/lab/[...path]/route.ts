import { publishedDataResponse } from "../../published-data";
import { boundedBody, engineHeaders, sameOrigin } from "../../hosted-proxy";
import { readBaseConfig } from "@rove/config";
import { hasDemoSession } from "../../demo-session";

export const runtime = "nodejs";
export const maxDuration = 60;

function allowed(path: string[], method: "GET" | "POST") {
  if (
    path.some(
      (part) =>
        !/^[A-Za-z0-9._:-]+$/.test(part) || part === "." || part === "..",
    )
  )
    return false;
  if (path[0] === "scenarios")
    return method === "GET"
      ? path.length === 1 ||
          path.length === 2 ||
          (path.length === 3 && path[2] === "readiness")
      : path.length === 1;
  if (path[0] === "runs")
    return method === "GET"
      ? path.length === 2
      : path.length === 1 ||
          (path.length === 3 &&
            [
              "play",
              "pause",
              "step",
              "reset",
              "speed",
              "check",
              "guidance",
            ].includes(path[2]));
  return false;
}

async function proxy(
  request: Request,
  params: Promise<{ path: string[] }>,
  method: "GET" | "POST",
) {
  const config = readBaseConfig();
  if (
    (config.ACCESS_MODE !== "hosted" &&
      (config.ACCESS_MODE !== "local" ||
        config.NODE_ENV !== "development" ||
        !config.DEMO_SESSION_TOKEN ||
        !hasDemoSession(request, config.DEMO_SESSION_TOKEN))) ||
    (method === "POST" && !sameOrigin(request))
  )
    return Response.json(
      { message: "You don't have access to this Corridor Lab." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  const { path } = await params;
  if (!allowed(path, method)) return new Response(null, { status: 404 });
  if (method === "GET" && config.ACCESS_MODE === "hosted") {
    try {
      const published = await publishedDataResponse(
        `/api/lab/${path.join("/")}`,
      );
      if (published) return published;
    } catch {
      return Response.json(
        { message: "Published records are unavailable. Please try again." },
        { status: 503 },
      );
    }
  }
  try {
    const body =
      method === "POST" ? await boundedBody(request, 70_000) : undefined;
    const upstream = await fetch(
      new URL(`/api/lab/${path.join("/")}`, config.ENGINE_ORIGIN),
      {
        method,
        headers: {
          ...engineHeaders(request),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      },
    );
    return Response.json(await upstream.json(), {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof RangeError
            ? "This scenario is too large. Reduce its events and try again."
            : "Corridor Lab is unavailable right now. Try again.",
      },
      {
        status: error instanceof RangeError ? 413 : 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context.params, "GET");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context.params, "POST");
}
