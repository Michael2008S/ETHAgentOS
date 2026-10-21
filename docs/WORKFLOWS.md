# Two-step workflows and accepted artifact memory

The wallet page now offers a bounded business workflow:

1. A treasury-report service purchases and produces a complete allocation report.
2. An event-analysis service purchases a summary of that report's **accepted allocations**.

The second input contains one record per recipient allocation, not the original transfers again. For the demonstration, three transfers totaling 679 cents become two allocation records totaling 679 cents. The second result's transferCount therefore counts allocation groups, rather than original chain events. This is an explicit two-step template; arbitrary DAGs, autonomous goal decomposition and arbitrary code execution remain separate work.

## Commitments and authority

`agentos.accepted-artifact.v1` preserves the parent order/task, deployment, full original dataset and artifact, specification, artifact hash and settlement transaction. New input bytes include this envelope and the derived records. The next DeliveryVerification commits its memoryHash; the next escrow commits the resulting specification hash. Both the parent output and its lineage are therefore fixed before funding the next purchase.

The independent verifier recursively recomputes the complete original treasury report and derives the recipient allocation records. It rejects altered parent details even if their hashes are recomputed, changed derived records, omitted lineage and mixed source/memory descriptors. References are bounded to one parent level; no nested memory chains or empty allocation reports are accepted. Existing source/input size bounds remain enforced.

An offline envelope cannot prove payment or tenant ownership. The runtime additionally requires the exact original paid order in the current workspace, matching human buyer and deployment, and freshly verifies its canonical settlement before the next purchase, during execution and before committing settlement authority. Unavailable RPCs retain recoverable checkpoints. An immutable settlement intent already committed retains its original terms; this is not continuous reorganization monitoring or an atomic transaction across D1 and Ethereum.

The CRE verifier independently checks the committed parent arithmetic and memory derivation. It does not itself query the parent payment transaction. Runtime payment checks and CRE arithmetic checks remain distinct evidence.

## Quotes, budgets and cancellation

Both service IDs, skill versions, prices, per-step budgets and deterministic request IDs are fixed when the workflow is accepted. Both skills must be enabled and permitted by policy and the signed Vault session before the first purchase. Future steps reserve their quote against the session total and their budget against workspace daily policy; existing orders reserve themselves. Future order slots also count against the 300-order workspace limit. Creating the next order atomically transfers its reservation, preventing double counting or competing purchases from consuming it.

The workflow uses the existing bounded Vault session. Owner setup transactions and session signing remain distinct wallet actions. Individual steps do not request additional owner signatures. A changed service or price blocks progression instead of buying at a different price. The owner can restore the original configuration and explicitly resume, or cancel and create a new workflow.

Cancellation releases future reservations and cancels unsent drafts. A committed in-flight funding intent remains recoverable; funded escrows still require canonical payment/refund receipts. Cancellation does not roll back a paid first step or change an already committed settlement intent. A terminal refunded/cancelled step requires a new workflow rather than silently purchasing again.

## Persistence and interfaces

Workflow state and the first order are committed in one workspace CAS/D1 transaction. A separate durable workflow job exists throughout progression, including the gap after a parent was paid but before the next order exists. Its lease can expire and be reclaimed independently of order jobs. Publishing before a failed CAS can be retried with identical bytes and deterministic task IDs; funding and settlement reuse the existing order recovery protocol.

- GET/POST `/api/workflows`: owner-scoped list, create, resume and cancel.
- POST `/api/runtime` and `/api/runtime/drain`: recover already authorized workflows and orders.
- GET `/api/memory?kind=accepted-orders`: accepted treasury artifacts available for references.
- GET `/api/memory?kind=accepted-orders&orderId=...`: complete parent envelope. Reads return snapshots; execution rechecks payment.
- `sdk/workflows.ts`: wallet/deployment-checked creation, listing and recovery controls.
- Wallet UI: bilingual form, persisted draft/session selection, response-loss-safe request identity, progress, order links, cancellation and recovery.

The runtime currently publishes workflow evidence through the configured local service. Public immutable publishing and actual DON execution remain roadmap item 5. This feature does not claim a public deployment. Workspaces are bounded to 100 workflows.

## Verification

`tests/workflows.test.mjs` runs compiled EVM contracts and actual SQLite CAS/queue operations: paid-parent crash gap, publication-before-commit failure, expired workflow lease, concurrent recovery, one Opened/payment per step, future budget/session reservations, upfront permissions, complete memory tampering, scope/buyer refusal, canonical-payment refusal, cancellation and frozen-quote blocking.

`npm run demo:workflow` uses actual HTTP/D1/queue/SDK/EVM services. It verifies cancellation, two workflows/four payments under one session signature, scoped memory, unchanged sandbox credits and explicit recovery after price changes. Set AGENTOS_TEST_URL and AGENTOS_CHAIN_URL to the selected local runtime. Current evidence: `outputs/workflow-demo-d787e363-9d89-452e-9771-2fa60c7a278a.json`.

The Chromium regression loses a successful create response, reloads and restores its draft/session, retries the same request, then recovers both steps without another signature. It also checks Chinese/English and a 390px viewport. The initial async-selector restoration failure was retained and fixed with a controlled session selection.

The final complete demo includes demo:workflow and now has 20 steps. Its final execution remains a separate gate after the remaining roadmap work.
