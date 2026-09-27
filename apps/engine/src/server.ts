import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readBaseConfig } from "@rove/config";
import {
  createCorridorSchema,
  idSchema,
  laneCommandSchema,
  readinessSchema,
  startLaneSchema,
} from "@rove/contracts";
import { ChargingStore, StoreError } from "@rove/persistence";
import { processNextEffect } from "./outbox-worker.js";

const config = readBaseConfig();
const store = config.DATABASE_URL
  ? new ChargingStore(config.DATABASE_URL)
  : null;

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function logDecision(
  input: {
    commandId: string;
    correlationId: string;
    laneId?: string;
    corridorId?: string;
  },
  outcome: {
    id?: string;
    state?: string;
    reasonCodes?: string[];
    version?: number;
  },
) {
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      event: "charging.command_committed",
      commandId: input.commandId,
      correlationId: input.correlationId,
      laneId: input.laneId,
      corridorId: input.corridorId,
      laneVersion: outcome.version,
      state: outcome.state,
      reasonCodes: outcome.reasonCodes,
    })}\n`,
  );
}

function authorized(request: IncomingMessage) {
  if (!config.DEMO_SESSION_TOKEN || config.NODE_ENV !== "development")
    return false;
  const supplied = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(config.DEMO_SESSION_TOKEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJson(request: IncomingMessage) {
  let data = "";
  for await (const chunk of request) {
    data += chunk.toString("utf8");
    if (Buffer.byteLength(data) > 70_000) throw new StoreError("VALIDATION");
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new StoreError("VALIDATION");
  }
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method === "GET" && path === "/health") {
    let database = "unconfigured";
    if (store) {
      try {
        await store.health();
        database = "ready";
      } catch {
        database = "unavailable";
      }
    }
    const ready = database === "ready";
    send(
      response,
      ready ? 200 : 503,
      readinessSchema.parse({
        status: ready ? "ready" : "blocked",
        engineReachable: true,
        reasonCode: ready ? undefined : "DATABASE_UNAVAILABLE",
        checkedAt: new Date().toISOString(),
        dependencies: {
          web: "not checked",
          engine: ready ? "ready" : "database unavailable",
        },
      }),
    );
    return;
  }
  if (!authorized(request)) {
    send(response, 403, {
      message: "You don't have access to this charging session.",
    });
    return;
  }
  if (!store) {
    send(response, 503, {
      message: "Charging protection is unavailable right now. Try again.",
    });
    return;
  }
  let correlationId: string | undefined;
  let laneId: string | undefined;
  let commandId: string | undefined;
  try {
    if (path === "/api/corridors" && request.method === "POST") {
      const input = createCorridorSchema.parse(await readJson(request));
      ({ correlationId, commandId } = input);
      const outcome = await store.createCorridor(input, "demo-session");
      logDecision(input, outcome);
      send(response, 201, outcome);
      return;
    }
    if (path === "/api/corridors" && request.method === "GET") {
      send(response, 200, await store.listCorridors());
      return;
    }
    if (path === "/api/lanes" && request.method === "POST") {
      const input = startLaneSchema.parse(await readJson(request));
      ({ correlationId, commandId } = input);
      const outcome = await store.startLane(input, "demo-session");
      logDecision({ ...input, laneId: outcome.id }, outcome);
      send(response, 201, outcome);
      return;
    }
    const corridorMatch = /^\/api\/corridors\/([^/]+)$/.exec(path);
    if (corridorMatch && request.method === "GET") {
      const id = idSchema.parse(corridorMatch[1]);
      send(response, 200, {
        corridor: await store.getCorridor(id),
        laneIds: await store.listLanes(id),
      });
      return;
    }
    const laneMatch = /^\/api\/lanes\/([^/]+)$/.exec(path);
    if (laneMatch && request.method === "GET") {
      send(response, 200, await store.getLane(idSchema.parse(laneMatch[1])));
      return;
    }
    const commandMatch = /^\/api\/lanes\/([^/]+)\/commands$/.exec(path);
    if (commandMatch && request.method === "POST") {
      const input = laneCommandSchema.parse(await readJson(request));
      ({ correlationId, commandId, laneId } = input);
      if (
        input.laneId !== commandMatch[1] ||
        input.payload.type === "ObservePayment"
      )
        throw new StoreError("ACCESS_DENIED");
      const outcome = await store.advanceLane(
        { ...input, now: undefined },
        "demo-session",
      );
      logDecision(input, outcome);
      send(response, 200, outcome);
      return;
    }
    send(response, 404, { message: "We couldn't find that charging session." });
  } catch (error) {
    const code =
      error instanceof StoreError
        ? error.code
        : error instanceof RangeError ||
            (error instanceof Error && error.name === "ZodError")
          ? "VALIDATION"
          : error instanceof Error && "code" in error && error.code === "23505"
            ? "CONFLICT"
            : "UNAVAILABLE";
    const status =
      code === "NOT_FOUND"
        ? 404
        : code === "ACCESS_DENIED"
          ? 403
          : code === "CONFLICT" || code === "VERSION_CONFLICT"
            ? 409
            : code === "VALIDATION"
              ? 400
              : 503;
    const message =
      code === "ACCESS_DENIED"
        ? "You don't have access to this charging session."
        : code === "VERSION_CONFLICT"
          ? "This session changed. Refresh and try again."
          : code === "CONFLICT"
            ? "This charging session is already in use."
            : code === "VALIDATION"
              ? "Check the charging setup and try again."
              : "Charging protection is unavailable right now. Try again.";
    const currentVersion =
      error instanceof StoreError ? error.currentVersion : undefined;
    send(response, status, { code, message, currentVersion });
    if (status >= 400)
      process.stderr.write(
        `${JSON.stringify({
          level: status >= 500 ? "error" : "warn",
          code,
          path,
          correlationId,
          laneId,
          commandId,
          message: "Charging request failed",
        })}\n`,
      );
  }
}

const server = createServer((request, response) => {
  void handle(request, response);
});
server.listen(config.ENGINE_PORT, config.ENGINE_HOST);

if (store) {
  const timer = setInterval(() => {
    void processNextEffect(store, {
      reconcile: async () => ({ status: "unknown" }),
      submit: async () => ({ status: "pending" }),
    }).catch(() => {
      process.stderr.write(
        `${JSON.stringify({ level: "error", event: "charging.outbox_unavailable" })}\n`,
      );
    });
  }, 2_000);
  timer.unref();
}
