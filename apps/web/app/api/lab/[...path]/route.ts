import { readBaseConfig } from "@rove/config";
import { hasDemoSession } from "../../demo-session";

export const runtime = "nodejs";

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
      ? path.length === 1 || path.length === 2
      : path.length === 1;
  if (path[0] === "runs")
    return method === "GET"
      ? path.length === 2
      : path.length === 1 ||
          (path.length === 3 &&
            ["play", "pause", "step", "reset", "speed", "check"].includes(
              path[2],
            ));
  return false;
}

async function proxy(
  request: Request,
  params: Promise<{ path: string[] }>,
  method: "GET" | "POST",
) {
  const config = readBaseConfig();
  if (
    config.NODE_ENV !== "development" ||
    !config.DEMO_SESSION_TOKEN ||
    !hasDemoSession(request, config.DEMO_SESSION_TOKEN) ||
    (method === "POST" &&
      request.headers.get("origin") !== new URL(request.url).origin)
  )
    return Response.json(
      { message: "You don't have access to this Corridor Lab." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  const { path } = await params;
  if (!allowed(path, method)) return new Response(null, { status: 404 });
  const body = method === "POST" ? await request.text() : undefined;
  if (body && Buffer.byteLength(body) > 70_000)
    return Response.json(
      {
        message: "This scenario is too large. Reduce its events and try again.",
      },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  try {
    const upstream = await fetch(
      new URL(`/api/lab/${path.join("/")}`, config.ENGINE_ORIGIN),
      {
        method,
        headers: {
          authorization: `Bearer ${config.DEMO_SESSION_TOKEN}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { message: "Corridor Lab is unavailable right now. Try again." },
      { status: 503, headers: { "cache-control": "no-store" } },
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
