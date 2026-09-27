import { readFileSync } from "node:fs";
import { verifyOcmf } from "@rove/evidence";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/evidence/fixtures/safe-ocmf-example.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  raw: string;
  publicKeyHex: string;
  transportSessionId: string;
};
const variant = process.argv[2] ?? "accepted";
const known = [
  "accepted",
  "tampered",
  "wrong-meter",
  "wrong-session",
  "replay",
  "stale",
  "continuity",
  "energy-regression",
];
if (!known.includes(variant))
  throw new Error(`Choose one of: ${known.join(", ")}`);

const input = {
  ...fixture,
  raw:
    variant === "tampered"
      ? fixture.raw.replace("0.2597", "0.2598")
      : fixture.raw,
  expectedMeterId: variant === "wrong-meter" ? "different" : "17619300",
  expectedSessionId: variant === "wrong-session" ? "different" : "29",
  maxAgeMs: 60_000,
  now: new Date(
    variant === "stale" ? "2019-08-13T10:05:00Z" : "2019-08-13T10:03:37Z",
  ),
};
const first = verifyOcmf(input);
const previous =
  variant === "replay"
    ? {
        rawPayloadHash: first.rawPayloadHash,
        observedAt: first.observedAt!,
        cumulativeMilliWh: 259700n,
        sequence: 32,
      }
    : variant === "continuity"
      ? {
          rawPayloadHash: "different",
          observedAt: "2019-08-13T10:03:00.000Z",
          cumulativeMilliWh: 259600n,
          sequence: 30,
        }
      : variant === "energy-regression"
        ? {
            rawPayloadHash: "different",
            observedAt: "2019-08-13T10:03:00.000Z",
            cumulativeMilliWh: 300000n,
            sequence: 31,
          }
        : undefined;
const result = previous ? verifyOcmf({ ...input, previous }) : first;
process.stdout.write(
  `${JSON.stringify({ operation: "verify_meter_record", state: result.accepted ? "confirmed" : "failed", ...result })}\n`,
);
if (!result.accepted) process.exitCode = 1;
