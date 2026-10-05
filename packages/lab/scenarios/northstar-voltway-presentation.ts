import {
  parseLabDecimal,
  resequenceLabEvents,
  type LabScenario,
  type LabScenarioEvent,
} from "@rove/contracts";
import { northstarVoltwayScenario } from "./northstar-voltway.js";

/** A two-minute charging excerpt, independent of the boundary regression fixture. */
export function createPresentationScenario(assetDecimals = 6): LabScenario {
  const amount = (value: string) => parseLabDecimal(value, assetDecimals);
  const events: LabScenarioEvent[] = northstarVoltwayScenario.events
    .filter((event) => event.type === "session_start")
    .map((event) => ({ ...event }));
  for (let interval = 1; interval <= 12; interval++) {
    for (const [index, lane] of northstarVoltwayScenario.lanes.entries()) {
      const fault = index === 2 && interval === 5;
      const recovery = index === 2 && interval === 6;
      const readingInterval =
        index === 2 && interval >= 6 ? interval - 2 : interval;
      const energyWh = [50, 350, 900][index] * readingInterval;
      events.push({
        id: fault
          ? "reading-c-corrupt"
          : recovery
            ? "reading-c-recovery"
            : `reading-${lane.key}-${interval}`,
        laneKey: lane.key,
        traceOffsetMs: interval * 10_000,
        sequence: events.length,
        type: fault
          ? "corrupt_signature"
          : recovery
            ? "recovery_reading"
            : "valid_reading",
        parameters: {
          cumulativeMilliWh: (BigInt(energyWh) * 1000n).toString(),
        },
        durationMs: null,
      });
    }
  }
  // 350 kW × 0.42/kWh consumes the 0.75 limit after 18.368 s.
  for (const [id, traceOffsetMs] of [
    ["risk-c-before", 58_367],
    ["risk-c-boundary", 58_368],
    ["risk-c-restored", 60_001],
  ] as const)
    events.push({
      id,
      laneKey: "lane-c",
      traceOffsetMs,
      sequence: events.length,
      type: "protection_tick",
      parameters: {},
      durationMs: null,
    });
  return {
    ...northstarVoltwayScenario,
    schemaVersion: 2,
    id: "northstar-voltway-presentation",
    name: "Northstar Mobility ↔ Voltway · Rolling protection",
    description:
      "A two-minute charging excerpt shows rolling funding, rejected evidence, a protection pause, recovery, and settlement.",
    corridor: {
      ...northstarVoltwayScenario.corridor,
      tariff: {
        perKwh: amount("0.42"),
        tariffDecimals: assetDecimals,
        assetDecimals,
      },
      protectionPolicy: {
        warningThreshold: amount("0.25"),
        riskThreshold: amount("0.5"),
        maxUnprotectedExposure: amount("0.75"),
        evidenceMaxAgeMs: 15_000,
        chainMaxAgeMs: 600_000,
        zeroGrace: false,
        lowHeadroomThreshold: amount("0.75"),
      },
      reservePolicy: {
        initialDeposit: amount("2"),
        topUpIncrement: amount("1.5"),
      },
      settlementPolicy: {
        minimumIntervalMs: 30_000,
        minimumUnsettledProtectedValue: amount("0.75"),
      },
    },
    lanes: northstarVoltwayScenario.lanes.map((lane) => ({
      ...lane,
      expectedProofIntervalMs: 10_000,
    })),
    events: resequenceLabEvents(events),
    terminalCondition: "after_recovery",
  };
}
