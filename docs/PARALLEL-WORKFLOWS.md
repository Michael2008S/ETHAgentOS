# Parallel workflows and paid-artifact joins

Workflows may explicitly select `parallelism: 2`, `3` or `4`. New graph workflows use `agentos.workflow.v4`; existing v1/v2/v3 records retain their original sequential execution and immutable terms. The limit counts in-flight purchases through payment/refund completion, not merely outstanding HTTP calls.

## Program and review

Each of the 2–8 steps selects an installed service, fee ceiling, optional frozen signed supplier, input and optional result condition. Input is original input, one earlier paid step, an approved paid root during replanning, or `{from: 'merge', steps: [0, 1]}`. Merge indices must be distinct, strictly increasing and earlier than the current step. Conditions add their own dependency. No forward edge, cycle, arbitrary executable expression or dynamic concurrency increase is permitted.

The editor exposes the mode and parent checkboxes. Drafts survive refresh and same-ID creation retry. Disabling parallel mode while a merge remains makes the editor invalid rather than silently changing its inputs. Source selection, conditions, future fees, slots, budgets, skill grants and payees are validated before purchases proceed. Already reviewed supplier ceilings remain ceilings until exact future inputs can be quoted; changing a supplier, identity or price policy stops execution.

Goal-driven planning also has an explicit parallel mode. The real model may emit `source: -1` for independent roots, a previous step number, or an increasing array of previous step numbers for a merge. The server independently checks the program, fees, conditions and mode. The saved proposal binds concurrency; SDK approval and replanned funding reject a changed concurrency. Generating a proposal creates no purchase. Sequential requests retain their old model schema and behavior.

Portable graph templates use `agentos.workflow-template.v2` with the reviewed concurrency and input edges. They exclude business input and authority just as v1 templates do. Applying one restores the graph while clearing the selected Vault session; it does not authorize execution. V1 templates cannot contain a merge or hidden concurrency setting.

## Scheduling and recovery

One durable workflow job owns a running graph; its children are not separately scheduled as ordinary order jobs. A fenced six-minute drive lease coordinates concurrent consumer and explicit owner recovery requests. Lease state is operational metadata and is excluded from the immutable replanning snapshot. A stale driver cannot update a replacement lease or revive a cancelled workflow. Queue retry waits honor the lease expiry after a crashed driver.

Within a drive, Vault funding proceeds serially. Independently funded, ready steps execute concurrently under the reviewed cap, using the existing per-order funding, supplier and model leases. After completion, the controller verifies canonical parent payments before publishing ready dependent orders. Each request/step keeps its deterministic ID and immutable publication bytes, including after a failed commit. This serial funding is scoped to a graph drive; it does not claim a production cross-workspace transaction nonce coordinator.

A skipped input or condition parent skips its dependent step without a purchase. A failed/refunded parent blocks new graph progression. Previously funded siblings retain their original settlement/recovery obligations. Cancelling the graph fences pending results, cancels uncommitted purchases and makes remaining funded orders available to the ordinary durable recovery path for refund. Replanning waits for all outstanding funding and refunds to resolve, then can preserve any verified paid sibling result.

## Join semantics and independent verification

`agentos.accepted-merge.v1` commits `strategy: concat-projections.v1` and the ordered parent artifacts. Reports project allocations, summaries project one total record and bounded ranking skills project their top accounts. The join concatenates those derived records in reviewed step order. It does not deduplicate overlapping original transfers or invent a comparison result; totals may count the same original transfer more than once. This is displayed before execution.

All parent identities must refer to distinct payments on the same chain/escrow. Runtime checks additionally require exact original paid orders in the same owner workspace, buyer and deployment, and recheck canonical receipts throughout the lineage. Shared ancestors in a legitimate diamond are supported without accepting cycles. A paid envelope's fields alone never authenticate payment.

The existing `memoryHash` commitment binds the entire merge. Website, signed supplier input and CRE acceptance all use the same versioned evidence envelope, and CRE independently recomputes each parent result and the exact concatenation. Rehashing changed parent data or derived records does not make it acceptable. Proof depth stays bounded at eight, expanded proof nodes at 64, normalized custom input at 32 KiB and projections at 100 records. Unsupported/oversized joins stop rather than dropping parents. These limits also bound repeated shared-ancestor proofs.

## Acceptance

`npm run demo:workflow-parallel` uses actual HTTP/D1/SDK, two separate signed supplier processes, official local ERC-8004 registries, Vault/EVM transactions and the pinned planning model. It checks lost creation response replay, actual overlapping supplier execution windows, a signed supplier consuming merged paid inputs, cancellation during both supplier requests, mined refunds, failed-parent blocking, and a real model-generated graph followed by explicit approval. It checks balances, one Opened event per child, one request per supplier job, retained sandbox credits and an empty durable queue.

The browser regression checks parent selection, invalid one-parent refusal, persisted graph/template settings, same-ID retry after reload, exact three payments, joined lineage, clearing authority when applying a template, Chinese/English and mobile width. In-process EVM tests additionally cover shared ancestors, three-ready-root concurrency bounds, skipped joins, changed canonical payments, foreign ownership, record tampering and a late driver after lease expiry. SDK CRE tests reject changed parent outputs and changed projected records. Local execution and SDK simulations do not constitute public-chain or actual DON acceptance.

Use the identity-enabled isolated runtime recorded in `.sites-runtime/isolated-demo/current.json`. Older live chain and supplier processes retain their loaded verifier protocol; syncing a web source snapshot alone does not upgrade them. The graph acceptance runtime was created separately on 5887/9255/8171/8172, preserving older services and history. The overall final complete-demo gate remains in ROADMAP-IMPLEMENTATION.md.
