import { readBaseConfig } from "@rove/config";
import { readinessSchema, type Readiness } from "@rove/contracts";

export const runtime = "nodejs";

export async function GET() {
  const checkedAt = new Date().toISOString();
  let result: Readiness;

  try {
    const config = readBaseConfig();
    const response = await fetch(new URL("/health", config.ENGINE_ORIGIN), {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    const engine = readinessSchema.parse(await response.json());
    result =
      response.ok && engine.status === "ready"
        ? {
            status: "ready",
            engineReachable: true,
            checkedAt,
            dependencies: { web: "ready", engine: "ready" },
          }
        : {
            status: "blocked",
            engineReachable: true,
            reasonCode: "ENGINE_SETUP_NEEDED",
            checkedAt,
            dependencies: { web: "ready", engine: "blocked" },
          };
  } catch (error) {
    const configInvalid =
      error instanceof Error && error.message.startsWith("CONFIG_INVALID");
    result = {
      status: "blocked",
      engineReachable: false,
      reasonCode: configInvalid ? "CONFIG_INVALID" : "ENGINE_UNAVAILABLE",
      checkedAt,
      dependencies: { web: "ready", engine: "unavailable" },
    };
  }

  return Response.json(readinessSchema.parse(result), {
    headers: { "cache-control": "no-store" },
  });
}
