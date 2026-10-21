# AgentOS implementation roadmap

User request: complete improvements in the review order, test and commit each item separately, then execute the complete demo. Local evidence, public-chain evidence and deployment remain separate acceptance gates.

| Order | Deliverable | Required evidence | State |
| --- | --- | --- | --- |
| 1 | Complete delivery commitment and independent acceptance | Versioned skill/input contract; complete result hash; detail tampering rejected by runtime-independent verifier and EVM settlement; CRE WASM/CLI evidence | Implemented and checked; validation below |
| 2 | Real business data skill | Actual source fetch, immutable provenance and scope, useful output and reproducible acceptance | Implemented and checked; validation below |
| 3 | Vault in actual ordering | One owner grant, two bounded purchases, revocation denies subsequent purchase; refund/buyer accounting | Implemented and checked; validation below |
| 4 | Two-step workflow and memory references | Persisted dependencies, previous accepted artifact as next input, recovery without duplicate payment | Implemented; item validation below |
| 5 | Public testnet and CRE settlement | Real wallet, registered workflow execution, actual forwarder payment/refund transactions; account access verified rather than assumed | In progress; receiver/publisher/reconciliation/reusable dispatcher implemented; public acceptance pending |
| 6 | Third-party onboarding and hosted operation | New skill onboarding with integration acceptance; authenticated deployed consumer, monitoring and failure recovery | In progress; new skill and scoped consumer operations locally accepted; actual hosted operation remains open |
| Local complete-demo gate | Execute the current complete local sequence after implementation commits | Ordered 23-step HTTP/D1/EVM/model/supplier/CRE dry-run evidence | Passed at aae3f7e; public gates below remain incomplete |

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

## Item 6 consumer operations checkpoint — 2026-10-21

- Added owner-managed, digest-only stored consumer credentials with expiry, active-count bounds, revocation and one-time display. Service requests bind to the stored workspace and only drain already-authorized work or read aggregate status; they cannot use owner APIs or choose another owner/task. Legacy owner-private gateway mode stays explicitly restricted.
- Added a standalone retrying consumer, bounded/redirect-refusing transport, separate gateway bearer support, one-shot mode and loopback-only health listener. A new successful status read follows each drain. Authentication refusal terminates with exit code 2; network outages back off. No host process, schedule or notification was deployed.
- Runtime heartbeats now track expected polling intervals and recent failures. The health route uses the configured supplier port rather than the old fixed port. Three retained local databases were backed up and additively migrated; workspace/job snapshots were unchanged inside each migration transaction.
- Actual HTTP/D1/process acceptance passed five cases, including cross-workspace refusal, owner API refusal, visible outage/recovery, committed response loss, process kill/restart and revocation: outputs/consumer-demo-f210d6d3-d1e0-4202-9cfc-603573466a03.json. Earlier unsupported Node SDK syntax and denied-access status-code failures were fixed and retained.
- 115 Node tests, nine Chromium regressions, four SDK CRE tests (74 assertions), website/CRE type checks and production build passed. Browser failures first exposed a wrong test page, an ambiguous select label and an overly exact status selector; the corrected complete run passed. The actual credential was revoked before the mobile proof, outputs/consumer-browser-proof.png. Logs: outputs/validation-consumer-2026-10-21/.
- The model readiness probe failed; process/port inspection confirmed the old model process was absent. The existing downloaded model was started without redownloading or resetting any state. Public preflight still found zero Sepolia ETH and CRE Deploy Access Not enabled.
- Current local code is ready for the 23-step complete demo after this checkpoint commit. Actual public contracts/evidence/wallet/DON and external hosted deployment/monitoring remain unaccepted; the user's no-hosted-schedule decision is preserved. See CONSUMER-OPERATIONS.md.

## Complete local demo acceptance — 2026-10-21

- After implementation commit aae3f7edcc96cc567e1a571622d8c8d57dc91063, the complete current sequence ran once from start to finish: 23/23 steps passed, no failed attempts or resumed steps. Execution ran 10:32:35–10:39:56 UTC (18:32:35–18:39:56 Asia/Hong_Kong). Report: outputs/full-demo-eaf0c4f4-310b-42cc-9e63-34363da15c55/report.json.
- It includes API/core eight scenarios, deadlines, wallet/refund, receipt reconciliation, pre-funded execution, Vault grants and purchases, accepted-artifact workflows, durable queue, scoped consumer failure/restart/revocation, local EVM contracts, actual finalized mainnet USDC reads, real local Qwen, official local ERC-8004, independent signed supplier, new skill installation, model purchase suggestions, fresh showcase, independent evidence inspection, five single-task CRE CLI cases, reusable dispatcher/extension CLI cases and final readiness.
- Final doctor verified web, chain, model, supplier and queue; ready=true and warnings=[] on the retained identity-enabled runtime 5387/8755/7671. No chain/database reset was used. The showcase created fresh success/refund orders rather than reusing older terminal records.
- The report sequence was independently matched against scripts/demo-full.mjs. All step logs and 19 referenced child artifacts were hashed; the artifacts were copied into the run's artifacts/ directory, including the otherwise mutable outputs/showcase.json. verification.json retains these hashes, the tested source commit and source digest 47b0c1a61d0367e9bfecc61420ff03d8c37448786bc01531a19a7218e8ee4a9e. A newer run cannot silently replace this run's retained evidence.
- The earlier 115 Node tests, nine Chromium regressions, four SDK CRE tests, type checks and production build remain the applicable implementation checks. This local run does not claim a new remote CI execution, Site deployment, extension-wallet acceptance or registered DON execution.
- Completion audit: items 1–4 and the current local-demo gate have direct implementation/runtime evidence. Item 5 lacks actual Sepolia contracts/evidence hosting, browser wallet and production-forwarder/DON receipts; item 6 lacks an actual external consumer/monitoring deployment. No hosted schedule was enabled under the user's existing preference. The overall goal remains incomplete; public gates must be accepted separately, and any later code changes require appropriate regression and a renewed complete-demo check.

## 后续能力完善：可配置成果工作流（2026-10-21）

本轮持续目标仍是补齐未完成功能并按项提交，不以本地 demo 通过替代完整 AgentOS 或公共链验收。

- [x] 固定两步扩展为 2–8 步配置，支持已安装的扩展技能、原始输入或前序成果引用，保留 v1 API/记录。
- [x] 前序已验收结果条件判断、跳过采购、依赖跳过传播和对应预算释放。
- [x] 带显式投影的 v2 成果记忆，支持报告、排名、摘要以及有深度和大小上限的嵌套引用，逐层验算及付款复核。
- [x] 中英文配置界面、工作区/买家隔离草稿、同请求恢复、阶段状态展示。
- [x] 新的真实 HTTP/D1/SDK/队列/本地 EVM 六步演示，四笔付款、两步跳过；加入完整 demo 序列。

说明、协议及验收命令见 [WORKFLOWS.md](WORKFLOWS.md)。仍需继续：并行/多输入合并及模板复用、多供应商发现/比较/切换、目标驱动采购与记忆检索、通用插件和验收扩展、独立钱包及链上细粒度授权、市场信誉路由、持续数据/商业结算/运维能力。公网钱包、实际 CRE DON 和托管部署的外部验收保持待完成；本轮未发布站点或启用托管调度。

本项最终验收：119/119 Node 测试、9/9 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站与 CRE 类型检查、生产构建通过。真实本地六步验收见 `outputs/configurable-workflow-demo-b49ca987-1679-477a-bacf-df57d121fe4c.json`；旧版恢复回归见 `outputs/workflow-demo-2b7736ee-f567-4d40-b996-471aa1ffd6f7.json`。本项的独立浏览器失败复现发现条件控件的精确标签无法匹配，已补充明确的可访问名称，单项复测和最终九项整套回归均通过。

新的验收环境为 `http://127.0.0.1:5487`（链 8855、供应商 7771）。旧链 8755 使用启动时加载的旧验证器，实测 `/drafts` 对新 v2 成果记忆返回 400；因此保留旧运行环境与付款记录，另起隔离环境。旧环境失败演示的后续未购买步骤已取消，已付两笔保持原状。完整 demo 序列已加入新检查，变为 24 步；尚未重跑新的整套 24 步，既有 23 步证据只证明此前版本。

实际 CRE CLI/Javy WASM 构建也通过，binary SHA-256：`856515606505a86b37bf5f444380ef9040e9b697fb2608b590a3c08bb389bfd4`；这只证明编译成功，不代表已注册或由 DON 执行。

## 后续能力完善：多供应商目录与独立收款（2026-10-21）

- [x] 1–8 家供应商配置、独立认证、公开目录、按订单固定完整描述符精确路由，保留单供应商配置兼容。
- [x] SDK/API/中英文界面选择供应商，草稿恢复及 AI 建议保留具体供应商；未声明授权不进入采购候选。
- [x] 注册身份读取真实收款钱包；买家直接付款、Vault 注资、供应商校验和结算验收使用相同的固定收款方。
- [x] Vault 显式多收款方链上批准与签名会话集合，旧会话仍只允许原收款方，撤销后阻止新付款。
- [x] 双进程、双签名密钥/日志、双身份所有者/收款钱包的真实本地演示，包含单方故障、另一方继续和原供应商恢复。

接口与边界见 [MULTI-SUPPLIERS.md](MULTI-SUPPLIERS.md)。仍未完成：供应商签名报价、公共开放注册/发现、信誉/时延综合选择，以及在预算约束下确认旧订单退款后自动改购另一供应商。当前工作不把“原供应商恢复”当成“自动故障切换”，不修改已有托管订单的收款方。

本项验收：126/126 Node 自动测试、10/10 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站/CRE 类型检查和生产构建通过。双供应商专项证据为 `outputs/multi-supplier-demo-e7015d38-7917-4bb7-ad21-8256cc5a4c63.json`。

完整 25 步本地演示已完成：`outputs/full-demo-0d152bc2-0f47-4bab-a4a4-e421cc6c3312/report.json`。该报告保留一次展示身份准备失败，并在修复后续跑完成；不是首次无失败的单次运行。更早的测试代币余额耗尽失败保留在 `outputs/full-demo-801682d4-3b8b-4fc6-a4f8-7e3cb9a1f425/report.json`。已为完整演示增加仅限本地链 31337 的 MockToken 资金预检及公共链拒绝测试；展示脚本会准备自己的专用服务/注册身份，不依赖手工预置 Atlas，也不覆盖已有服务。

本次报告目录保留 21 份子报告副本、当前及失败日志和 SHA-256 校验清单 `verification.json`；本项代码摘要为 `893e4ad8d6b089ac8f5ed1a10f879455b5d4f27553b486eac05fa3da8526c413`。当前演示使用 `http://127.0.0.1:5587`、链 8955、供应商 7871/7872。未向公共链广播交易，未执行真实 DON 注册/结算，也未发布站点或启用托管调度；整个持续目标仍有后续功能待完成。

## 后续能力完善：供应商签名报价（2026-10-21）

- [x] 所有新 API 供应商采购获取并验证签名报价；报价绑定订单、工作区、输入/验收承诺、付款方、资产及注册身份/收款方。
- [x] 供应商独立定价与持久化报价重放；修改价格/输入/接收方、过期、无效签名及预算不足均拒绝。
- [x] 钱包与 Vault 在付款前复核，供应商按规范付款区块的时间验收有效期，已有效付款的订单不因随后报价到期而失效。
- [x] 中英文签名价预览、草稿修改失效、刷新持久化和同订单重试；保留历史无报价订单的既有承诺。

真实本地四组验收见 `outputs/quote-demo-8632ea02-87c9-4975-8abf-ef4e666a49a9.json`。详细协议及边界见 [SUPPLIER-QUOTES.md](SUPPLIER-QUOTES.md)。自动退款确认后的预算内改购仍未实现，不把报价成功当成自动故障切换。链上合约/CRE 当前不独立验证报价签名和报价到期；钱包、运行时与供应商负责检查，公共链/DON 验收仍待完成。完整 demo 序列已加入报价检查，现为 26 步；此前 25 步报告证明此前版本，不替代新的整套验收。

本项检查：130/130 Node 测试、10/10 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站/CRE 类型检查和生产构建通过。最新完整演示前 23 步通过，包括双供应商与签名报价；第 24 步官方 CRE CLI 编译成功，但模拟的认证请求在 `api.cre.chain.link` TLS 握手超时。保留原失败及一次显式续跑的相同失败，没有将网络故障改为通过，也没有据此要求用户重新登录。第 25–26 步尚未执行，整套 26 步验收仍未完成。

报告为 `outputs/full-demo-93722ba6-9ea1-45db-ac7f-7f4655927122/report.json`，同目录保留 22 份子报告副本、当前/失败日志和 `verification.json` 校验清单，以及 Node/构建原始日志。当前代码摘要为 `607e69005bd08aded1d72b0f7d7cce2d779f4efa22090a4607c9ec8bec037920`。新增功能使用独立本地环境 5787/9155/8071/8072；旧环境与数据保持原状。未发布站点、启用托管调度或向公共链广播。后续仍需真实报价比较、退款确认后的自动改购及其他 AgentOS 能力。
