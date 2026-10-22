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
| Local complete-demo gate | Execute the current complete local sequence after implementation commits | Current ordered 37-step HTTP/D1/EVM/model/supplier/plugin/CRE dry-run evidence and final regression | Passed on 4ccad5b with one explicit same-source network recovery; all 37 final steps passed, original DNS failure retained. Current regression: 228 Node, 21 Chromium, 6 CRE SDK. See final acceptance below. |

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

## 后续能力完善：工作流模板复用（2026-10-22，香港时间）

- [x] 工作区持久化、不可覆盖的名称/版本、2–8 步技能槽位、技能版本/扩展定义摘要、费用上限、输入依赖和条件；支持幂等保存、可移植导出/跨工作区导入、归档/恢复与显式服务绑定。
- [x] 模板不复制业务输入、钱包、部署、会话、签名、收款方、端点或凭证。套用只更新编辑器，保留当前输入并清空会话选择；选择当前服务/供应商及有效会话后，显式启动新的工作流。实例化与导入均不创建订单、作业或资金预留。
- [x] 中英文界面、刷新恢复、受限 JSON/API/SDK、摘要与工作区绑定校验；服务/价格/技能策略变化拒绝复用，供应商精确报价和链上授权仍由原执行器重新检查。模板是可编辑起点，不是已签名采购指令或全局发布注册表。

真实 HTTP/D1/SDK/队列/Vault/本地 EVM 三组最终验收通过：`outputs/workflow-template-demo-722699b3-bffb-48b8-b03b-6ea5bdc8875e.json`。保存丢响应后只有一份模板；跨工作区导入后显式绑定服务且没有采购；同一模板在两份新输入上分别完成两步采购，四笔付款合计 1200 分，一次买方会话签名；余额增量、唯一 Opened 事件、前序成果血缘均吻合，六个队列作业完成且 pending/leased/dead 为零。首次三组通过报告也保留，最终报告在后续隔离/只读修复之后重新运行。

当前源码 169/169 Node 回归、15/15 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站/CRE 类型检查及生产构建通过。模板浏览器用例核验丢响应重试、刷新保留、导出边界、显式绑定、套用清空已选会话/保留输入、未重选会话不能启动、两步付款、归档/恢复、中英文与移动宽度。实际移动截图已人工查看。

保留集成失败证据：测试只在进程起始补币，连续用例中余额不足导致存款回退；模板测试拦截器遗漏隔离头，使一份测试模板写入默认本地工作区，已按固定 ID/摘要核对并归档，未删除历史或产生采购；供应商恢复遇到订单执行租约竞争，诊断 API 记录 `executing/running`。补币现按每个用例实际缺额补足，拦截器保留隔离头，SDK 可额外绑定预期工作区。发现的 GET 执行副作用单独提交为 `40e3c89`，见 [READ-ONLY-OBSERVATION](READ-ONLY-OBSERVATION.md)；移除后供应商恢复实际返回订单/工作流均 completed、pending 为零，完整 15 项通过。

原始成功/失败日志、报告、截图、测试隔离清理记录及逐文件 SHA-256 保存在 `outputs/validation-workflow-templates-2026-10-22/`，只读专项证据另存于 `outputs/validation-workspace-read-only-2026-10-22/`。协议及使用方法见 [WORKFLOW-TEMPLATES.md](WORKFLOW-TEMPLATES.md)。本项加入完整演示后现为 31 步，最终整套测试仍待其余功能完成；运行中重规划、并行/多输入合并、语义记忆、通用插件、开放市场/信誉路由、独立钱包/细链上授权及公网外部验收继续保留为未完成项。未发布站点、启用托管调度或公共链广播。

## 后续能力完善：保留已付款成果的审阅式重规划（2026-10-22，香港时间）

- [x] 从尚未完成且未被替代的工作流构建受限历史：核验全部已付款成果、规范退款最终确认与未发送意图，保留原始目标、已花累计额度、状态快照、可复用根与每步历史。活动托管或未决注资须先处理，生成提案不改变旧工作流或预留。
- [x] 真实模型从授权目录生成 1–8 个剩余步骤，可引用原始输入、任意可用的已付款祖先成果或新方案前序成果。模型只看到汇总事实/摘要和目录；不读取转账明细、完整凭证、签名或密钥。原工作流与新方案目标/供应商均作为不可信文本处理，采购仍由服务端独立校验。
- [x] 用户审阅总体累计上限、此前尝试费用、剩余方案与成果引用后显式批准。旧的未支出预留仅在批准的同一 CAS 中释放，旧工作流写入 supersededBy，新方案、首单、持久作业和计划关联原子提交；原付款/退款及不可变成果不被改写。
- [x] 每次新注资再次检查批准程序、来源关联及全部此前退款/未发送证明；成果与父/祖先付款继续逐层复核。退款回 Vault，但不补回目标累计额度、签名会话与链上额度；方案不会自动提高总上限。中英文、选择/额度刷新恢复、编辑器无关输入隔离与移动端展示均接通。

真实模型 HTTP/D1/SDK/独立签名供应商/官方 ERC-8004/Vault/本地 EVM 四组最终验收通过：`outputs/workflow-replan-demo-7c1928d7-a3da-434a-b33b-6ec0a5179394.json`。原报告付款 360 分、错误摘要退款 200 分，模型分别产生一步和两步不同修复程序。批准两步方案后复用原报告，只新购摘要/报告共 540 分，累计注资 1100 分低于审阅的 1200 分上限；实际付款 900 分、退款 200 分。四笔唯一注资，三笔付款、一笔退款，一次买方会话签名；Vault/收款方余额、原交易 hash、成果血缘与唯一 Opened 均吻合。六个队列作业完成，pending/leased/dead 为零。首次同范围通过报告另行保留，不合并为一次运行。

177/177 Node 回归、16/16 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站/CRE 类型检查及生产构建通过。新增实际进程内 EVM 专项验证了刚好用满签名会话额度时正确替换旧未来预留、退款未最终确认拒绝批准/新注资、不可变发布后提交失败、并发批准、竞争提案拒绝、单步修复选择非首个付款根，以及两次重规划后选用更早祖先成果；其模型响应受控，不冒充真实推理。五项额外单测覆盖严格字段、推理前超额拒绝、快照漂移/诊断稳定、原始输入不入模型及 SDK 模式/来源/额度拒绝。

浏览器实测使用真实模型与实际退款场景，刷新后来源和额度保留；故意无关的编辑器 JSON 不覆盖原输入；生成时零新采购，批准丢响应后从历史恢复同一替代工作流；完成两步付款且原付款/退款 hash 不变，双语移动宽度通过，实际截图已查看。原始报告、编译/回归日志、截图及逐文件 SHA-256 保存于 `outputs/validation-workflow-replanning-2026-10-22/`；协议、信任边界与限制见 [WORKFLOW-REPLANNING.md](WORKFLOW-REPLANNING.md)。

本项完成由 owner 触发并明确批准的动态替代规划，不启用无人值守的失败触发提案或自动批准；该自动触发能力仍在剩余范围。并行/多输入合并、语义记忆选择、通用插件、开放市场/信誉路由、独立钱包/细链上授权、演示外部 HTTPS 依赖改善与公网/实际 DON/托管运维验收仍待继续。当前完整演示为 32 步，按总体目标要求，最终整套验收在剩余功能完成后执行；本轮增量回归不替代它。未发布站点、启用托管调度或公共链广播。

## 后续能力完善：受限的自动失败修复提案（2026-10-22，香港时间）

- [x] owner 为未完成工作流配置固定模型、目标、Vault 会话、累计目标/剩余方案/单步费用上限、1–3 次尝试与有效期。配置、重试和只读轮询均不调用模型、不创建替代采购；配置丢响应后按同一编号恢复。
- [x] 工作流受阻后原子发布独立持久 repair 作业；消费者先核验已付款成果、全部退款最终确认、未决注资、授权和目录，再持久领取推理租约。并发只发起一个有效尝试，失败及租约过期消耗次数，迟到结果或停用后的结果不能回写；凭证不可用等待不消耗模型次数。
- [x] 自动生成提案后等待人工批准。明确批准原子创建替代工作流，并沿用策略原摘要、到期时间、累计上限和已用次数；停用、撤权、模型漂移和原工作流取消均保留边界。已经保存的提案仍可在原期限内手动批准，停用策略不会因此重新启用。
- [x] owner API/SDK、中英文配置与历史、刷新恢复、审阅链接、停用/恢复和移动布局接通。修复零费用授权预检查误调用正金额转换器的问题；实际 EVM 专项同时验证零费用仍检查当前授权、正费用剩余额度精确边界及撤权拒绝。

真实模型 HTTP/D1/SDK/独立认证消费者进程/签名供应商/官方 ERC-8004/Vault/本地 EVM 三组验收通过：`outputs/auto-repair-demo-2263f630-8528-4550-9060-43a5f9ae76d8.json`。无浏览器推进地完成原报告付款 360 分、错误摘要退款 200 分，并自动生成复用已付款报告的两步提案；批准前仍只有两笔原订单。批准后重启本轮自己的消费者完成摘要/报告采购，累计注资 1100 分、实际付款 900 分、退款 200 分，仅一次买方会话签名和一次真实模型尝试。原付款/退款 hash、唯一 Opened 和余额增量吻合；7 个队列作业完成，pending/leased/dead 为零；两次消费者进程均正常退出并撤销本轮凭证。

184/184 Node 回归、17/17 Chromium 回归、5/5 CRE SDK 测试（80 assertions）、网站/CRE 类型检查及生产构建通过。新增浏览器专项实际验证丢配置响应后刷新并同编号重试、字段恢复、无 owner 生成请求的自动提案、批准前零新采购、停用后手动批准不重新启用、一次会话签名、原回执保留、中英文和移动宽度；移动截图已查看。最终恢复了通用 `failed` 的既有翻译，另跑 4 项语言专项和生产构建；没有改变全站失败状态的含义。

失败证据保留：首次实际消费者演示在推理前等待超时（`outputs/auto-repair-demo-cd8b91eb-6175-4eb1-9d87-bbd737bf43a0.json`），定位到零金额预检查，修复后上述同范围三组通过；完整 Node 首轮 180/184，通过本地监听的四项因沙箱 `listen EPERM` 失败，允许本地监听后完整 184 项通过。未将环境失败或首次失败计为成功。原始日志、成功/失败报告、截图与逐文件 SHA-256 见 `outputs/validation-auto-repair-2026-10-22/`。

协议及范围见 [AUTOMATIC-REPAIR.md](AUTOMATIC-REPAIR.md)。本项完成受限的失败触发提案，不实现自动批准或无限自主重试。当前完整演示为 33 步，最终整套验收仍在其余功能完成后执行；本轮增量回归不替代该关卡。并行/多输入汇合、语义记忆选择、通用插件、开放市场/信誉路由、独立钱包/细链上授权、外部 HTTPS 演示依赖改善与公网/实际 DON/托管运维验收仍未完成。继续按用户选择本地交付，不发布站点或启用托管调度，总体目标保持进行中。

## 演示证据服务改造：代码与本地回归完成，实际 CLI 网络验收待继续

- `demo:cre` 不再从 httpbin base64 URL 读取数据，改为使用既有 dispatcher 演示的临时 HTTPS/workerd/R2 服务，仅公开脚本内合成数据，哈希路径固定输入及成果。服务写入后必须匿名读回精确字节；写凭证不进入公开读请求、配置或报告。
- 新增独立发布辅助器：丢响应、HTTP 408/429/5xx 和网络/响应中断有限重试三次，始终复用原字节；冲突、重定向、过大响应和规格/字节变化立即失败。继续使用真实 HTTPS，未增加 HTTP 或关闭证书验证的替代路径。退出仅关闭本轮临时链和隧道。
- 两个新测试覆盖真实 workerd/R2 写入后丢响应、暂时读失败、不可覆盖、匿名读取、重定向及恶意规格拒绝、重试上限和凭证脱敏；连同原证据服务专项 3/3 通过。完整 Node 回归 186/186 通过。没有改动产品界面、合约或 CRE 工作流源码，沿用此前的 17 项浏览器及 CRE SDK 记录，不把它们表述为本次重新运行。
- 官方 CLI 实际编译成功，WASM binary hash 为 `856515606505a86b37bf5f444380ef9040e9b697fb2608b590a3c08bb389bfd4`。本次真实五场景演示在临时 HTTPS 准备阶段停止：cloudflared 日志显示系统 DNS 的隧道 SRV 查询超时，并报告 API 连通故障；只读核查 1.1.1.1 和 8.8.8.8 对该 SRV 查询也超时，未修改系统 DNS 或网络配置。原进程已确认退出，未因观察超时重新启动。
- 失败报告 `outputs/cre-demo-2f574779-0000-4567-b30a-4cd0addaa8ec.json` 为 failed、cases=0，不计为模拟场景通过。本次没有完成这条新证据路径上的真实官方 CLI 验收；后续须在隧道网络可用时继续，不能用本地回归代替。CLI 日志、失败报告、隧道诊断、WASM、Node 和专项日志及 SHA-256 清单保存在 `outputs/validation-cre-evidence-2026-10-22/`。

此提交完成移除 httpbin 依赖和可验证的发布重试改造，保留实际 HTTPS/CLI 和最终 33 步完整演示为开放验收关卡。临时隧道和 CRE 账户 API 仍是外部网络依赖，未声称离线运行、公共链、DON 或托管 SLA。其余 AgentOS 能力继续按上节范围推进，总体目标未完成。

## 后续能力完善：受限并行工作流与多父成果汇合（2026-10-22，香港时间）

- [x] 显式选择 2–4 个在途采购上限，v4 图按依赖启动就绪步骤；一个持久工作流作业及带 fencing token 的六分钟租约协调消费者/owner 恢复。单次 drive 内先顺序注资，再并行执行独立步骤；旧顺序协议与已存记录保持原语义。阻断/取消后已注资子订单交给原订单恢复/退款路径，旧独立作业不会绕过运行中的图调度。
- [x] 合并输入绑定有序、互不重复的全部父成果及规范付款；允许共享祖先的菱形图，拒绝循环/前向依赖。条件跳过传播到汇合下游，退款/失败父步骤阻断新采购。Website、供应商和 CRE 均独立核算完整成果与拼接派生记录；运行时额外核验所有原订单的工作区、买方、部署及规范付款。拼接不去重，重叠输入会重复计入，界面明确说明；深度/节点数/字节/记录上限均保留。
- [x] 真实模型可在明确启用并行模式后生成独立根及多输入汇合，服务端及 SDK 独立检查并发数和完整程序。模板 v2 保存并发数及输入边，套用仍清空会话授权。编辑器、规划器、模板、刷新恢复、同编号重试、中英文和移动端接通。

最终四组真实 HTTP/D1/SDK/两个独立签名供应商进程/官方 ERC-8004/Vault/本地 EVM/固定 Qwen 3B 验收通过：`outputs/parallel-workflow-demo-16e6ce6c-fb96-42dc-84d9-131e5914bde0.json`。两家供应商实际执行窗口重叠后，由第三个签名采购消费汇合的已付款输入；丢创建响应只保留同一图及两个根。另验证两笔执行中取消后的退款、错误父结果阻断汇合，以及真实模型生成并人工批准的三步并行图。10 笔唯一注资、7 笔付款、3 笔退款；实际付款 1820 分、累计注资 2460 分，两家收款方分别收到 1620/200 分，仅一次买方会话签名。供应商每个作业请求一次、余额增量与派生成果核验吻合；6 个持久作业完成，pending/leased/dead 为零。首次四组通过报告同样保留，但不合并为一次运行。

191/191 Node 回归、18/18 Chromium 回归、6/6 CRE SDK 测试（92 assertions）、网站/CRE 类型检查及生产构建通过。12 项实际进程内 EVM 工作流专项另外覆盖三根分支在途上限、租约过期后的旧 driver 被拒绝、共享祖先、条件跳过、篡改记录、外部买方和规范付款改变等。新增浏览器专项验证仅选一个父步骤不能启动、v2 模板、刷新及丢响应重试、两根和汇合实际三笔付款、一次签名、模板套用清空授权、中英文及无横向溢出，实际移动截图已查看。官方 CLI 对新验证器编译成功，binary hash 为 `9b8e03977e2e176eeee72afc6ff619d17cb1228bd8d1d12b1f473a73e980b4ce`；不将编译及 SDK mocks 说成实际 DON 或新的 CLI HTTPS 场景通过。

旧链进程加载的验证器不因网页源代码同步而升级，故新建 5887/9255/8171/8172 的隔离环境；旧 5787/9155/8071/8072 服务、部署、D1 和签名历史均保留。当前环境见 `.sites-runtime/isolated-demo/current.json`。原始报告、类型检查修正前/后的日志、最终回归、CRE/WASM、启动记录与移动截图及逐文件 SHA-256 清单保存在 `outputs/validation-parallel-workflows-2026-10-22/`。

协议见 [PARALLEL-WORKFLOWS.md](PARALLEL-WORKFLOWS.md)。本项已加入完整演示，现为 34 步，最终整套验收仍待其余功能完成后执行；增量回归不替代该关卡。语义记忆选择、通用插件、开放市场/信誉路由、独立钱包/细粒度链上授权与公网/实际 DON/托管运维验收仍在剩余范围；新 HTTPS 证据路径的官方 CLI 实测也保留为待网络恢复后的验收。继续按用户选择本地交付，不发布站点、启用托管调度或公共链广播，总体目标保持进行中。


## 后续能力完善：真实多语言语义记忆与审阅式成果采用（2026-10-22，香港时间）

- [x] 固定官方 Qwen3-Embedding-0.6B Q8_0 工件、文件大小及 SHA-256，独立本地模型端口 11437；查询使用固定指令，1024 维输出投影并归一化为 256 维向量。模型设置、版本和指令绑定配置摘要，独立服务密钥，拒绝无效输出，不以关键词替代推理失败。启动器、doctor 和运行状态已接通。
- [x] 对工作区任务快照、已付款成果汇总和私有笔记显式建立索引，摘要批次与字符数受限；原转账明细、分配列表、钱包签名及密钥不会自动进入模型。D1 独立存储向量、修订笔记和请求，不扩大主工作区 JSON。当前精确扫描上限 700 份，笔记上限 100，非无限向量数据库。
- [x] 严格 owner API/SDK、模型及来源版本失效、部分覆盖展示、持久查询凭证、丢响应同编号重试、90 秒 fencing 租约、推理后 CAS 与原子写入、清除在途请求后迟到结果拒绝写入。笔记 CAS 修改使旧向量失效，删除原子移除关联向量与包含正文的已存查询，不删除无关历史。
- [x] 中英文记忆页与钱包工作流入口接通；跨页只传递查询审阅游标。采用必须在 15 分钟内核验当前买方、部署、规范付款和完整成果血缘；采用只更新输入且清空已选 Vault 会话，不采购或扩大授权。后续创建与执行继续重新核验原付款根。

迁移 0004 先通过 SQLite 在线备份，再只升级当前隔离数据库；原工作区及作业快照摘要完全一致，记录在 outputs/validation-semantic-memory-2026-10-22/migration.json。旧运行环境和历史均保留。

真实模型 HTTP/D1/SDK、两个独立签名供应商、官方 ERC-8004/Vault/本地 EVM 四组验收通过：outputs/semantic-memory-demo-ec070b24-b583-4dc3-b75b-d82d447dfbb8.json。中文检索将英文科研资助付款报告排在无关库存付款成果之前，实际相似度为 0.791099 与 0.468512；查询丢响应复用同一保存结果。另验证跨工作区、错买方、笔记冒充付款成果、模型漂移、同源及消费者限制；笔记修改失效和定向删除。采用原成果后只新购后续两步，共四笔唯一注资及付款、1160 分、一次买方会话签名，原付款 hash、余额与沙盒账本吻合，五个作业完成且 pending/leased/dead 为零。

首次浏览器专项因快速轮询未等待队列再次可用而过早读取空 settlement；改为有界状态等待，并将同一原订单继续推进至 completed，保留失败截图、日志和恢复记录。后续专项通过笔记修订、真实跨语言查询、丢响应后刷新同编号重试、跨页审阅、采用清空会话、刷新保持输入、显式重新授权选择后两步付款，以及中英文和移动宽度。

本项独立协议见 [SEMANTIC-MEMORY](SEMANTIC-MEMORY.md)。语义检索是显式审阅工具，不代表自动将任意历史注入所有规划、模型推理证明或加密记忆。当前完整演示新增 demo:memory，现为 35 步，最终整套验收仍在其余功能完成后执行。通用插件、开放市场/信誉路由、独立钱包/细粒度链上授权与公网/真实 DON/托管运维仍待继续；此前新 HTTPS 证据入口的官方 CLI 网络验收也保持待完成。继续本地交付，不发布站点、启用托管调度或公共链广播，总体目标保持进行中。

本项最终回归：198/198 Node、19/19 Chromium、6/6 CRE SDK 测试（92 assertions）、网站/CRE 类型检查和生产构建通过；六项语义协议/SQLite 测试包含任务摘要不发送明细及 SDK 拒绝畸形/越界响应。首轮完整浏览器 17/19，通过项保留；两项旧测试因新增折叠区导致 summary 选择器不唯一，在采购前停止。收紧为面板自身展开按钮后完整 19 项通过。doctor 新增嵌入模型探测通过，默认工作区暂无身份的提醒保留，不影响隔离测试工作区已验证的身份/订单。原始日志、模型工件描述、真实报告、迁移备份记录、失败/通过截图和逐文件 SHA-256 见 outputs/validation-semantic-memory-2026-10-22/verification.json。

## 后续能力完善：通用隔离插件与只读 MCP（2026-10-22，香港时间）

- [x] 通用有界 JSON/JavaScript manifest、不可变版本、输入/输出 schema、独立审阅 verifier、实际 QuickJS WASM 进程内隔离及可中断 worker。按线程 CPU、墙钟、堆/栈和调用次数限制资源；等待 MCP 不消耗 guest CPU 额度。
- [x] 官方 MCP SDK HTTP initialize/list/call，运营者配置固定端点、只读工具白名单、完整原始工具声明摘要及调用前重查。密钥不进入 guest、manifest 或凭证；拒绝任意端点、重定向、写工具、模块/主机对象、悬空调用及原始 schema 文档漂移。
- [x] owner 安装/授权/执行/撤销/取消/API/SDK、中英文 Agents 面板、同编号丢响应恢复及最后一次额度重试。四张 D1 侧表与工作区 CAS、次数预留及持久队列原子提交；运行 lease、权限 epoch、期限和源代码指纹约束迟到结果，服务重启后复用不可变执行日志。
- [x] 仅当前 5887 数据库备份后追加迁移 0005，迁移前后既有工作区/队列摘要一致。全新 5987/9355/8271/8272/5988/5989 环境实际启动、全迁移、两种插件与实际新链 Vault 读取通过；只停止该临时启动器，恢复原 current.json，目录与历史保留。

最终 206/206 Node、20/20 Chromium、6/6 CRE SDK（92 assertions）、网站/CRE 类型检查和生产构建通过。六组最终真实 HTTP/D1/SDK/QuickJS/官方 MCP/本地 EVM 只读验收：outputs/plugin-demo-cfcd4edf-cc85-4896-842f-af81473a3e87.json。两项完成、两项校验拒绝、两项撤权取消，6 个队列作业完成且 pending/leased/dead 均为零；链订单、链交易与买方签名新增均为零，Vault 余额和区块高度不变。移动端结果截图已查看。doctor 在停模型前核验全部服务 ready=true；默认本地工作区未绑定身份的提醒保留，不影响隔离测试工作区证据。

保留原始失败与修复记录：原始 MCP schema 文档改动曾未改变摘要，改为完整声明 pin；冷启动正常执行曾误用 600ms 墙钟，改为正常 5s 并另保留 600ms 死循环中止测试；新增真实 250ms MCP 等待、25ms CPU 用例。完整八项隔离引擎回归及最终 206 项均通过。原类型/JSX、迁移数据库选择及中间测试失败不计为通过，日志归档于 outputs/validation-plugins-2026-10-22/。

按用户新增的机器资源要求，核验进程归属后停止七套旧隔离 demo，共 45 个进程、约 970 MiB 当时 RSS；保留数据库/部署历史。全部模型相关验收结束后停止本项目三个空闲模型及启动器，模型文件保留。后续只按需启动依赖，每项完成再清理，不停止编辑器、Codex 或其他项目进程。

协议见 PLUGINS.md。此项不授予插件支付权，不声称通用插件已有付费工作流或 DON 验收；下一项须实际打通通用 JSON 插件的预算、托管、独立验收、付款/退款、成果依赖与恢复。当前完整演示为 36 步，仍待后续实现后整套运行。公网验收和托管调度按用户要求暂缓，不发布站点或公共链广播。

## 本地进程资源治理（2026-10-22，香港时间）

新增 demo:cleanup：默认仅预览本仓库旧隔离启动器及子进程，保留当前入口；--apply 才发送 SIGTERM，--models 明确包括模型，--all 明确包括当前和已识别辅助服务。进程目录、限定 Node 命令、父子关系及启动时间/命令指纹共同限制操作；每次信号前重读，跳过已换身份的 PID，不使用 killall 或 SIGKILL，不删除历史。测试/浏览器/完整演示进程存在时拒绝操作。

三个专项测试通过，覆盖当前/模型保护、其他项目与编辑器排除、测试期间拒绝、PID 复用及残留子进程。实际 --apply --models 再核查时没有待清理旧服务，stopped=0、remaining=[]，报告 outputs/process-cleanup-1bb996fa-7afb-44b0-b949-3a4c56334417.json。之前已核验清理的 45 个旧实例进程及 6 个模型进程，分别保留在插件验收目录的 process-cleanup-*.json；清理后当前开发入口及插件/MCP 继续保留，模型待需要时启动。此增量不改变插件/付款逻辑，不冒称重新运行整个 209 项回归。

## 通用插件付费工作流：显式授权与共享额度基础（2026-10-22，香港时间）

完成 Vault pluginPermissions 的 API/SDK 和签名绑定：具体代码、运行时、最高单价、单笔/总额/期限/当前 epoch 均纳入约束；旧签名不自动增加能力，SDK 签名前拒绝不同的权限集合。API 仅允许当前 owner 已安装且工具仍匹配的插件。新增有界 JSON 工作流草稿、已付款父成果输入选择和紧凑费用引用；已注资退款继续占用签名总额，可能广播的取消意图不释放费用。它们是后续持久付费执行器的基础，尚未创建实际插件采购。

214/214 Node、九项 Vault/插件协议/实际 EVM 专项、原有 Vault 界面单项浏览器回归、网站/CRE 类型检查与生产构建通过。实际 HTTP/D1/SDK/本地钱包及 EVM 验收一次签名绑定精确插件权限，错误代码摘要返回 403，零插件采购；测试会话已撤销。新 EVM 用例首次遗漏 viem chain:null 的失败保留，修正后完整回归通过。证据：outputs/validation-plugin-purchases-2026-10-22/authorization-verification.json。

该阶段仅完成支付授权基础，不将签名与类型校验当成付款验收。剩余状态机、实际注资/执行/独立结算、付款/退款与依赖、双语付费界面及完整 demo 见 PLUGIN-PURCHASES.md；总体目标继续进行，公网与托管验收暂缓。模型未启动，本阶段临时 EVM 都在 finally 中断开，当前开发实例保留供下一步复用。

## 通用插件付费核心：持久采购、签名交付与真实结算（2026-10-22，香港时间）

- [x] 通用 JSON 一至八步程序、owner API/SDK、已付款父成果及路径选择、单价冻结、精确 Vault 插件权限；与旧订单/工作流共享真实 Vault、Escrow、费用计算和队列，不伪造转账数据。公共采购模式明确拒绝，旧 CRE 协议不冒充通用代码验收。
- [x] 追加生成迁移 0006 和完整采购侧表；同一次 CAS 预留全部执行次数、费用、作业槽和持久作业。注资意图先持久提交，规范回执确认前不运行 guest。丢响应查回原事件；撤权/取消不能重用旧 epoch，未知广播持续占用额度，期限后的未注资证明才能释放。
- [x] 私有专用交付身份、原子签名日志和 runtimeHash 绑定；独立进程验证完整签名后重放代码/输入/有序工具记录与 owner verifier。拒绝自报 accepted、重算哈希、错误输出、额外凭证字段及高-S/v/hex/signer 拼写可塑性。MCP 原数据仍依赖已授权服务，不声称任意语义、TEE、zkML 或 DON 证明。
- [x] 实际 local Vault 付款、错误成果退款、注资中取消补偿、已矿交易丢响应恢复、父成果规范付款重查、独立认证消费者推进及资源收尾。

最终六组真实 HTTP/D1/SDK/QuickJS/官方 MCP/独立重放/Vault/EVM 验收通过：outputs/plugin-purchase-demo-f4e8e053-f9ea-45bb-bf8e-186523145183.json。五份工作流共六笔注资、五笔付款、一笔退款；累计注资 600 个测试代币分，实际付款 500、退款 100。仅一次 owner 会话签名，另三笔存款/白名单/授权交易单独计数。只读 MCP 在实际注资后取规范 Vault 区块，独立重放不再请求 MCP；无效 verifier 退款并停止依赖。独立消费者在 owner 只读轮询期间完成两次付款，进程退出码为 0，凭证和测试钱包会话均已撤销。11 个队列作业完成，pending/leased/dead 均为零，余额增量吻合，沙盒 ledger 和旧 chainOrders 不变。

226/226 Node 回归、网站/CRE 类型检查、生产构建通过。随后资金端补充完整 runtime/程序总额再校验，另跑十项 SQLite/签名/实际 EVM 专项及上述六组完整 HTTP 验收均通过。原钱包授权和免费插件的两项 Chromium 兼容回归通过，移动截图已查看；这不是新的付费浏览器入口验收，也不冒称当前全部浏览器重跑。

保留失败及修复证据：SDK 参数属性不兼容 Node strip-only、Workers redirect:error 不兼容、同对象 reducer 条款比较，以及凭证附加字段/真实高-S 等价签名的先失败回归。第一次 HTTP 的原未发送意图保留并取消，测试链推进 35 秒取得原 deadline 后的未注资证明，再完成原队列；无历史删除或重新创建代替恢复。此前六组通过报告也保留，不合并为最终同一次执行。

最终本地实例为 6097/9455/8371/8372/6098/6099；升级前先停止旧实例，保留历史目录，始终只保留一套所需服务。三个模型本阶段一直关闭；所有临时 EVM 与验收消费者均已退出。协议、API 和剩余浏览器要求见 PLUGIN-PURCHASES.md，归档见 outputs/validation-plugin-purchases-2026-10-22/execution-core/。

本项提交完成付费核心/API/SDK，不代表整体目标完成：浏览器付费表单、双语审阅/刷新重试/移动端与新版完整 demo 仍须继续。完整序列已加入 demo:plugin-purchases，现为 37 步；公网与托管验收继续暂缓。

## 通用插件付费网页闭环（2026-10-22，香港时间）

- [x] Agents 中的双语付费面板：显式安装标签归一化→文本报告示例，选择任意已安装插件的一至八步程序、原始或前序已付款输出、对象路径、执行次数和费用上限。安装不执行、不支付；独立审阅代码、verifier、工具、运行时签名地址后分别授权执行及付款。
- [x] 本地买方钱包、精确插件 Vault 会话、累计日额度、付款前程序与次数检查；设置交易和一次会话签名分开显示，新 Vault grant 替换此前授权。错误代码/运行时或旧 epoch 会话不显示为可用，编辑程序/输入/额度清空付款选择和审阅标记。
- [x] 按工作区保存草稿、会话 ID、原提交意图和查看编号，不保存签名、密钥或消费者令牌。刷新明确重新连接钱包；创建响应丢失后，即使最后一次执行额度已预留，仍按原 UUID 恢复。轮询只有 GET；恢复、取消、撤销均显式触发。逐步显示签名成果、资金/结算 hash、父付款引用和历史。

新增实际浏览器专项首次通过；补充旧 epoch 过滤、程序/次数预检、中文文案并消除测试中吞掉状态等待失败的写法后，专项再次通过，最终完整 21/21 Chromium 回归通过。验收从界面创建两步真实 JSON 采购，丢响应刷新后复用同一请求，两个 task 各只有一个规范 Opened 事件，付款哈希和完整签名交付哈希匹配，第二步绑定原父付款；仅一次会话签名。安装与无效预算预检阶段均零采购，编辑清空权限、最后一次执行额度重试、存储仅含草稿/ID、中英文/390px 布局均核验；移动截图已查看，测试付款会话最后撤销。

当前 226/226 Node 回归、6/6 CRE SDK 测试（92 assertions）、网站/CRE 类型检查和生产构建通过。原始日志、浏览器交易证明及截图归档到 outputs/validation-plugin-purchases-2026-10-22/browser-ui/。同步修正 PLUGINS、ARCHITECTURE 与 README 中仍将通用沙箱/本地付费列为未实现的旧描述，补齐 demo:plugin-purchases 的 npm 命令登记。

本项完成网页付费闭环，最终当前 37 步完整 demo 仍须从第一步实际运行，不以增量回归代替。三个模型仅为全部浏览器与最终 demo 按需启动，结束后停掉；仅复用当前一套本地服务，不发布站点、启用托管调度或广播公共链交易。

## 完整演示发现并修复：终态订单的延迟队列记录

在 `844fca3` 上从第一步执行当前 37 步序列，前 11 步通过，第 12 步供应商组合的七组业务场景全部通过，但末尾空队列断言失败，pending=3、completed=19。原报告保留为 outputs/full-demo-91e01d07-19c1-4f21-878e-955f18e59f1b/report.json，不将本次尝试表述为整套通过。直接读取该隔离 D1 表确认三个订单均已付款完成，但其 pending 作业沿用约 90 秒后的原注资重试时刻，在 60 秒收尾结束时仍分别差约 18/23/26 秒才可领取。

工作区 CAS/batch 现在在同一事务中结束本 owner 已不在当前 workItems 中的 pending 行；不修改原 available_at 或删除历史，不执行任务、不发交易、不改 GET。活动 leased 行保留原 token 并按原修订确认；注资、暂停到期和待确认发布等仍需工作的行保留。恢复重新打开原 job ID。两项实际 SQLite 新回归先复现失败再通过，覆盖旧退避终态、存活资金/证据任务、CAS/owner 隔离、活动租约和同编号恢复。两项组合 EVM 测试改为明确断言原订单行已经完成，保留原来的崩溃、最终确认、租约恢复及唯一付款检查；未删除断言以迎合通过。

修复后原七组供应商 HTTP/D1/SDK/ERC-8004/Vault/EVM 验收全部通过：outputs/supplier-workflow-demo-d9d61802-b744-4d9b-98b6-9eee486d3889.json。12 笔注资、11 笔付款、1 笔退款、2 笔未注资取消，累计注资 3560 分、付款 3360 分；22 个作业完成，pending/leased/dead 均为零。原失败工作区另行显式恢复三个到期记录，原订单、付款 hash 和 ledger 均未改变；原失败报告保持 failed。

当前完整 228/228 Node、21/21 Chromium、6/6 CRE SDK（92 assertions）、网站/CRE 类型检查及生产构建通过。九项队列专项和两项组合 EVM 专项共 11 项通过。第一次完整 Node 中两项旧领取顺序断言失败的原日志与后续通过记录全部保留，归档到 outputs/validation-terminal-queue-2026-10-22/。此修复单独提交；由于实现发生变化，最终 37 步须从第一步重新执行，不续跑旧源码的失败报告。模型继续仅供此最终验收按需保留，结束清理；公网及托管验收继续暂缓。

## 当前 37 步完整本地验收完成（2026-10-22，香港时间）

使用已提交实现 `4ccad5bb6d5cc944278ede955c156f92e0e04e62`，源码摘要 `c75f679111e8c3028bd0ad9882d41a0aab5f3aa68bd9cac28018d9f790b6a9d0`，同一 6097/9455/8371/8372/6098/6099 实例。10:11 从第一步开始，前 34 步通过；第 35 步官方 WASM 编译成功，但临时 HTTPS 的默认 UDP DNS 边缘发现超时，cases=0。没有将它记为 CLI 场景通过，也没有跳过后续步骤。

只读 HTTPS DNS 查询取得官方公共 SRV/A 记录，四次实际 TCP 检查均连接成功。临时合成夹具用 cloudflared 既有进程级 `TUNNEL_EDGE` 测试参数验证 HTTPS 可达并关闭。随后核对 Git 无改动、提交/源码摘要、runtime 根目录、真实模型别名及同一链部署，通过标准 `--resume` 从第 35 步显式续跑；系统 DNS/代理/防火墙和 TLS 验证均未改变。此选项是连接诊断/本次验收配置，不是承诺生产支持或默认网络已修复；未将静态 IP 写入产品源码。

最终 10:38 完成全部 37 步，报告 `outputs/full-demo-8001b0aa-da62-4655-bf28-b885ad6b3f44/report.json` 为 passed=true，37 项最终 code 均为 0，failedAttempts 保留原 DNS 失败与原日志。第 35 步官方 CLI 五场景通过，正确/错误交付和资金库明细篡改独立复算，承诺不匹配按预期非零退出且不生成报告；dry-run 后任务保持 Funded。第 36 步固定 dispatcher 配置的四组 CLI 场景及独立本地回调通过，覆盖新订单、新技能、错误成果和已结束跳过。第 37 步 doctor 为 ready=true，九项服务全部就绪、warnings=[]。不把模拟或本地测试回调当成 DON/公共链交易。

全部主日志、原失败及第二次 CRE 日志、子报告快照、网络参数/诊断、隧道日志、WASM 摘要、当前回归记录和逐文件 SHA-256 见同目录 verification.json 与 artifacts/。模型在网络诊断期间先停掉，确认为最后自检所需后才恢复；完成后再次停止本项目三个模型及其启动器，共 6 个进程，清理时合计约 3667 MiB RSS，remaining=[]。仅保留当前一套本地服务；D1、链实例、模型与签名历史文件保留，不清理其他项目或编辑器。

本轮插件验收、通用插件付费 API/SDK/消费者/双语网页和完整本地 demo 交付完成。开放市场、通用插件与规划器统一、更多链上权限等平台化能力仍是独立路线图；真实钱包/公共测试网、实际 DON 与托管调度按用户要求继续暂缓。本节是当前本地交付证据，不将早期失败或其他部署提升为当前公网验收。

## 统一服务描述与通用插件目标规划（2026-10-22）

新增 agentos.service.v1：业务技能、供应商规划候选与通用插件共用带摘要的版本化描述，包含执行适配器、真实输入输出契约、费用及能力绑定。旧业务规划器现使用同一描述；新插件规划面板展示统一目录。转账契约与 JSON 契约保留实际语义，不伪造记录或套用旧 CRE 验证器。详见 SERVICE-CATALOG.md。

模型可从已安装插件生成一至八步顺序程序，选择根 JSON、对象路径或前序已付款成果。原始值与结构化 schema 在审批前检查，必需字段、封闭对象、枚举、数值和长度边界不兼容会拒绝；手工采购也使用同一预检。原有纯额度测试夹具曾将带 count 输出直接送回只允许 labels 的插件，现改为两次独立原始输入，保留两次额度/CAS 检查，并另增真实不兼容组合零采购、零次数消耗的测试。

审阅方案固定输入、目录、源码/运行时/费用、模型与提示/响应摘要；五分钟过期。生成不执行、不付款、不授予权限；实际创建在同一次 D1 CAS/batch 接受精确方案、预留全部次数/资金并提交持久采购。审批响应丢失使用原方案 UUID 恢复；既有采购不能追认一个不同方案。SDK 独立重建可执行草稿，网页按工作区恢复方案标识，修改程序清空付款选择及方案绑定。执行与付款仍分别授权。

真实模型 HTTP/D1/SDK/QuickJS/独立重放/Vault/EVM 三组验收通过：outputs/service-plan-demo-77023be5-c4e4-4f40-aa44-c839ce3cf780.json。模型选择归一化与报告两个插件及前序依赖；生成阶段零授权/采购，错误输入/工作区零预留；丢审批响应只产生一个采购，两笔唯一注资/付款，父付款引用规范，一次会话签名、余额增量与空队列吻合；测试会话最后撤销。

保留初次真实模型选择了不合格输入来源而被预检拒绝的报告 outputs/service-plan-demo-9630e741-e7ef-4800-a4d6-c9e4eabac2f3.json。随后压缩模型选择编号，并用当前兼容目录生成协议格式示例；没有以确定性答案替代模型或放宽校验。首次浏览器在两笔真实付款完成后读取 Chromium 响应体失败；保留原日志并核对原工作流已完成、撤销原会话。修正测试为通过独立 GET 读取原采购，未改产品付款判断；新用例还在 finally 撤销测试会话。

完整 Node 238/238 通过；格式调整后的规划专项另行通过。已有付费流程与新增真实模型规划、审阅、刷新、精确付款、中英文/390px 两项 Chromium 验收通过，移动截图已查看。日志、模型记录与截图位于 outputs/validation-service-plans-2026-10-22/；最终类型/构建记录在同目录。本项完成后停止唯一按需规划模型及其启动器，共两个进程，清理时约 1800 MiB RSS，remaining=[]；保留一套本地应用/链/供应商/插件/MCP，历史数据不删除。

当前完整 runner 增加 demo:service-plans，为 38 步。本项增量验收不代表新版完整序列已通过；插件模板、失败修复及最后整套 demo 继续进行。公共链、实际 DON 与托管部署/调度保持暂缓。

## 通用插件可移植模板接入（2026-10-22）

新增 agentos.service-template.v1，与统一服务描述、schema 组合和审阅采购共用程序编译器。模板固定精确插件版本/源码摘要、真实输入输出契约、依赖路径、逐服务及总费用上限和期限；导出不含原输入、运行时授权、钱包/会话/签名、模型提示或供应商凭证。可从模型或模板方案保存、导入摘要、归档/恢复。名称与版本不可变，模型与模板请求不能用同一 UUID 互相替换来源。

复用时核对当前目录与工具能力、精确代码/契约、新输入、实际价格及原上限，保存无模型证据的模板来源方案，再走同一五分钟审阅与原子付费审批。归档阻止新准备和新审批，已创建采购保留原资金义务及可恢复性。模板中的非默认期限会保留到网页创建请求，原草稿的缺省恢复继续兼容。

真实 HTTP/D1/SDK/QuickJS/独立重放/Vault/EVM 三组通过：outputs/service-template-demo-cf900749-86f1-42d7-92bf-cf035a406d78.json。导入响应丢失后只保留一个模板；新输入准备与另存不复制输入/授权、不调用模型；另一个工作区只导入模板而没有插件时不能准备；归档期间零采购/次数消耗，恢复后两步各一次真实付款，后续归档不改变已创建采购；一次会话签名、规范父付款、唯一注资和余额及空队列吻合，最后撤销测试会话。首次报告保留：缺少代码被正确拒绝，但断言期望的诊断不同；改为逐槽明确提示安装精确插件，未放宽接入条件或删除导入历史。

245/245 完整 Node、17 项规划/模板专项、网站与 CRE 类型检查、生产构建通过。两项 Chromium（既有付费流程及新模板导入丢响应/刷新/归档/无模型复用/真实两步付款）通过；新用例核验 300 秒期限实际进入创建请求、中英文和 390px，移动截图已查看。证据位于 outputs/validation-service-templates-2026-10-22/。

本阶段未启动模型。完成后再次执行进程清理，stopped=0、remaining=[]，报告 outputs/process-cleanup-d87cc0a9-7fb6-42e6-b5f2-7c2d007f8e1c.json；六项当前本地服务均 HTTP 200，11435/11436/11437 三个模型端口均关闭，未删除数据或操作其他项目。新 runner 加入 demo:service-templates，现为 39 步；插件失败修复与最终整套 demo 仍待继续。公共链、DON 及托管部署/调度继续暂缓。协议见 SERVICE-TEMPLATES.md。

## 通用插件审阅式失败修复与已付款根引用（2026-10-22）

统一服务方案新增 agentos.service-replan.v1。终态失败/取消的原采购须先核实全部规范注资与付款/退款，未决广播不能当作未付款。明确选择原目标输入或同一目标谱系内已付款成果；源码/运行时签名、实际付款、原输入与历史费用均纳入上下文摘要。后续修复保留同一目标总上限，每次已注资尝试（包括退款）继续计费，不能重置预算。

替代创建在同一次 D1 CAS/batch 中接受精确方案、预留次数/资金、新建采购并标记原采购 supersededBy；并发与丢响应仍只有同一替代采购。acceptedRoot 固定原流程/步骤/task、付款 hash 与交付 digest；创建时重建规范上下文，注资前复核父付款。本地独立验收者另行核对同 scope/buyer、原验收记录、规范付款、完整输出及跨流程 parent；重新计算伪造引用的摘要仍不能注资。原 escrow/spec、已付款成果与交易凭证不改写。钱包绑定 SDK 有界递归核验原交付与付款，拒绝循环谱系。

真实 EVM/SQLite/QuickJS 专项通过：先付款库存，再拒收/退款报告，用该已付款库存仅采购剩余报告；覆盖原手续费/退款累计、规范证据改变拒绝、CAS 冲突/并发单次替代、独立验收伪造根零注资、原付款不重购。真实模型 HTTP/D1/SDK/独立重放/Vault/EVM 两组通过：outputs/service-replan-demo-71cae298-d480-44a9-864e-65493fcd9c4e.json。保留此前交易证明报告 2b231f1f-c8ac-4d38-9a3e-0c8782106e81；后一次另补余额增量断言。三笔注资、两笔付款、一笔退款、一次会话签名、原规范 parent、唯一资金事件与空队列均核验，测试会话最后撤销。

浏览器实际核验失败历史→选择 paid root→真实模型审阅→刷新→选择原匹配会话→只付款剩余一步，中英文、390px 与最终已完成画面均通过。既有付费流程加修复两项回归通过，补充界面终态等待的单项也通过，最终截图已查看。首次用例错误地要求未连接钱包时存在会话选择器；保留其日志/trace，改为核验控件不存在且保存的授权为空，没有放宽产品权限。日志及图片见 outputs/validation-service-replanning-2026-10-22/。

249/249 完整 Node、20 项规划/模板/修复纯逻辑、实际 EVM 专项、网站/CRE 类型检查与生产构建通过。新功能修改了本地独立链验收程序，因此先停止旧一套九个进程（约 1119 MiB RSS），保留其目录，启动唯一新实例 .sites-runtime/isolated-demo/691195a9-415d-46ee-b210-0bf613603444。验收后关闭唯一按需规划模型及启动器两个进程（约 2420 MiB RSS，remaining=[]）；其他模型未启动。完整回归/构建结束再做进程清理，当前一套本地服务及全部历史保留。

新增 demo:service-replanning，完整 runner 现为 40 步，最终整套尚未执行。此提交完成审阅式修复；下一增量把同一机制接入有次数/预算/期限限制的自动修复提案，再做当前完整 demo。公共链、DON 与托管部署/调度继续暂缓。协议见 SERVICE-REPLANNING.md。
