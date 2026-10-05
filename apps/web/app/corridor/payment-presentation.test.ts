import {
  paymentOperationStatus,
  paymentOperationUrl,
  orderPaymentOperations,
} from "../payment-operation-presentation.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentAssetLabel, tempoTransactionUrl } from "../payment-asset.ts";
import { newestTempoRecording } from "../published-recording.ts";
import { paymentBalances } from "./payment-balances.ts";
import {
  formatOperationalValue,
  formatOperationalDelta,
} from "./format-operational-value.ts";

test("asset identity and explorer routing are bound to the network", () => {
  const token = "0x20C0000000000000000000000000000000000000";
  assert.equal(paymentAssetLabel("eip155:42431", token), "PathUSD");
  assert.equal(
    paymentAssetLabel("local-simulation", "TEST_ASSET"),
    "Simulation units",
  );
  assert.equal(paymentAssetLabel("eip155:4217", token), `Asset ${token}`);
  const hash = `0x${"ab".repeat(32)}`;
  assert.equal(
    tempoTransactionUrl("eip155:42431", hash),
    `https://explore.testnet.tempo.xyz/tx/${hash}`,
  );
  for (const network of ["local-simulation", "eip155:4217", "unknown"])
    assert.equal(tempoTransactionUrl(network, hash), null);
  for (const invalid of [
    null,
    "voucher-digest",
    "0x123",
    `${hash}?redirect=evil`,
    "https://evil.example",
  ])
    assert.equal(tempoTransactionUrl("eip155:42431", invalid), null);
});

test("amounts sum in one denomination without dropping precision or signed deltas", () => {
  const values = ["252000", "1764000", "3780000"];
  assert.equal(
    formatOperationalValue(
      values
        .reduce((total, value) => total + BigInt(value), BigInt(0))
        .toString(),
      6,
    ),
    "5.796",
  );
  assert.deepEqual(
    values.map((value) => formatOperationalValue(value, 6)),
    ["0.252", "1.764", "3.78"],
  );
  assert.equal(formatOperationalValue("1", 6), "0.000001");
  assert.equal(formatOperationalDelta("-1", 6), "-0.000001");
  assert.equal(
    formatOperationalDelta("100000000000000001", 2),
    "+1000000000000000.01",
  );
  assert.equal(formatOperationalDelta("0", 6), "0");
  assert.equal(formatOperationalValue(null, 6), "Unknown");
});

test("escrow and headroom differ and confirmed closure releases both", () => {
  const lane = {
    state: "PROTECTED" as const,
    confirmedDeposit: "5000000",
    settledValue: "3000000",
    fundedHeadroom: "1220000",
  };
  assert.deepEqual(paymentBalances(lane), {
    escrow: "2000000",
    headroom: "1220000",
  });
  assert.deepEqual(paymentBalances({ ...lane, state: "CLOSED" }), {
    escrow: "0",
    headroom: "0",
  });
  assert.deepEqual(
    paymentBalances({ ...lane, confirmedDeposit: null, fundedHeadroom: null }),
    { escrow: null, headroom: null },
  );
});

test("featured entry uses the newest published Tempo recording", () => {
  const base = {
    title: "Charging",
    description: "Recorded",
    payment: "Tempo testnet",
  };
  const runs = [
    { ...base, id: "old", publishedAt: "2026-10-04T00:00:00Z" },
    {
      ...base,
      id: "local",
      publishedAt: "2026-10-06T00:00:00Z",
      payment: "Local simulation",
    },
    { ...base, id: "new", publishedAt: "2026-10-05T00:00:00Z" },
  ];
  assert.equal(newestTempoRecording(runs)?.id, "new");
  assert.equal(newestTempoRecording([]), null);
});

test("pending and failed operations remain distinct and offchain digests never link", () => {
  const hash = `0x${"ab".repeat(32)}`;
  const operation = {
    type: "top_up" as const,
    status: "submitted" as const,
    requestedAmount: "1500000",
    transactionHash: hash,
    reasonCode: null,
  };
  assert.equal(
    paymentOperationStatus(operation, "tempo-adapter"),
    "Awaiting confirmation",
  );
  assert.equal(
    paymentOperationStatus(
      { ...operation, status: "pending" },
      "tempo-adapter",
    ),
    "Awaiting confirmation",
  );
  assert.equal(
    paymentOperationStatus({ ...operation, status: "failed" }, "tempo-adapter"),
    "Needs checking",
  );
  assert.equal(
    paymentOperationStatus(
      { ...operation, status: "confirmed" },
      "local-simulation",
    ),
    "Simulated · no network confirmation",
  );
  assert.equal(
    paymentOperationStatus(
      { ...operation, type: "voucher", status: "confirmed" },
      "tempo-adapter",
    ),
    "Verified offchain",
  );
  assert.equal(
    paymentOperationUrl(
      { ...operation, type: "voucher" },
      "tempo-adapter",
      "eip155:42431",
    ),
    null,
  );
  assert.equal(
    paymentOperationUrl(operation, "local-simulation", "eip155:42431"),
    null,
  );
  assert.equal(
    paymentOperationUrl(
      { ...operation, transactionHash: null },
      "tempo-adapter",
      "eip155:42431",
    ),
    null,
  );
  assert.ok(paymentOperationUrl(operation, "tempo-adapter", "eip155:42431"));
  const open = { ...operation, type: "open" as const };
  const close = { ...operation, type: "close" as const };
  assert.deepEqual(
    orderPaymentOperations([close, operation, open], [hash]).map(
      (op) => op.type,
    ),
    ["open", "top_up", "close"],
  );
});
