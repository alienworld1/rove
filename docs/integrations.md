# Integration evidence

The maintained manual explains [meter evidence](http://localhost:3001/docs/integrate/meter-evidence) and [channel lifecycle](http://localhost:3001/docs/integrate/tempo/channel-lifecycle). Start it with `pnpm dev:docs`; see [docs setup](documentation.md). This guide retains runnable setup and proof pointers.

## Signed meter source

The fixture in `packages/evidence/fixtures/safe-ocmf-example.json` copies the OCMF payload and public key from [SAFE e.V.'s published transparency software example](https://github.com/SAFE-eV/transparenzsoftware/blob/main/XML_Format.md). The sample contains two signed readings from source serial `17619300`, signed pagination `T32`, and a source-container `transactionId` of `29`. OCMF signs its data section as original bytes; the record's `SD` field is a DER ECDSA signature verified with P-256 and SHA-256. The selected key is a source example key, not a production trust root.

The source timestamp is historical, so local proof uses an injected time near the recorded reading. A production transport must supply authenticated session binding, source key selection, and its actual freshness policy. This fixture cannot establish live charger cadence.

## Tempo source and test environment

The [Tempo repository](https://github.com/tempoxyz/tempo#as-a-user) identifies Moderato testnet, chain ID `42431`, RPC `https://rpc.moderato.tempo.xyz`, and its explorer. [TIP-1007](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1007.md) identifies the pathUSD token address used in the environment example. [TIP-1034](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1034.md) specifies the channel reserve precompile at `0x4D50500000000000000000000000000000000000`, cumulative EIP-712 vouchers, partial settlement, top-up, request-close, close, and withdraw. Its [reference interface](https://github.com/tempoxyz/tempo/blob/main/tips/verify/src/interfaces/ITIP20ChannelReserve.sol) defines the exact calls and events. The [Tempo Session draft](https://paymentauth.org/draft-tempo-session-00.html) and [MPPx Session design](https://github.com/wevm/mppx/blob/main/src/tempo/session/README.md) describe the client and server authority split. These sources were inspected on 2026-09-27.

The read-only payment probe returned chain ID `42431`, pathUSD decimals `6`, and a reserve voucher digest matching local EIP-712 on 2026-09-27.

The funded proof used fresh test-only accounts and verified channel `0x35bbba2e3691786bbb3d74266f7e323fbb2c4da3933f386a528e11ef7e4fefcd`:

| Step               | Confirmed reference                                                                                            | Chain observation                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Open and fund      | [Transaction](https://explore.tempo.xyz/tx/0x9d515230429d07fd85cc1aea8eaa4a95c7fa109ac754b4f70c3021dc3b46a90d) | Deposit 1,000,000 base units                                                                 |
| First voucher      | Digest `0x830a398bdb07c698512c56c9a60284786789a49a5e9152c695c7623142212498`                                    | Cumulative 100,000 base units, signed and matched on-chain digest                            |
| Higher voucher     | Digest `0x3619ca535bdac2f6275b7dd7f3fed51524951b2ceb91f33a209f5dd55e4d3e9d`                                    | Cumulative 200,000 base units, signed and matched on-chain digest                            |
| Top up             | [Transaction](https://explore.tempo.xyz/tx/0x277b693bc83211a7f2ea4189c48d311855ef78d3ac45b64f99d960a54a54f966) | Deposit increased to 1,500,000                                                               |
| Partial settlement | [Transaction](https://explore.tempo.xyz/tx/0x94843b045b1cdc0759cd25b75ce8e5bd49eec96aabce4bf2fe0877f90395cd0b) | Settled 200,000; reserve 1,300,000                                                           |
| Cooperative close  | [Transaction](https://explore.tempo.xyz/tx/0xb2398023e63e207b33383e2e1e90946cca7f754ac78a13059520da41aa2693a0) | `ChannelClosed` refunded 1,300,000; payer balance rose by that amount; channel state cleared |

The proof prints `submitted`, `pending`, `confirmed`, and `failed` separately. A pending transaction stops dependent operations. Inspect the transaction and channel state before rerunning an uncertain open or top-up.

## Reproduce the live proof

Copy `.env.example` into an ignored local file and set the payer, payee, and voucher signer addresses and private keys. Use three fresh test-only accounts. The address fields must match their signer keys. Fund the payer and payee with the [Moderato faucet](https://github.com/tempoxyz/tempo#as-a-user); the repository also documents `tempo_fundAddress` for the test RPC. The payer needs the configured deposit and top-up plus fee reserve; the payee needs transaction fees. Do not use production keys or funds.

`TEMPO_RPC_URL`, `TEMPO_CHAIN_ID`, `TEMPO_ASSET_ADDRESS`, `TEMPO_ASSET_DECIMALS`, and `TEMPO_SESSION_BACKEND` select Moderato, pathUSD, and the precompile shown above. `TEMPO_INITIAL_DEPOSIT`, `TEMPO_TOP_UP_AMOUNT`, `TEMPO_FIRST_VOUCHER_AMOUNT`, and `TEMPO_SECOND_VOUCHER_AMOUNT` are decimal integer base units. The provided values reserve 1.5 pathUSD and settle 0.2. Source the ignored file into the engine terminal, run `pnpm --filter @rove/engine probe:payment`, then `pnpm --filter @rove/engine proof:payment`.

Keep signer keys in ignored local secret storage. The sample evidence public key is in the versioned fixture; use the matching configured key when running against that profile.
