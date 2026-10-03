import { readBaseConfig } from "@rove/config";
import {
  causalInspectorTraceSchema,
  corridorOperatingViewSchema,
  idSchema,
  presentationCursorSchema,
} from "@rove/contracts";
import { hasDemoSession } from "../../demo-session";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const config = readBaseConfig();
  if (
    config.NODE_ENV !== "development" ||
    !config.DEMO_SESSION_TOKEN ||
    !hasDemoSession(request, config.DEMO_SESSION_TOKEN)
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
    (path.length === 3 && !(path[0] === "lanes" && path[2] === "inspector")) ||
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
    const upstreamUrl = new URL(`/api/${path.join("/")}`, config.ENGINE_ORIGIN);
    if (event) upstreamUrl.searchParams.set("event", event);
    if (trace !== null) upstreamUrl.searchParams.set("trace", trace);
    const upstream = await fetch(upstreamUrl, {
      headers: { authorization: `Bearer ${config.DEMO_SESSION_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const text = await upstream.text();
    if (upstream.ok) {
      const value = JSON.parse(text) as unknown;
      if (path[0] === "corridors" && path.length === 2)
        corridorOperatingViewSchema.parse(value);
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
