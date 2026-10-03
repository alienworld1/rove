import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeAccountingRecord, compareSessionTotals } from "./index.js";

const context = {
  externalSessionId: "session",
  sourcePartyId: "cpo",
  meterId: "meter",
  chargerId: "charger",
  startedAt: "2026-10-03T00:00:00Z",
  endedAt: "2026-10-03T00:01:00Z",
  currency: "USD",
  settlementAssetId: "pathUSD",
  tariff: { perKwh: "500000", tariffDecimals: 6, assetDecimals: 6 },
};
const record = {
  ...context,
  externalCdrId: "cdr",
  totalEnergyKwh: "1.000",
  totalCost: "0.500000",
  tariffBasis: context.tariff,
  chargeType: "energy_only_tax_free",
};
const { settlementAssetId: _asset, tariff: _tariff, ...payload } = record;
const now = "2026-10-03T00:02:00Z";
test("accounting preserves decimal lexemes and exact Wh and asset units", () => {
  const raw = JSON.stringify(payload);
  const normalized = normalizeAccountingRecord(raw, context, now);
  assert.equal(normalized.raw, raw);
  assert.equal(normalized.totalEnergyWh, "1000");
  assert.equal(normalized.normalizedTotal, "500000");
  assert.equal(
    normalizeAccountingRecord(
      JSON.stringify({ ...payload, totalCost: "9007199254740993.000001" }),
      context,
      now,
    ).normalizedTotal,
    "9007199254740993000001",
  );
});
test("unsupported precision, numeric money, charges, bindings and time are rejected", () => {
  for (const change of [
    { totalEnergyKwh: "1.0001" },
    { totalCost: "0.5000001" },
    { totalCost: 0.5 },
    { totalCost: "1e-3" },
    { currency: "EUR" },
    { sourcePartyId: "other" },
    { meterId: "other" },
    { chargerId: "other" },
    { externalSessionId: "other" },
    { endedAt: "2026-10-04T00:00:00Z" },
    { chargeType: "tax" },
    { parking: "0" },
  ])
    assert.throws(() =>
      normalizeAccountingRecord(
        JSON.stringify({ ...payload, ...change }),
        context,
        now,
      ),
    );
  assert.throws(
    () =>
      normalizeAccountingRecord(
        JSON.stringify(payload),
        { ...context, currency: "" },
        now,
      ),
    /MAPPING_MISSING/,
  );
});
test("all four totals and both energies must match with exact signed deltas", () => {
  const values = {
    trustedEnergyWh: "1000",
    cdrEnergyWh: "1000",
    trustedValue: "500000",
    cdrTotal: "500000",
    authorizedValue: "500000",
    settledValue: "500000",
  };
  assert.equal(compareSessionTotals(values).status, "MATCH");
  assert.equal(
    compareSessionTotals({ ...values, cdrEnergyWh: "999" }).deltas.energyWh,
    "-1",
  );
  assert.equal(
    compareSessionTotals({ ...values, cdrTotal: "500001" }).deltas.accounting,
    "1",
  );
  assert.equal(
    compareSessionTotals({ ...values, settledValue: "499999" }).status,
    "MISMATCH",
  );
});
