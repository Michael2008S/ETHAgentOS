# Compare supplier-signed purchase offers

`POST /api/purchase-plan` can compare real signed offers before any order is created. It keeps the existing goal classifier, and replaces unsigned local supplier price hints with independently verified provider prices. The result is advisory: the owner reviews it and explicitly adopts an offer. This does not implement autonomous replanning or refund-confirmed fallback.

## Request and catalog

The existing `goal` and integer-cent `budget` fields remain. Optional `buyer`, transfer `input` and `vaultSessionId` bind supplier comparison to the actual intended purchase. A Vault session requires a buyer; callers cannot supply a payer, deployment, endpoint, signer or seller. The server derives those from the workspace and trusted configuration. Legacy calls without a buyer compare built-in services only; they never present unsigned supplier hints as executable offers.

For wallet-bound requests the runtime rechecks input provenance/accepted-memory authority, registry identity and exact supplier delegation. It requests a separate quote with its own eventual order UUID for each eligible service/supplier pair. A locally expensive service remains a candidate when the supplier's actual price may fit the budget. Up to 24 authorized offers are permitted per request, with four concurrent quote requests per batch and the existing provider transport timeout. An oversized eligible catalog fails explicitly rather than silently omitting offers. This is a bounded configured directory, not an open market crawler.

Invalid signatures or commitments, missing/expired quotes, over-budget prices, incompatible inputs and denied Vault scopes are excluded explicitly. Neither an outage nor a rejected quote substitutes an unsigned profile price. Comparison is among eligible, verified responding offers; it is not a claim of the cheapest provider on the internet or of availability under every future condition. Built-ins continue to use workspace service prices and are labeled separately.

Vault candidates must fit the selected session's skill, payee, per-task budget and remaining gross quote allowance. The API rechecks the actual grant before comparing. Quoting reserves no allowance, so normal creation/funding checks still decide whether a later purchase can proceed after concurrent spending or policy changes.

## Model and adoption

Qwen classifies the goal into the existing three supported intents and an execution mode. The runtime selects the cheapest eligible service for that classification using the verified catalog. The prompt does not receive transfer records, provider credentials or the signed envelopes. A catalog digest retains the comparison inputs; a model response is not a provider or DON attestation.

After inference, the selected supplier offer is checked again against current chain time. Suggestion validity is bounded by both five wall-clock minutes and that offer's remaining chain lifetime. The API returns the candidates, explicit exclusions and the chosen complete signed offer; it creates no workspace task, order, reservation or queue job. Providers may persist their own quote journals.

The bilingual wallet form displays compared prices and their evidence. Changes to the form clear the suggestion/quote. Adopting a supplier suggestion reuses its order UUID, re-fetches the exact durable offer through the wallet SDK, independently verifies its scope, input, payer and registry authorization, and rejects any changed envelope. The selected signed offer is persisted in the existing scoped draft. Creating an order uses that original quote and UUID; refresh and a lost creation response cannot silently reprice the purchase. Adoption and comparison do not sign or send funds.

## Acceptance

- `tests/purchase-quotes.test.ts`: opposite profile/real prices, deterministic model intent with actual signed offers, explicit quote failure/exclusion, policy denial, post-response chain time, input replay refusal, oversized catalog refusal and signed Vault gross-allowance/payee filtering.
- `npm run demo:quote-planning`: actual local Qwen, HTTP/D1/SDK, independent quote signers, ERC-8004 and EVM. It compares prices 240 and 200 while local hints are 1 and 9999; checks a committed lost quote response, insufficient budget, tampering, cross-workspace replay, exact adoption, expiry, buyer payment and payer-bound Vault payment with single funding events.
- The added Chromium case compares actual offers, adopts the 200-cent offer, reloads, loses the first successful creation response, retries the same request/quote, and pays the bound provider once. It also checks English/Chinese and mobile width.
- `npm run demo:planning` retains the legacy no-buyer actual-model regression. The full sequence includes both planning checks and is now 27 stages. Earlier 25/26-stage reports do not establish a new complete pass.

Public Sepolia, actual browser-extension wallet, registered DON/forwarder execution and external hosted operation remain separate gates. This increment neither publishes a Site nor enables a hosted scheduler.
