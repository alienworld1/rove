import assert from "node:assert/strict";
import { test } from "node:test";
import { CorridorApiError, readInspector } from "./api.ts";

const trace = {
  corridorId: "corridor",
  laneId: "lane-c",
  eventId: "rejected",
  eventType: "meter.evidence_rejected",
  occurredAt: "2026-01-01T00:00:00.000Z",
  traceTime: null,
  reasonCode: "EVIDENCE_SIGNATURE_INVALID",
  reasonText: "Meter signature rejected.",
  evidence: null,
  calculation: null,
  voucher: null,
  payment: null,
  result: {
    laneVersion: 1,
    state: "AT_RISK",
    reasonCodes: ["EVIDENCE_SIGNATURE_INVALID"],
    before: null,
    after: { trusted: "324", protected: "324", exposure: "350" },
  },
  causalSteps: [
    {
      type: "verification",
      label: "Verification",
      status: "rejected",
      reference: null,
    },
  ],
};

test("a valid Inspector response must match the selected Lane and event", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json(trace));
  assert.equal((await readInspector("lane-c", "rejected")).eventId, "rejected");
  await assert.rejects(
    readInspector("lane-b", "rejected"),
    (error) => error instanceof CorridorApiError && error.status === 502,
  );
  await assert.rejects(
    readInspector("lane-c", "other"),
    (error) => error instanceof CorridorApiError && error.status === 502,
  );
});

test("a malformed Inspector never exposes validation internals as operator copy", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ privilegedField: "untrusted-response" }),
  );
  await assert.rejects(
    readInspector("lane-c", "rejected"),
    (error) =>
      error instanceof CorridorApiError &&
      error.status === 502 &&
      !error.message.includes("privilegedField"),
  );
});
