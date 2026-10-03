import { completionCommandSchema } from "@rove/contracts";
import { recoverCharging, recoverChargingLane } from "./recover-charging.js";
import { createLocalLabPaymentAdapter } from "./lab-payment.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { proofPrerequisites, readBaseConfig } from "@rove/config";
import {
  createCorridorSchema,
  idSchema,
  labSpeedSchema,
  labStartRunSchema,
  labTransportSchema,
  laneCommandSchema,
  realtimePresentationEventSchema,
  readinessSchema,
  startLaneSchema,
} from "@rove/contracts";
import { ChargingStore, LabStore, StoreError } from "@rove/persistence";
import { LabValidationError } from "@rove/lab";
import { CorridorLab } from "./corridor-lab.js";
import { processNextEffect } from "./outbox-worker.js";
import { createChargingEffectAdapter } from "./charging-effects.js";
import { composeCorridorOperatingView } from "./corridor-read-model.js";
import {
  encodePresentationEvent,
  parsePresentationCursor,
} from "./presentation-stream.js";

const config = readBaseConfig();
const store = config.DATABASE_URL
  ? new ChargingStore(config.DATABASE_URL)
  : null;
const labStore = config.DATABASE_URL ? new LabStore(config.DATABASE_URL) : null;
const corridorLab = store && labStore ? new CorridorLab(store, labStore) : null;
const seedLab = corridorLab?.seed().then(
  () => true,
  () => false,
);
const paymentEffects =
  store && proofPrerequisites().paymentConfigured
    ? createChargingEffectAdapter(store)
    : null;
const initialRecovery = store
  ? recoverCharging(store, paymentEffects).then(
      () => true,
      () => false,
    )
  : Promise.resolve(false);
let activeStreams = 0;

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
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 70_000) throw new StoreError("VALIDATION");
    chunks.push(bytes);
  }
  const data = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new StoreError("VALIDATION");
  }
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const path = requestUrl.pathname;
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
    const recovered = await initialRecovery;
    const gates = store ? [...store.recovery.values()] : [];
    const ready =
      database === "ready" &&
      recovered &&
      gates.every((gate) => gate.status === "ready");
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
          engine:
            database !== "ready"
              ? "database unavailable"
              : !recovered
                ? "Restoring session state"
                : !ready
                  ? "Checking payment state"
                  : "ready",
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
    if (path === "/api/events/stream" && request.method === "GET") {
      if (activeStreams >= 4) {
        send(response, 429, { message: "Too many live connections." });
        return;
      }
      const corridorId = idSchema.parse(
        requestUrl.searchParams.get("corridor"),
      );
      const runId = requestUrl.searchParams.get("run");
      if (runId) idSchema.parse(runId);
      const lastEventId = request.headers["last-event-id"];
      const requestedCursor = parsePresentationCursor(
        (Array.isArray(lastEventId) ? lastEventId[0] : lastEventId) ??
          requestUrl.searchParams.get("cursor") ??
          undefined,
      );
      if (requestedCursor === null) throw new StoreError("VALIDATION");
      const view = await composeCorridorOperatingView(
        store,
        corridorLab,
        corridorId,
      );
      const replayFloor = await store.getPresentationReplayFloor(corridorId);
      if (runId && view.activeRun?.id !== runId)
        throw new StoreError("NOT_FOUND");
      let runVersion = runId ? await corridorLab?.runVersion(runId) : null;
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      response.flushHeaders();
      activeStreams += 1;
      let cursor = requestedCursor;
      let closed = false;
      let checking = false;
      let heartbeat = 0;
      if (cursor > view.projectionVersion || cursor < replayFloor) {
        const resync = realtimePresentationEventSchema.parse({
          id: String(view.projectionVersion),
          type: "resync_required",
          corridorId,
          laneId: null,
          runId: view.activeRun?.id ?? null,
          projectionVersion: view.projectionVersion,
          reasonCode: null,
          occurredAt: new Date().toISOString(),
          payload: { eventType: null, laneVersion: null },
        });
        response.write(encodePresentationEvent(resync));
        cursor = view.projectionVersion;
      }
      const timer = setInterval(() => {
        if (closed || checking) return;
        checking = true;
        void Promise.all([
          store.getPresentationEvents(corridorId, cursor),
          runId ? corridorLab?.runVersion(runId) : Promise.resolve(null),
        ])
          .then(([events, nextRunVersion]) => {
            for (const event of events) {
              if (Number(event.id) <= cursor) continue;
              if (!response.write(encodePresentationEvent(event))) {
                cleanup();
                return;
              }
              cursor = Number(event.id);
            }
            if (
              runId &&
              nextRunVersion !== null &&
              nextRunVersion !== undefined &&
              nextRunVersion !== runVersion
            ) {
              runVersion = nextRunVersion;
              if (
                !response.write(
                  encodePresentationEvent(
                    realtimePresentationEventSchema.parse({
                      id: String(cursor),
                      type: "lab_run_changed",
                      corridorId,
                      laneId: null,
                      runId,
                      projectionVersion: cursor,
                      reasonCode: null,
                      occurredAt: new Date().toISOString(),
                      payload: {
                        eventType: `run.version.${nextRunVersion}`,
                        laneVersion: null,
                      },
                    }),
                  ),
                )
              )
                cleanup();
            }
            heartbeat += 1;
            if (heartbeat >= 15) {
              response.write(`: keep-alive ${Date.now()}\n\n`);
              heartbeat = 0;
            }
          })
          .catch(() => {
            if (!closed) response.write(": source unavailable\n\n");
          })
          .finally(() => {
            checking = false;
          });
      }, 1_000);
      timer.unref();
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        activeStreams = Math.max(0, activeStreams - 1);
        if (!response.writableEnded) response.end();
      };
      response.once("close", cleanup);
      return;
    }
    if (request.method === "POST" && !(await initialRecovery))
      throw new Error("RECOVERY_UNAVAILABLE");
    const completionMatch =
      /^\/api\/lanes\/([^/]+)\/(completion|complete|check|close|cdr|accounting|end)$/.exec(
        path,
      );
    if (completionMatch) {
      const id = idSchema.parse(completionMatch[1]);
      const action = completionMatch[2];
      if (
        request.method === "GET" &&
        ["completion", "accounting"].includes(action)
      ) {
        send(
          response,
          200,
          action === "completion"
            ? await store.getCompletion(id)
            : await store.getAccountingRecord(id),
        );
        return;
      }
      if (
        request.method === "POST" &&
        ["complete", "check", "close"].includes(action)
      ) {
        const input = completionCommandSchema.parse(await readJson(request));
        if (input.laneId !== id) throw new StoreError("ACCESS_DENIED");
        if (action === "complete") {
          if (!corridorLab) throw new StoreError("VALIDATION");
          send(response, 202, await corridorLab.finishLane(input));
          return;
        }
        const context = await store.getPaymentContext(id);
        const local = context.lane.tempoNetwork === "local-simulation";
        const instant = local
          ? (context.lane.completion?.serviceEndedAt ?? context.lane.updatedAt)
          : new Date().toISOString();
        const observation =
          !local && action === "close" && paymentEffects
            ? await paymentEffects.observe(id)
            : undefined;
        await store.advanceLane(
          {
            ...input,
            now: observation?.observedAt ?? instant,
            payload: {
              type: action === "close" ? "CloseChannel" : "CheckCompletion",
            },
          },
          action === "check" ? "engine-recovery" : "demo-session",
          observation,
        );
        if (action === "check")
          await recoverChargingLane(store, context.lane, paymentEffects);
        if (local)
          await processNextEffect(
            store,
            createLocalLabPaymentAdapter(store, instant),
            new Date().toISOString(),
            id,
          );
        send(response, 202, await store.getCompletion(id));
        return;
      }
      if (request.method === "POST" && ["cdr", "end"].includes(action)) {
        const input = laneCommandSchema.parse(await readJson(request));
        if (
          input.laneId !== id ||
          (action === "cdr"
            ? input.payload.type !== "ReceiveCDR"
            : input.payload.type !== "CompleteLane" ||
              input.payload.endSource !== "external_adapter")
        )
          throw new StoreError("ACCESS_DENIED");
        send(
          response,
          202,
          await store.advanceLane(
            { ...input, now: undefined },
            "external-adapter",
          ),
        );
        return;
      }
    }
    if (path.startsWith("/api/lab/")) {
      if (!corridorLab) throw new StoreError("VALIDATION");
      if (seedLab && !(await seedLab)) throw new Error("LAB_SEED_UNAVAILABLE");
      if (path === "/api/lab/scenarios" && request.method === "GET") {
        send(response, 200, await corridorLab.listScenarios());
        return;
      }
      if (path === "/api/lab/scenarios" && request.method === "POST") {
        send(
          response,
          201,
          await corridorLab.saveScenario(await readJson(request)),
        );
        return;
      }
      const scenarioMatch = /^\/api\/lab\/scenarios\/([^/]+)$/.exec(path);
      if (scenarioMatch && request.method === "GET") {
        const scenario = await corridorLab.getScenario(
          idSchema.parse(scenarioMatch[1]),
        );
        send(response, 200, {
          definition: scenario.definition,
          digest: scenario.digest,
          validationStatus: scenario.validationStatus,
        });
        return;
      }
      if (path === "/api/lab/runs" && request.method === "POST") {
        const input = labStartRunSchema.parse(await readJson(request));
        send(
          response,
          201,
          await corridorLab.start(input.scenarioId, input.scenarioDigest),
        );
        return;
      }
      const runMatch = /^\/api\/lab\/runs\/([^/]+)$/.exec(path);
      if (runMatch && request.method === "GET") {
        send(
          response,
          200,
          await corridorLab.view(idSchema.parse(runMatch[1])),
        );
        return;
      }
      const transportMatch =
        /^\/api\/lab\/runs\/([^/]+)\/(play|pause|step|reset|speed|check)$/.exec(
          path,
        );
      if (transportMatch && request.method === "POST") {
        const input =
          transportMatch[2] === "speed"
            ? labSpeedSchema.parse(await readJson(request))
            : labTransportSchema.parse(await readJson(request));
        const runId = idSchema.parse(transportMatch[1]);
        send(
          response,
          200,
          transportMatch[2] === "check"
            ? await corridorLab.check(runId, input.expectedVersion)
            : await corridorLab.transport(
                runId,
                transportMatch[2] as
                  "play" | "pause" | "step" | "reset" | "speed",
                input.expectedVersion,
                "speed" in input ? Number(input.speed) : undefined,
              ),
        );
        return;
      }
    }
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
      if (!paymentEffects) throw new StoreError("VALIDATION");
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
      const trace = requestUrl.searchParams.get("trace");
      const traceOffset =
        trace === null ? null : parsePresentationCursor(trace);
      if (trace !== null && traceOffset === null)
        throw new StoreError("VALIDATION");
      send(
        response,
        200,
        await composeCorridorOperatingView(store, corridorLab, id, traceOffset),
      );
      return;
    }
    const laneMatch = /^\/api\/lanes\/([^/]+)$/.exec(path);
    if (laneMatch && request.method === "GET") {
      send(response, 200, await store.getLane(idSchema.parse(laneMatch[1])));
      return;
    }
    const historyMatch = /^\/api\/lanes\/([^/]+)\/inspector$/.exec(path);
    if (historyMatch && request.method === "GET") {
      const eventId = requestUrl.searchParams.get("event");
      send(
        response,
        200,
        eventId
          ? await store.getInspector(
              idSchema.parse(historyMatch[1]),
              idSchema.parse(eventId),
            )
          : await store.getHistory(idSchema.parse(historyMatch[1])),
      );
      return;
    }
    const evidenceMatch = /^\/api\/lanes\/([^/]+)\/evidence$/.exec(path);
    if (evidenceMatch && request.method === "POST") {
      const input = laneCommandSchema.parse(await readJson(request));
      ({ correlationId, commandId, laneId } = input);
      if (
        input.laneId !== evidenceMatch[1] ||
        input.payload.type !== "ObserveEvidence"
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
    const commandMatch = /^\/api\/lanes\/([^/]+)\/commands$/.exec(path);
    if (commandMatch && request.method === "POST") {
      const input = laneCommandSchema.parse(await readJson(request));
      ({ correlationId, commandId, laneId } = input);
      if (
        input.laneId !== commandMatch[1] ||
        ![
          "TickProtectionClock",
          "RequirePause",
          "BeginRecovery",
          "PaymentUnavailable",
        ].includes(input.payload.type)
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
    if (error instanceof LabValidationError) {
      send(response, 400, {
        message: "Review the highlighted settings.",
        issues: error.issues,
      });
      return;
    }
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
  let working = false;
  const timer = setInterval(() => {
    if (working) return;
    working = true;
    void (async () => {
      if (!(await initialRecovery)) return;
      const now = new Date().toISOString();
      for (const lane of await store.listRecoveryLanes()) {
        if (store.recovery.get(lane.id)?.status !== "ready")
          await recoverChargingLane(store, lane, paymentEffects);
        if (store.recovery.get(lane.id)?.status !== "ready") continue;
        if (lane.completion && lane.state !== "CLOSED") {
          const local = lane.tempoNetwork === "local-simulation";
          const adapter = local
            ? createLocalLabPaymentAdapter(
                store,
                lane.completion.serviceEndedAt,
              )
            : paymentEffects;
          if (adapter) await processNextEffect(store, adapter, now, lane.id);
          if (!local && paymentEffects && lane.completion.status !== "closing")
            await paymentEffects.refresh(lane.id).catch(() => undefined);
        }
      }
      if (paymentEffects)
        for (const lane of await store.listActiveLanes()) {
          if (
            store.recovery.get(lane.id)?.status === "ready" &&
            !(labStore && (await labStore.ownsLane(lane.id)))
          )
            await processNextEffect(store, paymentEffects, now, lane.id, true);
        }
      const active = await store.listActiveLanes();
      for (const lane of active) {
        if (store.recovery.get(lane.id)?.status !== "ready" || lane.completion)
          continue;
        if (labStore && (await labStore.ownsLane(lane.id))) continue;
        if (!lane.serviceStarted) continue;
        const cadence = Math.max(
          1_000,
          Math.min(30_000, lane.expectedProofIntervalMs),
        );
        if (Date.parse(now) - Date.parse(lane.updatedAt) < cadence) continue;
        const evidenceDue =
          lane.lastTrustedEvidenceAt !== null &&
          Date.parse(now) - Date.parse(lane.lastTrustedEvidenceAt) >
            lane.policy.evidenceMaxAgeMs;
        const chainDue =
          lane.lastChainObservedAt !== null &&
          Date.parse(now) - Date.parse(lane.lastChainObservedAt) >
            lane.policy.chainMaxAgeMs;
        const boundGrowing = lane.evidenceHealth !== "fresh" || evidenceDue;
        const chainNeedsObservation =
          lane.channelId !== null &&
          lane.confirmedDeposit !== null &&
          (lane.chainHealth !== "fresh" || chainDue);
        if (!boundGrowing && !chainNeedsObservation) continue;
        try {
          if (paymentEffects && chainNeedsObservation) {
            try {
              await paymentEffects.refresh(lane.id);
            } catch {
              const before = await store.getLane(lane.id);
              await store.advanceLane(
                {
                  commandId: randomUUID(),
                  correlationId: randomUUID(),
                  laneId: lane.id,
                  expectedVersion: before.version,
                  now,
                  payload: {
                    type: "PaymentUnavailable",
                    reason: "PAYMENT_CHAIN_STATE_UNAVAILABLE",
                  },
                },
                "engine-chain-check",
              );
            }
          }
          if (boundGrowing || !paymentEffects) {
            const projection = await store.getLane(lane.id);
            await store.advanceLane(
              {
                commandId: randomUUID(),
                correlationId: randomUUID(),
                laneId: lane.id,
                expectedVersion: projection.version,
                now,
                payload: { type: "TickProtectionClock" },
              },
              "engine-clock",
            );
          }
        } catch {
          process.stderr.write(
            `${JSON.stringify({ level: "warn", event: "charging.lane_check_unavailable", laneId: lane.id })}\n`,
          );
        }
      }
      if (corridorLab) await corridorLab.schedule();
    })()
      .catch(() => {
        process.stderr.write(
          `${JSON.stringify({ level: "error", event: "charging.outbox_unavailable" })}\n`,
        );
      })
      .finally(() => {
        working = false;
      });
  }, 2_000);
  timer.unref();
}
