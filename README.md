# Rove

Rove checks the service and integration boundaries needed for trusted charging evidence and payment protection.

## Run locally

Use Node.js 22 and pnpm 11.19.0. From the repository root:

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

The saved Northstar Mobility ↔ Voltway digital-twin scenario includes a rejected meter reading, an exact protection pause, and recovery. The scenario builder is available below the launch controls. Use `pnpm --filter @rove/engine lab:run` for the matching headless protection check. The three local payment channels are deterministic. With the funded Tempo testnet configuration, `pnpm --filter @rove/engine lab:run --live` separately runs three real channel workflows; see [charging storage and local checks](docs/charging-storage.md) before submitting testnet transactions.

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
