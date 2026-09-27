import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readBaseConfig } from "@rove/config";
import type { LaneCommandInput } from "@rove/contracts";
import { ChargingStore } from "@rove/persistence";

const config = readBaseConfig();
if (config.NODE_ENV !== "development" || !config.DATABASE_URL)
  throw new Error("Local development and DATABASE_URL are required");

function signedReading(meterId: string, now: Date) {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const timestamp = now.toISOString().replace(/\.([0-9]{3})Z$/, ",$1+0000 R");
  const payload = JSON.stringify({
    GS: meterId,
    PG: "T1",
    RD: [{ TM: timestamp, RU: "kWh", RV: 0.5 }],
  });
  const signature = sign(
    "sha256",
    Buffer.from(payload),
    keys.privateKey,
  ).toString("hex");
  return {
    raw: `OCMF|${payload}|${JSON.stringify({ SD: signature })}`,
    publicKeyHex: keys.publicKey
      .export({ type: "spki", format: "der" })
      .toString("hex"),
  };
}

async function main() {
  const store = new ChargingStore(config.DATABASE_URL!);
  try {
    const startedAt = new Date();
    const meterId = `meter-${randomUUID()}`;
    const externalSessionId = `session-${randomUUID()}`;
    const reading = signedReading(meterId, startedAt);
    const corridor = await store.createCorridor(
      {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        name: "Local charging example",
        payerEmsp: "local-emsp",
        payeeCpo: "local-cpo",
        settlementAssetId: "TEST_ASSET",
        tempoNetwork: "local-simulation",
        tariff: { perKwh: "1000", tariffDecimals: 0, assetDecimals: 0 },
        protectionPolicy: {
          warningThreshold: "20",
          riskThreshold: "50",
          maxUnprotectedExposure: "100",
          evidenceMaxAgeMs: 1000,
          chainMaxAgeMs: 120_000,
          zeroGrace: false,
          lowHeadroomThreshold: "1",
        },
        reservePolicy: { initialDeposit: "1000", topUpIncrement: "500" },
        settlementPolicy: { minimumIntervalMs: 1000 },
        meters: [
          {
            meterId,
            publicKeyHex: reading.publicKeyHex,
            fingerprint: createHash("sha256")
              .update(reading.publicKeyHex)
              .digest("hex"),
          },
        ],
      },
      "local-simulation",
    );
    const started = await store.startLane(
      {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        corridorId: corridor.id,
        externalSessionId,
        chargerId: "local-charger",
        meterId,
        maxPowerWatts: "3600",
        expectedProofIntervalMs: 1000,
      },
      "local-simulation",
    );
    if (process.argv[2] === "seed") {
      process.stdout.write(
        `${JSON.stringify({
          simulation: "local only",
          corridorId: corridor.id,
          laneId: started.id,
          projection: await store.getLane(started.id),
        })}\n`,
      );
      return;
    }
    const evidence: LaneCommandInput = {
      commandId: randomUUID(),
      correlationId: randomUUID(),
      laneId: started.id,
      expectedVersion: 0,
      now: startedAt.toISOString(),
      payload: {
        type: "ObserveEvidence",
        raw: reading.raw,
        transportSessionId: externalSessionId,
      },
    };
    await store.advanceLane(evidence, "local-simulation");
    const payment: LaneCommandInput = {
      commandId: randomUUID(),
      correlationId: randomUUID(),
      laneId: started.id,
      expectedVersion: 1,
      now: startedAt.toISOString(),
      payload: {
        type: "ObservePayment",
        channelId: `channel-${randomUUID()}`,
        network: "local-simulation",
        assetId: "TEST_ASSET",
        observedAt: startedAt.toISOString(),
        confirmedDeposit: "1000",
        authorizedValue: "500",
        settledValue: "0",
        chainHeight: "1",
      },
    };
    if (payment.payload.type !== "ObservePayment")
      throw new Error("Simulation input invalid");
    await store.advanceLane(payment, "local-simulation", {
      ...payment.payload,
      type: "PaymentObserved",
      source: "local-simulation",
    });
    const pauseAt = new Date(startedAt.getTime() + 100_000).toISOString();
    const paused = await store.advanceLane(
      {
        commandId: randomUUID(),
        correlationId: randomUUID(),
        laneId: started.id,
        expectedVersion: 2,
        now: pauseAt,
        payload: { type: "TickProtectionClock" },
      },
      "local-simulation",
    );
    process.stdout.write(
      `${JSON.stringify({
        simulation: "local only",
        corridorId: corridor.id,
        laneId: started.id,
        state: paused.state,
        projection: await store.getLane(started.id),
      })}\n`,
    );
  } finally {
    await store.close();
  }
}

void main();
