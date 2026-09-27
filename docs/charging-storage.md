# Charging storage and local checks

Rove stores each charging Corridor, Lane, verification, protection decision, and requested effect in PostgreSQL. The web page reads a safe projection from the engine. It does not calculate protection values.

## Prepare the services

Set `DATABASE_URL` to a local PostgreSQL database and set the same random `DEMO_SESSION_TOKEN` in both the engine and web processes. The token must be at least 48 hexadecimal characters. Keep it in your shell or ignored `.env` file; never commit it. Then run:

```sh
pnpm install
pnpm --filter @rove/persistence db:migrate
pnpm dev:engine
```

Start `pnpm dev:web` in another terminal. Open `http://localhost:3000`, enter the local access key in **Integration status**, and select **Open status**. The charging area uses the same restricted session. Without it, reads return an access denial.

## Create and inspect a local session

For a controlled, labeled local example:

```sh
pnpm --filter @rove/engine simulate:charging seed
```

The command prints a Corridor ID, Lane ID, and stored `INITIALIZING` projection. Open `http://localhost:3000/?lane=<lane-id>` using the printed Lane ID. No funding or meter total is invented: confirmed funding is unknown and trusted value is the known initial cumulative zero. Refresh or restart the services to check persistence.

The engine also accepts controlled `POST /api/corridors`, `POST /api/lanes`, `GET /api/corridors/:id`, and `GET /api/lanes/:id` requests on port 4100. Send `Authorization: Bearer $DEMO_SESSION_TOKEN`; the engine must be in local development mode. Creation bodies use the schemas in `packages/contracts/src/charging.ts`. A Corridor needs explicit parties, asset, network, integer tariff/precision, ordered protection thresholds, reserve/settlement policy, and an allowed meter public key. A Lane needs that Corridor ID, unique external session ID, charger/meter IDs, positive max power in watts, and proof interval in milliseconds. Both creations require a unique `commandId` and a `correlationId`. An identical command retry returns the original outcome; a reused key with changed content is rejected.

For a local signed-evidence and confirmed-payment **simulation**:

```sh
pnpm --filter @rove/engine simulate:charging
```

This command generates an ephemeral meter key, verifies its signed OCMF reading, injects a deterministic fake confirmed payment observation, and advances the clock exactly to the exposure limit. Its payment observation is a test adapter, not a Tempo receipt. The printed Lane should be `PAUSE_REQUIRED` with `RISK_WINDOW_EXHAUSTED`, a 100 base-unit unprotected exposure bound, and a durable pause request. Open `/?lane=<lane-id>` with its new ID. The real Tempo proof remains the separate payment command documented in [integration notes](integrations.md).

To inspect command conflicts, send `POST /api/lanes/:id/commands` with `commandId`, `correlationId`, `laneId`, `expectedVersion`, and a validated `payload` such as `{ "type": "TickProtectionClock" }`. Repeating the same command returns the same version. Changing its payload with the same key returns 409; an old `expectedVersion` returns 409 with the current version. External payment observations cannot be supplied through this HTTP command path.

The local test suite exercises signed evidence, rejected identity binding, stale versions, concurrent Lane writes, and atomic rollback against PostgreSQL when `DATABASE_URL` is set:

```sh
pnpm --filter @rove/persistence test
pnpm typecheck
pnpm test
```

The browser shows an unavailable message if the engine or database read fails. Restore the service and select **Check again**. A historical chain snapshot is labeled as needing a fresh check; it does not grant new payment protection.
