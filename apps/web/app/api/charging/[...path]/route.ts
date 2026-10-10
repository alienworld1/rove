import { publishedDataResponse } from "../../published-data";
import { engineHeaders, sameOrigin } from "../../hosted-proxy";
import { readBaseConfig } from "@rove/config";
import {
  causalInspectorTraceSchema,
  completionCommandSchema,
  completionSummarySchema,
  corridorOperatingViewSchema,
  idSchema,
  presentationCursorSchema,
} from "@rove/contracts";
import { hasDemoSession } from "../../demo-session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const config = readBaseConfig();
  if (
    config.ACCESS_MODE !== "hosted" &&
    (config.ACCESS_MODE !== "local" ||
      config.NODE_ENV !== "development" ||
      !config.DEMO_SESSION_TOKEN ||
      !hasDemoSession(request, config.DEMO_SESSION_TOKEN))
  )
    return Response.json(
      { message: "You don't have access to this charging session." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  const { path } = await context.params;
  const event = new URL(request.url).searchParams.get("event");
  const trace = new URL(request.url).searchParams.get("trace");
  if (
    trace !== null &&
    (path[0] !== "corridors" ||
      path.length !== 2 ||
      !presentationCursorSchema.safeParse(trace).success)
  )
    return Response.json(
      { message: "That trace point is unavailable." },
      { status: 400 },
    );
  if (
    path.length < 1 ||
    path.length > 3 ||
    !["corridors", "lanes"].includes(path[0]) ||
    (path.length === 3 &&
      !(
        path[0] === "lanes" &&
        ["inspector", "completion", "accounting"].includes(path[2])
      )) ||
    path.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9._:-]+$/.test(segment),
    )
  )
    return new Response(null, { status: 404 });
  if (
    event &&
    (path.at(-1) !== "inspector" || !idSchema.safeParse(event).success)
  )
    return Response.json(
      { message: "That selection is no longer available." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  try {
    if (config.ACCESS_MODE === "hosted") {
      const published = await publishedDataResponse(
        `/api/${path.join("/")}`,
        new URL(request.url).searchParams,
      );
      if (published) return published;
    }
    const upstreamUrl = new URL(`/api/${path.join("/")}`, config.ENGINE_ORIGIN);
    if (event) upstreamUrl.searchParams.set("event", event);
    if (trace !== null) upstreamUrl.searchParams.set("trace", trace);
    const upstream = await fetch(upstreamUrl, {
      headers: engineHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const text = await upstream.text();
    const value = JSON.parse(text) as unknown;
    if (upstream.ok) {
      if (path[0] === "corridors" && path.length === 2)
        corridorOperatingViewSchema.parse(value);
      if (path.at(-1) === "completion") completionSummarySchema.parse(value);
      if (path.at(-1) === "inspector" && event)
        causalInspectorTraceSchema.parse(value);
    }
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { message: "Corridor state couldn't be displayed safely." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const config = readBaseConfig();
  const headers = { "cache-control": "no-store" };
  if (
    (config.ACCESS_MODE !== "hosted" &&
      (config.ACCESS_MODE !== "local" ||
        config.NODE_ENV !== "development" ||
        !config.DEMO_SESSION_TOKEN ||
        !hasDemoSession(request, config.DEMO_SESSION_TOKEN))) ||
    !sameOrigin(request)
  )
    return Response.json(
      { message: "You don't have access to this charging session." },
      { status: 403, headers },
    );
  const { path } = await context.params;
  if (
    path.length !== 3 ||
    path[0] !== "lanes" ||
    !idSchema.safeParse(path[1]).success ||
    !["complete", "check", "close"].includes(path[2])
  )
    return new Response(null, { status: 404, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("BODY_REQUIRED");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2000) {
        await reader.cancel();
        return Response.json(
          { message: "This request is too large." },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    const body = completionCommandSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (body.laneId !== path[1])
      return Response.json(
        { message: "You don't have access to this charging session." },
        { status: 403, headers },
      );
    const upstream = await fetch(
      new URL(`/api/${path.join("/")}`, config.ENGINE_ORIGIN),
      {
        method: "POST",
        headers: {
          ...engineHeaders(request),
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      },
    );
    const value = await upstream.json();
    if (upstream.ok) completionSummarySchema.parse(value);
    return Response.json(value, { status: upstream.status, headers });
  } catch (error) {
    const invalid =
      error instanceof SyntaxError ||
      (error instanceof Error && error.name === "ZodError");
    return Response.json(
      {
        message: invalid
          ? "Check this session and try again."
          : "Payment state is unavailable. Check again.",
      },
      { status: invalid ? 400 : 503, headers },
    );
  }
}
