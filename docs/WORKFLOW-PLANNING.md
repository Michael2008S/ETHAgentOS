# Goal-driven workflow planning and explicit approval

The workflow planner asks a configured language model to compose a program of 2–8 steps from the owner's currently authorized catalog. The model selects services, original/earlier-result inputs and optionally result conditions. This is distinct from the earlier purchase classifier, which selects one service from three intents. Execution uses the existing accepted-result workflow controller, durable jobs and escrow validation.

The model proposes a graph; it cannot create orders, change prices, grant permissions or select arbitrary tools/endpoints. A structural/financially valid program is not proof that the model understood the goal. The owner reviews the steps and source relationships before explicit approval. There is no deterministic plan substituted when inference fails or returns an invalid program.

## Request, review and approval

`AgentWorkflowPlanClient` exposes `propose`, `list`, `accept` and `dismiss`. The owner API is `/api/workflow-plans`; it refuses consumer credentials and cross-origin writes, uses strict JSON schemas and a 64 KiB request bound.

```ts
const proposal = await planner.propose({
  requestId: crypto.randomUUID(),
  goal: 'First create an allocation report, then summarize that accepted report.',
  vaultSessionId,
  input,
  totalBudget: 1000,
  perStepBudget: 400,
  maxSteps: 4,
  execution: 'builtin', // 'supplier' or 'any' are also supported
  allowConditions: false,
  timeoutSeconds: 300,
});

// Show proposal.draft, selected providers, fees, input and evidence for review.
// Approval submits only the stored plan ID and its reviewed digest.
const workflow = await planner.accept(proposal);
```

Amounts are integer token cents. Plans contain the goal, input, deployment/buyer/session binding, frozen catalog, selected services and optional identity/payee snapshots, normalized model program, complete executable draft, model descriptor, prompt/response/catalog/input hashes and review digest. Plans are retained in the workspace under `workflowPlans`; at most 20 records are retained. They expire after at most five minutes or when the current session expires. Reads do not refresh expiry or execute anything. Dismissed/expired proposals cannot be approved. An already accepted plan replays the existing workflow even after its proposal expiry; it cannot create another order.

Generation records an audit proposal without orders, workflow jobs or spending reservations. Replaying a stored proposal request UUID returns the same record; changing its parameters conflicts. Concurrent initial requests may perform inference before the first record is saved, so provider inference billing is not claimed to be exactly once.

Approval rechecks the stored digest and exact draft, live prices/skills, selected supplier identity/configuration, signed session and remaining fees/order capacity. Changed terms are rejected with a request to generate a new plan. Existing unrelated workflows cannot be retrospectively labeled as model-approved. The accepted-plan pointer, workflow, first child and durable jobs are committed through one workspace CAS transaction. An immutable evidence publication before a failed commit can be retried with identical bytes. A lost approval response is recovered through the stored plan/workflow history.

## Catalog and program limits

- Only enabled skills permitted by both workspace policy and the signed Vault session enter the catalog. Supplier choices additionally require current operator configuration, actual ERC-8004 delegation and a payee permitted by the session.
- The model sees at most 32 choices. One slot per skill/executor pair is selected before additional provider alternatives, preserving deterministic ordering. Omitted/excluded choices are not represented as available; this is not a global-market optimality claim.
- Built-in step fees are frozen catalog prices. Future supplier input hashes do not yet exist, so supplier fees are explicit ceilings under `signed-at-execution-under-cap`; exact signed quotes are obtained only when each input is known. No quote request is made merely to generate a plan. Selected supplier descriptors and identity/payee fingerprints are checked again at approval.
- The model cannot emit a price, a new service, a tool call or a URL. Its choice strings must match the supplied catalog. The runtime maps those strings to audited catalog entries and independently validates every step and budget.
- `source: -1` means original input; other sources must reference an earlier step. The stored draft uses the existing `{from:'original'}` / `{from:'step',step:n}` form. Forward references and cycles are rejected.
- Conditions require `allowConditions: true` and the same typed scalar-field restrictions as manual workflows. With conditions disabled, every model step uses `when: null`. A false condition skips a purchase through the existing controller; a failed/refunded parent cannot become an accepted artifact.
- Every step ceiling, aggregate requested ceiling, current workspace daily budget, remaining signed allowance and future order capacity must fit. Generation reserves none of them; approval revalidates them, and each actual purchase retains its existing funding checks. Token service-fee ceilings exclude gas and external model-provider charges.

The committed workflow retains `planId`. The original model program remains an audit record; execution does not silently edit that program or let the model replace committed escrows. [Reviewed replanning](WORKFLOW-REPLANNING.md) can now create a separate 1–8-step replacement after outstanding escrows are resolved, reusing scoped paid roots and preserving gross charges. Unattended failure-triggered generation remains a separate capability; every replacement purchase still requires approval.

## Model and input boundary

Only the goal, authorized catalog and input metadata/hash enter the planning prompt. Transfer rows, Vault session signatures, API keys and private keys do not. The approved workflow still publishes input/delivery evidence according to its configured execution mode, as described in the workflow/public-evidence documentation.

The bundled planner uses a dedicated Qwen 2.5 3B Q4_K_M service at `127.0.0.1:11436`. The existing 0.5B tool/purchase model remains at `11435`. The official artifact is pinned to repository revision `7dabda4d13d513e3e842b20f0d435c732f172cbe`, size 2,104,932,768 bytes and SHA-256 `626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d`. Both setup and startup check the artifact. See the [official file](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/blob/7dabda4d13d513e3e842b20f0d435c732f172cbe/qwen2.5-3b-instruct-q4_k_m.gguf) and its repository for model terms.

```sh
npm run model:setup          # official llama-server and existing small model
npm run model:setup:planning # pinned planner weights, about 2.1 GB
npm run model:planning      # separate terminal, or let demo:start own it
```

The setup keeps partial downloads for explicit resume, disables curl's partial-discarding automatic retries and verifies the complete hash before publishing its runtime manifest. The local planner uses one inference slot and an 8,192-token context. macOS defaults to GPU offload; `AGENTOS_PLANNING_GPU_LAYERS=0` selects CPU. Another official llama-server binary may be provided with `AGENTOS_LLAMA_BIN`. The bundled startup accepts relocated model files only when they still match the pinned artifact.

Hosted/custom planning can set server-only `AGENTOS_WORKFLOW_MODEL_CONFIGURATION` and `AGENTOS_WORKFLOW_MODEL_API_KEY`; otherwise hosted execution can use the existing configured model. HTTPS or the explicitly permitted development loopback origins are required. Configuration resource bounds, model failures and truncation are enforced; no model is guaranteed to understand every goal. The small-model failures retained during integration are evidence of that limit, not successful plans.

## Verification

- Node checks cover multiple graph shapes, conditions, unauthorized choices/tools, fee/capacity/refusal, model failure and response bounds, digest tampering, fixed-price/identity changes, dismissal/expiry, owner SDK binding and retrospective-provenance refusal.
- An actual in-process EVM check exercises model-plan approval after an immutable publication/failed commit, concurrent replay, three exact paid results, nested accepted memory and a skipped purchase. Its model response is controlled; it is not evidence of live inference.
- `npm run demo:workflow-planning` requires the actual local model and validates distinct real two/three-step programs, no procurement before approval, lost approval response, durable execution, ownership/digest refusal and seller/Vault balance deltas.
- Chromium checks cover persisted planning settings, review-only generation, reload, lost approval response recovered through stored history, exact paid steps, bilingual labels and mobile width.

Public browser wallets, Sepolia, registered DON execution and hosted operations remain separate acceptance gates. Final project regression is still required after all remaining functions are completed; per-feature checks do not replace it.

Initial planning acceptance (2026-10-22, Hong Kong): `outputs/workflow-plan-demo-31bcb83e-a639-4909-bdd8-0f67f4d4efac.json` passed all four groups with the actual pinned 3B model, two different programs, five unique payments totaling 1,440 cents and one owner session signature. That source's complete 163 Node / 14 Chromium regressions, five CRE SDK tests (80 assertions), type checks and production build passed. Raw evidence and the mobile screenshot are retained under `outputs/validation-workflow-plans-2026-10-22/`. Earlier model/SDK failures remain in that directory and are not counted as passes. Its 30-step runner was not a final project pass; later increments and the current final gate are recorded in ROADMAP-IMPLEMENTATION.md.
