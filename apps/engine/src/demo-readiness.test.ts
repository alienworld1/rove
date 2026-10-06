import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDemoAccountingProfile } from "@rove/config";
import { randomUUID } from "node:crypto";
import { ChargingStore, LabStore, StoreError } from "@rove/persistence";
import { createLiveLabScenario } from "./lab-live-scenario.js";
import { CorridorLab } from "./corridor-lab.js";
import { LabValidationError } from "@rove/lab";

test("controlled accounting is explicit and independent of global Tempo accounting", () => {
  assert.deepEqual(
    resolveDemoAccountingProfile(
      { tempoNetwork: "local-simulation", settlementAssetId: "TEST_ASSET" },
      { CDR_SETTLEMENT_ASSET_ID: "tempo-asset" },
    ),
    {
      settlementAssetId: "TEST_ASSET",
      currency: "USD",
      sourcePartyId: "controlled-cpo",
    },
  );
  assert.throws(
    () =>
      resolveDemoAccountingProfile({
        tempoNetwork: "local-simulation",
        settlementAssetId: "other",
      }),
    /ACCOUNTING_ASSET_MISMATCH/,
  );
});

test(
  "incompatible Tempo accounting blocks launch before a run or channels exist",
  { skip: !process.env.DATABASE_URL || !process.env.TEMPO_ASSET_ADDRESS },
  async () => {
    const charging = new ChargingStore(process.env.DATABASE_URL!);
    const runs = new LabStore(process.env.DATABASE_URL!);
    const prior = process.env.CDR_SETTLEMENT_ASSET_ID;
    try {
      const lab = new CorridorLab(charging, runs);
      const definition = createLiveLabScenario();
      const scenario = await lab.saveScenario(definition);
      for (const asset of [undefined, "different-asset"]) {
        if (asset === undefined) delete process.env.CDR_SETTLEMENT_ASSET_ID;
        else process.env.CDR_SETTLEMENT_ASSET_ID = asset;
        const readiness = lab.readinessForScenario(definition);
        assert.equal(readiness.paymentCompatible, true);
        assert.equal(readiness.accountingCompatible, false);
        const id = randomUUID();
        await assert.rejects(
          lab.start(scenario.id, scenario.digest, undefined, id),
          (error) =>
            error instanceof LabValidationError &&
            error.issues.some((issue) => issue.path === "readiness"),
        );
        await assert.rejects(
          runs.getRun(id),
          (error) => error instanceof StoreError && error.code === "NOT_FOUND",
        );
      }
    } finally {
      if (prior === undefined) delete process.env.CDR_SETTLEMENT_ASSET_ID;
      else process.env.CDR_SETTLEMENT_ASSET_ID = prior;
      await charging.close();
      await runs.close();
    }
  },
);
test("Tempo accounting requires complete settings and matching asset", () => {
  const corridor = {
    tempoNetwork: "eip155:42431",
    settlementAssetId: "tempo-asset",
  };
  assert.throws(() => resolveDemoAccountingProfile(corridor, {}));
  assert.throws(
    () =>
      resolveDemoAccountingProfile(corridor, {
        CDR_CURRENCY: "USD",
        CDR_SOURCE_PARTY_ID: "controlled-cpo",
        CDR_SETTLEMENT_ASSET_ID: "other",
      }),
    /ACCOUNTING_ASSET_MISMATCH/,
  );
  assert.equal(
    resolveDemoAccountingProfile(corridor, {
      CDR_CURRENCY: "USD",
      CDR_SOURCE_PARTY_ID: "controlled-cpo",
      CDR_SETTLEMENT_ASSET_ID: "tempo-asset",
    }).settlementAssetId,
    "tempo-asset",
  );
});
