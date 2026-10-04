import { publishedDataResponse } from "../published-data";
import { proxyHosted } from "../hosted-proxy";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return (
      (await publishedDataResponse("/api/published-runs")) ??
      (await proxyHosted(request, "/api/published-runs"))
    );
  } catch {
    return Response.json(
      {
        message: "Published runs are unavailable right now. Please try again.",
      },
      { status: 503 },
    );
  }
}
