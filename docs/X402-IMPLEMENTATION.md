# Local x402 implementation and acceptance

Scope: local HTTP, test-token EVM transactions, Vault escrow, independent delivery acceptance and refunds. No public deployment, real-token purchase or DON execution.

## Increment 1 — protocol and test token

- Locked official `@x402/core`, `@x402/evm` and `@x402/extensions` at 2.28.0.
- Added a separate six-decimal EIP-3009 test token; existing deployments and their token remain unchanged.
- Added an independent reference report API, facilitator using the official EVM scheme, signed report envelopes and private durable SQLite journals.
- Two actual HTTP/EVM tests passed: 402/payment/report plus signature/input/payment verification and replay/conflict refusal; lost HTTP response followed by service restart returns the original result with one authorization transfer.
- `npm run contracts:compile` and website TypeScript passed. Protocol logs: `outputs/x402-validation-20261023/protocol-increment-1.log`.
- During implementation the protocol test exposed inconsistent address casing in advertised requirements; the server now advertises the same validated canonical requirements that it verifies.

At this checkpoint the existing Vault ordering runtime has not yet been connected to the x402 supplier. The complete x402 business demo remains outstanding.

## Increment 2 — supplier procurement budget and restart recovery

- Added a private SQLite procurement ledger shared across workspaces by wallet, network and asset; unresolved authorizations remain reserved across UTC day boundaries.
- A signing guard checks the actual EIP-712 intent. The SDK-generated nonce, unsigned intent and complete payment payload are persisted before submission; restart never invokes a fresh random authorization for the same purchase.
- Concurrent retries share one procurement. Canonical nonce/Transfer reconciliation records actual upstream cost independently of the user escrow ledger.
- Four protocol/procurement tests passed, including a simulated crash after durable signing followed by reopening the database, a real dropped HTTP response, parallel retries, one upstream transfer, changed-intent refusal and cross-workspace/cross-day budget contention.
- Evidence: `outputs/x402-validation-20261023/procurement-increment-2.log`. This checkpoint is the upstream procurement layer; Vault/owner runtime integration follows separately.

## Increment 3 — Vault, scoped authority and delivery acceptance

- Connected the x402 supplier to the existing order runner without changing ordinary supplier requests. Reviewed policy hash and input disclosure are part of the frozen order and wallet commitment.
- Short-lived hashed tickets bind the workspace, supplier request and current execution lease. The callback checks current policy, signed Vault session, registry delegation and funded escrow; rereads state after chain checks; and fixes one payment nonce/intent in a dedicated D1 table. No caller-selected owner or owner API credential is passed to the supplier.
- Signed upstream report and procurement receipts are stored separately from business artifacts, with independently checked canonical payment logs and workspace isolation.
- An isolated local stack uses the new EIP-3009 token and separate supplier procurement/facilitator/provider accounts. Existing runtime deployments stay unchanged.
- Nine focused tests passed, including existing supplier/Vault regression, three actual HTTP/EVM order flows, full-result recomputation rejection, full user-principal refund, one escrow/settlement per order, upstream cost borne by supplier, non-replenished gross Vault limits, policy revocation during a callback, expired/wrong-scope tickets, old leases and replacement nonce refusal.
- Evidence: `outputs/x402-validation-20261023/increment-3-regression.log`. Web/API demo and UI acceptance are the next increment.
