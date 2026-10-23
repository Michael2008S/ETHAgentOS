# Local x402 implementation and acceptance

当前运行基线、CCIP 业务集成及本轮 60 阶段完整验收见 [当前本地验收总览](LOCAL_INTEGRATION_ACCEPTANCE_2026-10-23.md)。下文旧测试数量、旧实例状态和旧功能边界按各自阶段理解。

2026-10-23 P1/P2 更新：[恢复、独立实现互操作及本地 Data Feeds 验收](P1_P2_LOCAL_ACCEPTANCE_2026-10-23.md)。

当前本地整体验收入口：[2026-10-23 P0 基线](P0_LOCAL_ACCEPTANCE_2026-10-23.md)。本文各阶段 lint 数量与测试数量是历史检查点；以该基线中的实际运行报告为准。

Scope: local HTTP, test-token EVM transactions, Vault escrow, independent delivery acceptance and refunds. No public deployment, real-token purchase or DON execution.

## Increment 1 — protocol and test token

- Locked official `@x402/core`, `@x402/evm` and `@x402/extensions` at 2.28.0.
- Added a separate six-decimal EIP-3009 test token; existing deployments and their token remain unchanged.
- Added an independent reference report API, facilitator using the official EVM scheme, signed report envelopes and private durable SQLite journals.
- Two actual HTTP/EVM tests passed: 402/payment/report plus signature/input/payment verification and replay/conflict refusal; lost HTTP response followed by service restart returns the original result with one authorization transfer.
- `npm run contracts:compile` and website TypeScript passed. Protocol logs: `outputs/x402-validation-20261023/protocol-increment-1.log`.
- During implementation the protocol test exposed inconsistent address casing in advertised requirements; the server now advertises the same validated canonical requirements that it verifies.

At this checkpoint the existing Vault ordering runtime has not yet been connected to the x402 supplier. The complete x402 business demo remains outstanding.

## Increment 2 — supplier procurement budget and restart recovery

- Added a private SQLite procurement ledger shared across workspaces by wallet, network and asset; unresolved authorizations remain reserved across UTC day boundaries.
- A signing guard checks the actual EIP-712 intent. The SDK-generated nonce, unsigned intent and complete payment payload are persisted before submission; restart never invokes a fresh random authorization for the same purchase.
- Concurrent retries share one procurement. Canonical nonce/Transfer reconciliation records actual upstream cost independently of the user escrow ledger.
- Four protocol/procurement tests passed, including a simulated crash after durable signing followed by reopening the database, a real dropped HTTP response, parallel retries, one upstream transfer, changed-intent refusal and cross-workspace/cross-day budget contention.
- Evidence: `outputs/x402-validation-20261023/procurement-increment-2.log`. This checkpoint is the upstream procurement layer; Vault/owner runtime integration follows separately.

## Increment 3 — Vault, scoped authority and delivery acceptance

- Connected the x402 supplier to the existing order runner without changing ordinary supplier requests. Reviewed policy hash and input disclosure are part of the frozen order and wallet commitment.
- Short-lived hashed tickets bind the workspace, supplier request and current execution lease. The callback checks current policy, signed Vault session, registry delegation and funded escrow; rereads state after chain checks; and fixes one payment nonce/intent in a dedicated D1 table. No caller-selected owner or owner API credential is passed to the supplier.
- Signed upstream report and procurement receipts are stored separately from business artifacts, with independently checked canonical payment logs and workspace isolation.
- An isolated local stack uses the new EIP-3009 token and separate supplier procurement/facilitator/provider accounts. Existing runtime deployments stay unchanged.
- Nine focused tests passed, including existing supplier/Vault regression, three actual HTTP/EVM order flows, full-result recomputation rejection, full user-principal refund, one escrow/settlement per order, upstream cost borne by supplier, non-replenished gross Vault limits, policy revocation during a callback, expired/wrong-scope tickets, old leases and replacement nonce refusal.
- Evidence: `outputs/x402-validation-20261023/increment-3-regression.log`. Web/API demo and UI acceptance are the next increment.

## Increment 4 — real process interruption and independent gas limits

- Added acceptance that actually SIGKILLs only the test-owned procurement process before submission and after mined payment. A new process reopens its private journal, reuses the original nonce/payment and produces one authorization transfer in both cases.
- Facilitator transactions have independent 300,000 gas, 25 gwei fee and 0.05 native ETH daily ceilings. Durable gas reservations precede broadcast; unresolved broadcasts retain their reservation. Actual gas expense is recorded separately from token procurement and user escrow. Unresolved facilitator gas intents fail closed and require reconciliation; there is no automatic new transaction allocation.
- Gas-budget refusal was tested before broadcast: no token authorization was consumed and no gas reservation leaked. Three real Vault orders also reconciled three separate gas receipts with zero outstanding gas reservation.
- Evidence: `outputs/x402-validation-20261023/crash-acceptance-attempt-1.log`, `x402-gas-and-crash-regression.log`, and `gas-budget-acceptance.log` in the same directory. This is procurement-process crash acceptance, not a claim of production key management or DON execution.

## Increment 5 — owner UI and complete HTTP/D1 demo

- The supplier catalogue exposes its revision-bound procurement policy. Order creation requires explicit disclosure consent; changing draft input clears it. The SDK checks that the returned order preserves the reviewed policy.
- Owner-scoped evidence displays the independently verified upstream payment/report beside the existing escrow acceptance/refund evidence. Ordinary historical orders do not query the new side tables.
- `npm run demo:x402` starts a separate persistent test runtime on ports 16877/16897/16907 (plus adjacent service ports), imports the captured finalized USDC sample, executes the three purchases, verifies duplicate-create/escrow/settlement protection, cross-workspace evidence denial, gross session cap, exact balances and browser behavior, then stops only its own child processes. Existing active runtimes and the current-instance pointer are preserved. Port conflicts fail rather than replacing processes.
- Set `AGENTOS_X402_DEMO_WEB_PORT`, `AGENTOS_X402_DEMO_CHAIN_PORT`, and `AGENTOS_X402_DEMO_SUPPLIER_PORT` to choose different demo ports. To inspect an existing x402 runtime use `npm run demo:x402 -- --runtime <runtime.json>`; it creates a new test workspace and retains supplied services.
- For an interactive stack use `AGENTOS_DEMO_X402=1 AGENTOS_DEMO_NO_CURRENT=1 AGENTOS_DEMO_CAPTURED_SOURCE=1 npm run demo:isolated` with distinct `AGENTOS_DEMO_WEB_PORT`, `AGENTOS_DEMO_CHAIN_PORT`, and `AGENTOS_DEMO_SUPPLIER_PORT`. Its printed runtime file can be resumed with `node scripts/demo-isolated.mjs --resume <runtime.json>` without replacing the pinned source.
- Initial complete HTTP/D1/browser acceptance passed: `outputs/x402-demo-b767b7f8-da8c-43a0-9bbf-e24af593e771/report.json`. User funded 3.00 = paid 2.00 + refunded 1.00; supplier separately paid upstream 0.60, leaving token margin 1.40 before native gas/operating costs. The source is explicitly a captured replay, not fresh mainnet data.
- `demo:full` includes the standalone x402 acceptance as its final stage. Public deployment, real USDC, arbitrary upstream discovery, encrypted/private input, CCIP and Data Feeds remain outside this increment.

## Increment 6 — failure boundaries, browser creation and live source

- Actual HTTP/EVM fault acceptance now covers an overpriced challenge (no purchase authorization or upstream charge), a mined payment followed by an invalid report signature (full user refund with supplier cost retained), and cancellation after upstream payment (late signed delivery cannot settle the cancelled order). Repeated recovery retains the original refund transaction.
- Two separate Node processes contend for one supplier procurement budget; exactly one reservation succeeds. Repeated 402 responses produce one signature/nonce and retain exposure until the local chain proves the unused authorization expired; that purchase can never silently authorize a replacement.
- The sample demo creates its first paid order through Chromium: import the source, request a signed quote, review disclosure, then submit the actual Vault order. Refresh clears consent and creates no new purchase. Latest sample/browser proof: `outputs/x402-demo-d9428aa1-d6a3-4e30-a7ff-76a12eacbff0/report.json`.
- `npm run demo:x402 -- --live` runs a separate fresh finalized read-only Ethereum USDC import on ports 18877/18897/18907 by default. Payment, acceptance and refunds still use local DemoUSDC only. Live import and all three flows plus browser evidence passed separately: `outputs/x402-demo-7f7a4897-42b6-43ce-81ae-93eaffa79420/report.json`. Earlier cold-preview/browser timeouts remain in the attempt logs; this result does not relabel a sample replay as live acceptance.
- Functional logs: `failure-boundaries.log`, `shared-process-budget.log`, and `expiry-and-repeat-402.log` under `outputs/x402-validation-20261023/`. Final expanded automatic regression passed **325 tests**. TypeScript and application build passed; source lint still reports 58 errors and 248 warnings across the repository, separately recorded in `source-lint.log` (new x402 files have no lint findings).
- Full-project demo runs retain failed attempts and resume the same runtime. Its browser wizard timeout includes actual grant cleanup; plugin-memory acceptance retries a known retained-checkpoint dependency error without creating a replacement workflow. Frozen previews disable file watching/HMR, preventing unrelated builds from resetting an in-flight worker.
- Restarted the completed live runtime without new purchases: its three original payments remained canonical, procurement reservations stayed zero, consumer evidence access returned 403, and raw EIP-3009 payment signatures were absent from owner exports. The temporary consumer was revoked and that test-owned runtime stopped. Evidence: `outputs/x402-validation-20261023/resumed-evidence-acceptance.json`.

## Final local acceptance — 2026-10-23

- Latest complete sample/browser demo: `outputs/x402-demo-4e0e12bf-5871-4139-8074-941a48941a69/report.json`. It also checks that refreshing the imported chain data clears the approved quote and disclosure, and that a consumer cannot read procurement evidence. Raw payment signatures are absent from the order export.
- Final balances: 3.00 DemoUSDC funded = 2.00 paid + 1.00 refunded; user net spend 2.00; supplier upstream spend 0.60; procurement reservation and unsettled principal both zero. Native gas in the report covers the independent upstream facilitator; initial wallet setup and other execution transactions have separate receipts. Token margin 1.40 is before those operating costs.
- Latest typecheck and build passed after the disclosure-reset fix: `final-disclosure-typecheck.log` and `final-disclosure-build.log` under `outputs/x402-validation-20261023/`. Frozen preview browser hydration and real input also passed without HMR.
- Full local project sequence: **46 executed stages passed**, including the final x402 demo. Report: `outputs/full-demo-43380e9e-eb36-4ba8-b7de-37c128a54266/report.json`. Earlier wizard timeout, retained dependency checkpoint and preview-reload failures remain in `failedAttempts` and passed on resumed attempts.
- The standard sequence's two external CRE stages are **not counted as passed**. CRE WASM compilation succeeded, but its temporary synthetic HTTPS tunnel could not resolve Cloudflare edge DNS. The run continued with explicit `--without-cre`; its report records `allStagesPassed: false` and names both exclusions. No DON or public application deployment was performed.
- Reproduce the focused flow with `npm run demo:x402`, or the independent live-source variant with `npm run demo:x402 -- --live`. For the wider local suite use `npm run demo:full -- --runtime <runtime.json> --manage-models --without-cre`; this still includes read-only live data checks. Omit `--without-cre` when separately validating the external CRE fixtures.
- All test-owned acceptance instances were stopped with their state, receipts and source snapshots retained. The current-instance pointer and unrelated running instances were preserved.

Validated functional commits: protocol `2cf6fa8`, procurement budget/recovery `729e436`, Vault/authority `369ff01`, SIGKILL/gas `8bbb7a3`, owner UI/demo `90d5242`, fault/browser/live-source acceptance `bb74068`. Additional acceptance fixes preserve cold-preview timing, retained checkpoints and immutable preview sources.
