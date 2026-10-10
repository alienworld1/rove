import { readBaseConfig, readHostedLimits } from "@rove/config";
import { ChargingStore, HostedStore, LabStore } from "@rove/persistence";
import { idSchema } from "@rove/contracts";
import { CorridorLab } from "./corridor-lab.js";
import { publishVerifiedTempoRun } from "./publish-hosted-run.js";
import { readVerifiedReleaseSeed } from "./release-seed.js";

async function main() {
  const config = readBaseConfig();
  if (!config.DATABASE_URL)
    throw new Error("Configure the durable database before managing access.");
  const access = new HostedStore(config.DATABASE_URL);
  const store = new ChargingStore(config.DATABASE_URL);
  const labStore = new LabStore(config.DATABASE_URL);
  try {
    const action = process.argv[2];
    if (action === "invite") {
      const values = new Map<string, string>();
      const args = process.argv.slice(3);
      for (let i = 0; i < args.length; i += 2) {
        if (!args[i]?.startsWith("--") || !args[i + 1])
          throw new Error("Supply an expiry and finite invite allowances.");
        values.set(args[i].slice(2), args[i + 1]);
      }
      const integer = (key: string) => {
        const value = Number(values.get(key));
        if (!Number.isSafeInteger(value) || value <= 0)
          throw new Error(`Choose a positive ${key} allowance.`);
        return value;
      };
      const money = (key: string) => {
        const value = values.get(key) ?? "";
        if (!/^[1-9][0-9]{0,77}$/.test(value))
          throw new Error(`Supply the ${key} budget in base units.`);
        return value;
      };
      const expiresAt = values.get("expires") ?? "";
      if (
        !Number.isFinite(Date.parse(expiresAt)) ||
        Date.parse(expiresAt) <= Date.now()
      )
        throw new Error("Choose a future invite expiry.");
      const limits = readHostedLimits();
      const fundingBudget = money("funding");
      const feeBudget = money("fees");
      if (
        BigInt(fundingBudget) > BigInt(limits.HOSTED_FUNDING_BUDGET) ||
        BigInt(feeBudget) > BigInt(limits.HOSTED_FEE_BUDGET)
      )
        throw new Error(
          "Invite budgets must fit within the deployment allowances.",
        );
      const invite = await access.createInvite({
        expiresAt: new Date(expiresAt).toISOString(),
        maxRedemptions: integer("redemptions"),
        maxRuns: integer("runs"),
        runsPerWorkspace: integer("runs-per-workspace"),
        fundingBudget,
        feeBudget,
      });
      process.stdout.write(
        `${JSON.stringify({ ...invite, link: config.APP_ORIGIN ? `${config.APP_ORIGIN}/#invite=${invite.code}` : undefined })}\n`,
      );
    } else if (action === "seed") {
      const recording = process.argv[3] ?? "presentation";
      if (recording !== "presentation" && recording !== "boundary")
        throw new Error("Choose the presentation or boundary recording.");
      const snapshot = await readVerifiedReleaseSeed(recording);
      await access.publish(snapshot.run.run.id, snapshot);
      process.stdout.write(
        `${JSON.stringify({ runId: snapshot.run.run.id, published: true })}\n`,
      );
    } else if (action === "revoke") {
      await access.revokeInvite(idSchema.parse(process.argv[3]));
      process.stdout.write(
        "Invite access revoked. Pending financial work remains recoverable.\n",
      );
    } else if (action === "publish") {
      process.stdout.write(
        `${JSON.stringify(await publishVerifiedTempoRun(access, store, new CorridorLab(store, labStore, access), idSchema.parse(process.argv[3])))}\n`,
      );
    } else
      throw new Error(
        "Use invite, revoke <invite ID>, seed, or publish <completed run ID>.",
      );
  } finally {
    await Promise.all([access.close(), store.close(), labStore.close()]);
  }
}
void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Access management failed"}\n`,
  );
  process.exitCode = 1;
});
