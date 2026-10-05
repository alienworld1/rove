# Hosted Rove

The hosted product offers **Explore runs** and **Invite access**. Public visitors inspect immutable, explicitly published completed Tempo testnet runs. An invite opens a private workspace and enables **Run on Tempo testnet** for the approved three-Lane digital-twin preset. There are no wallets, consumer accounts, public simulations, or visitor scenario builders.

## Services

Use two Vercel projects, rooted at `apps/web` and `apps/docs`, and one persistent Node 22 engine built with `deployment/engine.Dockerfile`. Use Supabase PostgreSQL for the engine's durable state. Keep exactly one engine replica: its worker and payer nonce coordination assume one process.

For a free preview, [Koyeb's free instance](https://www.koyeb.com/docs/reference/instances) provides 512 MB RAM and 0.1 vCPU. It [sleeps after an hour without traffic](https://www.koyeb.com/docs/run-and-scale/scale-to-zero). This is a preview option, not an always-on worker guarantee. Paused unattended runs resume after 15 minutes while the engine is awake; incomplete financial work resumes after wake/restart. Public analysis reads Supabase directly and does not wake the engine. Use an always-on instance when continuous execution is required. Do not use an artificial keep-alive to bypass hosting limits.

## Database first

Create a Supabase project near the engine region. Take the PostgreSQL connection string from its Connect panel. Use the direct connection or session pooler for migrations; the transaction pooler is supported for runtime (prepared statements disabled). Require TLS and retain certificate verification; never set `rejectUnauthorized: false`. Keep the privileged database credential exclusively on the engine and migration operator machine.

```sh
# With DATABASE_URL set to the privileged migration connection:
pnpm install --frozen-lockfile
pnpm --filter @rove/persistence db:migrate
```

Drizzle owns the migration history. Migrations enable RLS on every application table, deny public access to private tables, and grant only SELECT on `published_runs` to Supabase's `anon` and `authenticated` API roles. The engine database role must retain trusted server access; visitor permissions are checked again by the engine. Never use the browser's publishable key to run migrations or execute private work.

Set `SUPABASE_URL` and the new `sb_publishable_…` publishable key on the **web** project. No secret/service-role Supabase key belongs there. Public records use this read-only API; keep the `public` schema exposed. Verify anonymous SELECT on `hosted_sessions`, `hosted_invites`, and `lanes` is denied, while published records can be read. Database unavailability is shown accurately; cached published reads may remain available for five minutes.

## Engine settings

Create a Koyeb Web Service from the repository with Dockerfile `deployment/engine.Dockerfile`, port 4100, one replica, HTTPS endpoint, and HTTP health check `/health`. Configure:

- `NODE_ENV=production`, `ACCESS_MODE=hosted`, `ENGINE_HOST=0.0.0.0`, `ENGINE_PORT=4100`.
- `DATABASE_URL` with the privileged runtime PostgreSQL connection.
- `APP_ORIGIN` with the exact production web HTTPS origin and `ENGINE_ORIGIN` with the engine HTTPS endpoint (also used by the web project).
- A cryptographically random hex `ENGINE_SERVICE_TOKEN` of at least 64 characters, shared only with the web server.
- The verified `TEMPO_*` and `CDR_*` settings from `.env.example`, with funded test-only payer/payee/signing accounts. Hosted execution requires Moderato chain 42431 and the precompile; the live RPC, asset decimals, and voucher domain are probed before admission.
- Finite `HOSTED_FUNDING_BUDGET`, `HOSTED_FEE_BUDGET`, `HOSTED_GAS_LIMIT`, and `HOSTED_MAX_FEE_PER_GAS`. Configure `HOSTED_MAX_TRANSACTIONS_PER_RUN` (default 32), session hours (default 24), and stream limits as needed.

Funding limits are gross asset base units, never net of refunds. The two-minute preset reserves at most 10.5 asset units: three initial deposits of 2 units, one 1.5-unit top-up on Lane B, and two 1.5-unit top-ups on Lane C. For six-decimal PathUSD, configure at least 10,500,000 base units per admitted run. Its tariff is 0.42 PathUSD/kWh; final service totals are 0.252, 1.764, and 3.78 PathUSD. These are testnet presentation settings, not production policy. Fee reservation is `gasLimit × maxFeePerGas × maxTransactions`; Tempo gas prices use [18-decimal USD units](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1010.md). Read current gas prices and choose a finite cap with enough margin for the actual calls. Both payer and payee need fee assets. The worker enforces the admitted gas cap and funding again before each transaction. Missing limits disable admission while analysis remains available.

Budgets persist cumulatively in PostgreSQL. Deleting sessions, reusing an invite, refunds, redeployment, reset, or playback cannot replenish them. Each new run is new financial work. One unfinished admission occupies global capacity until all three channels are confirmed closed. Do not delete admission/submission rows to unblock pending transactions. Inspect existing outbox references, reconciliation, and chain receipts first; uncertain reserved submissions are not automatically rebroadcast. Retain unresolved work independently of invitation/session expiry.

## Vercel web and docs

Use Node 22 and pnpm 11.19.0. The project `vercel.json` files supply build/install commands. Set the following on the web project before building:

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
