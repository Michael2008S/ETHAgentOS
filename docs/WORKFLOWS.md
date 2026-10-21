# Configurable, paid-result workflows

Workflows can now compose 2–8 enabled services, including installed extension skills. Steps execute in order. Each step selects the original workflow input or the typed projection of an earlier paid, independently accepted result. An optional condition checks a scalar field of an earlier accepted result before a purchase is created.

The existing `agentIds: [report, summary]` / `budgets: [number, number]` API and persisted `agentos.workflow.v1` records keep their two-step behavior. New configurations use `steps` and are stored as `agentos.workflow.v2`; requests cannot mix both formats. No database migration is required.

## Creating a configuration

The SDK accepts the same fields as the authenticated `POST /api/workflows` create endpoint. References use zero-based indices; the UI displays one-based step numbers.

```ts
await workflows.create({
  requestId: crypto.randomUUID(),
  title: 'Treasury concentration review',
  vaultSessionId,
  timeoutSeconds: 300,
  input,
  steps: [
    { agentId: 'sage', budget: 400, input: { from: 'original' } },
    { agentId: concentrationAgentId, budget: 400,
      input: { from: 'step', step: 0 } },
    { agentId: 'atlas', budget: 300,
      input: { from: 'step', step: 1 },
      when: { step: 1, field: 'concentrated', operator: 'eq', value: true } },
  ],
});
```

Amounts are integer cents. The concentration definition must be installed, its service registered, and its skill explicitly authorized in both the workspace policy and the signed Vault session. Installing a definition does not grant execution authority. The bilingual Wallet & escrow panel offers service, budget, input-source and condition controls and retains drafts across reloads, scoped to the workspace and buyer.

## Conditions and reservation rules

- All service skills, frozen quotes, per-step budgets, the worst-case session quote allowance and workspace budget reservations are checked before the first order is committed. The chain contract still enforces its own per-task, daily and seller limits.
- A condition may check `totalCents` or `transferCount`; event summaries also support `uniqueRecipients`, and ranked-flow extensions support `accountCount` and `concentrated`.
- Numbers support `eq`, `gte`, and `lte`; the `concentrated` boolean supports only `eq`. Fields are read as own properties, without expression evaluation or code execution.
- Input and condition references must point to earlier steps. Missing grants, cycles/forward references, unsupported fields, mixed schemas and extra fields are rejected.
- A false condition records `skippedAt` and `skipReason` without creating an order. Its reservation is released. A step depending on a skipped step is also skipped; independent later steps can still run.
- Every executed predecessor's full result and canonical payment lineage are rechecked before dependent decisions. Runtime output caches must match the immutable committed artifact.
- A failed/refunded dependency blocks the workflow. Frozen quote changes block subsequent purchases; restoring the quote and explicitly resuming can recover. Cancellation preserves existing escrow rules and releases uncreated steps. An expired session or a terminal failed step requires a new authorized workflow.
- Every step derives its stable request ID from the workflow request ID and step index. Queue leases, workspace CAS, immutable publication and order idempotency protect retries and concurrent consumers. Each drain has bounded work; further drains advance longer sequences.

Conditions and sequencing are enforced by the authenticated runtime. CRE independently verifies each delivery, including its nested arithmetic evidence. This does **not** claim that the escrow contract or DON independently enforces the entire workflow graph, checks all ancestor payments, or enforces the application's session skill/total restrictions.

## Typed accepted-result memory

`agentos.accepted-artifact.v1` retains its historical root treasury-report format. The new v2 envelope explicitly commits a projection and supports nested accepted evidence:

| Projection | Result source | Derived transfer records |
| --- | --- | --- |
| `allocations.v1` | Treasury report | One record per recipient allocation |
| `ranked-accounts.v1` | Installed ranked-flow skill | Only the returned top accounts, with their committed amounts |
| `summary-total.v1` | Event summary | One `accepted-summary-total` record containing the total |

Every derived record has block 0 and identifies its parent order in `from`. These records represent result projections, **not original transfers**. Ranking projections can omit accounts outside top N; a later summary describes that subset. A summary projection preserves the total but cannot reconstruct original event counts or recipients. Empty allocation/ranking results cannot be used as transfer input, but a valid terminal empty result can complete a workflow.

Complete acceptance is independently recomputed for every ancestor, with an eight-envelope depth bound and existing 32 KiB per-envelope dataset/artifact and input limits. Payload size can stop a deeply nested chain before the depth limit; the workflow blocks before purchasing the unsupported next step. Runtime authorization additionally requires the exact retained parent in the same workspace, buyer and deployment and rechecks canonical paid receipts throughout its lineage. A self-consistent embedded hash is not proof of payment.

## Persistence and interfaces

The workspace and first order share an atomic D1/CAS commit. A distinct durable workflow job spans the gaps between paid results and future orders. Immutable publication before a lost commit is replayed with the same task ID and bytes. Current limits remain 100 workflows and 300 order slots per workspace, including future reserved slots.

Owner-scoped interfaces are GET/POST `/api/workflows` (list/create/resume/cancel), POST `/api/runtime` and `/api/runtime/drain` (recovery), and GET `/api/memory?kind=accepted-orders` (supported accepted results). Adding `orderId` returns a complete parent envelope. Snapshot reads do not prove a still-canonical payment; execution performs that check. Already committed settlement intents retain their original terms; this is not continuous post-settlement reorg monitoring or an atomic transaction between D1 and Ethereum.

## Verification

- `npm test`: configured multi-step execution on a real local EVM, conditional skips, exact single funding per executed step, nested projections, tampering/reorg rejection, grants/reservations, cancellation, input validation and standalone module loading; retains D1 crash/CAS tests for the legacy flow.
- `npm run test:cre`: unchanged dispatcher configuration accepts nested extension evidence and refuses forged derived records through actual CRE SDK mocks.
- `npm run demo:workflow-configurable`: real local HTTP/D1/SDK/queue/EVM run, six configured steps, four payments and two skips, response replay and owner isolation. JSON evidence is written under `outputs/configurable-workflow-demo-*.json`.
- `npm run demo:workflow`: legacy two-step HTTP recovery, price-change blocking and payment compatibility.
- `npm run test:browser`: bilingual configurable editor, persisted four-step draft, a lost create response, same request replay, three payments and one skipped step, single session signature and narrow-screen layout.

Use a freshly launched isolated local chain for changes to verifier formats: the Node chain service loads its verifier at startup. Source synchronization updates the web server but cannot replace the verifier already running in that process. Create another isolated environment to retain old chain history; do not reset an existing chain to make a test pass.

## Remaining scope

This is bounded sequential composition with conditional skipping and earlier-step references. Parallel execution, multi-input merges, generic workflow template distribution, dynamic model replanning, multi-supplier routing and arbitrary plugin code remain separate work. All skills still use the supported transfer/result contracts. Public Sepolia/browser-wallet/DON acceptance and hosted deployment are separate gates; local success does not satisfy them.
