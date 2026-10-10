# Rove

Rove checks the service and integration boundaries needed for trusted charging evidence and payment protection.

## Hosted access

The hosted product offers public **Explore runs** analysis and **Invite access** to a private workspace. An invite enables **Run on Tempo testnet** for the approved three-Lane digital-twin preset. Published records include evidence, payments, protection history, and final reconciliation; recording playback never starts financial work.

Set `ACCESS_MODE=hosted` explicitly. Invitations, opaque sessions, ownership, spending reservations, and pending work persist in PostgreSQL. Public records are published only through an operator command after verifying the real lifecycle. See [hosted deployment](docs/hosted-deployment.md) for Vercel web/docs, Supabase PostgreSQL, and a single persistent engine, including a Render free-preview option and its sleep limitation.

For a new deployment, run `pnpm deploy:setup` to create private per-service settings with a shared service credential. Fill in your provider URLs and Supabase credentials, then run `pnpm deploy:db`, `pnpm deploy:seed`, and `pnpm deploy:check`. The [first deployment walkthrough](docs/hosted-deployment.md#first-deployment-from-a-fresh-account) covers provider settings, environment imports, and enabling live invites after public analysis works.

## Run locally

Use Node.js 22 and pnpm 11.19.0. Prepare the ignored environment file and PostgreSQL described below before starting the services. From the repository root:

```sh
pnpm install
pnpm dev:engine
```

In another terminal:

```sh
pnpm dev:web
```

Open `http://localhost:3000`. Enter the local access key, choose the Northstar Mobility ↔ Voltway scenario, and start a run. The Corridor keeps three charging Lanes, aggregate protection, playback, and event inspection in one view. Select a Lane or one of its recorded events to inspect it; the URL preserves that selection across refreshes. Live updates reconnect automatically, and the latest safely checked state remains visible if the stream is interrupted.

Pause and scrub the recorded trace to inspect committed Lane snapshots and their totals without changing playback or payment confirmation. The live stream pauses in background tabs and reconnects with capped exponential backoff and jitter. Each new connection supplies the validated last committed cursor in the query string because the client closes and recreates EventSource to control backoff; the server also accepts native `Last-Event-ID`. A cursor outside retained history triggers a fresh authoritative read.

Copy `.env.example` to an ignored `.env` file for local settings. The engine reads settings from its process environment; shell values may be loaded with `set -a; . ./.env; set +a` before starting it. The web process needs the same `ENGINE_ORIGIN` and `DEMO_SESSION_TOKEN` values. Generate a random hexadecimal token of at least 48 characters for the local access key. It is entered on the page and kept in an HTTP-only cookie.

The Corridor requires PostgreSQL but the local deterministic payment scenario needs no payer key. Run `pnpm --filter @rove/persistence db:migrate` after setting `DATABASE_URL`. The source disclosure identifies whether payment is local simulation or Tempo. See [charging storage and local checks](docs/charging-storage.md) for the controlled live session path.

For local session completion, set `CDR_CURRENCY=USD`, `CDR_SETTLEMENT_ASSET_ID=TEST_ASSET`, and `CDR_SOURCE_PARTY_ID=controlled-cpo`. When switching to Tempo, set the accounting asset to the configured Tempo asset and restart the engine. A different asset is an accounting mismatch, not permission to correct the record automatically.

The local access-key flow requires controlled development mode. Hosted access uses separate explicit deployment configuration; a production build alone does not enable it. Public documentation remains available independently.

During an outage, the Corridor and selected event retain their last checked records. Their values and bounds describe that checked state. Commands remain unavailable until current reads succeed. **Check again** refreshes or reconciles existing work; it does not establish that an uncertain payment failed. If session access expires, protected caches and streams are cleared; enter the local access key again to restore validated URL context.

The saved Northstar Mobility ↔ Voltway digital-twin scenario includes a rejected meter reading, an exact protection pause, and recovery. The scenario builder is available below the launch controls. Use `pnpm --filter @rove/engine lab:run` for the matching headless protection check. The three local payment channels are deterministic. With the funded Tempo testnet configuration, `pnpm --filter @rove/engine lab:run --live` separately runs three real channel workflows; see [charging storage and local checks](docs/charging-storage.md) before submitting testnet transactions.

## Documentation

The public integration manual runs independently of PostgreSQL, the engine, wallets, and RPC access:

```sh
pnpm dev:docs
```

Open [Rove Docs](http://localhost:3001/docs). The introduction links to EV roaming, protection, evidence, channel lifecycle, Lab, API, reasons, and final accounting. **Docs** and contextual guidance in the product open a new tab without changing the selected Lane/event.

Local development defaults to docs on port 3001 and the product on port 3000. For builds/deployment, explicitly set `NEXT_PUBLIC_DOCS_ORIGIN` for web and `NEXT_PUBLIC_APP_ORIGIN` for docs to their HTTP(S) origins, without paths, credentials, queries, or fragments. Local build example:

```sh
NEXT_PUBLIC_DOCS_ORIGIN=http://localhost:3001 NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000 pnpm build
```

The versioned public narrative lives in `apps/docs/content/docs`; repository integration guides retain runnable setup and proof details. See [documentation maintenance and checks](docs/documentation.md).

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @rove/engine probe:payment
pnpm --filter @rove/engine proof:payment
pnpm --filter @rove/engine proof:evidence accepted
pnpm --filter @rove/engine proof:evidence tampered
pnpm --filter @rove/engine proof:evidence wrong-meter
pnpm --filter @rove/engine proof:evidence wrong-session
pnpm --filter @rove/engine proof:evidence replay
pnpm --filter @rove/engine proof:evidence stale
pnpm --filter @rove/engine proof:evidence continuity
pnpm --filter @rove/engine proof:evidence energy-regression
```

Rejected evidence commands exit with status 1 and print a typed reason. The fixture is the published [SAFE e.V. transparency software example](https://github.com/SAFE-eV/transparenzsoftware/blob/main/XML_Format.md). The proof uses a historical injected clock. The external session identifier is supplied by the source container's `transactionId`; it is not a signed OCMF field. The verifier preserves the exact JSON payload bytes for signature verification and floors sub-Wh readings when exposing integer Wh.

The evidence proof uses the fixture's public key and matching profile settings by default. Set `EVIDENCE_*` variables to check a different configured key, meter, session, or freshness policy against the fixture. The example environment contains the published public key; it is not a secret.

The payment environment probe reads the RPC chain ID, asset decimals, and reserve voucher digest without a transaction. The payment proof requires a funded test payer and payee and submits real Moderato transactions. It halts on a pending or failed operation; inspect the emitted transaction reference before rerunning. See [integration notes](docs/integrations.md) for setup and a verified run.
