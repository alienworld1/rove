# Rove

Rove is an EV-roaming credit protection engine that connects signed charging-meter evidence to funded payment channels. It tracks how much service has been delivered, how much is covered by valid payment authorization, and when the remaining exposure requires charging to pause.

Each charging session has its own channel and exposure limit. Funding can grow through rolling top-ups as service progresses, with partial settlement during charging and final reconciliation before channel closure. The workspace shows evidence, payment operations, protection decisions, and accounting together so operators can inspect what supports each value.

Run the local scenario below to explore the mechanism without wallet keys or testnet funds. For integration work, the repository also includes a Tempo testnet adapter and a separate documentation application.

## Run locally

Requirements: Node.js 22, pnpm 11.19.0, and a running PostgreSQL database.

```sh
pnpm install --frozen-lockfile
```

Create a database named `rove`, or use an existing development database. Create an ignored `.env` in the repository root with the following settings, adjusting the connection URL for your PostgreSQL installation:

```dotenv
NODE_ENV=development
ACCESS_MODE=local
DATABASE_URL=postgres://localhost:5432/rove
ENGINE_ORIGIN=http://127.0.0.1:4100
ENGINE_HOST=127.0.0.1
ENGINE_PORT=4100
DEMO_SESSION_TOKEN=<random-hex-access-key>
NEXT_PUBLIC_DOCS_ORIGIN=http://localhost:3001
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
```

Replace the access-key placeholder with a random hexadecimal value of at least 48 characters. Generate one with:

```sh
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

The engine and migration command read their process environment; they do not automatically load the root `.env`. In a Bash terminal at the repository root:

```sh
set -a
. ./.env
set +a
pnpm --filter @rove/persistence db:migrate
pnpm dev:engine
```

In a second terminal, load the same settings and start the web application:

```sh
set -a
. ./.env
set +a
pnpm dev:web
```

Open [localhost:3000](http://localhost:3000), enter the access key, and start the Northstar Mobility ↔ Voltway scenario. The engine seeds this scenario at startup. It runs three digital-twin charging sessions with signed meter inputs and deterministic local payment channels. One session rejects a corrupted reading, reaches its exposure limit, and recovers after valid evidence and payment checks; the others progress independently.

The Lab lets you edit readings, fault intervals, tariffs, reserve policy, and final accounting, then save and run a validated scenario. Recorded traces support event inspection and replay. Replaying a recording does not submit payments.

For the repeatable headless local check, use a terminal with the same environment:

```sh
pnpm --filter @rove/engine lab:run
```

The complete [environment example](.env.example) includes additional evidence, Tempo, accounting, and hosted settings. Use the minimal configuration above for local development; leave unused hosted credentials unset rather than exporting empty values.

## How protection works

A **Corridor** describes the relationship between an e-mobility service provider and a charging point operator: their settlement asset, fixed energy tariff, allowed meter identities, and protection policy. Each **Lane** is one charging session with an independent payment channel.

The engine verifies OCMF signatures over the original payload bytes using P-256 and SHA-256. It also checks meter identity, transport-supplied session binding, sequence continuity, timestamps, and nondecreasing energy. Accepted readings become integer Wh and billable value. Rejected readings cannot advance trusted value.

Cumulative payment vouchers must be supported by both accepted service and confirmed channel funding. Protected value is the lesser of trusted delivered value and verified authorization. Settlement is tracked separately: a signed voucher is not a settled payment, and a submitted transaction is not confirmed funding.

When evidence becomes stale or untrusted, the engine bounds possible additional service using maximum charger power, elapsed time, and tariff. The resulting unprotected exposure is:

```text
max(0, trusted delivered value + unverified service bound - protected value)
```

Reaching the configured maximum, including equality, produces `PAUSE_REQUIRED`. Recovery requires fresh evidence, current payment state, available signing, and valid protection invariants. Rove emits the pause requirement; a charging-management system must enforce it on physical equipment. The Lab enforces it within its digital twin.

Completion verifies final meter evidence and an immutable charge detail record (CDR), then compares energy, accounting value, authorization, and settlement. Matching totals permit closure; mismatches remain unresolved. Tempo closure requires a matching channel-close receipt and attributed reserve refund.

## Runtime and source layout

The Node.js engine owns verification, protection decisions, and financial effects. PostgreSQL stores versioned session state, evidence, events, idempotent command results, and a transactional outbox. The worker submits and reconciles external operations after the state transaction commits. Startup recovery checks uncertain payment work before allowing further financial movement.

The Next.js web application sends allowed commands through server-side proxies and displays sanitized engine projections. Server-sent events trigger authoritative refreshes. The browser does not calculate exposure or authorize payment amounts.

| Location                                                                                                         | Responsibility                                              |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`apps/engine`](apps/engine)                                                                                     | HTTP API, scenario execution, payment worker, and recovery  |
| [`apps/web`](apps/web)                                                                                           | Corridor workspace, Lab editor, and published-run viewer    |
| [`apps/docs`](apps/docs)                                                                                         | Public integration manual and searchable API reference      |
| [`packages/evidence`](packages/evidence), [`packages/protection`](packages/protection)                           | Meter verification and deterministic protection transitions |
| [`packages/tempo`](packages/tempo), [`packages/ocpi`](packages/ocpi)                                             | Payment-channel adapter and final accounting validation     |
| [`packages/persistence`](packages/persistence)                                                                   | PostgreSQL schema, Drizzle migrations, and durable stores   |
| [`packages/contracts`](packages/contracts), [`packages/domain`](packages/domain), [`packages/lab`](packages/lab) | Shared schemas, domain types, and scenario compilation      |

`packages/contracts` contains TypeScript API schemas. Tempo calls use the TIP-1034 channel-reserve precompile ABI in [`packages/tempo/src/protocol.ts`](packages/tempo/src/protocol.ts); this repository does not deploy a custom Solidity contract.

## Tempo and hosted operation

The live path uses Tempo Moderato testnet. Configure the `TEMPO_*` settings in [.env.example](.env.example) with funded test-only payer, payee, and voucher-signing accounts, following the [integration guide](docs/integrations.md). Load those settings into your shell before running:

```sh
pnpm --filter @rove/engine probe:payment
pnpm --filter @rove/engine lab:run --live
```

The probe reads network configuration without sending transactions. The live run creates three channels and submits funding, top-ups, and partial settlements; it leaves the channels open. Follow [session completion](docs/session-completion.md) to reconcile, close, and verify returned reserve. Check existing transaction and channel state before retrying uncertain work.

Hosted mode provides public analysis of explicitly published recordings and invite-based private workspaces for testnet execution. Invitations, ownership, run allowances, and funding and fee budgets persist in PostgreSQL. Public snapshots can be read through the Supabase Data API independently of the engine. Playback never starts financial work.

See [hosted deployment](docs/hosted-deployment.md) for per-service configuration, database initialization, invitation management, and publication. The deployment includes separate Vercel web and docs applications and one persistent engine service. `ACCESS_MODE=hosted` must be configured explicitly; a production build does not enable hosted access.

## Documentation and checks

Run the public manual independently of the engine, database, and wallets:

```sh
pnpm dev:docs
```

Open [localhost:3001/docs](http://localhost:3001/docs) for protection calculations, trust boundaries, scenario formats, API endpoints, and integration details. Repository guides cover [controlled charging sessions](docs/charging-storage.md) and [documentation maintenance](docs/documentation.md).

From a shell with the local configuration loaded:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use an isolated, migrated database for tests. Database-dependent suites skip when `DATABASE_URL` is absent; hosted persistence and access-control suites additionally require `HOSTED_TEST_DATABASE_URL`. Both public application origins must be set for builds.

## Current scope

Rove implements a controlled charging and testnet environment. It supports one OCMF cryptographic profile and fixed energy tariffs. The accounting adapter accepts energy-only, tax-free records with explicit currency-to-asset equivalence; it does not perform currency conversion or implement the full OCPI protocol.

Digital-twin readings establish reproducible scenarios, not production charger telemetry. Connecting physical equipment requires authenticated meter transport, trusted key provisioning, and external pause enforcement. The supplied access flows are not an enterprise identity or partner-authorization system.
