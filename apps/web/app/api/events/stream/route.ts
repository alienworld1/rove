import { readBaseConfig } from "@rove/config";
import { idSchema } from "@rove/contracts";
import { hasDemoSession } from "../../demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = readBaseConfig();
  if (
    config.NODE_ENV !== "development" ||
    !config.DEMO_SESSION_TOKEN ||
    !hasDemoSession(request, config.DEMO_SESSION_TOKEN)
  )
    return Response.json(
      { message: "You don't have access to this Corridor." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  const incoming = new URL(request.url);
  const corridor = incoming.searchParams.get("corridor");
  const run = incoming.searchParams.get("run");
  const cursor = incoming.searchParams.get("cursor");
  if (
    !idSchema.safeParse(corridor).success ||
    (run !== null && !idSchema.safeParse(run).success) ||
    (cursor !== null && !/^[0-9]{1,18}$/.test(cursor))
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
        authorization: `Bearer ${config.DEMO_SESSION_TOKEN}`,
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
