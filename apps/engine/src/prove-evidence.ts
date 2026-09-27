import { readFileSync } from "node:fs";
import { readEvidenceConfig } from "@rove/config";
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
const settings = readEvidenceConfig({
  ...process.env,
  EVIDENCE_PROFILE_ID:
    process.env.EVIDENCE_PROFILE_ID || "ocmf-secp256r1-sha256",
  EVIDENCE_METER_ID: process.env.EVIDENCE_METER_ID || "17619300",
  EVIDENCE_SESSION_ID:
    process.env.EVIDENCE_SESSION_ID || fixture.transportSessionId,
  EVIDENCE_PUBLIC_KEY_HEX:
    process.env.EVIDENCE_PUBLIC_KEY_HEX || fixture.publicKeyHex,
  EVIDENCE_MAX_AGE_MS: process.env.EVIDENCE_MAX_AGE_MS || "60000",
});
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
  publicKeyHex: settings.EVIDENCE_PUBLIC_KEY_HEX,
  raw:
    variant === "tampered"
      ? fixture.raw.replace("0.2597", "0.2598")
      : fixture.raw,
  expectedMeterId:
    variant === "wrong-meter" ? "different" : settings.EVIDENCE_METER_ID,
  expectedSessionId:
    variant === "wrong-session" ? "different" : settings.EVIDENCE_SESSION_ID,
  maxAgeMs: settings.EVIDENCE_MAX_AGE_MS,
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
