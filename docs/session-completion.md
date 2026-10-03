# Finish a charging session

Focus a Lane in the Corridor after its controlled service trace has stopped. Choose **Finish session** and confirm. Rove verifies a final signed reading, retains an immutable accounting fixture, authorizes any remaining accepted service value, and settles the final cumulative amount. **Close channel** becomes available after all four totals and both energies match and earlier payment work is resolved. The channel remains visible after closure and refresh.

**Check again** checks existing work. Pending transactions continue after navigation. Differences remain visible and cannot be corrected by changing the accounting record or forcing a match.

## Accounting settings

Set these server environment variables alongside the existing Tempo settings:

```sh
CDR_CURRENCY=USD
CDR_SETTLEMENT_ASSET_ID=0x20C0000000000000000000000000000000000000
CDR_SOURCE_PARTY_ID=controlled-cpo
```

This explicitly declares USD accounting with direct base-unit equivalence to the configured pathUSD test asset. It does not perform currency conversion. `CDR_SOURCE_PARTY_ID` is the authenticated source identity for this controlled fixture; it is not an OCPI partner credential or a counterparty display name. For the built-in local deterministic payment scenario, use `CDR_SETTLEMENT_ASSET_ID=TEST_ASSET` instead. Restart the engine after changing settings.

Apply migrations with `pnpm --filter @rove/persistence db:migrate`, then start `pnpm dev:engine` and `pnpm dev:web` with the same controlled-session access key. Database readiness and payment recovery are separate: a Lane with unavailable payment state remains blocked until its authoritative state can be checked.

## Supported accounting input

The narrow input follows the [OCPI 2.3.0 CDR definition](https://github.com/ocpi/ocpi/blob/2.3.0/release/core/mod_cdrs.asciidoc): concluded-session energy is expressed in kWh, costs declare their currency, and accepted records are immutable. This input is a controlled adapter fixture, not full OCPI protocol conformance.

```json
{
  "externalCdrId": "record-123",
  "externalSessionId": "session-123",
  "sourcePartyId": "controlled-cpo",
  "meterId": "meter-123",
  "chargerId": "charger-123",
  "startedAt": "2026-10-03T12:00:00Z",
  "endedAt": "2026-10-03T12:01:00Z",
  "currency": "USD",
  "totalEnergyKwh": "1.000",
  "totalCost": "0.500000",
  "tariffBasis": {
    "perKwh": "500000",
    "tariffDecimals": 6,
    "assetDecimals": 6
  },
  "chargeType": "energy_only_tax_free"
}
```

Session, meter, charger, party, times, currency, asset, and tariff must agree with authenticated session context. Energy and money must be decimal strings. Numeric JSON decimals, sub-Wh energy, unsupported fractional asset units, tax, parking, time, fixed charges, and extra fields are rejected. Original source text and decimal spelling are retained. Delivery with the same provider ID and identical content is harmless; changed content conflicts.

The controlled browser accepts only `commandId`, `correlationId`, `laneId`, and `expectedVersion` for finish, check, and close. Financial amounts, end readings, and accounting input come from server adapters. Authenticated engine ingestion also accepts service-end context at `/api/lanes/:id/end`, explicitly final evidence through the existing evidence endpoint, and narrow records at `/api/lanes/:id/cdr`; these use the shared Lane command envelope. They are not proxied as browser financial inputs.

## Verify Tempo closure

Run `pnpm --filter @rove/engine probe:payment`, then `pnpm --filter @rove/engine lab:run --live`. Once that run completes, use its printed run ID:

```sh
pnpm --filter @rove/engine proof:completion <run-id>
```

These commands use funded testnet accounts, create real channels, and settle and close all three sessions. The completion proof restarts persistence after close submission, discovers the same receipt, and checks the attributed returned reserve. It prints only safe operation and evidence references. Rerunning against the same run inspects its existing completion work.

For dedicated zero-service and zero-refund fixtures, run `pnpm --filter @rove/engine proof:terminal`. This creates two additional testnet channels, uses the configured proof deposit for zero service and 500000 base units for the 1000 Wh fixture, and deliberately discards only its own submission reference before discovering the canonical close receipt.

The adapter uses the repository's [TIP-1034 precompile ABI](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1034.md) and the [Tempo Session draft](https://paymentauth.org/draft-tempo-session-00.html). A canonical `ChannelClosed` receipt, matching descriptor and capture amounts, exact expected refund, and cleared storage establish closure; zero storage or an aggregate wallet balance alone does not. Historical cumulative settlement is retained separately from cleared live escrow.
