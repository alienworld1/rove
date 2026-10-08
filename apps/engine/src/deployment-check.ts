import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import postgres from "postgres";
import {
  readBaseConfig,
  readPaymentConfig,
  readAccountingConfig,
  readHostedLimits,
} from "@rove/config";
import { publicOrigin } from "@rove/contracts/docs-links";

let step = "Read deployment/*/.env; run pnpm deploy:setup if missing";

async function main() {
  const settings = async (service: string) =>
    parseEnv(
      await readFile(
        new URL(`../../../deployment/${service}/.env`, import.meta.url),
        "utf8",
      ),
    );
  const engine = await settings("engine");
  const web = await settings("web");
  const docs = await settings("docs");
  step =
    "Check hosted settings, matching origins, shared service token, and publishable key";
  for (const env of [web, docs]) {
    if (
      Object.keys(env).some(
        (key) =>
          key === "DATABASE_URL" ||
          key.includes("PRIVATE_KEY") ||
          key.includes("SERVICE_ROLE") ||
          key.includes("SECRET_KEY"),
      )
    )
      throw new Error(
        "Keep database and signing credentials exclusively on the engine.",
      );
    if (env.ENABLE_EXPERIMENTAL_COREPACK !== "1")
      throw new Error("Enable Corepack on both Vercel projects.");
  }
  for (const env of [engine, web]) {
    readBaseConfig({ ...env, NODE_ENV: "production" });
    if (env.ACCESS_MODE !== "hosted")
      throw new Error("Set ACCESS_MODE=hosted.");
    for (const key of ["APP_ORIGIN", "ENGINE_ORIGIN"]) {
      const origin = publicOrigin(env[key], key, "", false);
      if (!origin.startsWith("https://"))
        throw new Error(`Use HTTPS for ${key}.`);
    }
  }
  for (const key of ["APP_ORIGIN", "ENGINE_ORIGIN", "ENGINE_SERVICE_TOKEN"]) {
    if (engine[key] !== web[key])
      throw new Error(`Web and engine ${key} must match.`);
  }
  if (docs.NEXT_PUBLIC_APP_ORIGIN !== web.APP_ORIGIN)
    throw new Error("Docs must link to the configured app origin.");
  if (
    !publicOrigin(
      web.NEXT_PUBLIC_DOCS_ORIGIN,
      "NEXT_PUBLIC_DOCS_ORIGIN",
      "",
      false,
    ).startsWith("https://")
  )
    throw new Error("Use HTTPS for the docs origin.");
  if (!web.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_"))
    throw new Error("Add the Supabase publishable key to the web settings.");
  const supabase = publicOrigin(web.SUPABASE_URL, "SUPABASE_URL", "", false);
  if (!supabase.startsWith("https://"))
    throw new Error("Use HTTPS for Supabase.");
  if (!engine.DATABASE_URL) throw new Error("Add the engine DATABASE_URL.");
  const database = new URL(engine.DATABASE_URL);
  if (database.searchParams.get("sslmode") !== "verify-full")
    throw new Error(
      "Use sslmode=verify-full on DATABASE_URL to verify database TLS.",
    );
  if (
    database.hostname.endsWith(".pooler.supabase.com") &&
    database.port !== "5432"
  )
    throw new Error(
      "Use the Supabase Session pooler on port 5432 for this setup.",
    );

  const liveKeys = [
    "TEMPO_PAYER_PRIVATE_KEY",
    "TEMPO_PAYEE_PRIVATE_KEY",
    "TEMPO_VOUCHER_SIGNER_PRIVATE_KEY",
    "HOSTED_FUNDING_BUDGET",
    "HOSTED_FEE_BUDGET",
    "HOSTED_GAS_LIMIT",
    "HOSTED_MAX_FEE_PER_GAS",
  ];
  const live = liveKeys.some((key) => engine[key]);
  step =
    "Complete every Tempo and budget setting, or leave all signing keys and budgets empty for analysis only";
  if (live) {
    const payment = readPaymentConfig(engine);
    const accounting = readAccountingConfig(engine);
    const limits = readHostedLimits(engine);
    if (
      payment.TEMPO_CHAIN_ID !== 42431 ||
      payment.TEMPO_SESSION_BACKEND !== "precompile"
    )
      throw new Error(
        "Hosted runs require Moderato chain 42431 and the precompile.",
      );
    if (
      payment.TEMPO_ASSET_ADDRESS.toLowerCase() !==
      accounting.CDR_SETTLEMENT_ASSET_ID.toLowerCase()
    )
      throw new Error("Payment and accounting assets must match.");
    if (BigInt(limits.HOSTED_FUNDING_BUDGET) < 10_500_000n)
      throw new Error(
        "Allow at least 10500000 base units for one six-decimal preset run.",
      );
  }

  step =
    "Connect to the database with verified TLS and apply migrations with pnpm deploy:db";
  const sql = postgres(engine.DATABASE_URL, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
  });
  try {
    await sql`select run_id from published_runs limit 1`;
    const insecure = await sql`
      select tablename from pg_tables
      where schemaname = 'public' and not rowsecurity
      and tablename in ('hosted_sessions', 'hosted_invites', 'lanes', 'published_runs')
    `;
    if (insecure.length)
      throw new Error("Apply the complete migration history to enable RLS.");
  } finally {
    await sql.end({ timeout: 5 });
  }
  const headers = { apikey: web.SUPABASE_PUBLISHABLE_KEY };
  step =
    "Check the Supabase publishable key, public schema exposure, and published_runs SELECT grant";
  const published = await fetch(
    `${supabase}/rest/v1/published_runs?select=run_id&limit=1`,
    { headers, signal: AbortSignal.timeout(15000) },
  );
  if (!published.ok)
    throw new Error(
      "Published Supabase API reads failed. Check migrations, API key, and exposed schema.",
    );
  const rows = await published.json();
  step = "Publish the verified release recording with pnpm deploy:seed";
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("Publish the release recording with pnpm deploy:seed.");
  for (const table of ["hosted_sessions", "hosted_invites", "lanes"]) {
    step = `Verify anonymous access to ${table} is denied by API grants`;
    const response = await fetch(
      `${supabase}/rest/v1/${table}?select=*&limit=1`,
      { headers, signal: AbortSignal.timeout(15000) },
    );
    if (![401, 403].includes(response.status))
      throw new Error(
        `Anonymous access to ${table} must be denied. Review API grants.`,
      );
  }
  process.stdout.write(
    `Deployment settings, database, and anonymous API permissions passed. ${live ? "Live settings are complete; probe Tempo before issuing invites." : "Published analysis is ready; live admission remains disabled."}\n`,
  );
}

void main().catch(() => {
  // Database/network errors may contain credentials; never print raw exceptions.
  process.stderr.write(`Deployment check failed: ${step}.\n`);
  process.exitCode = 1;
});
