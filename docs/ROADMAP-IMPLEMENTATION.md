# AgentOS implementation roadmap

User request: complete improvements in the review order, test and commit each item separately, then execute the complete demo. Local evidence, public-chain evidence and deployment remain separate acceptance gates.

| Order | Deliverable | Required evidence | State |
| --- | --- | --- | --- |
| 1 | Complete delivery commitment and independent acceptance | Versioned skill/input contract; complete result hash; detail tampering rejected by runtime-independent verifier and EVM settlement; CRE WASM/CLI evidence | Implemented and checked; validation below |
| 2 | Real business data skill | Actual source fetch, immutable provenance and scope, useful output and reproducible acceptance | Implemented and checked; validation below |
| 3 | Vault in actual ordering | One owner grant, two bounded purchases, revocation denies subsequent purchase; refund/buyer accounting | Implemented and checked; validation below |
| 4 | Two-step workflow and memory references | Persisted dependencies, previous accepted artifact as next input, recovery without duplicate payment | Implemented; item validation below |
| 5 | Public testnet and CRE settlement | Real wallet, registered workflow execution, actual forwarder payment/refund transactions; account access verified rather than assumed | In progress; receiver/publisher/reconciliation/reusable dispatcher implemented; public acceptance pending |
| 6 | Third-party onboarding and hosted operation | New skill onboarding with integration acceptance; authenticated deployed consumer, monitoring and failure recovery | In progress; bounded new skill onboarding locally accepted; hosted operation remains open |

The complete demo is a final gate after the individual changes. Public workflow deployment depends on actual account capabilities and configured infrastructure; local simulation does not satisfy item 5. No unattended schedule is enabled merely to represent deployment.

## Item 1 validation — 2026-10-21

- 83 automated tests passed, including actual temporary HTTP/EVM payment/refund for modified allocation details and recipient counts; existing pre-funded model/supplier execution also passed.
- TypeScript checks and production build passed. Focused reconciliation, evidence and language regression: 9 passed after their integration changes.
- Official CRE CLI WASM build succeeded. Five dry-run cases passed: event acceptance, incorrect-total rejection, specification mismatch rejection before reporting, treasury acceptance, and altered-allocation rejection even with a recomputed output hash. Evidence: `outputs/cre-demo-81ff696d-9374-4b4f-9c4b-f471bdb7adb8.json`. No broadcast or DON deployment.
- Existing running services and their historical state were preserved. Source changes do not imply the older running chain/supplier processes have been upgraded. A fresh isolated runtime must be used for the final complete demo, or a state-preserving service upgrade must be implemented.

## Item 2 validation — 2026-10-21

- Read-only mainnet USDC import, full raw provenance commitment, exact base-unit report, canonical-source recheck and bilingual source-input form implemented.
- Actual mainnet → HTTP/D1 treasury execution → temporary local EVM full-artifact payment passed: `outputs/data-demo-598e76de-1865-4527-b377-ef5876930e1b.json`. The first attempt stopped at source reverification before authorization (`outputs/data-demo-772f77eb-dd65-4d5d-a6d2-9d6e4e366d1d.json`); retained, not counted as success.
- 86 automated tests passed with bounded concurrency, plus the Chromium source-draft refresh/language regression. TypeScript checks, production build and official CRE WASM compilation passed. Raw logs: `outputs/validation-data-2026-10-21/`. The source parser was compiled into WASM; this item does not claim a new source-origin DON execution.
- Full-demo runner includes `demo:data`; the final complete demo remains outstanding.

## Item 3 validation — 2026-10-21

- Grant epochs, signed workspace sessions, quote/daily-budget reservations, automatic funding checkpoints, executor integration, Vault payer accounting, SDK and bilingual wallet controls implemented. See VAULT.md.
- Actual EVM runtime test passed: two payments plus one refund, one primary session signature, no duplicate principal after lost response, non-replenished total allowance, and old-epoch rejection after revoke/re-grant. Three policy tests passed, including daily-budget reservation before funding.
- HTTP/D1/queue/SDK/EVM acceptance passed: `outputs/vault-demo-2cf1fc72-aa6c-49fe-ba10-068b4bfec741.json`. It reused a chain with existing browser purchases and verified balance deltas, one primary session signature for two paid orders plus one rejected-delivery refund, idempotent creation/single Opened events, cross-workspace refusal, session total refusal, and revocation while capacity remained. A separate grant for the revocation case is explicitly counted as a second signature.
- Session total and UTC daily cap are separately signed. Earlier grants' daily spending remains charged after revoke/re-grant; refunds replenish neither cap. The EVM regression tests this even when the daily cap exceeds the session total.
- 91 automated tests and all six Chromium regressions passed. The browser flow granted, purchased without another personal_sign, reloaded the wallet and revoked; the purchase selector then had no authority. Screenshot: `outputs/vault-browser-proof.png`. TypeScript checks and production build passed. Raw logs and summary: `outputs/validation-vault-2026-10-21/`.
- Earlier SDK Node syntax/import, interrupted validation and preview failures were retained rather than counted as passes. The previous owned runtime was confirmed gone before launching the new isolated instance; its stored D1/source/evidence directories remain. No existing data was reset. Separate state/cache and Vinext's native multi-instance option are used.
- Public deployment, subsequent roadmap items and the final complete demo remain outstanding. The Vault-only isolated instance disables identity and cannot satisfy the final complete-demo gate.

## Item 4 validation — 2026-10-21

- Added a persisted two-step allocation workflow, signed Vault session reuse, frozen quotes, future budget/quote/order-slot reservations, separate durable workflow jobs, cancellation and recovery. Step 2 uses accepted recipient allocations rather than reusing the original transfer records.
- Parent memory includes the complete artifact and its inputs, output hash and payment reference. The independent verifier rejects forged parent details and derived records; the runtime additionally rechecks scoped ownership and canonical parent payment. Offline CRE recomputation does not itself authenticate that payment.
- Actual SQLite/EVM regression passed: paid-parent crash gap, immutable publication before failed D1 commit, expired lease, concurrent recovery and exactly one principal transfer/payment per step; scope, permission, budget and quote constraints are covered.
- Actual HTTP/D1/queue/SDK/EVM acceptance: `outputs/workflow-demo-d787e363-9d89-452e-9771-2fa60c7a278a.json`. Cancellation released reservations; two workflows made four payments with one owner session signature; a price change blocked step 2 until explicit recovery. Sandbox credits were unchanged.
- Added a bilingual wallet workflow form with persisted drafts, same-request retries after response loss, order links and recovery controls. The browser test covers refresh, two paid steps, Chinese/English and mobile width. Its first failure exposed asynchronous session-selector restoration; fixed and retained in the validation logs.
- 92 automated tests and seven Chromium regressions passed; TypeScript checks, production build and SDK CRE WASM compilation passed. Raw logs: `outputs/validation-workflow-2026-10-21/`. Final checks after the last policy/capacity guards are recorded there.
- Identity-enabled isolated runtime uses 5287/8655/7571 with separate D1/cache/supplier state. The existing 5187/8555/7471 instance was confirmed live and retained. Public publishing, DON/public-chain acceptance, third-party/hosted item 6, and the final complete 20-step demo remain outstanding.

## Item 5 implementation checkpoint — not public acceptance

- Added AgentEscrowReceiver with ERC165, production 64-byte metadata parsing, strict workflow ID/name/owner and forwarder checks, and one-time workflow binding before funding. SDK validates the binding. Legacy exact-metadata behavior remains available; existing running deployments were not replaced.
- Added a separately deployable authenticated R2 evidence service and server adapter. Input/specification/artifact publication uses conditional immutable writes, bounded requests/responses and anonymous exact-byte readback. The wallet displays the public-data boundary. The private Site has not been redeployed and the public evidence service has not been deployed.
- Added bounded confirmed settlement discovery with durable cursors, canonical anchors, rollback after a reorg, and full receipt verification before updating orders. It does not sign reports or transactions. A lost artifact-publication response retries the original committed bytes.
- Public Vault funding now reserves at least a one-hour escrow window independently of the shorter adapter execution timeout, allowing time for finalized CRE reads. Existing committed deadlines remain fixed.
- 97 automated tests, seven Chromium regressions, type checks and production build passed. R2 tests execute inside actual workerd; receiver/payment/refund/discovery tests execute compiled contracts on local EVM. Logs: `outputs/validation-public-preparation-2026-10-21/`.
- Initial Node-to-R2 proxy harness and browser test-token-exhaustion failures were retained. The harness now runs the actual bundled Worker. Browser setup adds local test tokens only when needed and bases its allowance on existing daily spending, preserving all chain/D1 histories.
- Authenticated CLI supported-chains returned the actual Sepolia forwarder and a distinct simulation mock address; the filtered public capability record is retained. This is network configuration evidence, not a public execution.
- Still required at this earlier checkpoint: reusable CRE order dispatcher, actual public contracts/evidence hosting, real wallet acceptance, registered DON execution and its real forwarder payment/refund evidence. The dispatcher is now implemented as recorded below. Item 5 stays in progress. Item 6 and final demo remain open. See PUBLIC-CRE.md.

## Item 5 reusable dispatcher checkpoint — 2026-10-21

- One fixed receiver/origin configuration discovers new immutable artifacts through a conditional R2 ready index, processes rotating bounded batches and verifies finalized/latest commitments before independently accepting the complete delivery. A bad or unavailable task is deferred without blocking another valid task.
- Actual SDK handler tests cover accepted/rejected/new tasks, stale state, malformed feeds, callback failure and host constraints. Public receipt acknowledgement waits for finalization, retains a durable retry after outages and cannot resurrect archived tasks through late publication.
- 101 Node tests, three SDK CRE tests (65 assertions), separate website/CRE type checks and production build passed. CI now installs Bun 1.3.8 and runs the SDK CRE tests; no remote CI run is claimed. Logs, including retained failed harness/build attempts: outputs/validation-dispatcher-2026-10-21/.
- Official CLI/Javy WASM build and three dispatcher simulations passed with unchanged configuration: initial accepted/rejected deliveries, terminal-task skip and a new order. Evidence: outputs/cre-dispatcher-ea77bbde-f05a-4b35-b1ef-58572be7626b.json. The original five single-task regressions also passed: outputs/cre-demo-955657a1-dc36-465c-a2ce-29badc3b78d2.json. Dry-runs leave contracts Funded; local test-forwarder callbacks prove local payment/refund separately. No registered DON, public deployment or attestation is claimed.
- The public buyer address has been supplied and validated. Its latest read-only Sepolia check found zero ETH; the fresh CRE account check still reported Deploy Access Not enabled. These are external gates, not failed local functionality. No private keys were requested or stored.
- Item 6 (new third-party skill onboarding and authenticated hosted operation) and the final 21-step complete demo remain required. Existing running services, historical storage and the user's decision not to enable hosted scheduling are preserved.

## Item 6 new skill onboarding checkpoint — 2026-10-21

- Added immutable workspace-scoped skill definitions, SDK/API installation, explicit policy grants, registration and bilingual browser controls. Definitions have bounded transfer input/output recipes and can introduce a new versioned skill without editing runtime skill enums or loading arbitrary provider code. Versioned IDs are not global namespace ownership claims.
- Complete input/specification commitments embed the original definition; separate runtime, reference supplier and CRE BigInt implementations verify the full output. Unsupported tools, conflicting definitions, altered ranking details and invalid signatures cannot authorize payment. Old built-in commitments and existing Vault-session skills remain fixed.
- Actual HTTP/D1/SDK/identity/supplier/EVM acceptance passed six cases: installation/authorization, runtime purchase, independent signed purchase, invalid-delivery refund, lost-response recovery and capability rejection. Evidence: outputs/skill-demo-e7287178-6db8-4a37-9fc3-ba9f3a8afb5e.json. The supplier is a separate reference process, not an independently operated public service.
- Official CLI/Javy WASM compilation and four unchanged-config dispatcher simulations passed, including accepted/rejected extension orders: outputs/cre-dispatcher-41ba5889-6d5a-4fb2-85b4-b61c90355daf.json. Chain status stays Funded after dry-run; local callback payment/refund is separate. No public DON execution is claimed.
- The first browser attempt completed installation/authorization/execution but timed out when the open task drawer intercepted the language-switch click. The test now closes the drawer with Escape; the focused rerun passed. Failed evidence is retained. Final combined checks are recorded in outputs/validation-skill-2026-10-21/.
- Final checks: 108 Node tests, eight Chromium regressions and four SDK CRE tests (74 assertions) passed. Website/CRE type checks, production build and the reference-provider conformance command passed. The mobile browser proof is outputs/skill-browser-proof.png. The new isolated identity-enabled instance uses 5387/8755/7671; prior instances and their storage were retained.
- Public acceptance, authenticated hosted operation and the new 22-step final complete demo remain open. The existing local-only scheduling decision is preserved; no cloud automation or Site publication was enabled.
