import { timingSafeEqual } from "node:crypto";
import { readBaseConfig, proofPrerequisites } from "@rove/config";
import { integrationStatusSchema } from "@rove/contracts";

export const runtime = "nodejs";

function authorized(request: Request, token: string) {
  const supplied = request.headers
    .get("cookie")
    ?.split("; ")
    .find((part) => part.startsWith("rove_demo="))
    ?.slice("rove_demo=".length);
  if (!supplied) return false;
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  const config = readBaseConfig();
  if (
    config.NODE_ENV !== "development" ||
    !config.DEMO_SESSION_TOKEN ||
    !authorized(request, config.DEMO_SESSION_TOKEN)
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
  if (config.NODE_ENV !== "development" || !config.DEMO_SESSION_TOKEN)
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
      "set-cookie": `rove_demo=${config.DEMO_SESSION_TOKEN}; HttpOnly; SameSite=Strict; Path=/api/integration-status`,
      "cache-control": "no-store",
    },
  });
}
