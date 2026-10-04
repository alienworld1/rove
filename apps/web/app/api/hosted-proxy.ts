import { readBaseConfig } from "@rove/config";

export function hostedSessionToken(request: Request) {
  const cookies = request.headers.get("cookie")?.split(/;\s*/) ?? [];
  const name =
    readBaseConfig().NODE_ENV === "production"
      ? "__Host-rove_session"
      : "rove_session";
  const value = cookies
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
export function engineHeaders(
  request: Request,
  extra: Record<string, string> = {},
) {
  const config = readBaseConfig();
  const token =
    config.ACCESS_MODE === "hosted"
      ? config.ENGINE_SERVICE_TOKEN
      : config.DEMO_SESSION_TOKEN;
  const session =
    config.ACCESS_MODE === "hosted" ? hostedSessionToken(request) : undefined;
  return {
    authorization: `Bearer ${token}`,
    ...(session ? { "x-rove-session": session } : {}),
    ...extra,
  };
}
export function sameOrigin(request: Request) {
  const config = readBaseConfig();
  return (
    request.headers.get("origin") ===
    (config.ACCESS_MODE === "hosted"
      ? new URL(config.APP_ORIGIN!).origin
      : new URL(request.url).origin)
  );
}
export function sessionCookie(token: string, hours: number, clear = false) {
  const production = readBaseConfig().NODE_ENV === "production";
  return `${production ? "__Host-rove_session" : "rove_session"}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : hours * 3600}${production ? "; Secure" : ""}`;
}
export async function boundedBody(request: Request, limit = 2000) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RangeError("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function proxyHosted(request: Request, path: string) {
  const config = readBaseConfig();
  const headers = { "cache-control": "no-store" };
  if (
    config.ACCESS_MODE !== "hosted" ||
    (request.method !== "GET" && !sameOrigin(request))
  )
    return Response.json(
      { message: "This action is unavailable." },
      { status: 403, headers },
    );
  if (path === "/api/access/session" && !hostedSessionToken(request))
    return Response.json(
      {
        authenticated: false,
        expiresAt: null,
        canRun: false,
        remainingRuns: 0,
        runs: [],
      },
      { headers },
    );
  try {
    const body =
      request.method === "GET" ? undefined : await boundedBody(request);
    const upstream = await fetch(new URL(path, config.ENGINE_ORIGIN), {
      method: request.method,
      headers: engineHeaders(
        request,
        body ? { "content-type": "application/json" } : {},
      ),
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const value = await upstream.json();
    if (path === "/api/access/invite" && upstream.ok) {
      return Response.json(value.session, {
        headers: {
          ...headers,
          "set-cookie": sessionCookie(value.token, config.HOSTED_SESSION_HOURS),
        },
      });
    }
    return Response.json(value, {
      status: upstream.status,
      headers: {
        ...headers,
        ...(path === "/api/access/end" && upstream.ok
          ? { "set-cookie": sessionCookie("", 0, true) }
          : {}),
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof RangeError
            ? "This request is too large."
            : "Rove is unavailable right now. Please try again.",
      },
      { status: error instanceof RangeError ? 413 : 503, headers },
    );
  }
}
