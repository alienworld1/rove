import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  readBaseConfig,
  readEvidenceConfig,
  readPaymentConfig,
} from "@rove/config";
import { createCorridorSchema, startLaneSchema } from "@rove/contracts";
import { ChargingStore } from "@rove/persistence";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Provide the controlled session JSON path");
const base = readBaseConfig();
if (base.NODE_ENV !== "development" || !base.DATABASE_URL)
  throw new Error("A local development database is required");
const payment = readPaymentConfig();
const evidence = readEvidenceConfig();
const input = JSON.parse(await readFile(inputPath, "utf8")) as {
  corridor: Record<string, unknown>;
  lane: Record<string, unknown>;
};
const externalSessionId = String(input.lane?.externalSessionId ?? "");
const stableId = (kind: string) =>
  createHash("sha256").update(`${kind}:${externalSessionId}`).digest("hex");
const corridorInput = createCorridorSchema.parse({
  ...input.corridor,
  commandId: stableId("corridor"),
  correlationId: stableId("session"),
  settlementAssetId: payment.TEMPO_ASSET_ADDRESS.toLowerCase(),
  tempoNetwork: `eip155:${payment.TEMPO_CHAIN_ID}`,
  meters: [
    {
      meterId: evidence.EVIDENCE_METER_ID,
      publicKeyHex: evidence.EVIDENCE_PUBLIC_KEY_HEX,
      fingerprint: createHash("sha256")
        .update(evidence.EVIDENCE_PUBLIC_KEY_HEX)
        .digest("hex"),
    },
  ],
});
if (corridorInput.tariff.assetDecimals !== payment.TEMPO_ASSET_DECIMALS)
  throw new Error(
    "The tariff asset precision does not match the configured payment asset",
  );
const store = new ChargingStore(base.DATABASE_URL);
try {
  const corridor = await store.createCorridor(
    corridorInput,
    "controlled-session",
  );
  const laneInput = startLaneSchema.parse({
    ...input.lane,
    commandId: stableId("lane"),
    correlationId: stableId("session"),
    corridorId: corridor.id,
    meterId: evidence.EVIDENCE_METER_ID,
  });
  const lane = await store.startLane(laneInput, "controlled-session");
  process.stdout.write(
    `${JSON.stringify({ corridorId: corridor.id, laneId: lane.id, state: lane.state })}\n`,
  );
} finally {
  await store.close();
}
