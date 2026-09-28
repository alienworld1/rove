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

For a local signed-evidence and payment **simulation**:

```sh
pnpm --filter @rove/engine simulate:charging
```

This command generates an ephemeral meter key, verifies cumulative signed OCMF readings, injects labeled local payment observations, rejects a corrupted signature, checks one unit before and at the exposure limit, then accepts a continuity-valid recovery reading. It prints the paused and recovered states. Its payment source is local simulation, not a Tempo receipt. Open `/?lane=<lane-id>` with its new ID. The real Tempo proof remains the separate payment command documented in [integration notes](integrations.md).

## Run one controlled live charging session

Configure `DATABASE_URL`, `DEMO_SESSION_TOKEN`, the Tempo RPC, asset, and funded payer/payee/voucher-signer test settings, and the allowed meter public key in ignored environment settings. Use an external meter source capable of producing signed OCMF records for that key. Change the external session ID in [the example configuration](charging-session.example.json), then run:

```sh
pnpm --filter @rove/persistence db:migrate
pnpm --filter @rove/engine start:charging "$PWD/docs/charging-session.example.json"
```

The command prints the Corridor and Lane IDs. It creates one persisted `INITIALIZING` Lane and queues initial funding; the running engine submits and reconciles the channel. The example values are illustrative test settings. Match `EVIDENCE_METER_ID` and `EVIDENCE_PUBLIC_KEY_HEX` to the signed record source. Set `EVIDENCE_SESSION_ID` to the new external session ID; the session ID in each record's transport binding must match it. Keep the funded test keys in ignored local secret storage.

If the signed readings come from a local controlled fixture, set `"meterSource": "controlled-fixture"` at the top level of the session JSON. The Lane then identifies that meter input in the UI while Tempo transaction status remains sourced from the network.

Open `/?lane=<lane-id>` after entering the local access key. `Check again` only refreshes the projection. The causal history shows sanitized evidence, voucher, channel, and transaction references. The confirmed deposit and settlement values change only after the engine reads their chain state.

To submit a signed record saved as raw OCMF text, or advance the controlled clock for a boundary check:

```sh
pnpm --filter @rove/engine control:charging <lane-id> evidence <signed-record-path>
pnpm --filter @rove/engine control:charging <lane-id> tick 2026-09-28T12:00:00.000Z
```

Use the next signed sequence value after the last accepted record. For a corrupted-signature check, submit a copy with a changed signature, then submit the original valid record at the expected sequence for recovery. The tick timestamp is an injected test clock and should be used only in the controlled development session. The engine also ticks active Lanes using its wall clock. The example settlement policy queues a partial settlement when enough protected value is available; no client amount is accepted.

To inspect command conflicts, send `POST /api/lanes/:id/evidence` with `commandId`, `correlationId`, `laneId`, `expectedVersion`, and an `ObserveEvidence` payload containing the raw signed record and transport session ID. Repeating the same command returns the same version. Changing its payload with the same key returns 409; an old `expectedVersion` returns 409 with the current version. External payment observations cannot be supplied through the HTTP command path.

The local test suite exercises signed evidence, rejected identity binding, stale versions, concurrent Lane writes, and atomic rollback against PostgreSQL when `DATABASE_URL` is set:

```sh
pnpm --filter @rove/persistence test
pnpm typecheck
pnpm test
```

The browser shows an unavailable message if the engine or database read fails. Restore the service and select **Check again**. A historical chain snapshot is labeled as needing a fresh check; it does not grant new payment protection.
