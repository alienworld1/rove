import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChargingStore } from "@rove/persistence";
import { processNextEffect, type EffectAdapter } from "./outbox-worker.js";

const now = "2026-01-01T00:00:00.000Z";

test("uncertain external outcome is reconciled without another submission", async () => {
  let submitted = 0;
  let finalStatus = "";
  const store = {
    claimOutbox: async () => ({
      id: "job",
      effectType: "payment.topup",
      idempotencyKey: "key",
      externalReference: null,
      attemptCount: 2,
      leaseToken: "lease-1",
      payload: {},
    }),
    finishOutbox: async (_id: string, _lease: string, status: string) => {
      finalStatus = status;
    },
  } as unknown as ChargingStore;
  const adapter: EffectAdapter = {
    reconcile: async () => ({ status: "unknown" }),
    submit: async () => {
      submitted++;
      return { status: "submitted" };
    },
  };
  assert.equal(await processNextEffect(store, adapter, now), true);
  assert.equal(submitted, 0);
  assert.equal(finalStatus, "pending");
});

test("definitive absence permits the first stable-key submission", async () => {
  const keys: string[] = [];
  let finalStatus = "";
  const store = {
    claimOutbox: async () => ({
      id: "job",
      effectType: "pause.requested",
      idempotencyKey: "stable-key",
      externalReference: null,
      attemptCount: 1,
      leaseToken: "lease-2",
      payload: {},
    }),
    finishOutbox: async (_id: string, _lease: string, status: string) => {
      finalStatus = status;
    },
  } as unknown as ChargingStore;
  const adapter: EffectAdapter = {
    reconcile: async () => ({ status: "not_found" }),
    submit: async (_type, key) => {
      keys.push(key);
      return { status: "submitted", externalReference: "ref" };
    },
  };
  await processNextEffect(store, adapter, now);
  assert.deepEqual(keys, ["stable-key"]);
  assert.equal(finalStatus, "submitted");
});

test("uncertainty after an interrupted submission does not repeat a financial effect", async () => {
  let submitted = 0;
  let finalStatus = "";
  const store = {
    claimOutbox: async () => ({
      id: "job",
      effectType: "payment.open_requested",
      idempotencyKey: "stable-key",
      externalReference: null,
      attemptCount: 2,
      leaseToken: "lease-4",
      payload: {},
    }),
    finishOutbox: async (_id: string, _lease: string, status: string) => {
      finalStatus = status;
    },
  } as unknown as ChargingStore;
  const adapter: EffectAdapter = {
    reconcile: async () => ({ status: "unknown" }),
    submit: async () => {
      submitted++;
      return { status: "submitted" };
    },
  };
  await processNextEffect(store, adapter, now);
  assert.equal(submitted, 0);
  assert.equal(finalStatus, "pending");
});

test("a missing channel with no pending payer transaction can reuse its stable open key", async () => {
  let submitted = 0;
  const store = {
    claimOutbox: async () => ({
      id: "job",
      effectType: "payment.open_requested",
      idempotencyKey: "stable-key",
      externalReference: null,
      attemptCount: 8,
      leaseToken: "lease-5",
      payload: {},
    }),
    finishOutbox: async () => undefined,
  } as unknown as ChargingStore;
  const adapter: EffectAdapter = {
    reconcile: async () => ({ status: "not_found" }),
    submit: async () => {
      submitted++;
      return { status: "submitted", externalReference: "reference" };
    },
  };
  await processNextEffect(store, adapter, now);
  assert.equal(submitted, 1);
});

test("an uncertain submitted effect remains submitted for reconciliation", async () => {
  let finalStatus = "";
  const store = {
    claimOutbox: async () => ({
      id: "job",
      effectType: "payment.topup",
      idempotencyKey: "key",
      externalReference: "ref",
      previousStatus: "submitted",
      attemptCount: 3,
      leaseToken: "lease-3",
      payload: {},
    }),
    finishOutbox: async (_id: string, _lease: string, status: string) => {
      finalStatus = status;
    },
  } as unknown as ChargingStore;
  const adapter: EffectAdapter = {
    reconcile: async () => ({ status: "unknown" }),
    submit: async () => {
      throw new Error("unexpected submission");
    },
  };
  await processNextEffect(store, adapter, now);
  assert.equal(finalStatus, "submitted");
});

test("startup discovery cannot submit financial work and preserves unknown outcomes", async () => {
  let submissions = 0;
  let status = "";
  const store = {
    claimOutbox: async () => ({
      id: "job",
      laneId: "lane",
      effectType: "payment.close_requested",
      idempotencyKey: "close-key",
      externalReference: null,
      attemptCount: 1,
      leaseToken: "lease",
      payload: {},
      previousStatus: "pending",
    }),
    finishOutbox: async (_id: string, _lease: string, next: string) => {
      status = next;
    },
  } as unknown as ChargingStore;
  const adapter: EffectAdapter = {
    reconcile: async () => ({ status: "not_found" }),
    submit: async () => {
      submissions++;
      return { status: "submitted" };
    },
  };
  await processNextEffect(store, adapter, now, "lane", false, true);
  assert.equal(submissions, 0);
  assert.equal(status, "pending");
});

test("RPC timeouts keep submitted financial work unresolved rather than reverted", async () => {
  let status = "";
  let failures = 0;
  const store = {
    claimOutbox: async () => ({
      id: "job",
      laneId: "lane",
      effectType: "payment.close_requested",
      idempotencyKey: "close-key",
      externalReference: "hash",
      attemptCount: 2,
      leaseToken: "lease",
      payload: {},
      previousStatus: "submitted",
    }),
    finishOutbox: async (_id: string, _lease: string, next: string) => {
      status = next;
    },
  } as unknown as ChargingStore;
  const adapter: EffectAdapter = {
    reconcile: async () => {
      throw new Error("RPC_TIMEOUT");
    },
    submit: async () => {
      throw new Error("Unexpected submission");
    },
    fail: async () => {
      failures++;
    },
  };
  await processNextEffect(store, adapter, now);
  assert.equal(status, "submitted");
  assert.equal(failures, 0);
});
