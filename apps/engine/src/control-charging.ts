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
  const now =
    action === "tick" ? instantSchema.parse(detail) : new Date().toISOString();
  const raw = action === "evidence" ? await readFile(detail, "utf8") : null;
  const commandId = randomUUID();
  const correlationId = randomUUID();
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    const lane = await store.getLane(laneId);
    try {
      result = await store.advanceLane(
        {
          commandId,
          correlationId,
          laneId,
          expectedVersion: lane.version,
          now,
          payload:
            raw === null
              ? { type: "TickProtectionClock" }
              : {
                  type: "ObserveEvidence",
                  raw,
                  transportSessionId: lane.externalSessionId,
                },
        },
        "controlled-session",
      );
      break;
    } catch (error) {
      if (
        !(error instanceof Error && error.message === "VERSION_CONFLICT") ||
        attempt === 2
      )
        throw error;
    }
  }
  if (!result) throw new Error("VERSION_CONFLICT");
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
