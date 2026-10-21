# AgentOS implementation roadmap

User request: complete improvements in the review order, test and commit each item separately, then execute the complete demo. The updated objective requires a final complete regression after all remaining functions are finished; per-increment checks do not satisfy that final gate. Local evidence, public-chain evidence and deployment remain separate acceptance gates.

| Order | Deliverable | Required evidence | State |
| --- | --- | --- | --- |
| 1 | Complete delivery commitment and independent acceptance | Versioned skill/input contract; complete result hash; detail tampering rejected by runtime-independent verifier and EVM settlement; CRE WASM/CLI evidence | Implemented and checked; validation below |
| 2 | Real business data skill | Actual source fetch, immutable provenance and scope, useful output and reproducible acceptance | Implemented and checked; validation below |
| 3 | Vault in actual ordering | One owner grant, two bounded purchases, revocation denies subsequent purchase; refund/buyer accounting | Implemented and checked; validation below |
| 4 | Two-step workflow and memory references | Persisted dependencies, previous accepted artifact as next input, recovery without duplicate payment | Implemented; item validation below |
| 5 | Public testnet and CRE settlement | Real wallet, registered workflow execution, actual forwarder payment/refund transactions; account access verified rather than assumed | In progress; receiver/publisher/reconciliation/reusable dispatcher implemented; public acceptance pending |
| 6 | Third-party onboarding and hosted operation | New skill onboarding with integration acceptance; authenticated deployed consumer, monitoring and failure recovery | In progress; new skill and scoped consumer operations locally accepted; actual hosted operation remains open |
| Local complete-demo gate | Execute the current complete local sequence after all remaining implementation commits | Current ordered 30-step HTTP/D1/EVM/model/supplier/CRE dry-run evidence and final regression | Open for current source; the latest 28-stage attempt passed 25 steps before external HTTPS failure. Historical 23-stage pass at aae3f7e remains scoped to that source. |

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

## 后续能力完善：真实报价采购建议与原报价采用（2026-10-21）

- [x] 买方/输入/Vault 绑定的供应商询价比较；以独立签名价格筛选，服务档案标价不排除实际可负担的供应商。
- [x] 最多 24 个报价、每批四个并发；无效、不可用、超预算、输入不兼容和会话未授权分别排除，超大目录明确拒绝而非漏掉候选。
- [x] 保持模型的受限意图分类，服务端确定价格与选择；模型推理后再次检查报价有效期，旧无买方调用仅比较内置服务。
- [x] 中英文比较表、价格凭证及排除说明；采用时 SDK 重新核验并保留同一签名报价/订单 UUID，刷新与创建丢响应重试不重新定价。
- [x] 实际 Qwen、双供应商签名、HTTP/D1/SDK/身份/本地 EVM 四组演示，包括买方与 Vault 付款，且询价不创建订单/预留预算。

详细协议见 [PURCHASE-COMPARISON.md](PURCHASE-COMPARISON.md)。实际演示为 `outputs/quote-planning-demo-5ac9861f-31a2-4ddd-bf8d-6fc136b0de36.json`；本地标价 1 和 9999 与真实报价 240 和 200 故意相反，实际选择并支付 200。旧版无买方模型回归通过：`outputs/planning-demo-f8bd3894-d65c-4f2a-b3c2-5c46843d98a2.json`。

134/134 Node 测试、最终完整 11/11 Chromium 回归、网站/CRE 类型检查及生产构建通过。新增浏览器测试发现采用后草稿延迟保存可能覆盖签名报价，已修复并通过单项和完整回归。一次并发运行模型验收遇到推理不可用；本地模型只有一个推理槽，串行复测通过。两次脚本准备失败（服务编号、调时 API）、浏览器失败截图/日志、模型失败日志和通过证据保留在 `outputs/validation-quote-comparison-2026-10-21/`；未把失败删掉或直接标为通过。代码摘要为 `fc46bc6495ba00dfcb15e5c173c820cad99ebfc7ca7bef210824c60c74618d9f`。

完整演示新增 `demo:quote-planning`，现为 27 步；此前 26 步因 CRE 认证 TLS 超时中断的报告不作为新版完整通过证据。本项仍是人工审核的采购建议，未完成退款确认后的自动改购、动态目标拆解、供应商组合工作流及其他未完能力。公网钱包、实际 DON 与托管运维的外部验收继续保持待完成，未发布站点或启用托管调度。

## 新版完整演示检查 — 2026-10-21，尚未全部通过

在提交 `72aaa689aa88cf7ca940ed9a171b96d4b3673127` 上从第一步运行 27 步序列，前 24 步全部通过，包括新增真实报价比较、原报价采用、实际付款与展示证据；报告为 `outputs/full-demo-9709cad8-4bc4-44b1-b372-410c8b6a5dc1/report.json`。第 25 步官方 CRE WASM 编译成功，认证恢复，事件接受、错误交付拒绝及承诺不匹配三项模拟达到各自预期；资金库场景读取 `httpbin.org` 合成证据时超时，整步失败。第 26–27 步未执行，不能宣称新版整套通过。失败报告与 22 份子报告副本、日志哈希、代码提交及摘要保留在同目录的 `artifacts/` 和 `verification.json`。

随后尝试复用已有临时 HTTPS/workerd/R2 夹具以移除回显站点依赖，但临时 Cloudflare 隧道在本机 DNS 解析时超时，没有开始模拟案例。实验补丁、失败报告及隧道日志保留在 `outputs/validation-controlled-cre-2026-10-21/`，实验未提交为已完成功能；工作源码恢复到已验收版本。后续仍需完成演示证据入口的稳定性改造，以及原目标中的自动改购等功能。未重置已有链和工作区，未发布站点或启用托管调度。

## 后续能力完善：确认退款后的自动改购（2026-10-21）

- [x] 审核两到三家不同供应商、相同技能/输入的签名报价；支持指定优先级或签名价格排序，固定每次尝试的订单编号、身份与收款方。
- [x] 首笔采购前预留全部尝试的累计 Vault 额度、工作区预算和订单槽位；退款不恢复已发生的 Vault 累计用量。成功、取消或尝试耗尽释放未创建的后续预留。
- [x] 核验真实退款及规范区块；公共配置需覆盖退款的最终确认区块，重新核对最终确认锚点与退款区块哈希。未确认、网络中断或未过期的在途付款意图不会触发下一笔采购。
- [x] 在后续订单申请注资前再次核验所有前序退款；独立持久改购作业覆盖退款后的崩溃间隙，丢响应和并发恢复不重复转出本金。
- [x] 默认及独立收款方均在付款前重查供应商委托；SDK/Vault 执行者拒绝已撤销的供应商。保留已付款订单的回执恢复。
- [x] 中英文报价审核、累计费用、异步会话选择恢复、同编号重试、阶段订单/退款凭证、恢复/取消及移动端界面。

协议与边界见 [PURCHASE-ROUTES.md](PURCHASE-ROUTES.md)。真实 HTTP/D1/SDK/双进程供应商/ERC-8004/Vault/本地 EVM 七组验收通过：`outputs/purchase-route-demo-59182d25-203a-434f-8632-5483a61f5f00.json`。共七笔实际注资，其中三笔付款、四笔退款，另三笔草稿取消且没有转账；累计注资费用 1520 分，实际付款 600 分，两家供应商余额变化与之相符。测试工作区 17 个作业全部完成，pending/leased/dead 均为零。主改购场景复用一次会话签名，后续场景另设一份授权，合计两次买方会话签名；不把授权存款/批准等链上交易说成一个钱包动作。

最终 138/138 Node 测试、完整 12/12 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站/CRE 类型检查及生产构建通过，补充语言字典回归也通过。实际 SQLite/EVM 专项验证了最终确认等待、锚点变化拒绝、不可变发布后的 CAS 失败、过期租约、并发恢复、付款前再次核验退款、撤销委托零转账拒绝和供应商全部失败；公共最终确认分支使用本地 EVM 上受控的最终区块读取测试，不是公共测试网验收。

集成期间的零金额预检错误、旧测试占位身份、浏览器异步会话恢复/就绪失败均已修复并保留证据。旧供应商测试改用真实注册表/委托，还核验 SDK 拒绝付款时 token 余额及 Opened 事件均未变化。失败记录、最终原始日志、七组报告和移动端截图保留在 `outputs/validation-purchase-routes-2026-10-21/`；代码摘要为 `4d3aaaff2b6b6c8a4b562fbbabdd4eb5a0200c09fa1ce59227afe9498d3b8530`。

完整演示已加入 `demo:purchase-routes`，现为 28 步，新整套验收仍需另跑。既有 27 步网络失败报告不证明本版本完整通过。剩余目标仍包括动态目标拆解、供应商组合工作流、并行/多输入合并、通用插件、开放市场与信誉路由、独立钱包/更细链上授权及公网/实际 DON/托管运维验收；本项不替代这些功能。仍以本地 demo 交付，未发布站点或启用托管调度。

## 28 步完整演示验收记录（2026-10-22，香港时间）

- 使用已提交版本 `00802ba8082666570fbc882d7a014fdf3da39b3b`，代码摘要保持 `4d3aaaff2b6b6c8a4b562fbbabdd4eb5a0200c09fa1ce59227afe9498d3b8530`。运行时间为 2026-10-21 16:11:21–16:17:20 UTC，即香港时间 10 月 22 日 00:11:21–00:17:20；本次没有续跑。
- 前 25 步通过，包括自动改购七组验收、新建展示订单和证据检查。第 26 步官方 CLI/Javy WASM 编译成功，首个 accepted-delivery dry-run 成功且托管仍为 Funded；随后准备下一个场景的 httpbin.org 合成 HTTPS 证据预检报 `fetch failed`，整步退出码为 1。它与上次模拟器内部 10 秒 HTTP 超时是不同失败位置，不能合并称为本次模拟器超时。
- 第 27 步可复用 CRE dispatcher 与第 28 步最终 doctor 未运行，完整演示未通过。报告：`outputs/full-demo-effa8791-ab91-460f-92ec-7fc8e0932411/report.json`。保留全部 26 步日志和 23 份子报告副本，`verification.json` 记录源码版本、报告、日志和子报告 SHA-256，包括可变的 showcase 输出快照。
- 结束后另行运行本地 doctor，结果保留为同目录 `post-run-doctor.log`；这项独立检查不替代完整序列中未运行的最终 doctor。供应商组合工作流、其他平台能力和公网验收仍待继续；本次未发布站点、启用托管调度或向公共链广播交易。

## 后续能力完善：供应商组合工作流（2026-10-22，香港时间）

- [x] v3 工作流允许每步选择内置或独立供应商；固定供应商描述符、注册身份和收款方，保留 v1/v2 的固定价格与记录。
- [x] 明确批准 `signed-at-execution-under-cap` 模式：前序付款成果尚未生成时不伪造提前报价；预留全部未来供应商费用上限、内置报价、工作区预算和订单槽位，逐步获取并独立验证精确输入的签名报价。超额停止，不自动换供应商或抬高预算。
- [x] 已验收成果和规范付款逐层复核，条件跳过不报价、不付款；报价写入后丢响应保留原请求及持久检查点；撤权阻止后续采购，恢复相同委托后可显式继续；无效交付退款并阻断依赖采购。
- [x] 内联执行、owner 恢复与持久消费者共用执行器；中英文供应商选择、收款/签名地址、费用上限说明、草稿恢复和同编号重试。

协议及信任边界见 [SUPPLIER-WORKFLOWS.md](SUPPLIER-WORKFLOWS.md)。真实 HTTP/D1/SDK/双进程供应商/官方 ERC-8004/Vault/本地 EVM 的六组验收通过：`outputs/supplier-workflow-demo-e4c773e3-81ba-4c82-8f34-c39c73c56912.json`。实际注资 10 笔，9 笔付款、1 笔退款，另两笔未注资取消；累计注资 2960 分、实际付款 2760 分，两家供应商分别收到 2160 与 600 分，余额增量一致。主测试只签一份买方会话，链上存款/批准/委托另计；19 个队列作业完成，pending/leased/dead 均为零。

新增混合执行专项也已通过：进程内 EVM 部署真实 ERC-8004 注册表和委托，执行“内置报告 → 独立签名供应商摘要 → 内置报告”，三步实际价格为 360/200/360 分，分别核对规范付款、嵌套成果和唯一 Opened 事件。供应商在该专项中使用进程内签名适配器，外部 HTTP/供应商日志由上述六组独立验证，不把进程内适配器说成公开第三方服务。

最终 145/145 Node 回归、13/13 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站/CRE 类型检查及生产构建均通过，新增混合专项所在文件的 5 项测试也单独通过。失败证据保留于 `outputs/validation-supplier-workflows-2026-10-22/`：报价故障模式误用、队列排空没有等待退避、浏览器首次恢复只完成父步骤，以及 Chromium 无法读取诊断响应体。测试已改用真实报价丢响应模式、等待队列可运行、明确等待创建重试结束，并直接复核 UI/工作区/链结果；补充等待后的专项和完整 13 项均通过，但不据此认定首次恢复失败的唯一原因。

七组 HTTP 扩展脚本已加入混合场景，但补跑因自动权限审核连续两次超时未启动；这不是已执行的测试失败，也不是安全性拒绝。本轮不宣称七组 HTTP 全部通过。完整 demo 已加入本项，现为 29 步；用户要求的最终完整测试在其余功能全部完成后执行，本轮增量回归不替代该最终验收。

原始日志、六组 HTTP 报告、混合 EVM 专项、完整回归、移动端截图及失败快照已留存；`verification.json` 记录逐文件 SHA-256 和证据范围。代码摘要为 `9d5b1c0763ab4f835ac474b69c5062e1758c9aa9d0a0ce4c717ecedc219a49f4`，测试源码摘要为 `74fa448ac0bf99075974769ca304f72e28dcb7797ad0b59129ee3661a7fc4979`。

仍需完成动态目标拆解/重规划、并行与多输入合并、模板复用、语义记忆选择、通用插件、开放市场/信誉路由、独立钱包及细粒度链上授权，以及公网/实际 DON/托管运维的外部验收。仍按用户选择以本地 demo 交付，不发布站点或启用托管调度；总体目标尚未完成。

## 后续能力完善：目标驱动多步规划（2026-10-22，香港时间）

- [x] 真实语言模型根据目标从已授权目录生成 2–8 步方案，选择服务、原始/前序成果输入及可选条件；服务端独立验证依赖、权限、供应商身份、费用与累计额度，不以固定意图模板替代推理。
- [x] 生成阶段只保存可审阅提案，不创建订单、作业或资金预留。提案固定目标、输入、目录、模型及提示/响应摘要、供应商绑定和费用上限，最多五分钟有效；显式批准后原子创建工作流、首单、持久作业与提案关联。丢响应重试复用同一工作流。
- [x] 中英文规划/审阅界面、按钱包与工作区隔离的表单恢复、批准丢响应后的历史恢复、移动端展示；原有单步小模型保留，新增独立官方 Qwen 2.5 3B 服务及固定文件校验。独立模型配置不继承其他提供商密钥。

真实模型 HTTP/D1/SDK/持久队列/Vault/本地 EVM 四组验收通过：`outputs/workflow-plan-demo-31bcb83e-a639-4909-bdd8-0f67f4d4efac.json`。两种目标分别形成不同的两步、三步程序，批准前零订单；批准丢响应、跨工作区/摘要篡改、价格变更与撤销提案均按预期处理。五笔实际付款合计 1440 分，一次买方会话签名；Vault 与收款方余额增量吻合，七个队列作业完成，pending/leased/dead 均为零。存款、授权等链上交易与会话签名分开计数。

最终 163/163 Node 回归、14/14 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站/CRE 类型检查及生产构建通过。浏览器实际核验刷新后提案保留、批准响应丢失后只生成一个工作流、两步付款/成果血缘、中英文与移动宽度。实际进程内 EVM 专项另外覆盖不可变发布后 CAS 失败、并发批准、三笔付款和条件跳过；该专项的模型响应受控，不冒充真实推理。

保留小模型条件错误/步骤顺序错误及 3B 首次标题截断末尾空格导致 SDK 比较失败的证据。标题生成与验证现使用一致的 trim 规则，完整真实模型验收已在修复后通过。此前原生 CLI/浏览器启动曾因自动权限审核超时未运行，本轮重新启动并取得上述完整通过结果，不将超时记为执行失败或测试通过。

原始日志、失败/成功报告、模型配置与启动日志、移动截图及逐文件 SHA-256 保存于 `outputs/validation-workflow-plans-2026-10-22/`。协议及限制见 [WORKFLOW-PLANNING.md](WORKFLOW-PLANNING.md)。本项完成初始目标拆解，运行中失败后的动态重规划仍未实现；并行/多输入合并、模板、语义记忆、通用插件、开放市场/信誉路由、独立钱包/细链上授权及公网外部验收仍待继续。当前完整 demo 为 30 步，其最终整套验收待剩余功能全部完成后执行；没有发布站点、启用托管调度或公共链广播。
