import { readBaseConfig } from "@rove/config";
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
  if (
    path.length < 1 ||
    path.length > 2 ||
    !["corridors", "lanes"].includes(path[0]) ||
    path.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9._:-]+$/.test(segment),
    )
  )
    return new Response(null, { status: 404 });
  try {
    const upstream = await fetch(
      new URL(`/api/${path.join("/")}`, config.ENGINE_ORIGIN),
      {
        headers: { authorization: `Bearer ${config.DEMO_SESSION_TOKEN}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
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
      { message: "Charging protection is unavailable right now. Try again." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
