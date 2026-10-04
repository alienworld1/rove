import { timingSafeEqual } from "node:crypto";
import { readBaseConfig, proofPrerequisites } from "@rove/config";
import { integrationStatusSchema } from "@rove/contracts";
import { hasDemoSession } from "../demo-session";
import { sameOrigin } from "../hosted-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = readBaseConfig();
  if (
    config.ACCESS_MODE !== "local" ||
    config.NODE_ENV !== "development" ||
    !config.DEMO_SESSION_TOKEN ||
    !hasDemoSession(request, config.DEMO_SESSION_TOKEN)
  ) {
    return Response.json(
      { message: "This view isn't available in this session" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    integrationStatusSchema.parse({
      environment: "development",
      ...proofPrerequisites(),
    }),
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const config = readBaseConfig();
  if (
    config.ACCESS_MODE !== "local" ||
    config.NODE_ENV !== "development" ||
    !config.DEMO_SESSION_TOKEN ||
    !sameOrigin(request)
  )
    return new Response(null, { status: 403 });
  const body = await request.json().catch(() => null);
  const supplied =
    typeof body?.token === "string" ? Buffer.from(body.token) : Buffer.alloc(0);
  const expected = Buffer.from(config.DEMO_SESSION_TOKEN);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie": `rove_demo=${config.DEMO_SESSION_TOKEN}; HttpOnly; SameSite=Strict; Path=/api`,
      "cache-control": "no-store",
    },
  });
}
