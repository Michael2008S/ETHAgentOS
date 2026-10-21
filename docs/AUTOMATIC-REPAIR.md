# Bounded automatic repair proposals

An owner can authorize a durable consumer to request a replacement plan when an unfinished workflow blocks. The consumer can generate and save a proposal while the browser is closed. Every replacement still needs explicit owner approval through the existing workflow-plan API; configuration never creates a replacement order or reserves additional funds.

## Enable and operate

In Wallet → configurable workflow → Automatic repair proposals, select an unfinished workflow and an active Vault session. Review the remaining goal, gross goal fee ceiling, remaining-plan ceiling, per-step ceiling, execution catalog, maximum steps, maximum model attempts and expiry. Configuration freezes the current model descriptor and deployment. Reload restores the form; a lost configure response retries the same request ID and cannot reset attempts or expiry.

Run the existing local worker or an authenticated consumer with its owner-scoped token in the secret environment. `npm run consumer` advances already authorized jobs; issuing a credential alone does not start a process. See CONSUMER-OPERATIONS.md. GET requests and browser polling only observe state. No hosted consumer, schedule or Site deployment is enabled by this feature.

The API is `/api/workflow-repairs`: owner-only GET plus strict JSON POST `configure`, `cancel` and `resume`. Requests have same-origin checks and a streamed 64 KiB limit. Consumer credentials cannot configure policies, generate owner proposals or approve replacements. `sdk/workflow-repairs.ts` verifies the returned policy digest, parameters, wallet, deployment and workspace.

## Authority and cost bounds

- One policy may be active per current source workflow, with at most 20 retained policies per workspace. Model attempts are limited to 1–3, plans to 1–8 steps and policy duration to 60–86400 seconds, clipped to the signed Vault session expiry.
- The immutable digest binds the original source, goal, all limits, model descriptor, deployment and expiry. Retargeting an approved replacement preserves that digest, original expiry and cumulative attempt count. A new policy requires a new explicit owner configuration.
- Before inference, the runner verifies the current source snapshot, canonical paid roots, refund finality, unresolved funding, current grant and authorized catalog. Source/finality availability waits consume no inference attempt. A zero-fee authority preflight still checks the live Vault binding; positive proposal fees are checked again before publication and approval.
- Each initiated model attempt is committed before the external request, with a deterministic request UUID and a fenced lease. Provider failures, rejected results and expired leases consume attempts. A late result cannot overwrite a newer attempt or revive a cancelled policy. Providers may charge a request whose result is lost, and may ignore the supplied idempotency key; this is not strictly-once model billing.
- Previous funded fees, including refunded attempts, continue to consume the gross goal ceiling. Remaining proposals cannot exceed the lesser of the reviewed plan ceiling and the remaining gross goal allowance. Existing session, daily, skill and payee rules remain enforced by the ordering path.
- Token service-fee ceilings exclude model-provider charges and transaction gas. No credentials, endpoint URLs, complete transfer rows or raw provider errors are placed in model history. The existing replan prompt uses aggregate facts and paid-root commitments; goals and service descriptions remain untrusted text.

## Proposal review and stopping

A successful attempt saves its proposal and history atomically, then stops generation in `proposed`. No replacement purchase exists until the owner approves the exact digest. Approval revalidates canonical evidence and capacity and atomically supersedes the original workflow, creates the replacement and carries the policy forward. A manually generated competing replacement cancels automation for the old source. Already-paid artifacts and original payment/refund receipts are preserved.

Disable stops future generation and fences an in-flight result. A proposal already saved remains manually reviewable until its original expiry; approving it after disabling does not rearm automation. Cancelling the workflow also cancels its active policy. Revocation does not reverse a mined transaction or an already started provider request.

`blocked` policies may be explicitly resumed under their original limits after fixing authority or configuration. Expired/exhausted/cancelled policies cannot be resumed. Model drift does not silently select a new model. Saved proposals retain the planner's maximum five-minute review window, clipped to policy expiry; a dismissed or expired proposal does not silently consume another model attempt. The owner can disable and explicitly configure a new policy, or use manual reviewed replanning.

Terminal transitions and lease recovery occur on consumer/owner ticks, never on reads. The UI displays elapsed expiry even before the next tick. This is bounded failure-triggered proposal generation, not autonomous approval, parallel execution or open-ended self-modification.

## Acceptance

`npm run demo:auto-repair` uses a pinned real local planning model, HTTP/D1, ERC-8004 delegation, a separate signed supplier process, an independent authenticated consumer process and actual local Vault/EVM transactions. It injects a rejected supplier result, waits for the refund and automatic proposal without browser progression, verifies zero replacement purchases before approval, then approves and restarts its owned consumer to finish. Only its test consumers/credential are stopped/revoked; shared services and histories remain intact.

The browser regression exercises configure-response loss, same-ID retry after reload, source/session/limits restoration, consumer-triggered proposal display, stopping automation before manually approving the saved proposal, one buyer session signature, preserved receipts, bilingual UI and mobile width. State-machine tests use actual SQLite/CAS and cover concurrent claims, retries, cancellation, expired leases and inherited limits. Vault tests independently check zero-cost preflight, live revocation and exact positive remaining allowance on compiled local contracts.

Current evidence and whole-project gate status are recorded in ROADMAP-IMPLEMENTATION.md. Local transactions and SDK/CLI simulations do not establish public-wallet, Sepolia, DON or hosted-operation acceptance.
