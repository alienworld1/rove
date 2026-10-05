import { randomUUID } from "node:crypto";
import type { ChargingStore } from "@rove/persistence";
import { createChargingEffectAdapter } from "./charging-effects.js";
import {
  readHostedLimits,
  readPaymentConfig,
  readAccountingConfig,
} from "@rove/config";
import { labRunViewSchema, type LabScenario } from "@rove/contracts";
import { compileLabScenario, type CompiledLabScenario } from "@rove/lab";
import { controlledMeterProfiles } from "@rove/lab/scenarios/northstar-voltway";
import {
  HostedAccessError,
  HostedStore,
  type RunReservation,
} from "@rove/persistence";
import { tariffValue } from "@rove/protection";
import { probePaymentEnvironment } from "@rove/tempo";
import { CorridorLab } from "./corridor-lab.js";
import { createLiveLabScenario } from "./lab-live-scenario.js";

export function quoteHostedRun(
  scenario: LabScenario,
  limits: ReturnType<typeof readHostedLimits>,
): Omit<RunReservation, "compiled"> {
  const { tariff, reservePolicy, protectionPolicy } = scenario.corridor;
  const initial = BigInt(reservePolicy.initialDeposit);
  const increment = BigInt(reservePolicy.topUpIncrement);
  let funding = 0n;
  let transactions = BigInt(scenario.lanes.length * 3);
  for (const lane of scenario.lanes) {
    const energies = scenario.events
      .filter(
        (event) =>
          event.laneKey === lane.key &&
          ["valid_reading", "recovery_reading"].includes(event.type),
      )
      .map(
        (event) =>
          BigInt(
            (event.parameters as { cumulativeMilliWh: string })
              .cumulativeMilliWh,
          ) / 1000n,
      );
    const energy = energies.reduce(
      (max, value) => (value > max ? value : max),
      BigInt(lane.initialEnergyWh),
    );
    const value = tariffValue(
      energy,
      tariff.perKwh,
      tariff.tariffDecimals,
      tariff.assetDecimals,
    );
    const needed =
      value + BigInt(protectionPolicy.lowHeadroomThreshold) - initial;
    const topUps = needed >= 0n ? needed / increment + 1n : 0n;
    funding += initial + topUps * increment;
    const partialByValue =
      value /
      BigInt(scenario.corridor.settlementPolicy.minimumUnsettledProtectedValue);
    transactions +=
      topUps +
      (partialByValue < BigInt(energies.length)
        ? partialByValue
        : BigInt(energies.length));
  }
  if (transactions > BigInt(limits.HOSTED_MAX_TRANSACTIONS_PER_RUN))
    throw new HostedAccessError(
      422,
      "This scenario may exceed the transaction allowance. Increase the top-up increment or settlement threshold, or shorten the trace.",
    );
  return {
    funding: funding.toString(),
    fees: (
      BigInt(limits.HOSTED_GAS_LIMIT) *
      BigInt(limits.HOSTED_MAX_FEE_PER_GAS) *
      BigInt(limits.HOSTED_MAX_TRANSACTIONS_PER_RUN)
    ).toString(),
    gasLimit: limits.HOSTED_GAS_LIMIT,
    maxFeePerGas: limits.HOSTED_MAX_FEE_PER_GAS,
    maxTransactions: limits.HOSTED_MAX_TRANSACTIONS_PER_RUN,
    deploymentFunding: limits.HOSTED_FUNDING_BUDGET,
    deploymentFees: limits.HOSTED_FEE_BUDGET,
  };
}

export class HostedRuntime {
  constructor(
    private access: HostedStore,
    private lab: CorridorLab,
    private charging: ChargingStore,
  ) {}
  template() {
    return {
      ...createLiveLabScenario(),
      id: "hosted-template",
      traceEpoch: "2026-01-01T00:00:00.000Z",
    };
  }
  private validateScenario(input: unknown) {
    const compiled = compileLabScenario(input, controlledMeterProfiles);
    const template = this.template();
    const corridor = compiled.definition.corridor;
    if (
      corridor.tempoNetwork !== template.corridor.tempoNetwork ||
      corridor.settlementAssetId !== template.corridor.settlementAssetId ||
      corridor.tariff.assetDecimals !==
        template.corridor.tariff.assetDecimals ||
      corridor.tariff.tariffDecimals !== template.corridor.tariff.tariffDecimals
    )
      throw new HostedAccessError(
        422,
        "Use this workspace's configured Tempo testnet asset and precision.",
      );
    return compiled;
  }
  async saveScenario(token: string | undefined, input: unknown) {
    await this.access.identity(token, "control_owned");
    return this.access.saveScenario(token, this.validateScenario(input));
  }
  async quote(
    token: string | undefined,
    ref: { scenarioId: string; scenarioDigest: string },
  ) {
    const compiled = await this.access.scenario(token, ref.scenarioId);
    if (compiled.digest !== ref.scenarioDigest)
      throw new HostedAccessError(
        409,
        "This scenario changed. Save and review it again.",
      );
    const validated = this.validateScenario(compiled.definition);
    const quote = quoteHostedRun(validated.definition, readHostedLimits());
    const session = await this.access.session(token);
    return {
      funding: quote.funding,
      fees: quote.fees,
      assetDecimals: validated.definition.corridor.tariff.assetDecimals,
      asset: validated.definition.corridor.settlementAssetId,
      remainingRuns: session.remainingRuns,
      maxTransactions: quote.maxTransactions,
    };
  }
  async start(
    token: string | undefined,
    runId: string,
    ref?: { scenarioId: string; scenarioDigest: string },
  ) {
    try {
      const existing = await this.access.ownsRun(token, runId);
      if (
        ref &&
        ((existing.compiled as CompiledLabScenario).digest !==
          ref.scenarioDigest ||
          (existing.compiled as CompiledLabScenario).definition.id !==
            ref.scenarioId)
      )
        throw new HostedAccessError(
          409,
          "This run already has a different scenario.",
        );
      return this.view(token, runId);
    } catch (error) {
      if (!(error instanceof HostedAccessError) || error.status !== 404)
        throw error;
    }
    const owned = ref
      ? await this.access.scenario(token, ref.scenarioId)
      : undefined;
    if (ref && owned!.digest !== ref.scenarioDigest)
      throw new HostedAccessError(
        409,
        "This scenario changed. Save and review it again.",
      );
    let scenario: LabScenario;
    let limits: ReturnType<typeof readHostedLimits>;
    try {
      limits = readHostedLimits();
      const payment = readPaymentConfig();
      const accounting = readAccountingConfig();
      if (payment.TEMPO_CHAIN_ID !== 42431) throw new Error("TESTNET_REQUIRED");
      if (
        accounting.CDR_SETTLEMENT_ASSET_ID.toLowerCase() !==
        payment.TEMPO_ASSET_ADDRESS.toLowerCase()
      )
        throw new Error("ASSET_MISMATCH");
      const readiness = await probePaymentEnvironment({
        rpcUrl: payment.TEMPO_RPC_URL,
        chainId: payment.TEMPO_CHAIN_ID,
        assetAddress: payment.TEMPO_ASSET_ADDRESS,
        assetDecimals: payment.TEMPO_ASSET_DECIMALS,
      });
      if (readiness.state !== "ready") throw new Error("PAYMENT_UNAVAILABLE");
      if (ref) {
        scenario = this.validateScenario(owned!.definition).definition;
      } else scenario = { ...createLiveLabScenario(), id: `hosted-${runId}` };
    } catch (error) {
      if (error instanceof HostedAccessError) throw error;
      throw new HostedAccessError(
        503,
        "Live execution is unavailable right now. You can still explore published runs.",
      );
    }
    const compiled = compileLabScenario(scenario, controlledMeterProfiles);
    await this.access.admit(token, runId, {
      compiled,
      ...quoteHostedRun(scenario, limits),
    });
    return this.view(token, runId);
  }
  async view(token: string | undefined, runId: string) {
    const admission = await this.access.ownsRun(token, runId);
    try {
      return await this.lab.view(runId);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "NOT_FOUND")
        throw error;
      const compiled = admission.compiled as CompiledLabScenario;
      return labRunViewSchema.parse({
        run: {
          id: runId,
          scenarioId: compiled.definition.id,
          scenarioDigest: compiled.digest,
          status: "initializing",
          version: 0,
          cursor: 0,
          traceOffsetMs: 0,
          speed: 1,
          laneBindings: {},
          replayOfRunId: null,
          awaiting: null,
          failureCode: null,
          startedAt: new Date(admission.created_at).toISOString(),
          updatedAt: new Date(admission.created_at).toISOString(),
        },
        scenario: compiled.definition,
        environment: {
          physicalSource: "Digital twin",
          evidence: "Controlled signed meter readings",
          payment: "Tempo testnet",
          settlement: "Cumulative settlement and channel completion",
        },
        lanes: compiled.definition.lanes.map((definition) => ({
          definition,
          projection: null,
        })),
        events: [],
      });
    }
  }
  async maintain() {
    for (const admission of await this.access.active()) {
      const view = await this.lab.view(admission.run_id);
      if (
        ["ready", "paused"].includes(view.run.status) &&
        Date.now() - new Date(admission.last_activity_at).getTime() >
          15 * 60_000
      ) {
        await this.lab.transport(view.run.id, "play", view.run.version);
      }
      if (view.run.status !== "completed") continue;
      const adapter = createChargingEffectAdapter(this.charging, this.access);
      for (const laneId of Object.values(view.run.laneBindings)) {
        const summary = await this.charging.getCompletion(laneId);
        if (!summary.completion) {
          await this.lab.finishLane({
            laneId,
            expectedVersion: summary.version,
            commandId: `hosted-finish:${laneId}`,
            correlationId: view.run.id,
          });
        } else if (
          summary.completion.status === "reconciled" &&
          summary.canClose
        ) {
          const observation = await adapter.observe(laneId);
          await this.charging.advanceLane(
            {
              commandId: randomUUID(),
              correlationId: view.run.id,
              laneId,
              expectedVersion: summary.version,
              now: observation.observedAt,
              payload: { type: "CloseChannel" },
            },
            "hosted-completion",
            observation,
          );
        }
      }
    }
    await this.access.releaseClosed();
  }
  async prepareQueued() {
    for (const admission of await this.access.queued()) {
      const compiled = admission.compiled as CompiledLabScenario;
      await this.lab.startAdmitted(compiled, admission.run_id);
      await this.lab.initialize(admission.run_id);
      const view = await this.lab.view(admission.run_id);
      if (view.run.status === "ready")
        await this.lab.transport(view.run.id, "play", view.run.version);
      await this.access.markStarted(admission.run_id);
    }
    await this.access.releaseClosed();
  }
}
