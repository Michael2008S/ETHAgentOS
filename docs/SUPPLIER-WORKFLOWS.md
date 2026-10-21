# Supplier-backed accepted-result workflows

`agentos.workflow.v3` composes registered, independently signed suppliers within the existing sequential workflow. A later supplier can consume a previous supplier's paid accepted artifact, including nested report/allocation and summary projections. Built-in steps and supplier steps can coexist. Existing v1/v2 workflow records and fixed-price behavior remain unchanged.

## Authorization and pricing

A future input includes the predecessor's actual accepted artifact and canonical payment reference. Its exact input hash does not exist before that predecessor is paid, so a future exact-input signed quote cannot be reviewed in advance. V3 requires the explicit policy `supplierPricing: 'signed-at-execution-under-cap'`. Each selected supplier step's `budget` is an integer-cent maximum service fee, rather than a purported exact signed quote.

```ts
await workflows.create({
  requestId: crypto.randomUUID(),
  title: 'Independent report and summary',
  vaultSessionId,
  input,
  timeoutSeconds: 300,
  supplierPricing: 'signed-at-execution-under-cap',
  steps: [
    { agentId: reportAgentId, supplierId: reportSupplierId,
      budget: 400, input: { from: 'original' } },
    { agentId: summaryAgentId, supplierId: summarySupplierId,
      budget: 300, input: { from: 'step', step: 0 } },
  ],
});
```

The server resolves each supplier exclusively through operator configuration, inspects the bound ERC-8004 identity and registry delegation, and freezes its descriptor, signer, identity and payment wallet before committing the first order. Every future payee and skill must already be permitted by the signed Vault session. The bilingual editor shows current payee/signer addresses and states the fee-ceiling policy before the start action. Existing orders keep their frozen terms.

Before the first purchase, supplier fee ceilings and built-in fixed quotes reserve the remaining signed session allowance. All per-step budgets reserve workspace budget and future order slots. The current onchain daily grant must also cover the worst-case future fees. Refunds consume gross Vault allowance. A conditional skip, cancellation or completion releases unused future reservations; already funded spending remains charged.

Only after the exact input is known does the runtime request a supplier quote under the stable step UUID. It independently verifies the signature, scope, input and acceptance commitments, identity, asset, payer and current validity. A price above the approved ceiling blocks the workflow before a new order, evidence publication or token transfer. The runtime cannot increase a ceiling, select a new supplier/payee or overwrite an expired quote journal. A new authorization requires a new workflow request.

`WorkflowStep.quote` retains the supplier ceiling as the future reservation value. `ChainOrder.quote` and its complete `supplierQuote` record the actual payable signed price. A built-in step still retains its fixed service quote and blocks when that quote changes. Gas charges are outside these token service-fee ceilings.

## Execution and recovery

The existing owner APIs, inline scheduling, owner recovery and scoped durable consumers use the same workflow controller. Creating the workflow, its first child and durable jobs is one workspace CAS commit. Every step retains its derived order UUID through response loss and retries. A separate workflow job spans the crash gap after the parent payment and before the next order.

The runtime revalidates the entire predecessor result and canonical payment lineage before deriving a dependent input or evaluating a condition. It then rechecks the frozen provider delegation and remaining onchain grant before quoting. Order execution performs the existing quote and supplier authority checks again before funding and delivery acceptance. A transient quote response loss leaves the workflow running for a later bounded recovery tick; replay recovers the provider's original signed quote. Permanent authority/configuration/price failures block the workflow and preserve its checkpoint. Restoring the same valid delegation permits explicit resume; a refunded/cancelled child cannot be resumed into a valid parent artifact.

Invalid signed output follows the existing escrow refund path. The dependent workflow stops and does not purchase a later supplier. Supplier fallback for one purchase remains the separate purchase-route capability; v3 does not silently insert a fallback route or replan the graph.

## Evidence and limits

- `npm run demo:workflow-suppliers` exercises actual HTTP/D1/SDK/durable jobs, two reference supplier processes/signers, two registered owners/payees, a signed Vault session and local EVM transactions. It retains an individual JSON report under `outputs/supplier-workflow-demo-*.json`.
- Node checks cover explicit price policy, complete future reservations, payee refusal, over-cap/misbound/expired quotes, immutable publication replay, scoped idempotency and changed SDK response terms. Existing SQLite/CAS/EVM workflow tests remain applicable.
- Chromium checks exercise provider selection, fee ceilings, persisted draft, lost creation response, same request recovery, accepted input reuse, two actual payments, bilingual presentation and mobile width.

This is bounded sequential composition of supported transfer/result skills. Arbitrary plugin code, parallel/multi-input workflows, templates, semantic memory selection and dynamic goal decomposition/replanning remain open. The runtime enforces graph/ancestor payment rules; the escrow contract and CRE delivery verifier do not independently enforce the full graph, the application's session skill restrictions or future fee-reservation ledger. Local reference suppliers are not independently operated public suppliers. Public browser-wallet, Sepolia, actual DON and external hosting acceptance remain separate and incomplete.
