# Verified release recordings

`tempo-three-lane.json` is the immutable boundary recording for run `bd7f748d-7580-405e-b667-861249987536`, verified on Tempo Moderato (chain 42431) on 2026-10-04. Import it with `pnpm deploy:seed boundary` after migrations. The default `pnpm deploy:seed` imports `tempo-rolling-protection.json`, the presentation recording with 5.796 PathUSD settled and all three channels closed. Run both commands to make both saved examples visible. The command checks the artifact checksum and contracts; it submits no transactions. The engine is not required to execute another run to populate a new release database.

Charging equipment is a digital twin. Signed meter inputs pass through the normal verifier, including Lane C's invalid signature, exact protection limit, and valid recovery. Payments below are actual testnet transactions in pathUSD, using six decimal places. Funding was 1,800 base units; final settled value was 550; confirmed refunds total 1,250. Fee reservations were separate from channel funding.

| Lane | Funded | Final settled | Confirmed refund | Close receipt                                                                                                      |
| ---- | -----: | ------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------ |
| A    |    500 |            28 |              472 | [Confirmed close](https://explore.tempo.xyz/tx/0xfc1bcb4184338c28a8e1588f3d0b8a40ced34ed283a34910a60201539cbc5843) |
| B    |    500 |           180 |              320 | [Confirmed close](https://explore.tempo.xyz/tx/0x290d55ed4b0acb65e27c2e05c3bca8e19f14d971b6cde3aa3afaa78d5f9ec6e7) |
| C    |    800 |           342 |              458 | [Confirmed close](https://explore.tempo.xyz/tx/0x2383ecb422a4ecd1180c18f9c82a03db7c4ab777180ad9314dd1baf2cb2eef62) |

Lane C's [300-unit top-up](https://explore.tempo.xyz/tx/0x1106461c5c1cf902ed593dd911af447536369dfc66c9fab99b2600d2cfdfe029) and [324-unit partial settlement](https://explore.tempo.xyz/tx/0x884bf6b8568c4beb4dba4a7170d6d3dd81b88de15cd2a0126997e036d06413c6) precede final reconciliation and closure. Lane B also partially settled 144 units. All three final accounting comparisons match, with receipts proving unused reserve recovery.

The generated JSON is compact and excluded from automatic reformatting because `release-seed.ts` checks its exact SHA-256 bytes. It includes nine logical trace positions and 132 causal Inspector records. Receipt wall-clock timestamps remain distinct from logical scenario positions. It contains no signing keys, engine credential, invite code, or session identifier. Replacing the artifact requires repeating verification and updating its checksum deliberately.
