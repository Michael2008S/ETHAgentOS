# Supplier-signed purchase quotes

Every new supplier purchase through the order API now obtains and verifies a provider-signed quote. Built-in prices retain their existing behavior. Previously committed supplier orders without quotes retain their original commitments and recovery terms. New calls cannot opt out of quoting; SDK callers may either request a quote for review or let creation obtain one within their explicit budget.

## Quote before purchase

`POST /api/quotes` is an authenticated owner operation with same-origin checks, strict schema validation and a 64 KiB request limit. It accepts `requestId`, `agentId`, `supplierId`, `buyer`, optional input and optional `vaultSessionId`. A quote request creates no task, escrow, payment or runtime job. Input provenance and accepted-memory authority are checked before requesting an offer. The supplier receives input/verification commitments and public identity/payment context, not the input transfer records.

The SDK can request an offer and then commit exactly that offer:

```ts
const requestId = crypto.randomUUID();
const supplierQuote = await orders.quote({
  requestId, agentId, supplierId, input,
  // vaultSessionId, // required here too when funding from a Vault session
});
const order = await orders.create({
  requestId, agentId, supplierId, input,
  supplierQuote, executor: 'supplier', title, budget: 500,
});
```

`requestId` is the eventual order request ID. A quote for one ID cannot authorize another purchase. Quotes also bind workspace, human buyer, payer (buyer or Vault), chain, escrow, token, local service, skill, exact input hash, versioned verification hash, registry/agent ID, identity owner, payment wallet, registration-document hash and supplier ID/configuration hash. Addresses are normalized. The envelope is strict and contains a positive integer price in hundredths of the configured token unit, issue time, expiry and the authorized delivery signer's EIP-191 signature.

The signature message is `AgentOS supplier quote v1` followed by a newline and canonical payload JSON. The quote request idempotency key is `quote-` plus the Keccak-256 canonical request hash. Input hashes use the existing AgentOS SHA-256 input commitment; verification/quote hashes use the existing canonical Keccak-256 helpers. See `supplier-quote.ts` for the exact schema and encoding. The supplier signer is the EOA delegated by the registry owner, not the buyer wallet or the AI model.

## Price and validity

The reference supplier owns its pricing table (`AGENTOS_SUPPLIER_PRICES`) and quote lifetime (`AGENTOS_SUPPLIER_QUOTE_TTL`, default six hours, maximum 24 hours). Its default event-analysis prices are 240/200 hundredths for the first/second local provider; report/extension prices default to 360. Workspace service prices remain advisory catalog hints. A signed provider price can differ from that hint and becomes the order's frozen price. The actual signed price must fit the user's order budget, workspace policy, Vault per-task/daily limits and remaining session allowance.

The UI shows the signed amount, recipient, expiry and quote hash before committing a supplier purchase. Editing the draft invalidates the displayed quote; requesting another quote uses a new request ID. Draft persistence includes the public signed envelope, so a lost create response or page reload can reuse the same offer and order ID. No private keys are stored in the form.

The runtime validates issue/expiry against freshly observed chain time after receiving the response, avoiding a false rejection when the supplier observes a newer block during the request. Expired/future offers cannot create a new purchase. The wallet SDK and Vault runtime recheck before funding. An expired, unsent Vault draft cancels before transfer and releases its reservation; an in-flight funding intent retains conservative reconciliation rules.

Funding acceptance and supplier execution verify the quote at the canonical **funding block's timestamp**. A quote expiring after a valid funding transaction does not retroactively void the order or prevent delivery within its separate escrow deadline. Retrying creation of an already committed order returns its original record even after quote expiry; it does not create or reprice another order. A new request ID needs a currently valid quote.

The full quote enters the buyer's order commitment and the supplier execution request/receipt. The escrow contract pins amount, recipient and delivery specification. **The current contract and CRE arithmetic verifier do not independently verify quote signatures or quote expiry.** Quote authorization is enforced by the authenticated runtime, wallet SDK and supplier; signing a raw late transaction outside those paths is not prevented by a new onchain quote check. No atomic guarantee is made between an offchain validity observation and transaction inclusion.

## Endpoint and durable replay

`/v1/quote` is derived from the operator-configured supplier origin; callers cannot supply a URL. It uses the provider's existing HTTP authentication and rejects redirects, malformed/oversized bodies, altered request context and incorrect signatures. The response is limited to 64 KiB. Signed-quote validity is at most 24 hours; no unsigned price or fallback provider is substituted after a failure.

The reference service validates its registry owner, wallet, URI and exact delegation before offering a price. Offers are persisted as private-mode quote journal files, separately from delivered-job files. Concurrent identical quote calls share a promise; retries return the exact persisted envelope. A simulated lost response after the durable write exercises recovery without repricing. Old expired offers are not silently reissued under the same request.

Deployments of third-party suppliers must implement the quote endpoint to accept new API purchases. The optional quote field on historical v1 execution requests preserves existing funded orders. The server-side API always supplies a verified quote for a new supplier order.

## Verification and remaining work

- `tests/supplier-quote.test.ts` checks altered prices/context, cross-order/workspace/payer/asset/identity replay, invalid signatures/amounts/times, fixed authenticated HTTP routing, response bounds, provider-priced orders, buyer commitments and expiry-safe immutable replay.
- `npm run demo:quotes` executes actual HTTP/D1/SDK/registry/local-EVM flows. It checks read-only quote issuance, independent pricing, tampering, lost-response idempotency, expired creation/funding, valid funding followed by quote expiry, Vault payer binding and zero-transfer expiry cancellation. Reports are `outputs/quote-demo-*.json`.
- The two-provider Chromium case now requires a signed quote, invalidates it after a draft change, retains it across reload, then pays the quoted provider wallet. English/Chinese and mobile layout remain covered.
- The full demo sequence now has 26 stages including signed quotes. Running it remains separate evidence from focused checks.

Prices are still per-task for the bounded transfer skill contract; there is no generic auction, subscription billing or global offer index. Automatic refund-confirmed fallback purchasing remains the next controller milestone. Public Sepolia/browser-wallet/DON acceptance and deployment remain independent gates. This local work publishes no Site and enables no hosted scheduler.
