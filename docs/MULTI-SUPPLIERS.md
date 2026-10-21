# Multiple execution suppliers and independent payees

The runtime now supports a bounded directory of 1–8 operator-configured execution suppliers. Each order freezes one descriptor (provider ID, signer, revision, skills and configuration hash) and one registry identity. Execution and retries resolve that exact descriptor rather than the current default. Reordering the directory cannot redirect an existing order; a changed/missing descriptor never silently selects another provider.

This milestone implements the directory, explicit selection, independent ERC-8004 payment wallets, multi-payee Vault sessions and recovery of the originally selected supplier. **Automatic switching to another provider, provider-signed price offers and an open registration/discovery market remain subsequent work.** Prices in the current comparison are workspace service prices; they are not externally signed offers.

## Operator configuration

`AGENTOS_SUPPLIER_CONFIGURATIONS` is a JSON array of the existing supplier configuration objects. Each entry specifies its own ID, fixed HTTPS `/v1/execute` endpoint, name, revision, delivery signer, supported skills and timeout. Identifiers must be unique and the array is limited to eight. Development loopback endpoints remain restricted to the local profile. HTTP callers cannot register endpoints or pass endpoint URLs to an order.

`AGENTOS_SUPPLIER_API_KEYS` optionally contains an object mapping configured IDs to authentication strings. It is a secret, never returned by directory APIs or included in configuration hashes. Unknown IDs, empty/non-string values and excessive lengths fail configuration validation. Map lookups handle IDs such as `constructor` without reading inherited object properties.

The old single `AGENTOS_SUPPLIER_CONFIGURATION` and `AGENTOS_SUPPLIER_API_KEY` remain supported. In an array deployment the legacy key applies only to the first entry; use the per-provider secret map for other entries. Rotating an HTTP credential does not change the public descriptor. Endpoint/signer/revision changes do change the descriptor and require explicit registry reauthorization.

GET `/api/suppliers` returns the historical default `descriptor` plus `descriptors`. Responses include public descriptors only, never endpoint credentials. Development directory responses are bounded to 64 KiB, reject malformed JSON and do not follow redirects.

## Identity, selection and payment

1. Register an Agent service and bind its ERC-8004 identity with the registry owner's signature. The runtime reads the actual nonzero `getAgentWallet` address; it no longer substitutes or requires the deployment's default seller. Changes to owner, wallet, URI or the registration's canonical block invalidate the snapshot.
2. Select a configured supplier in Agents and authorize that exact descriptor through the existing registry metadata entry. A service currently delegates to one descriptor at a time. Two services can independently delegate to different suppliers.
3. In Wallet & escrow, choose `supplier` execution and an `Execution supplier`. The order API/SDK accepts an optional `supplierId`; omission retains default selection for new orders. An existing order's retry keeps its stored descriptor. Reusing its request ID with another provider is rejected.
4. The supplier order's payee is the frozen identity's wallet. Built-in orders retain the deployment default. The order card displays the payment recipient before funding. The buyer wallet SDK independently rechecks a non-default recipient's registry identity/delegation before signing a transfer.
5. Server funding inspection, supplier requests, supplier escrow checks, Vault execution and settlement verification all use that same payee. The reference suppliers check both their own configured wallet role and the funded escrow parties, amount, deadline, spec, registry identity and delegation.

The default deployment object is preserved, so token/escrow/forwarder/receiver/RPC matching is not relaxed. Order identity and supplier are already part of the frozen order commitment. An arbitrary client-supplied seller address is not accepted as a new order field.

AI comparison now enumerates the actually delegated supplier for each service and preserves its ID/configuration hash in the choice. Applying a suggestion selects that supplier explicitly. Comparison is advisory and creates no order or payment. Dynamic skill intent support and reputation-weighted routing remain separate work.

## Vault authorization

`AgentVaultClient.authorize` accepts optional `sellers`, and the UI offers `Additional permitted sellers`. The normalized set contains the default seller plus the explicit additional nonzero addresses, with at most eight total. The owner approves every selected address onchain, and the server returns the full set inside the signed workspace session. The SDK verifies that the challenge's set matches the owner's requested set before signing.

Historical sessions without a `sellers` field still permit only their original single seller. A new order to another provider is rejected before committing the order if its identity wallet is absent from the signed set. Funding rechecks the signed set and the contract whitelist. Revoking any member of the session's set invalidates that session for further funding; it does not rewrite already-funded escrows. Refunds still consume the session's gross quote allowance.

The contract's seller whitelist, per-task limit, daily limit and expiry are onchain controls. The session-specific seller subset, skill set and session total are application-enforced restrictions. This feature does not claim that the contract verifies the workspace session or protects against a compromised executor beyond its onchain grant.

## Local fixtures and verification

Fresh `npm run demo:isolated` launches two supplier processes with different persistent signing keys/journals and separate local provider wallets. The second port is the configured primary supplier port plus one; all four application/chain/supplier ports must be distinct. The new local `/seller2-rpc` role only signs identity challenges and identity-registry transactions, just like the first provider role. Both roles are local test wallets.

The primary local supplier publishes a bounded catalog of its own configuration plus operator-selected loopback peers. Peer configurations are captured when it starts, so an execution outage does not erase another provider's descriptor. Production array configuration does not require this local catalog service. `demo:start` and the browser test fixture also prepare both providers. Existing single-provider local environments remain usable for the original functionality; launch a fresh isolated environment to exercise the second wallet without resetting an old chain.

- `npm test`: directory/authentication/response bounds, exact routing, no accidental fallback, frozen comparison IDs, signed seller sets, independent registry wallets, plus all previous order/Vault/workflow tests.
- `npm run demo:multi-supplier`: real HTTP/D1/SDK/local-EVM execution with two identities/signers/payees; manual and Vault payments; unauthorized supplier/payee refusal; a one-provider outage while the other completes; original-provider recovery; single funding events; recipient balances; revocation and workspace isolation. Its JSON report is under `outputs/multi-supplier-demo-*.json`.
- `npm run test:browser`: provider directory, second provider wallet registration/delegation, persisted supplier selection, payment to the actual registry wallet, English/Chinese and mobile layout. The dedicated case requires a two-provider fixture; the standard test configuration supplies one.

The full demo now includes this check and has 25 ordered stages. Its setup records and, only on the local mock-token chain 31337, supplements the buyer to a 500-token fixture balance when needed; it does not reset the chain or workspace. This avoids failures caused solely by repeatedly consuming test tokens across prior runs. Set all service URLs to the same runtime, or run `npm run demo:full -- --runtime .sites-runtime/isolated-demo/current.json`. Existing reports with older sequences cannot be resumed as evidence of the new sequence.

A failed supplier execution currently retains its own checkpoint or follows that order's established refund rules. A future fallback must preserve the original escrow, confirm its terminal outcome and fit all attempts within an explicitly authorized budget before purchasing from a different provider. This document does not mark that routing controller as implemented. Public Sepolia, real browser-wallet and DON acceptance and hosted deployment remain independent gates.
