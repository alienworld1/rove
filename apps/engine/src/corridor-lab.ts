import { createHash } from "node:crypto";
import { labRunViewSchema, type LabScenarioEvent } from "@rove/contracts";
import { readPaymentConfig } from "@rove/config";
import {
  compileLabScenario,
  LabValidationError,
  nextEventDelayMs,
  type CompiledLabScenario,
} from "@rove/lab";
import { ChargingStore, LabStore, StoreError } from "@rove/persistence";
import { controlledMeterIdentity, controlledReading } from "./lab-evidence.js";
import { createLocalLabPaymentAdapter } from "./lab-payment.js";
import { createChargingEffectAdapter } from "./charging-effects.js";
import { processNextEffect } from "./outbox-worker.js";
import {
  controlledMeterProfiles,
  northstarVoltwayScenario,
} from "@rove/lab/scenarios/northstar-voltway";

const stableId = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const terminalStatuses = new Set(["completed", "failed"]);

export class CorridorLab {
  constructor(
    private charging: ChargingStore,
    private lab: LabStore,
  ) {}

  async seed() {
    const compiled = compileLabScenario(
      northstarVoltwayScenario,
      controlledMeterProfiles,
    );
    return this.lab.saveScenario(compiled);
  }

  async saveScenario(input: unknown) {
    const compiled = compileLabScenario(input, controlledMeterProfiles);
    if (
      compiled.definition.id === northstarVoltwayScenario.id &&
      compiled.digest !==
        compileLabScenario(northstarVoltwayScenario, controlledMeterProfiles)
          .digest
    )
      throw new LabValidationError([
        {
          path: "id",
          message: "Create a new scenario to change the built-in one.",
        },
      ]);
    this.checkEnvironment(compiled);
    return this.lab.saveScenario(compiled);
  }

  private checkEnvironment(compiled: CompiledLabScenario) {
    if (compiled.definition.corridor.tempoNetwork === "local-simulation")
      return;
    let settings: ReturnType<typeof readPaymentConfig>;
    try {
      settings = readPaymentConfig();
    } catch {
      throw new LabValidationError([
        {
          path: "corridor.tempoNetwork",
          message: "Tempo test settings are incomplete for this Corridor Lab.",
        },
      ]);
    }
    if (
      settings.TEMPO_SESSION_BACKEND !== "precompile" ||
      compiled.definition.corridor.tempoNetwork !==
        `eip155:${settings.TEMPO_CHAIN_ID}` ||
      compiled.definition.corridor.settlementAssetId.toLowerCase() !==
        settings.TEMPO_ASSET_ADDRESS.toLowerCase() ||
      compiled.definition.corridor.tariff.assetDecimals !==
        settings.TEMPO_ASSET_DECIMALS
    )
      throw new LabValidationError([
        {
          path: "corridor.tempoNetwork",
          message: "Choose the configured Tempo network and settlement asset.",
        },
      ]);
  }

  listScenarios() {
    return this.lab.listScenarios();
  }
  getScenario(id: string) {
    return this.lab.getScenario(id);
  }

  async start(scenarioId: string, digest: string, replayOfRunId?: string) {
    const scenario = await this.lab.getScenario(scenarioId);
    if (scenario.digest !== digest) throw new StoreError("VERSION_CONFLICT");
    const compiled = compileLabScenario(
      scenario.definition,
      controlledMeterProfiles,
    );
    this.checkEnvironment(compiled);
    if (compiled.digest !== digest) throw new StoreError("VERSION_CONFLICT");
    const run = await this.lab.createRun(compiled, replayOfRunId);
    await this.initialize(run.run.id);
    return this.view(run.run.id);
  }

  async initialize(runId: string) {
    const { run } = await this.lab.getRun(runId);
    if (run.status !== "initializing") return;
    const compiled = run.compiledSnapshot as CompiledLabScenario;
    const definition = compiled.definition;
    const corridor = await this.charging.createCorridor(
      {
        commandId: stableId(`${runId}:corridor`),
        correlationId: stableId(runId),
        ...definition.corridor,
        meters: definition.lanes.map(controlledMeterIdentity),
      },
      "corridor-lab",
    );
    const bindings: Record<string, string> = {};
    for (const lane of definition.lanes) {
      const started = await this.charging.startLane(
        {
          commandId: stableId(`${runId}:${lane.key}:start`),
          correlationId: stableId(`${runId}:${lane.key}`),
          corridorId: corridor.id,
          externalSessionId: `${lane.sessionId}-${runId}`,
          chargerId: lane.chargerId,
          meterId: lane.meterId,
          maxPowerWatts: lane.maxPowerWatts,
          expectedProofIntervalMs: lane.expectedProofIntervalMs,
        },
        "corridor-lab",
      );
      bindings[lane.key] = started.id;
    }
    await this.lab.bindRun(runId, corridor.id, bindings);
    if (definition.corridor.tempoNetwork === "local-simulation")
      for (const laneId of Object.values(bindings))
        await this.drainLocal(laneId, definition.traceEpoch);
    else
      for (const laneId of Object.values(bindings))
        await this.drainLive(laneId);
    if (definition.corridor.tempoNetwork !== "local-simulation")
      await this.syncAwaiting(runId);
  }

  private async drainLive(laneId: string) {
    const adapter = createChargingEffectAdapter(this.charging);
    return processNextEffect(
      this.charging,
      adapter,
      new Date().toISOString(),
      laneId,
    );
  }

  private async syncAwaiting(runId: string) {
    const { run } = await this.lab.getRun(runId);
    const compiled = run.compiledSnapshot as CompiledLabScenario;
    if (compiled.definition.corridor.tempoNetwork === "local-simulation")
      return;
    const bindings = run.laneBindings as Record<string, string>;
    for (const [laneKey, laneId] of Object.entries(bindings)) {
      const projection = await this.charging.getLane(laneId);
      const operation = projection.operations.find((item) =>
        ["pending", "submitted", "failed"].includes(item.status),
      );
      if (operation) {
        await this.lab.updateAwaiting(runId, {
          laneKey,
          operation: operation.type,
        });
        return;
      }
    }
    await this.lab.updateAwaiting(runId, null);
  }

  private async drainLocal(laneId: string, traceEpoch: string) {
    const adapter = createLocalLabPaymentAdapter(this.charging, traceEpoch);
    for (let index = 0; index < 12; index++) {
      if (
        !(await processNextEffect(
          this.charging,
          adapter,
          new Date().toISOString(),
          laneId,
        ))
      )
        break;
    }
  }

  async view(runId: string) {
    const { run, events } = await this.lab.getRun(runId);
    const compiled = run.compiledSnapshot as CompiledLabScenario;
    const bindings = run.laneBindings as Record<string, string>;
    const lanes = await Promise.all(
      compiled.definition.lanes.map(async (definition) => ({
        definition,
        projection: bindings[definition.key]
          ? await this.charging.getLane(bindings[definition.key])
          : null,
      })),
    );
    return labRunViewSchema.parse({
      run: {
        id: run.id,
        scenarioId: run.scenarioId,
        scenarioDigest: run.scenarioDigest,
        status: run.status,
        version: run.version,
        cursor: run.cursor,
        traceOffsetMs: run.traceOffsetMs,
        speed: Number(run.speed),
        laneBindings: bindings,
        replayOfRunId: run.replayOfRunId,
        awaiting: run.awaiting,
        failureCode: run.failureCode,
        startedAt: new Date(run.startedAt).toISOString(),
        updatedAt: new Date(run.updatedAt).toISOString(),
      },
      scenario: compiled.definition,
      environment: {
        physicalSource: "Digital twin",
        evidence: "Controlled signed meter readings",
        payment:
          compiled.definition.corridor.tempoNetwork === "local-simulation"
            ? "Local deterministic payment"
            : "Tempo",
        settlement: "Partial settlement; final close is outside this run",
      },
      lanes,
      events: events.map((event) => ({
        id: event.scenarioEventId,
        sequence: event.sequence,
        laneKey: event.laneKey,
        type: event.eventType,
        traceOffsetMs: event.traceOffsetMs,
        status: event.status,
        reasonCode: event.reasonCode,
        commandId: event.commandId,
      })),
    });
  }

  async transport(
    runId: string,
    action: "play" | "pause" | "step" | "reset" | "speed",
    expectedVersion: number,
    speed?: number,
  ) {
    if (action === "reset") {
      const { run } = await this.lab.getRun(runId);
      if (run.version !== expectedVersion)
        throw new StoreError("VERSION_CONFLICT", run.version);
      return this.start(run.scenarioId, run.scenarioDigest, run.id);
    }
    if (action === "step") {
      const { run } = await this.lab.getRun(runId);
      if (run.version !== expectedVersion)
        throw new StoreError("VERSION_CONFLICT", run.version);
      if (!["ready", "paused"].includes(run.status))
        throw new StoreError("CONFLICT");
      await this.dispatchOne(runId, expectedVersion);
      return this.view(runId);
    }
    const allowedStatuses: Array<"ready" | "running" | "paused"> =
      action === "play"
        ? ["ready", "paused"]
        : action === "pause"
          ? ["running"]
          : ["ready", "running", "paused"];
    const current = (await this.lab.getRun(runId)).run;
    if (current.version !== expectedVersion)
      throw new StoreError("VERSION_CONFLICT", current.version);
    if (!allowedStatuses.some((status) => status === current.status))
      throw new StoreError("CONFLICT");
    await this.lab.changeTransport(
      runId,
      expectedVersion,
      action === "play"
        ? "running"
        : action === "speed"
          ? (current.status as "ready" | "running" | "paused")
          : "paused",
      [...allowedStatuses],
      speed,
    );
    return this.view(runId);
  }

  async check(runId: string, expectedVersion: number) {
    const { run, events } = await this.lab.getRun(runId);
    if (run.version !== expectedVersion)
      throw new StoreError("VERSION_CONFLICT", run.version);
    const compiled = run.compiledSnapshot as CompiledLabScenario;
    if (compiled.definition.corridor.tempoNetwork === "local-simulation") {
      const bindings = run.laneBindings as Record<string, string>;
      for (const [laneKey, laneId] of Object.entries(bindings)) {
        const last = events
          .filter(
            (event) =>
              event.laneKey === laneKey &&
              ["completed", "rejected"].includes(event.status),
          )
          .at(-1);
        if (this.localEffectsAvailable(compiled, last?.sequence ?? -1, laneKey))
          await this.drainLocal(laneId, compiled.definition.traceEpoch);
      }
    } else {
      for (const laneId of Object.values(
        run.laneBindings as Record<string, string>,
      ))
        await this.drainLive(laneId);
    }
    await this.reconcileAwaiting(runId);
    await this.syncAwaiting(runId);
    return this.view(runId);
  }

  private async reconcileAwaiting(runId: string) {
    const { run, events } = await this.lab.getRun(runId);
    if (run.status !== "awaiting_chain") return;
    const pending = events.find((event) => event.status === "awaiting_chain");
    if (!pending?.laneKey) return;
    const laneId = (run.laneBindings as Record<string, string>)[
      pending.laneKey
    ];
    if (!laneId) return;
    const projection = await this.charging.getLane(laneId);
    if (
      projection.state === "PROTECTED" &&
      projection.operations.every(
        (operation) => operation.status === "confirmed",
      )
    )
      await this.lab.completeEvent(
        runId,
        pending.id,
        "completed",
        pending.reasonCode ?? undefined,
        pending.commandId ?? undefined,
      );
  }

  async dispatchOne(runId: string, expectedVersion: number) {
    const snapshot = await this.lab.getRun(runId);
    const unavailableLanes = new Set<string>();
    const definition = snapshot.run.compiledSnapshot as CompiledLabScenario;
    if (definition.definition.corridor.tempoNetwork !== "local-simulation") {
      const bindings = snapshot.run.laneBindings as Record<string, string>;
      for (const [laneKey, laneId] of Object.entries(bindings)) {
        const projection = await this.charging.getLane(laneId);
        if (
          projection.operations.some((operation) =>
            ["pending", "submitted", "failed"].includes(operation.status),
          )
        )
          unavailableLanes.add(laneKey);
      }
    }
    const claim = await this.lab.claimNext(
      runId,
      expectedVersion,
      unavailableLanes,
    );
    if (!claim) return;
    const { run, event } = claim;
    const compiled = run.compiledSnapshot as CompiledLabScenario;
    const input = event.payload as LabScenarioEvent;
    const bindings = run.laneBindings as Record<string, string>;
    const laneId = bindings[input.laneKey];
    if (!laneId) throw new StoreError("VALIDATION");
    const projection = await this.charging.getLane(laneId);
    if (
      input.type === "valid_reading" &&
      projection.state === "PAUSE_REQUIRED"
    ) {
      await this.lab.completeEvent(
        runId,
        event.id,
        "blocked",
        "CONTROL_PAUSE_REQUIRED",
      );
      return;
    }
    const commandId =
      event.commandId ?? stableId(`${runId}:${input.id}:command`);
    const laneVersion = event.expectedLaneVersion ?? projection.version;
    if (!event.commandId)
      await this.lab.recordEventCommand(event.id, commandId, laneVersion);
    const instant = new Date(
      Date.parse(compiled.definition.traceEpoch) + input.traceOffsetMs,
    ).toISOString();
    const lane = compiled.definition.lanes.find(
      (item) => item.key === input.laneKey,
    )!;
    const payload = this.payload(
      compiled,
      input,
      lane,
      `${lane.sessionId}-${runId}`,
      instant,
      projection,
    );
    try {
      const outcome = await this.charging.advanceLane(
        {
          commandId,
          correlationId: stableId(`${runId}:${input.id}`),
          laneId,
          expectedVersion: laneVersion,
          now: instant,
          payload: payload.command,
        },
        "corridor-lab",
        payload.observation,
      );
      if (
        compiled.definition.corridor.tempoNetwork === "local-simulation" &&
        this.localEffectsAvailable(compiled, event.sequence)
      )
        await this.drainLocal(laneId, compiled.definition.traceEpoch);
      const current = await this.charging.getLane(laneId);
      const isLast = event.sequence === compiled.events.length - 1;
      const waiting = isLast && current.state !== "PROTECTED";
      await this.lab.completeEvent(
        runId,
        event.id,
        waiting
          ? "awaiting_chain"
          : outcome.reasonCodes.some((reason) => reason.startsWith("EVIDENCE_"))
            ? "rejected"
            : "completed",
        outcome.reasonCodes[0],
        commandId,
      );
      if (compiled.definition.corridor.tempoNetwork !== "local-simulation")
        await this.syncAwaiting(runId).catch(() => undefined);
    } catch (error) {
      if (error instanceof StoreError && error.code === "VERSION_CONFLICT")
        throw error;
      await this.lab.completeEvent(
        runId,
        event.id,
        "failed",
        "RUN_EVENT_UNAVAILABLE",
        commandId,
      );
      throw error;
    }
  }

  private localEffectsAvailable(
    compiled: CompiledLabScenario,
    index: number,
    laneKey?: string,
  ) {
    if (index < 0) return true;
    const target = laneKey ?? compiled.events[index].laneKey;
    let signer = true;
    let tempo = true;
    for (const event of compiled.events.slice(0, index + 1)) {
      if (event.laneKey !== target) continue;
      if (event.type === "signer_unavailable") signer = false;
      if (event.type === "signer_restored") signer = true;
      if (event.type === "tempo_unavailable") tempo = false;
      if (event.type === "tempo_restored") tempo = true;
    }
    return signer && tempo && compiled.events[index].type !== "top_up_failure";
  }

  private payload(
    compiled: CompiledLabScenario,
    event: LabScenarioEvent,
    lane: CompiledLabScenario["definition"]["lanes"][number],
    sessionId: string,
    instant: string,
    projection: Awaited<ReturnType<ChargingStore["getLane"]>>,
  ) {
    const before = compiled.events.filter(
      (item) =>
        item.laneKey === event.laneKey &&
        (item.traceOffsetMs < event.traceOffsetMs ||
          (item.traceOffsetMs === event.traceOffsetMs &&
            item.sequence < event.sequence)) &&
        ["valid_reading", "recovery_reading"].includes(item.type),
    );
    const previous = before.at(-1);
    const sequence = before.length + 1;
    if (
      event.type === "valid_reading" ||
      event.type === "recovery_reading" ||
      event.type === "corrupt_signature" ||
      event.type === "wrong_meter" ||
      event.type === "sequence_break" ||
      event.type === "replay_reading"
    ) {
      const replay =
        event.type === "replay_reading" &&
        previous &&
        "cumulativeMilliWh" in previous.parameters;
      const milliWh = replay
        ? previous.parameters.cumulativeMilliWh
        : "cumulativeMilliWh" in event.parameters
          ? event.parameters.cumulativeMilliWh
          : "0";
      const readingInstant = replay
        ? new Date(
            Date.parse(compiled.definition.traceEpoch) + previous.traceOffsetMs,
          ).toISOString()
        : instant;
      return {
        command: {
          type: "ObserveEvidence" as const,
          raw: controlledReading({
            lane,
            sessionId,
            instant: readingInstant,
            sequence: replay
              ? sequence - 1
              : event.type === "sequence_break"
                ? sequence + 1
                : sequence,
            cumulativeMilliWh: milliWh,
            wrongMeter: event.type === "wrong_meter",
            corruptSignature: event.type === "corrupt_signature",
          }),
          transportSessionId: sessionId,
        },
        observation: undefined,
      };
    }
    if (event.type === "signer_unavailable")
      return {
        command: { type: "TickProtectionClock" as const },
        observation: { type: "SignerUnavailable" as const },
      };
    if (event.type === "signer_restored")
      return {
        command: { type: "TickProtectionClock" as const },
        observation: { type: "SignerRestored" as const },
      };
    if (event.type === "top_up_failure")
      return {
        command: { type: "TickProtectionClock" as const },
        observation: {
          type: "PaymentEffectFailed" as const,
          reasonCode: "PAYMENT_TOPUP_FAILED" as const,
        },
      };
    if (event.type === "tempo_unavailable")
      return {
        command: {
          type: "PaymentUnavailable" as const,
          reason: "PAYMENT_CHAIN_STATE_UNAVAILABLE" as const,
        },
        observation: undefined,
      };
    if (
      event.type === "tempo_restored" &&
      projection.channelId &&
      projection.confirmedDeposit !== null
    )
      return {
        command: { type: "TickProtectionClock" as const },
        observation: {
          type: "PaymentObserved" as const,
          source: "local-simulation" as const,
          channelId: projection.channelId,
          network: compiled.definition.corridor.tempoNetwork,
          assetId: compiled.definition.corridor.settlementAssetId,
          observedAt: instant,
          confirmedDeposit: projection.confirmedDeposit,
          settledValue: projection.settledValue,
          chainHeight: "3",
        },
      };
    return {
      command: { type: "TickProtectionClock" as const },
      observation: undefined,
    };
  }

  async schedule() {
    for (const active of await this.lab.listActiveRuns()) {
      const compiled = active.compiledSnapshot as CompiledLabScenario;
      const bindings = active.laneBindings as Record<string, string>;
      const { events } = await this.lab.getRun(active.id);
      if (compiled.definition.corridor.tempoNetwork !== "local-simulation") {
        for (const laneId of Object.values(bindings))
          await this.drainLive(laneId);
        await this.reconcileAwaiting(active.id);
        await this.syncAwaiting(active.id);
        continue;
      }
      for (const [laneKey, laneId] of Object.entries(bindings)) {
        const last = events
          .filter(
            (event) =>
              event.laneKey === laneKey &&
              ["completed", "rejected"].includes(event.status),
          )
          .at(-1);
        if (this.localEffectsAvailable(compiled, last?.sequence ?? -1, laneKey))
          await this.drainLocal(laneId, compiled.definition.traceEpoch);
      }
    }
    const running = await this.lab.listRunningRuns();
    for (const run of running) {
      const snapshot = await this.lab.getRun(run.id);
      const next = snapshot.events.find((event) =>
        ["pending", "dispatching", "awaiting_chain"].includes(event.status),
      );
      if (!next) continue;
      const delay = nextEventDelayMs(
        run.traceOffsetMs,
        next.traceOffsetMs,
        Number(run.speed) as 0.25 | 0.5 | 1 | 2 | 4,
      );
      if (Date.now() - Date.parse(run.updatedAt) < delay) continue;
      try {
        await this.dispatchOne(run.id, run.version);
      } catch {}
    }
  }
}
