# Hosted validation record

Verified locally on 2026-10-04 with Node 22.23.2, pnpm 11.19.0, and isolated PostgreSQL 16. No production hosting projects or deployment URLs were available during implementation.

- Applied the complete Drizzle migration history to a fresh database, including RLS and anonymous SELECT-only published access.
- Passed all 87 workspace tests with real PostgreSQL integration checks enabled. Additional session-capability checks passed after the capability migration. Typechecks, web/docs ESLint, Prettier, and production builds passed.
- Exercised hosted HTTP admission with two workspaces: an identical request returned the same run; a second workspace received 404; anonymous unpublished access and arbitrary scenario creation were denied.
- Executed the fixed real Moderato preset through the hosted worker. Three channels opened; evidence rejection, protection pause/recovery, vouchers, top-up, and partial settlement were retained. All final accounting matched, all channels closed, and unused reserve was confirmed returned.
- Restarted the engine with the same durable proof. Imported the checksum-verified published seed into a separate migrated database without importing private workspace state or submitting new transactions.
- Checked the public Corridor in a fresh browser: published listing, Lane expansion, evidence/payment inspection, historical playback, and final reconciliation work without an invite. Redeemed a bounded local invite, checked the unavailable-execution message without spending, and ended access while public analysis remained accessible.

The verified proof and receipt references are retained in [the release recording](../deployment/published-runs/README.md). Setup and the actual hosted release checks are in [hosted deployment](hosted-deployment.md).

Deployment setup was additionally verified on 2026-10-08 with Node 22.23.2 and pnpm 11.19.0:

- Applied all migrations to a fresh isolated PostgreSQL 16 database using `pnpm deploy:db`, then published the checksum-verified recording using `pnpm deploy:seed`.
- Passed workspace tests with PostgreSQL integration checks enabled. One environment-dependent Tempo accounting test was skipped because the live asset environment was not supplied.
- Built both Vercel applications and the engine Docker image. Loaded and verified the release recording inside the container under a 512 MB memory limit. This checks image startup dependencies and assets, not peak memory or CPU during a live run.
- Verified private deployment settings are Git-ignored and setup refuses to overwrite existing credentials. The deployment check rejects incomplete provider settings before attempting network access.

Still requires deployed Vercel/Supabase/engine targets: verified database TLS, Supabase PostgREST grants/configuration, HTTPS/origin checks against the actual domains, free-instance wake behavior, live-run resource measurements, and SSE through the hosting proxies. No cloud projects were created by these local checks.
