import { engineHeaders, hostedSessionToken } from "../../hosted-proxy";
import { readBaseConfig } from "@rove/config";
import { idSchema, presentationCursorSchema } from "@rove/contracts";
import { hasDemoSession } from "../../demo-session";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = readBaseConfig();
  if (
    config.ACCESS_MODE !== "hosted" &&
    (config.ACCESS_MODE !== "local" ||
      config.NODE_ENV !== "development" ||
      !config.DEMO_SESSION_TOKEN ||
      !hasDemoSession(request, config.DEMO_SESSION_TOKEN))
  )
    return Response.json(
      { message: "You don't have access to this Corridor." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  if (config.ACCESS_MODE === "hosted" && !hostedSessionToken(request))
    return new Response(null, { status: 403 });
  const incoming = new URL(request.url);
  const corridor = incoming.searchParams.get("corridor");
  const run = incoming.searchParams.get("run");
  const cursor = incoming.searchParams.get("cursor");
  if (
    !idSchema.safeParse(corridor).success ||
    (run !== null && !idSchema.safeParse(run).success) ||
    (cursor !== null && !presentationCursorSchema.safeParse(cursor).success)
  )
    return Response.json(
      { message: "That selection is no longer available." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  const upstreamUrl = new URL("/api/events/stream", config.ENGINE_ORIGIN);
  upstreamUrl.searchParams.set("corridor", corridor!);
  if (run) upstreamUrl.searchParams.set("run", run);
  if (cursor) upstreamUrl.searchParams.set("cursor", cursor);
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        ...engineHeaders(request),
        accept: "text/event-stream",
        ...(request.headers.get("last-event-id")
          ? { "last-event-id": request.headers.get("last-event-id")! }
          : {}),
      },
      cache: "no-store",
      signal: request.signal,
    });
    if (!upstream.ok || !upstream.body)
      return Response.json(
        { message: "Live updates are unavailable." },
        { status: upstream.status || 503 },
      );
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return Response.json(
      { message: "Live updates are unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
