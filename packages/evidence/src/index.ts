import { createHash, createPublicKey, verify } from "node:crypto";

export type EvidenceReason =
  | "EVIDENCE_PARSE_ERROR"
  | "EVIDENCE_KEY_UNSUPPORTED"
  | "EVIDENCE_SIGNATURE_INVALID"
  | "EVIDENCE_SOURCE_MISMATCH"
  | "EVIDENCE_SESSION_MISMATCH"
  | "EVIDENCE_REPLAY"
  | "EVIDENCE_SEQUENCE_INVALID"
  | "EVIDENCE_STALE"
  | "EVIDENCE_ENERGY_REGRESSION";

export type EvidenceResult = {
  sourceFormat: "OCMF";
  rawPayloadHash: string;
  accepted: boolean;
  reasonCode?: EvidenceReason;
  meterId?: string;
  sessionId?: string;
  sequence?: number;
  observedAt?: string;
  cumulativeWh?: string;
  cumulativeMilliWh?: string;
  signatureValid: boolean;
  continuityValid: boolean;
  freshnessValid: boolean;
};

export type EvidenceInput = {
  raw: string;
  publicKeyHex: string;
  expectedMeterId: string;
  expectedSessionId: string;
  transportSessionId: string;
  maxAgeMs: number;
  now: Date;
  previous?: {
    rawPayloadHash: string;
    observedAt: string;
    cumulativeMilliWh: bigint;
    sequence: number;
  };
};

function parseOcmfTime(value: string): Date {
  const match =
    /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d),(\d{3})([+-]\d\d)(\d\d) [A-Z]$/.exec(
      value,
    );
  if (!match) throw new Error("EVIDENCE_PARSE_ERROR");
  const date = new Date(`${match[1]}.${match[2]}${match[3]}:${match[4]}`);
  if (Number.isNaN(date.getTime())) throw new Error("EVIDENCE_PARSE_ERROR");
  return date;
}

function milliWhFromKwh(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value))
    throw new Error("EVIDENCE_PARSE_ERROR");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

function reject(
  result: EvidenceResult,
  reasonCode: EvidenceReason,
): EvidenceResult {
  return { ...result, accepted: false, reasonCode };
}

export function verifyOcmf(input: EvidenceInput): EvidenceResult {
  if (Buffer.byteLength(input.raw, "utf8") > 64 * 1024)
    return {
      sourceFormat: "OCMF",
      rawPayloadHash: "",
      accepted: false,
      reasonCode: "EVIDENCE_PARSE_ERROR",
      signatureValid: false,
      continuityValid: false,
      freshnessValid: false,
    };
  const rawPayloadHash = createHash("sha256")
    .update(input.raw, "utf8")
    .digest("hex");
  const result: EvidenceResult = {
    sourceFormat: "OCMF",
    rawPayloadHash,
    accepted: false,
    signatureValid: false,
    continuityValid: false,
    freshnessValid: false,
  };
  const first = input.raw.indexOf("|");
  const second = input.raw.lastIndexOf("|");
  if (!input.raw.startsWith("OCMF|") || first === second)
    return reject(result, "EVIDENCE_PARSE_ERROR");

  try {
    const payloadBytes = Buffer.from(
      input.raw.slice(first + 1, second),
      "utf8",
    );
    const payload = JSON.parse(payloadBytes.toString("utf8")) as Record<
      string,
      unknown
    >;
    const signature = JSON.parse(input.raw.slice(second + 1)) as Record<
      string,
      unknown
    >;
    if (
      typeof payload.GS !== "string" ||
      typeof payload.PG !== "string" ||
      !Array.isArray(payload.RD) ||
      payload.RD.length < 1 ||
      payload.RD.length > 256 ||
      typeof signature.SD !== "string" ||
      !/^[0-9a-fA-F]+$/.test(signature.SD)
    )
      return reject(result, "EVIDENCE_PARSE_ERROR");
    result.meterId = payload.GS;
    result.sessionId = input.transportSessionId;

    let key;
    try {
      key = createPublicKey({
        key: Buffer.from(input.publicKeyHex, "hex"),
        format: "der",
        type: "spki",
      });
      if (
        key.asymmetricKeyType !== "ec" ||
        key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
      )
        return reject(result, "EVIDENCE_KEY_UNSUPPORTED");
    } catch {
      return reject(result, "EVIDENCE_KEY_UNSUPPORTED");
    }
    if (!verify("sha256", payloadBytes, key, Buffer.from(signature.SD, "hex")))
      return reject(result, "EVIDENCE_SIGNATURE_INVALID");
    result.signatureValid = true;
    if (payload.GS !== input.expectedMeterId)
      return reject(result, "EVIDENCE_SOURCE_MISMATCH");
    if (input.transportSessionId !== input.expectedSessionId)
      return reject(result, "EVIDENCE_SESSION_MISMATCH");
    if (input.previous?.rawPayloadHash === rawPayloadHash)
      return reject(result, "EVIDENCE_REPLAY");

    const pagination = /^T([1-9][0-9]*)$/.exec(payload.PG);
    const sequence = pagination ? Number(pagination[1]) : NaN;
    if (!Number.isSafeInteger(sequence))
      return reject(result, "EVIDENCE_PARSE_ERROR");
    result.sequence = sequence;
    if (input.previous && sequence !== input.previous.sequence + 1)
      return reject(result, "EVIDENCE_SEQUENCE_INVALID");

    const readings = payload.RD as Record<string, unknown>[];
    const rawValues = [
      ...payloadBytes
        .toString("utf8")
        .matchAll(/"RV"\s*:\s*((?:0|[1-9]\d*)(?:\.\d+)?)/g),
    ].map((match) => match[1]);
    if (rawValues.length !== readings.length)
      return reject(result, "EVIDENCE_PARSE_ERROR");
    let priorMilliWh = input.previous?.cumulativeMilliWh;
    let priorTime = input.previous
      ? new Date(input.previous.observedAt).getTime()
      : -Infinity;
    for (const [index, reading] of readings.entries()) {
      if (
        typeof reading.TM !== "string" ||
        reading.RU !== "kWh" ||
        typeof reading.RV !== "number"
      )
        return reject(result, "EVIDENCE_PARSE_ERROR");
      const currentTime = parseOcmfTime(reading.TM).getTime();
      if (currentTime <= priorTime)
        return reject(result, "EVIDENCE_SEQUENCE_INVALID");
      const currentMilliWh = milliWhFromKwh(rawValues[index]);
      if (priorMilliWh !== undefined && currentMilliWh < priorMilliWh)
        return reject(result, "EVIDENCE_ENERGY_REGRESSION");
      priorTime = currentTime;
      priorMilliWh = currentMilliWh;
    }
    result.continuityValid = true;
    result.observedAt = new Date(priorTime).toISOString();
    const age = input.now.getTime() - priorTime;
    if (
      !Number.isSafeInteger(input.maxAgeMs) ||
      input.maxAgeMs <= 0 ||
      age < 0 ||
      age > input.maxAgeMs
    )
      return reject(result, "EVIDENCE_STALE");
    result.freshnessValid = true;
    result.cumulativeWh = (priorMilliWh! / 1000n).toString();
    result.cumulativeMilliWh = priorMilliWh!.toString();
    result.accepted = true;
    return result;
  } catch {
    return reject(result, "EVIDENCE_PARSE_ERROR");
  }
}
