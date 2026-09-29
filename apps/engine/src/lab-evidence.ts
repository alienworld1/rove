import {
  createECDH,
  createHash,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import { p256 } from "@noble/curves/nist";
import type { LabLaneDefinition } from "@rove/contracts";

function controlledKey(profileId: string) {
  const seed = controlledSeed(profileId);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(seed);
  const publicBytes = ecdh.getPublicKey(undefined, "uncompressed");
  const privateKey = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: seed.toString("base64url"),
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });
  return privateKey;
}

function controlledSeed(profileId: string) {
  return createHash("sha256")
    .update(`rove-controlled-meter:${profileId}`)
    .digest();
}

export function controlledMeterIdentity(lane: LabLaneDefinition) {
  const publicKeyHex = createPublicKey(controlledKey(lane.meterProfileId))
    .export({ type: "spki", format: "der" })
    .toString("hex");
  return {
    meterId: lane.meterId,
    publicKeyHex,
    fingerprint: createHash("sha256").update(publicKeyHex).digest("hex"),
    source: "controlled-fixture" as const,
  };
}

export function controlledReading(input: {
  lane: LabLaneDefinition;
  sessionId: string;
  instant: string;
  sequence: number;
  cumulativeMilliWh: string;
  wrongMeter?: boolean;
  corruptSignature?: boolean;
}) {
  const timestamp = input.instant.replace(/\.([0-9]{3})Z$/, ",$1+0000 R");
  const whole = BigInt(input.cumulativeMilliWh) / 1_000_000n;
  const fraction = (BigInt(input.cumulativeMilliWh) % 1_000_000n)
    .toString()
    .padStart(6, "0");
  const payload = `{"GS":${JSON.stringify(input.wrongMeter ? `${input.lane.meterId}-other` : input.lane.meterId)},"PG":"T${input.sequence}","RD":[{"TM":${JSON.stringify(timestamp)},"RU":"kWh","RV":${whole}.${fraction}}]}`;
  const signature = Buffer.from(
    p256
      .sign(
        createHash("sha256").update(payload).digest(),
        controlledSeed(input.lane.meterProfileId),
      )
      .toDERRawBytes(),
  ).toString("hex");
  const result = input.corruptSignature
    ? `${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}`
    : signature;
  return `OCMF|${payload}|${JSON.stringify({ SD: result })}`;
}
