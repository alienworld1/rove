import type { IncomingMessage, ServerResponse } from "node:http";
import { hostedStartSchema, inviteRedemptionSchema } from "@rove/contracts";
import { HostedAccessError, HostedStore } from "@rove/persistence";
import { HostedRuntime } from "./hosted-runtime.js";

function reply(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}
export async function handleHostedHttp(input: {
  request: IncomingMessage;
  response: ServerResponse;
  access: HostedStore;
  runtime: HostedRuntime;
  sessionHours: number;
  readJson: (request: IncomingMessage) => Promise<unknown>;
}) {
  const { request, response, access, runtime, readJson, sessionHours } = input;
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = request.method;
  const tokenHeader = request.headers["x-rove-session"];
  const token = typeof tokenHeader === "string" ? tokenHeader : undefined;
  if (path === "/api/published-runs" && method === "GET") {
    reply(response, 200, await access.listPublished());
    return true;
  }
  if (path === "/api/access/session" && method === "GET") {
    reply(response, 200, await access.session(token));
    return true;
  }
  if (path === "/api/access/invite" && method === "POST") {
    const body = inviteRedemptionSchema.parse(await readJson(request));
    reply(response, 200, await access.redeem(body.code, token, sessionHours));
    return true;
  }
  if (path === "/api/access/end" && method === "POST") {
    await access.endSession(token);
    reply(response, 200, { ended: true });
    return true;
  }
  if (path === "/api/access/runs" && method === "POST") {
    const body = hostedStartSchema.parse(await readJson(request));
    reply(response, 202, await runtime.start(token, body.runId));
    return true;
  }
  const run = /^\/api\/lab\/runs\/([^/]+)$/.exec(path);
  if (run && method === "GET") {
    const published = await access.published(run[1]);
    reply(response, 200, published?.run ?? (await runtime.view(token, run[1])));
    return true;
  }
  const resource =
    /^\/api\/(corridors|lanes)\/([^/]+)(?:\/(inspector|completion|accounting|complete|check|close))?$/.exec(
      path,
    );
  if (resource) {
    const kind = resource[1] === "corridors" ? "corridor" : "lane";
    if (method === "GET") {
      const published = await access.publishedResource(resource[2], kind);
      if (published) {
        let value: unknown;
        if (kind === "corridor" && !resource[3]) {
          const trace = url.searchParams.get("trace");
          value = trace === null ? published.corridor : published.traces[trace];
        } else if (!resource[3])
          value = published.corridor.lanes.find(
            (lane) => lane.projection.id === resource[2],
          )?.projection;
        else if (resource[3] === "inspector")
          value =
            published.inspectors[
              `${resource[2]}:${url.searchParams.get("event")}`
            ];
        else if (resource[3] === "completion")
          value = published.completions[resource[2]];
        else if (resource[3] === "accounting")
          value = published.accounting[resource[2]];
        if (!value)
          throw new HostedAccessError(
            404,
            "That recorded selection is unavailable.",
          );
        reply(response, 200, value);
        return true;
      }
      await access.ownsResource(token, resource[2], kind);
      return false;
    }
    if (
      method === "POST" &&
      kind === "lane" &&
      ["complete", "check", "close"].includes(resource[3])
    ) {
      const runId = await access.ownsResource(token, resource[2], kind);
      const identity = await access.identity(token, "control_owned");
      await access.touchRun(runId);
      await access.rateLimit(`commands:${identity.workspace_id}`, 60);
      return false;
    }
  }
  const transport =
    /^\/api\/lab\/runs\/([^/]+)\/(play|pause|step|speed|check)$/.exec(path);
  if (transport && method === "POST") {
    await access.ownsRun(token, transport[1]);
    const identity = await access.identity(token, "control_owned");
    await access.touchRun(transport[1]);
    await access.rateLimit(`commands:${identity.workspace_id}`, 60);
    return false;
  }
  if (path === "/api/events/stream" && method === "GET") {
    const corridorId = url.searchParams.get("corridor");
    if (!corridorId)
      throw new HostedAccessError(400, "Choose a Corridor for live updates.");
    const runId = await access.ownsResource(token, corridorId, "corridor");
    if (url.searchParams.get("run") && url.searchParams.get("run") !== runId)
      throw new HostedAccessError(404, "That run isn't available.");
    return false;
  }
  throw new HostedAccessError(
    403,
    "This action isn't available with invite access. You can explore published runs or run the approved scenario.",
  );
}
