import { proxyHosted } from "../../hosted-proxy";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handle(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  if (
    !(
      request.method === "GET"
        ? ["session"]
        : ["invite", "end", "runs", "quote"]
    ).includes(action)
  )
    return new Response(null, { status: 404 });
  return proxyHosted(request, `/api/access/${action}`);
}
export const GET = handle;
export const POST = handle;
