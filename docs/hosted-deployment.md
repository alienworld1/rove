# Hosted Rove

The hosted product offers **Explore runs** and **Invite access**. Public visitors inspect immutable, explicitly published completed Tempo testnet runs. An invite opens a private workspace and enables **Run on Tempo testnet** for the approved three-Lane digital-twin preset. There are no wallets, consumer accounts, public simulations, or visitor scenario builders.

## Services

The easiest starting point is Supabase Free, a Render Free Web Service, and two Vercel projects connected to the same Git repository. Start with published analysis, then enable invited live runs. No Supabase Auth, Storage, Edge Functions, Redis, or database connection on Vercel is needed. Choose a Render region near your Supabase project; Frankfurt is a suitable starting point for a European database. Keep the public app and docs on their default provider domains initially; add custom domains later and update both origins before rebuilding.

Free hosting suits a supervised testnet demo. [Render Free](https://render.com/docs/free) sleeps after 15 minutes without inbound requests and takes about a minute to wake. Its 750 monthly instance hours are shared across the workspace. Database and RPC calls do not keep it awake. Render may suspend services with unusually high outbound traffic, including external database and API traffic; it does not publish a threshold. Rove's background polling therefore needs measurement on the actual host. Use no payment method to have excess bandwidth/build usage suspended instead of billed. Do not enable paid resources or automatic upgrades.

[Supabase Free](https://supabase.com/pricing) includes a 500 MB database and pauses after a week of inactivity; it has no automatic backups. Keep an independent database backup before migrations. [Vercel Hobby](https://vercel.com/docs/plans/hobby) is for personal, non-commercial use. Keep the database on Supabase: Render's free PostgreSQL expires after 30 days. The engine's free-instance performance and recovery need the release checks below before sharing live access.

### First deployment, from a fresh account

1. Connect this repository to Vercel and create two projects: app root `apps/web`, docs root `apps/docs`. Select Next.js and Node 22.x. Enable **Include source files outside of the Root Directory** for both projects so workspace packages are available. Record the assigned production domains; the example names below are placeholders, not reserved domains. A first build may fail until origins are configured.
2. Create a Supabase project near the engine region. Save its database password privately, copy its HTTPS project URL and `sb_publishable_…` key, and copy the **Session pooler** connection from **Connect**, using port **5432**. URL-encode special characters in the password and add `?sslmode=verify-full` (or `&sslmode=verify-full` if the URL already has query parameters). This works over IPv4 without a paid IPv4 add-on. Use the pooler URL for both migrations and the engine. Do not weaken certificate verification if TLS fails; check the hostname and trusted certificate chain.
3. In Render, select **New → Blueprint**, connect this repository, and use the root `render.yaml`. Review that the only resource is a **Free Web Service** named `rove-engine`; there is no Render database, disk, or paid worker. The manifest uses the existing Dockerfile, repository-root build context, port **4100**, and **/health** check, with automatic Git deployments and previews disabled. Supply the prompted database URL, shared engine token, and engine origin. If Render has not assigned a domain yet, use `https://your-engine.onrender.com` temporarily and replace it before allowing access. Record the actual generated HTTPS domain; the manifest's service name does not reserve a domain. The first deployment may fail until database migrations and all settings are ready.
4. From the repository root, initialize private settings:

   ```sh
   pnpm install --frozen-lockfile
   pnpm deploy:setup
   ```

   Edit `deployment/engine/.env`, `deployment/web/.env`, and `deployment/docs/.env`. Replace every example domain, set `DATABASE_URL` on the engine, and set the Supabase URL and publishable key on web. Setup generates the same random service credential for web and engine, creates owner-only files, and refuses to overwrite existing settings. These files are Git-ignored. It does not copy local development credentials.

5. Initialize the database and the verified public recording:

   ```sh
   pnpm deploy:db
   pnpm deploy:seed
   pnpm deploy:check
   ```

   Commands load the engine deployment env explicitly and give those settings precedence over your shell; you do not need to source it. Drizzle remains the only migration owner; do not also apply this history through Supabase migrations. Keep the `public` schema exposed in Data API settings. The existing migration explicitly grants anonymous SELECT on `published_runs`, so it also supports Supabase projects where new tables receive no automatic API grants. The check reads the real database and API, verifies the seeded recording is public, and confirms private tables reject anonymous reads. It never starts a payment.

6. Replace `ENGINE_ORIGIN` in **both** private engine and web env files with the actual Render HTTPS origin. In Render's service **Environment** page, use **Add from .env** to import `deployment/engine/.env`, then save and deploy. This bulk import also supplies live-run settings; the Blueprint alone does not configure signing accounts or budgets. Verify `https://<engine-domain>/health` returns HTTP 200. Import `deployment/web/.env` into the app project's **Production** environment and `deployment/docs/.env` into docs. Both include `ENABLE_EXPERIMENTAL_COREPACK=1`; the committed build configuration uses Corepack to select pnpm 11.19.0. Redeploy both Vercel projects after saving env settings. Environment changes do not alter an existing deployment.
7. Open docs at `/docs` and the main app in a fresh browser. Verify public run analysis, receipt links, playback, and cross-app navigation. Published analysis should continue working while the Render engine sleeps. Run the HTTPS smoke checks below before sharing live invitations.

At this point, analysis works with all signing keys and budgets empty. For live execution, fill **all** Tempo signing/account settings and finite budget settings in `deployment/engine/.env`, rerun `pnpm deploy:check`, and run a read-only payment probe:

```sh
pnpm deploy:probe
```

Upload the updated engine env through the maintenance flow below. Both payer and payee need funded testnet fee assets. Issue invites using `pnpm deploy:admin invite` with the allowances described below. Setup never chooses financial limits or creates invites automatically. The deployment check validates settings and storage; it does not prove RPC funding, live-run performance, proxy streaming, or recovery on the actual host.

### Engine updates and process limits

Keep automatic Git deployments disabled. Render uses [rolling deployments](https://render.com/docs/deploys): a replacement may start before the previous process stops, including when using **Restart service**. This engine coordinates its worker and payer nonces in one process; one configured replica does not guarantee that only one process runs during a transition.

Before changing engine code or environment, set `ACCESS_MODE=disabled` on the Vercel web project and redeploy it to stop new private admissions. Wait for all live runs to finish, confirm every channel is closed and no preparation or payment remains pending, then apply migrations and deploy the engine manually. Verify `/health` and recovery before restoring hosted web access. Disabling hosted access also changes the app entry page; public records remain stored on Supabase throughout maintenance. Never run a local engine against the hosted database in parallel. Do not redeploy or use the dashboard's rolling restart while financial work is pending.

Render can also restart free services at any time, and [platform maintenance](https://render.com/docs/platform-maintenance) can overlap old and new processes. Manual deployment controls do not eliminate that risk. This setup is suitable for supervised testnet demonstrations, not unattended financial execution. A database-backed exclusive engine lease with takeover/recovery verification is required before treating rolling replacement as safe for live payments. The hosted smoke checks below remain mandatory; the Blueprint is deployment configuration, not a guarantee of payment safety.

Vercel app/docs deployments can remain automatic. Keep production engine credentials out of Vercel Preview environments; use `ACCESS_MODE=disabled` and the public docs origin for app previews, plus the production app origin for docs previews. Only use hosted preview access with separate database, engine, token, and payer accounts.

Use two Vercel projects, rooted at `apps/web` and `apps/docs`, and one persistent Node 22 engine built with `deployment/engine.Dockerfile`. Use Supabase PostgreSQL for the engine's durable state. Keep exactly one engine replica: its worker and payer nonce coordination assume one process.

For a free preview, paused unattended runs resume after 15 minutes while the engine is awake; background work stops during sleep and resumes after wake/restart. Public analysis reads Supabase directly and does not wake the engine. Before a demo, open the engine's `/health` URL and wait for HTTP 200, then open the app and keep the workspace active until all channels close. Do not assume a connected SSE response or outbound polling prevents sleep. Do not use artificial keep-alives to bypass hosting limits.

## Database first

Create a Supabase project near the engine region. Take the PostgreSQL connection string from its Connect panel. Prefer the session pooler on port 5432 for both migrations and runtime; direct connections also work when the host supports the project's IP version and certificate chain. Avoid the transaction pooler for this setup: disabling prepared statements alone does not address all [transaction-mode limitations](https://supabase.com/docs/guides/database/connecting-to-postgres#transaction-mode-limitations), including query pipelining. Require TLS and retain certificate verification; never set `rejectUnauthorized: false`. Keep the privileged database credential exclusively on the engine and migration operator machine.

```sh
# With DATABASE_URL set to the privileged migration connection:
pnpm install --frozen-lockfile
pnpm --filter @rove/persistence db:migrate
```

Drizzle owns the migration history. Migrations enable RLS on every application table, deny public access to private tables, and grant only SELECT on `published_runs` to Supabase's `anon` and `authenticated` API roles. The engine database role must retain trusted server access; visitor permissions are checked again by the engine. Never use the browser's publishable key to run migrations or execute private work.

Set `SUPABASE_URL` and the new `sb_publishable_…` publishable key on the **web** project. No secret/service-role Supabase key belongs there. Public records use this read-only API; keep the `public` schema exposed. Verify anonymous SELECT on `hosted_sessions`, `hosted_invites`, and `lanes` is denied, while published records can be read. Database unavailability is shown accurately; cached published reads may remain available for five minutes.

## Engine settings

Create a Render Free Web Service using `render.yaml` with Dockerfile `deployment/engine.Dockerfile`, port 4100, one replica, HTTPS endpoint, and HTTP health check `/health`. Configure:

- `NODE_ENV=production`, `ACCESS_MODE=hosted`, `ENGINE_HOST=0.0.0.0`, `ENGINE_PORT=4100`.
- `DATABASE_URL` with the privileged runtime PostgreSQL connection.
- `APP_ORIGIN` with the exact production web HTTPS origin and `ENGINE_ORIGIN` with the engine HTTPS endpoint (also used by the web project).
- A cryptographically random hex `ENGINE_SERVICE_TOKEN` of at least 64 characters, shared only with the web server.
- The verified `TEMPO_*` and `CDR_*` settings from `.env.example`, with funded test-only payer/payee/signing accounts. Hosted execution requires Moderato chain 42431 and the precompile; the live RPC, asset decimals, and voucher domain are probed before admission.
- Finite `HOSTED_FUNDING_BUDGET`, `HOSTED_FEE_BUDGET`, `HOSTED_GAS_LIMIT`, and `HOSTED_MAX_FEE_PER_GAS`. Configure `HOSTED_MAX_TRANSACTIONS_PER_RUN` (default 32), session hours (default 24), and stream limits as needed.

Funding limits are gross asset base units, never net of refunds. The two-minute preset reserves at most 10.5 asset units: three initial deposits of 2 units, one 1.5-unit top-up on Lane B, and two 1.5-unit top-ups on Lane C. For six-decimal PathUSD, configure at least 10,500,000 base units per admitted run. Its tariff is 0.42 PathUSD/kWh; final service totals are 0.252, 1.764, and 3.78 PathUSD. These are testnet presentation settings, not production policy. Fee reservation is `gasLimit × maxFeePerGas × maxTransactions`; Tempo gas prices use [18-decimal USD units](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1010.md). Read current gas prices and choose a finite cap with enough margin for the actual calls. Both payer and payee need fee assets. The worker enforces the admitted gas cap and funding again before each transaction. Missing limits disable admission while analysis remains available.

Budgets persist cumulatively in PostgreSQL. Deleting sessions, reusing an invite, refunds, redeployment, reset, or playback cannot replenish them. Each new run is new financial work. One unfinished admission occupies global capacity until all three channels are confirmed closed. Do not delete admission/submission rows to unblock pending transactions. Inspect existing outbox references, reconciliation, and chain receipts first; uncertain reserved submissions are not automatically rebroadcast. Retain unresolved work independently of invitation/session expiry.

## Vercel web and docs

Use Node 22 and pnpm 11.19.0. The project `vercel.json` files supply Corepack build/install commands. Set `ENABLE_EXPERIMENTAL_COREPACK=1` on both projects. Set the following on the web project before building:

```text
ACCESS_MODE=hosted
APP_ORIGIN=https://your-app.example
ENGINE_ORIGIN=https://your-engine.example
ENGINE_SERVICE_TOKEN=<same server-only credential>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
NEXT_PUBLIC_DOCS_ORIGIN=https://your-docs.example
```

Set `NEXT_PUBLIC_APP_ORIGIN=https://your-app.example` on docs. Set `NEXT_PUBLIC_DOCS_ORIGIN` too if running the full monorepo build. Origins have no paths, credentials, query strings, or fragments. `NODE_ENV` does not enable hosted access: `ACCESS_MODE` does. Use distinct preview infrastructure and test accounts if enabling invites on preview deployments; an unrelated Vercel preview Origin cannot mutate production sessions.

Never put engine credentials, database credentials, or signing keys in `NEXT_PUBLIC_*`. The browser receives an opaque host-only Secure HttpOnly SameSite cookie; PostgreSQL retains only its hash. Mutation requests require the configured same-origin Origin. Invite links use `/#invite=<code>`; the page strips the fragment before redeeming via POST. Do not add telemetry that records invite fragments or request bodies.

Private SSE closes after 55 seconds and reconnects with its committed cursor, within the configured [Vercel function duration](https://vercel.com/docs/functions/limitations) of 60 seconds. Historical views never open a stream. Concurrent viewers share a Corridor poll on the engine. On interruption, the product retains the last checked state and disables actions until current reads succeed.

## Invite and publication commands

Run these operator-only commands in a trusted environment with engine settings. Adjust expiry and limits to your finite deployment budget:

```sh
pnpm --filter @rove/engine hosted:admin invite \
  --expires 2026-10-11T00:00:00Z --redemptions 10 --runs 10 \
  --runs-per-workspace 1 --funding 105000000 --fees <finite-fee-budget>
pnpm --filter @rove/engine hosted:admin seed
pnpm --filter @rove/engine hosted:admin revoke <invite-id>
pnpm --filter @rove/engine hosted:admin publish <completed-run-id>
```

The invite command emits the raw code once. Store/share it privately. Reloading or redeeming again with the same retained session rotates the identifier and preserves the workspace allowance. A new browser consumes another redemption; ending access revokes the session. Invitations grant owned preset execution and completion controls, never arbitrary evidence, CDR, financial commands, or integration authority.

`hosted:admin seed` imports the included checksum-verified real Moderato recording into the release database without opening channels or submitting transactions. The presentation artifact `deployment/published-runs/tempo-rolling-protection.json` has three channels closed on 2026-10-05 and 5.796 PathUSD settled; the seed artifact retains receipt references, final totals, rejected evidence, pause/recovery, and recorded snapshots. The original boundary recording remains in `deployment/published-runs/tempo-three-lane.json` with its original amounts. New live runs remain private until explicitly published.

Publication verifies real testnet funding, rejected evidence, pause/recovery, top-up, settlement, matching final accounting, closed channels, and confirmed reserve refund. It captures frozen run/projection/trace/Inspector/accounting records. Publication has no visitor HTTP endpoint. Complete and publish a verified real run **before** release; no sample or simulation is automatically advertised as real payment proof.

## Release smoke checks

Run Prettier, typechecks, tests with an isolated migrated PostgreSQL database, and both production builds. Then check the actual HTTPS deployments:

1. In a fresh browser, explore a published three-Lane Corridor, expand Lanes, inspect rejected evidence and payment receipts, scrub/play the recording, and open reconciliation. Confirm no invite, stream, wallet, or mutation is needed.
2. Redeem an invite, run the preset, refresh during preparation/confirmation, and restart the engine while a transaction is pending. The same run/channel identities must recover without duplicate funding.
3. Verify a second workspace cannot read/control the first run, anonymous unpublished reads fail, and scenario/CDR/evidence/financial mutations are denied.
4. Verify duplicate run requests return the same admission, busy capacity permits retry, and exhausted/expired/revoked access leaves public analysis usable.
5. Disconnect the engine/RPC and verify checked-state copy, reconnect/cursor recovery after 55 seconds, and continued Supabase public reads. Confirm all three real channel receipts, reconciliation, close, and refunds before publishing.

These checks require deployed URLs and real service configuration; a local production build alone does not establish hosted readiness.
