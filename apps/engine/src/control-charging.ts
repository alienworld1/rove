import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readBaseConfig } from "@rove/config";
import { idSchema, instantSchema } from "@rove/contracts";
import { ChargingStore } from "@rove/persistence";

const [laneArg, action, detail] = process.argv.slice(2);
const laneId = idSchema.parse(laneArg);
if (!(["tick", "evidence"] as string[]).includes(action))
  throw new Error("Use tick or evidence");
const config = readBaseConfig();
if (config.NODE_ENV !== "development" || !config.DATABASE_URL)
  throw new Error("A local development database is required");
const store = new ChargingStore(config.DATABASE_URL);
try {
  const lane = await store.getLane(laneId);
  const now =
    action === "tick" ? instantSchema.parse(detail) : new Date().toISOString();
  const payload =
    action === "tick"
      ? { type: "TickProtectionClock" as const }
      : {
          type: "ObserveEvidence" as const,
          raw: await readFile(detail, "utf8"),
          transportSessionId: lane.externalSessionId,
        };
  const result = await store.advanceLane(
    {
      commandId: randomUUID(),
      correlationId: randomUUID(),
      laneId,
      expectedVersion: lane.version,
      now,
      payload,
    },
    "controlled-session",
  );
  process.stdout.write(
    `${JSON.stringify({
      laneId,
      version: result.version,
      state: result.state,
      projection: await store.getLane(laneId),
    })}\n`,
  );
} finally {
  await store.close();
}
