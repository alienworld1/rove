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

Open `http://localhost:3000`. The page checks the web route and the engine at `http://127.0.0.1:4100`. Stop the engine and select **Check again** to see the unavailable state. Restart it and retry to see recovery.

Copy `.env.example` to an ignored `.env` file for local settings. The engine reads settings from its process environment; shell values may be loaded with `set -a; . ./.env; set +a` before starting it. The web process needs the same `ENGINE_ORIGIN` and `DEMO_SESSION_TOKEN` values. Generate a random hexadecimal token of at least 48 characters for the local integration status view. The token is entered in that view and kept in an HTTP-only cookie.

Basic readiness requires PostgreSQL but no payer key. Run `pnpm --filter @rove/persistence db:migrate` after setting `DATABASE_URL`. The integration status view reports only whether the proof settings are configured. A ready page confirms service response, not a verified channel or meter record. See [charging storage and local checks](docs/charging-storage.md) for the controlled live session path and the clearly labeled local simulation.

In the controlled local session, **Corridor Lab** runs the saved Northstar Mobility ↔ Voltway digital-twin scenario. Use `pnpm --filter @rove/engine lab:run` for the matching headless protection check. The three local payment channels are deterministic; they do not stand in for a live Tempo acceptance run.

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
