# Refund-confirmed automatic supplier purchasing

A purchase route reviews two or three distinct suppliers for one skill and identical input. Each attempt freezes its provider-signed price, identity/payee and deterministic order UUID. The owner starts the reviewed plan under an existing bounded Vault session. The runtime then purchases the next approved service only after it verifies the previous attempt's terminal refund or proves that the previous transfer was never sent. It never redirects an existing escrow to another payee.

## Review, authorization and reservations

`POST /api/purchase-routes` supports `prepare`, `create`, `sync`, `resume` and `cancel`. Owner authentication, same-origin checks, strict schemas and a 64 KiB request bound apply. GET lists only the caller's workspace routes. A consumer credential cannot create or change a route; the existing scoped consumer may advance already-authorized route jobs.

Prepare accepts a route request UUID, title, buyer, Vault session ID, fixed input, gross token budget, execution timeout and two or three `(agentId, supplierId)` candidates. It verifies actual registry identities/delegations and obtains signed offers without writing a workspace order, reservation or queue job. Providers may retain their quote journals. The SDK independently verifies scope, input, configured deployment, registry delegation, payer, candidate set and priority/price order. A failed candidate is not replaced by a new provider.

Two strategies are supported: preserve the owner's reviewed priority, or order the approved offers by signed price. Every service must declare the same authorized skill and accept exactly the same normalized input. Custom bounded transfer-analysis definitions are supported through the existing skill contract. This is supplier fallback for one purchase, not dynamic goal decomposition or a supplier-backed multi-step workflow.

The sum of **all** reviewed service fees must fit the route's gross budget and remaining signed Vault allowance before the first order is committed. Every candidate payee must be in the signed session; per-task, workspace daily and canonical onchain daily limits also apply. Future attempts reserve quote allowance, workspace budget and order slots alongside future workflow steps. Refunds do not replenish the Vault session's gross allowance or the contract's daily spending. Completing, exhausting or cancelling the route releases uncreated attempts; it does not erase funded spending. Token service-fee budgets do not promise a bound on external transaction gas charges.

There are at most 100 retained routes and 300 orders per workspace, including reserved future slots. No schema migration or database reset is required: route state is an optional workspace field and the queue's existing text kind column accepts the new `purchase` job kind.

## Refund and funding gates

Each child is a new immutable supplier order. The route UUID, workspace scope and candidate identity derive its stable request UUID, so quote/creation retries cannot create another principal transfer or silently reprice an attempt. Route creation and the first order/job publication share the existing D1 CAS transaction. A separate durable route job spans the gap after one refund and before the next order; immutable evidence published before a failed CAS is retried under the same ID and bytes.

Before a new child is created, the runtime checks the previous order's actual settlement receipt, parties, amount, specification and currently canonical block. On public configurations it also waits for the configured chain's finalized checkpoint to cover the refund. It rechecks the finalized header and refund block hashes and retains the finality anchor in the route proof. An RPC failure or an unfinalized refund leaves the route waiting; it is not evidence that funds returned. Public waits back off for a minute, while local fixtures use their latest canonical block.

A cancelled unfunded child can be skipped only after a coherent chain read shows no escrow and either no funding intent exists or the original intent deadline has passed. A lost broadcast response or an unexpired funding lease cannot authorize another purchase. Every previous refund/unsent proof is checked again before a later child can claim a funding intent, including recovery after an evidence-publication crash. Already-mined funding is reconciled separately so revocation does not cause a duplicate transfer.

Supplier identity/delegation is rechecked before funding, both for the default payee and other payees. The wallet SDK refuses a new supplier transfer after registry authority is revoked; the Vault executor also rechecks authority before sending. Execution retains its existing authority checks and independent full-output verification. A rejected signed result can therefore refund one provider and allow the next approved provider to be purchased without another owner session signature.

These route, session-total and quote checks are enforced by the authenticated application. The existing contracts independently enforce their per-task/daily/expiry/payee controls and frozen per-order escrow terms; they do not verify the whole route graph or quote signatures. RPC observations and transaction inclusion are not one atomic operation. This does not claim an independent light-client proof, continuous monitoring of terminal-order reorgs, production nonce coordination, or public DON execution.

## Recovery and stopping

- `running`: the current attempt is progressing or a prior refund awaits finality. An outage alone cannot trigger concurrent backup funding.
- `completed`: a paid, independently verified accepted result ends the route; unused alternatives are released.
- `exhausted`: all approved attempts ended without a paid accepted result. No new supplier is invented.
- `blocked`: a later attempt no longer meets its frozen quote, configuration, policy, session or evidence requirements. The owner can resume the same reviewed terms or cancel; an expired grant/quote may require a new reviewed route. No hidden re-grant or repricing occurs.
- `cancelled`: no further attempts may start. Unsent drafts stop; in-flight or funded escrows retain their existing recovery/refund rules. A previously committed settlement authorization is not retroactively rewritten.

Both inline continuation and the owner/runtime consumer use the same controller. The consumer's existing lease, retry/backoff, dead-job recovery and owner isolation apply. Closing the browser does not remove the durable job. External hosted supervision remains deferred under the user's local-demo decision.

## UI, SDK and acceptance

The bilingual wallet panel provides priority/price strategy, two/three candidate selectors, fixed fixture/custom/USDC input, signed-offer review, gross cost and recipient display, persisted drafts, start/recover/resume/cancel controls and per-attempt order/refund links. Asynchronous session options restore the explicitly selected session. The SDK is `sdk/purchase-routes.ts`; comparison and starting a route do not request another personal signature beyond the existing Vault setup/session grant.

- `tests/purchase-route-policy.test.mjs`: gross budget, signatures, mixed skills, provider uniqueness, reservation/capacity/cancellation, price ordering, immutable replay and expired next-offer refusal.
- `tests/purchase-routes.test.mjs`: actual local ERC-8004, SQLite CAS/queue and EVM transactions with independent signed provider fixtures. It checks delayed finality and changed anchors, a crash after immutable publication, concurrent recovery and stale leases, refund rechecks before funding, canonical transaction order, single principal transfers, gross onchain spending, pre-funding delegation revocation and exhausted providers. The public finality branch is tested with controlled finalized-header reads over a local EVM; it is not Sepolia acceptance.
- `tests/orders.test.mjs`: the controlled supplier settlement fixture now registers a real identity/delegation. Default-payee authority revocation refuses SDK funding without a token transfer or `Opened` event; the original funded-result/final-authority recovery checks remain.
- `npm run demo:purchase-routes`: real HTTP/D1/SDK/durable queue, two independent provider processes/signers/payees and local Vault/EVM. Seven groups cover read-only review and lost creation response, wrong-delivery refund then automatic purchase, outage/timeout, cheapest-first release, all-failed stopping, expired-price refusal, cancellation and revocation. The final drain checks that no pending/leased/dead jobs remain in that test workspace.
- The added Chromium case grants one session, reviews both offers, reloads, loses the committed create response, retries the same route UUID, and automatically refunds the first provider before paying the second. It checks session/offer draft restoration, Chinese/English and mobile width.

The complete local sequence now includes this feature and has 28 stages. Older 27-stage evidence does not establish a pass for this version. Real Sepolia wallet/contracts, registered CRE/DON/forwarder receipts, an open supplier market and external hosted operation remain separate unfinished gates. No Site or hosted schedule is published by this increment.
