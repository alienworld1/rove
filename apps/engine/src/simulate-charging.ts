import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readBaseConfig } from "@rove/config";
import type { LaneCommandInput } from "@rove/contracts";
import { ChargingStore } from "@rove/persistence";

const config = readBaseConfig();
if (config.NODE_ENV !== "development" || !config.DATABASE_URL)
  throw new Error("Local development and DATABASE_URL are required");

const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKeyHex = keys.publicKey
  .export({ type: "spki", format: "der" })
  .toString("hex");

function signedReading(
  meterId: string,
  now: Date,
  sequence: number,
  kwh: number,
) {
  const timestamp = now.toISOString().replace(/\.([0-9]{3})Z$/, ",$1+0000 R");
  const payload = JSON.stringify({
    GS: meterId,
    PG: `T${sequence}`,
    RD: [{ TM: timestamp, RU: "kWh", RV: kwh }],
  });
  const signature = sign(
    "sha256",
    Buffer.from(payload),
    keys.privateKey,
  ).toString("hex");
  return `OCMF|${payload}|${JSON.stringify({ SD: signature })}`;
}

async function main() {
  const store = new ChargingStore(config.DATABASE_URL!);
  try {
    const startedAt = new Date();
    const meterId = `meter-${randomUUID()}`;
    const externalSessionId = `session-${randomUUID()}`;
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
          lowHeadroomThreshold: "450",
        },
        reservePolicy: { initialDeposit: "1000", topUpIncrement: "500" },
        settlementPolicy: {
          minimumIntervalMs: 1000,
          minimumUnsettledProtectedValue: "100",
        },
        meters: [
          {
            meterId,
            publicKeyHex,
            fingerprint: createHash("sha256")
              .update(publicKeyHex)
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
        `${JSON.stringify({ simulation: "local only", corridorId: corridor.id, laneId: started.id, projection: await store.getLane(started.id) })}\n`,
      );
      return;
    }
    async function advance(
      now: Date,
      payload: LaneCommandInput["payload"],
      override?: Parameters<ChargingStore["advanceLane"]>[2],
      voucher?: Parameters<ChargingStore["advanceLane"]>[5],
    ) {
      const lane = await store.getLane(started.id);
      return store.advanceLane(
        {
          commandId: randomUUID(),
          correlationId: randomUUID(),
          laneId: started.id,
          expectedVersion: lane.version,
          now: now.toISOString(),
          payload,
        },
        "local-simulation",
        override,
        undefined,
        undefined,
        voucher,
      );
    }
    function voucher(amount: string, channelId: string) {
      const digest = `0x${createHash("sha256").update(`${channelId}:${amount}`).digest("hex")}`;
      return {
        channelId,
        cumulativeAmount: amount,
        digest,
        signature: `0x${"11".repeat(65)}`,
        signerRef: "local-simulation",
        domainRef: "local-simulation",
      };
    }
    const channelId = `channel-${randomUUID()}`;
    await advance(startedAt, {
      type: "ObserveEvidence",
      raw: signedReading(meterId, startedAt, 1, 0.5),
      transportSessionId: externalSessionId,
    });
    await advance(
      startedAt,
      { type: "TickProtectionClock" },
      {
        type: "PaymentObserved",
        source: "local-simulation",
        channelId,
        network: "local-simulation",
        assetId: "TEST_ASSET",
        observedAt: startedAt.toISOString(),
        confirmedDeposit: "1000",
        settledValue: "0",
        chainHeight: "1",
      },
    );
    const first = voucher("500", channelId);
    await advance(
      startedAt,
      { type: "TickProtectionClock" },
      {
        type: "VoucherVerified",
        cumulativeAmount: first.cumulativeAmount,
        digest: first.digest,
      },
      first,
    );
    const secondAt = new Date(startedAt.getTime() + 1000);
    await advance(secondAt, {
      type: "ObserveEvidence",
      raw: signedReading(meterId, secondAt, 2, 0.55),
      transportSessionId: externalSessionId,
    });
    const second = voucher("550", channelId);
    await advance(
      secondAt,
      { type: "TickProtectionClock" },
      {
        type: "VoucherVerified",
        cumulativeAmount: second.cumulativeAmount,
        digest: second.digest,
      },
      second,
    );
    const rejectedAt = new Date(secondAt.getTime() + 1000);
    const corrupt = signedReading(meterId, rejectedAt, 3, 0.56).replace(
      /"SD":"[0-9a-f]+"/,
      `"SD":"${"00".repeat(70)}"`,
    );
    await advance(rejectedAt, {
      type: "ObserveEvidence",
      raw: corrupt,
      transportSessionId: externalSessionId,
    });
    const oneBefore = new Date(secondAt.getTime() + 99_000);
    const beforePause = await advance(oneBefore, {
      type: "TickProtectionClock",
    });
    const pauseAt = new Date(secondAt.getTime() + 100_000);
    const paused = await advance(pauseAt, { type: "TickProtectionClock" });
    const pausedProjection = await store.getLane(started.id);
    const recovering = await advance(pauseAt, {
      type: "ObserveEvidence",
      raw: signedReading(meterId, pauseAt, 3, 0.56),
      transportSessionId: externalSessionId,
    });
    await advance(
      pauseAt,
      { type: "TickProtectionClock" },
      {
        type: "PaymentObserved",
        source: "local-simulation",
        channelId,
        network: "local-simulation",
        assetId: "TEST_ASSET",
        observedAt: pauseAt.toISOString(),
        confirmedDeposit: "1500",
        settledValue: "0",
        chainHeight: "2",
      },
    );
    const recoveryVoucher = voucher("560", channelId);
    const recovered = await advance(
      pauseAt,
      { type: "TickProtectionClock" },
      {
        type: "VoucherVerified",
        cumulativeAmount: recoveryVoucher.cumulativeAmount,
        digest: recoveryVoucher.digest,
      },
      recoveryVoucher,
    );
    process.stdout.write(
      `${JSON.stringify({
        simulation: "local only",
        corridorId: corridor.id,
        laneId: started.id,
        beforePause: beforePause.state,
        atBoundary: paused.state,
        exposureAtBoundary: pausedProjection.unprotectedExposureBound,
        recovering: recovering.state,
        recovered: recovered.state,
        projection: await store.getLane(started.id),
      })}\n`,
    );
  } finally {
    await store.close();
  }
}

void main();
