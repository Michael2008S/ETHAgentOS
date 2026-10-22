# 验证记录

## 当前 41 步本地交付（2026-10-22）

实现提交 709bcd39ed5c88804fb5cc49948634a01e20f650，源码摘要 6a6b846789adac5402160a68a7471adc0e66e0bc722967c0d02532473fce01bd。香港时间 14:04:26–14:27:21，最终 41/41 code=0；最终 doctor 九项服务 ready=true、warnings=[]。报告 outputs/full-demo-68ac37bf-7900-4cd9-a6f5-2daf67354a3b/report.json；同目录 verification.json 比对全部命令、源码快照、日志、39 份子报告快照及 SHA-256。

第 39 步首次最后场景临时 HTTPS 超时，第 40 步首次最后场景账户 API EOF，均保留 failedAttempts、原日志和失败子报告，同源码/同链/同管理模式显式续跑。不是无中断一次通过。最终官方 CLI 五场景、dispatcher 四场景及本地回调通过，CRE SDK 6/6、92 assertions。TUNNEL_EDGE 仅作用于测试进程，不改系统 DNS、代理、TLS；不承诺默认路径可达或外部服务 SLA。

本轮四项核心交付分别提交：统一服务与插件规划 ae64c32，模板 8072852，规范已付款成果修复 e937b72，有界自动修复提案 287a711；资源管理与阻塞修复另行提交。最新专项：14 项规划单测、5 项资源检查、实际两步/三步目标五笔付款、队列六场景、供应商十三场景及受影响浏览器复验通过。此前 fd631ca 上全量 Chromium 25/25 通过，之后按用户快速 demo 要求只复验受影响流程。未再次扩大全量 Node/类型/构建；历史 259 项记录不作为新提交全量回归。

16 次自有模型启动全部停止，原始及续跑记录分别保存，三个模型端口关闭，临时 CRE CLI/隧道为空；六项保留服务 HTTP 200。清理 stopped=0、remaining=[]，报告 outputs/process-cleanup-74c17cf9-ef8b-4a96-8b24-f25af83c91b3.json，状态 outputs/validation-final-services-2026-10-22/final-processes.json。当前唯一服务、D1/交易历史及模型文件保留，未操作其他项目。本轮本地 demo 目标完成；公共链、实际 DON、托管发布/调度继续暂缓。跨契约混合图、开放市场和生产钱包等仍为后续平台范围。


## 历史：2026-10-22 插件付费与 37 步完整本地验收

- 实现提交 `4ccad5b`：228/228 Node、21/21 Chromium、6/6 CRE SDK（92 assertions）、网站/CRE 类型检查与生产构建通过。付费插件覆盖显式执行/钱包权限、刷新丢响应同编号重试、两笔真实本地付款、规范父成果、签名完整交付、撤销及双语手机宽度。
- 当前完整序列最终 37 项全部通过：`outputs/full-demo-8001b0aa-da62-4655-bf28-b885ad6b3f44/report.json`。保留第 35 步的原 DNS 失败；同源码、同链实例采用记录过的进程级边缘参数显式续跑，最后 doctor 九项服务全部就绪。官方 CLI 五场景与可复用 dispatcher 均通过；无公共链广播或实际 DON 部署。
- 完整演示此前发现终态订单仍等待旧队列退避时间的问题，已以 `4ccad5b` 单独修复；原失败、先失败回归、原工作区恢复及后续完整通过均保留。网络默认路径未被改为假成功，系统 DNS/代理/防火墙与 TLS 校验未改变，实验参数不作为生产承诺。
- 收尾停止三个模型及启动器，保留一套当前本地服务与全部数据/模型文件。完整日志、子报告快照、网络条件与 SHA-256 清单见上述目录的 verification.json；详细边界见 ROADMAP-IMPLEMENTATION.md 的最终验收。

## 2026-10-20 八项完善与完整 Demo 回归

按约定完成八项改善，分别提交；未部署新站点版本、真实 DON 或托管调度。

- `npm test`：78 项通过，0 失败；类型检查与生产构建通过。原始日志保存在 `outputs/validation-2026-10-20/`。
- 真实 Chromium 四项浏览器回归通过：创建响应丢失只生成一项任务/一次付款；钱包、自定义草稿和中英文在切页/刷新后保留；订单深链接及 owner 证据隔离；服务降级提示和 390px 宽度。之后加严的两项分别复跑通过：响应丢失后先刷新再提交；跳转到第 11 条历史订单。
- `npm run demo:full` 共 17 个步骤最终通过，包括实际 HTTP/D1、独立内存 EVM 及现有本地链、Qwen、签名供应商与官方 CRE CLI。总报告 `outputs/full-demo-5f493f20-5356-41b6-be74-937bc5d78615/report.json` 保存每项命令、耗时和原始日志。
- 首轮模型步骤发生一次推理不可用，订单安全退款，因此首轮失败未算作成功交付。独立真实推理随后在约 3.6 秒完成；未重启链或模型，从失败步骤继续，模型三场景及所有后续步骤通过。该次不可用未复现，原失败日志保存在 `failedAttempts`，没有隐藏或覆盖。
- 新 showcase 使用 `--fresh`，两笔订单均为本轮新执行；成功订单模型计划、供应商签名、579 分/两条记录复算、当前链上注资/结算、买方 95 分评价全部核验通过。错误交付订单结果不符并退款。
- 最终 doctor 五项服务检查均成功，warnings 为空。浏览器统一证据页已读回并保存 `outputs/final-demo-proof.png`；服务继续运行，链、D1 和供应商日志均保留。
- CI 工作流已配置，但本轮没有触发远端 GitHub Actions；CRE 是已登录官方 CLI dry-run，不广播，也不代表真实 DON 执行。小模型采购分类仍需用户审核。

| 命令 | 本轮证据 |
| --- | --- |
| `demo` | `outputs/demo-ffaffa8e-91ee-48a3-bbd1-1215d729b71a.json` |
| `demo:deadline` | `outputs/deadline-demo-2e7b1d13-d030-4f4e-b9db-0209cbf707e7.json` |
| `demo:wallet` | `outputs/wallet-demo-dffbc3e9-7997-4e3b-b300-ee67c89649e1.json` |
| `demo:reconcile` | `outputs/reconciliation-demo-3b229d09-dc1b-403f-9946-7d9a1d0144ce.json` |
| `demo:prefund` | `outputs/prefund-demo-b4d6bc3c-6f0a-41d4-8179-a2143dd7075c.json` |
| `demo:queue` | `outputs/queue-demo-c6a63477-8fc7-489b-984a-e7872143aaf9.json` |
| `demo:chain` | `outputs/chain-demo-4687fca5-0459-4d1a-89ee-7b018b18226b.json` |
| `demo:model` | `outputs/model-demo-c063faea-15a5-4c59-94f1-974c18fddefc.json` |
| `demo:identity` | `outputs/identity-demo-cbb33b7d-9a7c-4d3f-9a19-ccb01405e540.json` |
| `demo:supplier` | `outputs/supplier-demo-adb8e805-4a69-47f1-9e91-bb0b78f2f98c.json` |
| `demo:planning` | `outputs/planning-demo-2f478157-30f7-41d4-95b8-fe9ccfbc9f8b.json` |
| `demo:showcase` | `outputs/showcase.json` |
| `demo:evidence` | `outputs/evidence-demo.json` |
| `demo:cre` | `outputs/cre-demo-29e3fd5e-0522-480c-89b7-ac038b3e4de9.json` |

展示成功订单：`chain-eddf5921-2c6d-49b4-8d57-ec3a54f1d8fb`，付款交易 `0xaf3d27b32b97f1d66557873f3314e5e6d2e1549d275b00571e5216d7826a1dc4`。

展示退款订单：`chain-13321f81-51e4-4db0-ad50-6753b84da2dc`，退款交易 `0x618cc659112c46538dcef2fe2facba66c180faedbe8a5c8664f7d4eb9cdd16fe`。

## 本地交付收尾

用户确认先以本地完整 demo 交付，暂不启用托管调度；真实 DON 与公网联调保留为后续验收。最终 72 项测试、类型检查、生产构建通过。最后补充中文错误文案后，6 项语言/API 相关测试再次通过。

- 核心八场景：`outputs/demo-a9e054ff-2997-417b-81f7-70dce99906b2.json`。
- 供应商十三场景：`outputs/supplier-demo-cd0f6182-f11d-46e0-a2da-fe7cbf24bef8.json`，实际 Qwen、官方身份绑定、签名交付、恢复、撤销与单次付款/退款；测试结束恢复健康模式。
- 独立内存 EVM 三场景：`outputs/chain-demo-284ade78-9750-4929-a235-f77d92d8e885.json`，未重置网页当前使用的本地链。
- 队列五组、预注资五场景、凭证对账三场景、CRE 三场景等证据见下方本轮条目。
- `docs/LOCAL-DEMO.md` 提供启动顺序、当前入口和浏览器演示路线。已有站点 v11 保留；最终 API 修复为本地提交，未新增站点版本或调度。
- 交付时模型、供应商、队列 API 均为 200，默认工作区保留 12 个任务、4 个链上订单及 1 个身份绑定，没有待处理任务。截图 `/tmp/agentos-local-delivery-proof.jpg` 显示本地 Qwen + 签名供应商订单 6/6、单次请求。服务均保持运行。

## 2026-10-19 持久化恢复队列

- `npm test`：70 项全部通过，包括 7 项新增队列验证；`npm run typecheck` 通过。

- SQLite 实际事务测试覆盖 CAS 失败不入队、后续 SQL 失败整批回滚、并发领取、租约过期、旧 token/revision 回执拒绝、owner/manual 隔离、退避和 dead 终止、旧数据回填及暂停任务到期。
- `npm run demo:queue`：实际 HTTP/D1 五组场景通过。仅隔离本地测试丢弃 inline continuation，不打开页面或调用旧恢复 API；五个并发消费者只领取一次、付款一次。撤权、过期、错误结果、越权均不付款；真实 Qwen 订单在注资后由独立队列多次调用完成，579 分/两条记录，单个 EVM Settled 事件。证据 `outputs/queue-demo-fadcbbb9-e4c7-4801-94aa-f827d2fe6d00.json`。
- `npm run typecheck`、构建、API 回归、预注资五场景通过。预注资证据 `outputs/prefund-demo-88f960ae-8595-45d3-9b6d-aa28c97526cd.json`。本地 worker 已改用队列消费者并重启，保留数据库和链状态。
- CRE 官方 CLI 三场景再次通过，证据 `outputs/cre-demo-53c06e41-4b07-4809-8b3b-6ecb165d7aec.json`；未使用 broadcast，账户 Deploy Access 未启用。
- 私有 v11 线上验证：通过 Sites 官方服务访问，`POST /api/runtime/drain` 首次领取并完成 1 条，第二次零领取且 completed 仍为 1。服务访问读取 owner 工作区队列返回 401，带 owner 参数的 drain 返回 400，说明没有将服务身份当成用户身份。证据 `outputs/hosted-queue-verification.json`。网页任务 `Hosted queue smoke 2026-10-19` 完成 6/6，单次结算 2.40 测试积分，余额 97.60。
- 没有宣称该线上任务完全由独立消费者推进：正常请求的 inline continuation 同时可用。丢失原请求后的独立恢复已在本地真实 HTTP/D1 故障注入中验证。线上只验证了预期服务访问方式、实际队列写回与终态读回。
- Sites 定时任务拒绝每分钟频率，限制为每小时最多一次。本次没有创建调度，没有发生过待验收的定时执行；分钟级外部消费者仍需部署。

## 2026-10-19 API 故障响应

- 全套 `npm test` 72 项通过，类型检查通过；真实 HTTP/D1/EVM 凭证对账的付款、拒绝退款与超时退款三个场景回归通过，含签名、并发重放、工作区隔离与导出。证据 `outputs/reconciliation-demo-903fe17b-226b-4cea-9510-bee70459ea8b.json`。

- 两项测试覆盖嵌套 RPC 异常中的合成 key、URL、请求体和 stack 脱敏，以及 401/403/404/409/503 状态、无缓存、无效 JSON 不回显。链上凭证 API 的未知提供商故障返回 502，runtime 的暂时故障返回 503，并提示保留检查点后重试。

## 2026-10-19 独立供应商增量验证

- `npm test`：63 项全部通过，`npm run typecheck` 通过。新增签名/请求/job/成果绑定、配置和重定向拒绝、响应大小与错误脱敏、租约、未注资和越权零调用、取消/撤权后的晚到结果拒绝。真实 EVM 测试另覆盖成果保存后供应商服务离线仍可付款，以及最终授权前撤销委托会退款。
- `npm run demo:supplier`：13 组实际 HTTP/D1/EVM 场景通过。包含未授权供应商拒绝、客户端 URL 注入拒绝、真实 Qwen + Atlas 独立执行、Sage 独立资金库报告、错误交付与中断恢复网页场景、日志提交后响应丢失重试、错误算术和伪造签名退款、能力拦截零调用、离线检查点恢复、取消/供应商委托撤销/工作区权限撤销丢弃晚到结果。每个订单只有一个 Settled 事件，沙盒账本保持独立。证据 `outputs/supplier-demo-570aeb22-2a3f-4583-840b-8766d0b0c08b.json`。
- 实际停止并重启自建供应商进程，执行 `node scripts/test-supplier-journal.mjs outputs/supplier-demo-570aeb22-2a3f-4583-840b-8766d0b0c08b.json`，原已付款订单返回相同 payload 与签名，重启后只读取一次、日志任务数不增加。证据 `outputs/supplier-journal-c1399a20-6757-416b-96c0-33d5853e24fb.json`。
- 原有 API、预注资五场景、真实模型三场景与身份六组场景回归通过：`outputs/prefund-demo-2ff212a9-a0da-4b10-819d-55c0a01e6daa.json`、`outputs/model-demo-04eff3bb-c004-4f1c-bac9-667e1334761f.json`、`outputs/identity-demo-5e01ab66-c0d5-4f4f-b410-60127c9724db.json`。
- 浏览器由身份 #2 的持有者在链上授权供应商签名地址，创建 `chain-4c40ac8c-06d7-4269-94cc-ea74164500b5`，顺序为注资确认、模型计划、供应商执行、签名/独立复算、最终付款。只调用一次，成果 579 分/两条记录，付款交易 `0x5bf51abc7adf96984b9dab584f1ab8358e151f7551346e214a82dc2b5cebc11f`。沙盒余额仍为 82.00；默认工作区上下文保存于 `outputs/browser-supplier-order.json`。
- 本轮实测的是独立本地进程与本地 EVM；远程 HTTPS 供应商、公开链、MCP/A2A 发现、通用插件沙箱和生产 SLA 尚未验收。此前翻译字典 HMR 的 LanguageProvider 错误已修复，见下方热更新验证。

## 2026-10-19 身份与信誉增量验证

- `npm test`：60 项全部通过；`npm run typecheck` 通过。官方身份/信誉合约实际部署到内存 EVM，验证精确注册文档、工作区隔离、过期挑战、未付款拒评、持有者自评拒绝、NFT 转移清空收款钱包。
- `npm run demo:identity`：六组真实 HTTP/D1/EVM 场景通过。错误签名 403、跨工作区绑定 409、跨工作区订单 404、跨来源 403、注入服务端 registry 字段 400；已授权 operator 自评 403；未付款/退款订单拒评；并发绑定与评价意图只保存一条；重复对账不加分；外部链上撤销同步 D1；身份转移后新订单拒绝，供应商重新注册新身份后恢复。证据 `outputs/identity-demo-8b7fa85d-3df0-41e6-be16-a739fdddfafe.json`。
- 既有 `npm run test:api`、预注资五场景和真实模型三场景回归通过；对应证据 `outputs/prefund-demo-511812f3-e895-4b81-afb4-22b1aa32ea2a.json`、`outputs/model-demo-866ff929-bc30-4f2d-b01e-6ce7e5079ac1.json`。
- 浏览器在默认工作区完成身份 #2 注册和签名绑定；创建 `chain-21a89a0e-f2b1-4e87-b998-04ded9768f95`，固定身份与 Qwen 模型，成果为 579 分/两条记录，实际付款 2.40 测试代币。付款交易 `0x706a62c1c25996dd50575d4121f3a1fba2e58b2f633e14084beacaa26afa6efb`。
- 浏览器买方提交 95 分评价，交易 `0x29a8ead08f8ff523f52f605319a4bcbd3bc5b0bc86e19169c3e94e223fa221f0`，链上 feedbackIndex=1；D1 与身份页为 1 条有效付款评价、平均 95.0/100。中英文切换与重新核验保持一致；沙盒余额仍为 82.00。
- 身份与信誉的公共测试网/真实扩展尚未实测，线上未配置公共注册表。身份/评分是核验检查点，未实现持续重组监听或全网信誉索引。

## 2026-10-19 模型规划增量验证

- `npm test`：59 项全部通过；`npm run typecheck` 通过。新增协议结构/重定向拒绝/大小限制/密钥脱敏、租约过期与晚到结果丢弃测试；真实 EVM 另验证并发仅一次模型请求、越权计划和模型连接失败退款、无成果、不改变沙盒账本。
- `npm run demo:model`：实际 llama.cpp b11669 + 官方 Qwen2.5-0.5B Q4_K_M 运行；正常、恶意标题、中断恢复 3 场景通过，每订单一个 Settled 事件，重复对账不改变原付款。证据 `outputs/model-demo-64c51257-187d-4dee-af4f-c4d48cd67b58.json`。这是本地模型与本地 EVM 的真实调用，不是云模型或 DON 执行。
- `npm run test:api` 与既有 `npm run demo:prefund` 五场景回归通过；证据 `outputs/prefund-demo-29658f3e-6643-4274-bc2c-c46aaa06267b.json`。
- 浏览器创建并执行模型订单 `chain-db9ecabd-61f8-4b66-a3f2-c3762c1fd7db`，先注资再模型规划、能力检查、成果生成与链上付款，检查点 6/6；141 prompt token / 10 completion token，成果 579 分、两条记录。付款交易 `0xca1910f546bfa2eae5e0c65b2125d5d472a4753bdcf7c77af53b02229b5ca3c4`。沙盒积分仍为 82.00；同时有回归脚本使用测试钱包，因此不将期间钱包总余额差归因于该订单。
- 修复实跑发现的 Workers 参数兼容问题：`redirect: error` 不受支持，改为 `manual` 并拒绝非 2xx，保证重定向不携带提供商凭证继续请求。
- `cre whoami` 已确认登录成功，Deploy Access 显示未启用。已有 CLI dry-run 证据仍有效，尚未进行公共网络广播。

## 2026-10-19 先前增量验证

发布前完整回归的 26 个端到端场景通过：

| 命令 | 场景数 | 本地证据 |
| --- | ---: | --- |
| `npm run demo` | 8 | `outputs/demo-65e2333b-307f-4a02-8664-6126731dc361.json` |
| `npm run demo:deadline` | 3 | `outputs/deadline-demo-92a94af8-a8bb-4309-9259-db9c49b03dc6.json` |
| `npm run demo:chain` | 3 | `outputs/chain-demo-d8a21afc-694d-405e-9b8e-b6a8dddd3334.json` |
| `npm run demo:wallet` | 4 | `outputs/wallet-demo-76a1949b-da02-4679-8a23-a480c2fdac69.json` |
| `npm run demo:reconcile` | 3 | `outputs/reconciliation-demo-01b9e718-fe5d-4f79-99e1-d2cee05ddf24.json` |
| `npm run demo:prefund` | 5 | `outputs/prefund-demo-83be1dd7-5375-41e3-8e20-55b3dfdc477c.json` |

这些是本地网页/测试链证据；公共网络和真实 DON 状态见下文，不合并声称为已部署集成。

- 网页链上钱包：本地 HTTP 的成功付款、空范围零条交付付款、错误结果退款、超时退款与重连读取 4 场景通过；签名前网络/账户变更拒绝、重复注资拒绝通过。浏览器将自定义任务注资并结算 3.6 测试代币，余额变为 96.4，链上状态 Paid，交易回执核验通过。真实浏览器扩展与公共 Sepolia 尚未实测。

- `npm test`：56 项全部通过；`npm run typecheck` 通过。覆盖 owner/沙盒隔离、幂等冲突、严格收据、后台执行恢复、链适配器、服务端签名对账、预注资执行、生产配置边界和附件导出。
- `npm run demo:prefund`：真实 HTTP/EVM 的成功、越权、错误交付、付款后恢复、注资后过期才确认五场景通过。未注资零执行、错误签名、跨工作区拒绝、五次重复对账与单个链上结算事件通过。真实 EVM 单测另覆盖权限撤销和付款后 D1 提交失败恢复。
- 浏览器创建自定义输入订单 `chain-a872719c-303f-44d4-87a2-272a2d02416d`，先确认注资再生成成果，总额 579 分、两条记录，订单 6/6；付款交易 `0x888e3bd2e371c046176f1d12e42b96619aafd4bbabbee780f45360fee1e310fa`，钱包余额 95.2→92.8，沙盒余额保持 82.00。
- `npm run demo:reconcile`：真实 HTTP 钱包签名 → 服务端 EVM 复核 → D1 CAS 的付款、错误交付退款、超时退款三场景通过。每场景含 5 个并发重放、跨工作区 404、错误签名 403、伪造 evidence 400、错误网络/来源拒绝，历史与上下文导出及交易哈希记忆检索通过；沙盒账本未改变。
- 浏览器签名并保存注资与付款两条凭证，刷新页面后仍显示 2 条历史；沙盒余额仍为 82.00。付款交易 `0xcca7d4e89ca0f805b0e6ecc482ec1f681c60ac80ef929dea1a8be860fbcff6e7`，本地链区块 19。历史区域样式与截图已检查。
- 任务记忆：25 条记录跨页检索、组合筛选、全部匹配导出和只读不变性测试通过；真实 API 检索、导出及工作区隔离通过。
- 自定义输入：3 项单测、真实 API 与本地 EVM 联调通过；浏览器实跑资金库分配结果 1368 分、3 条记录、输入及收据哈希。
- 服务管理：单测覆盖报价快照、停用释放、已付款恢复；API 实跑及浏览器启停、调价通过。
- `npm run demo:deadline`：自动超时、预留检查点的并发释放、已付款任务跨期限恢复 3 项通过。
- `npm run test:api`：并发与重复请求、精确预留后撤销、附件内容与跨沙盒拒绝通过。
- `npm run demo`：独立沙盒的 8 项完整流程通过；`npm run demo:chain`：本地 EVM 的成功付款、拒绝退款、超时退款与重复结算拒绝通过。结果保存在忽略的 `outputs/`，见 `docs/PROGRESS.md`。
- 浏览器实际操作正常完成、受理后离开页面仍执行、结算暂停后安全恢复且不重复付款、越权零付款、错误交付退款。附件点击有服务端 HTTP 200 记录；未验证浏览器落盘文件。
- `npm run cre:build`：SDK 将实际工作流编译成 WASM，文件头 `0061736d01000000`；Bun 1.3.8、SDK 1.23.0、Javy 8.1.0。CLI v1.38.0 已完成 3 场景 dry-run，详见下项。

- `npm run demo:cre`：官方 CLI/WASM 的本地 RPC + 真实公共 HTTPS 模拟通过 3 场景。正确/错误交付分别产生 accepted=true/false 的报告；承诺不匹配拒绝，未生成报告。CLI 未使用 `--broadcast`，模拟后托管仍为 Funded。证据 `outputs/cre-demo-3549b172-cbb1-469c-99f2-a850d66a1a18.json`。

## 2026-10-19 语言模块热更新

- 将共享语言 context/hook 与 React 组件边界分开。真实 Vite 开发服务中，修改并还原中文字典，无需刷新页面，钱包连接、当前视图和未提交标题 `HMR retained draft 2026-10-19` 全部保留；中英切换后草稿仍在，未创建订单或发生交易。
- 4 项语言测试、类型检查通过。浏览器截图 `/tmp/agentos-hmr-proof.jpg`。

## 2026-10-15 初始验证

## 已执行并通过

- `npm test`：16 个测试全部通过。包括余额守恒、预算释放、请求重放、结算后恢复、capability 拦截、错误交付、权限撤销、日预算及并发在途占用、输入金额、收据篡改、CRE 纯校验器、ERC-8004 calldata。
- 同一测试命令在 Ganache 内存 EVM 部署真实编译后的 AgentEscrow / AgentVault / MockToken。验证错误 forwarder、错误 workflow metadata、错误 specHash、重复 report 拒绝；成功付款、拒绝退款、超时退款；执行者单次/每日限额、seller allowlist、撤销、非 owner 提款拒绝。
- `npm run typecheck`：网站、SDK、CRE 工作流独立类型检查通过。
- `npm run test:api`：对运行中的本地服务测试 D1 CAS。两个任务同时争用 60 testUSD 预留预算，仅一个成功；每一步发送 5 个重复请求，最终只产生一次付款。收据 API、跨来源写入拦截、错误 JSON 处理均通过。
- 浏览器实测正常任务完成、收据验证、付款后中断、刷新后持久化、恢复到 Completed；恢复前后单任务付款为 2.40 testUSD。
- 390px 手机宽度检查：document scrollWidth 与 viewport 都为 390，没有页面级横向溢出；任务表自身支持横向查看。浏览器错误日志为空。

本地 preview 的 Sites 网关会统一注入开发身份，API 测试不会通过伪造该 header 创建第二租户。未将此测试声称为生产多用户隔离验证。

## 尚未执行

- 真实 DON 部署及 execution 验证。CRE CLI dry-run 与 SDK/CLI WASM 编译已于 2026-10-19 通过。
- 公共测试网合约部署、真实浏览器扩展签名与持续链重组监控。网页本地测试钱包、服务端复核签名、预注资后台执行与 D1 凭证历史已验收。
- ERC-8004 公共测试网注册与信誉；本地 EVM 的官方注册表流程已验证。CCIP、Data Feeds、x402 尚未实现。
- 第三方安全审计、任意外部 Agent 或 LLM 的攻击评测、生产负载测试。

网页与合约采用不同的演示单位：网页是整数分 testUSD，合约是 token 最小单位。接入 adapter 时必须读取并校验 decimals，不能直接复用网页金额。

## Mixed skill and plugin workflows — 2026-10-22

A local-only, reviewed 2–8-step sequential controller composes exact versioned business services and JSON plugins. Explicit transfer, paid business projection and business summary adapters reject incompatible schemas before purchasing. Future budgets and plugin capacity are transferred atomically into deterministic child identifiers. Parent artifacts and canonical payments are rechecked before dependent child execution. The durable queue drives mixed parents, rather than independently advancing their child purchases. Cancellation preserves funding and settlement intents for reconciliation.

The bilingual wallet panel exposes a reviewed JSON program, source inspection in Integrations, execution grants, exact plugin payment grants and recoverable history. Editing clears the selected payment session. This increment does not add model-generated mixed plans, parallel mixed DAGs, public-chain plugin payments or DON verification of generic plugin execution.

Focused validation: `node --test tests/mixed-workflow.test.ts`, `npx tsc --noEmit`, and `node scripts/demo-mixed-workflows.mjs`. End-to-end evidence: `outputs/mixed-workflow-demo-0b81e1ab-a80e-469d-baa6-96bfda48dbb1.json`; both adapter directions, response-loss retry, one owner grant signature, exact gross payment, one escrow per child, empty test queue and revoked test session passed. Earlier failed attempts are retained in outputs. No broad regression was run for this increment.

## Paid plugin semantic memory — 2026-10-22

Paid plugin executions now join the unified memory corpus as `paid-plugin`, with explicit source hashes, plugin identifiers and canonical-payment references. Embeddings receive reviewed titles, field names and small numeric/boolean aggregates; full arbitrary JSON, transfer rows and signatures are not automatically embedded. The same existing source-drift, request-lease and model-version checks apply during index and search publication.

The wallet UI and SDK can adopt a reviewed plugin search hit into a new mixed draft. Adoption verifies the full signed execution and current canonical local payment. Creation rechecks the persisted search review; execution rechecks canonical source output. Fresh execution/payment grants remain required, and UI adoption clears the selected payment session. Forgotten/expired searches cannot authorize a new draft; existing committed work retains its original paid source for recovery.

Focused validation: 12 tests across semantic memory, mixed composition and model management; `npx tsc --noEmit`; actual embedding and purchase evidence `outputs/plugin-memory-demo-5cc8ca63-30da-4253-8ec6-226ca4131375.json`. Summary privacy, real vector search, adoption without purchase, tampered proof refusal, fresh skill/plugin payments and no second purchase of the remembered normalizer passed. The test Vault session was revoked and the owned embedding model stopped. Earlier failed attempts remain recorded.

## Finalized USDC treasury business case — 2026-10-22

The wallet panel imports a chosen treasury address and finalized outgoing range (up to 25 transfers), then prepares a reviewed two-step treasury-report → USDC policy-plugin purchase. `business-usdc.v1` requires a directly sourced treasury report, checks its complete paid source totals and preserves source/finality commitments. Policy analysis uses exact six-decimal token base units, rather than rounded cents: at least 50% to one recipient, or a zero-value sample, requests human review. This is a conclusion about the selected sample, not an account-wide risk classification. The UI reads the authenticated paid plugin report from history. Mainnet access is read-only; all service payments remain local test tokens.

Evidence `outputs/treasury-case-be7b0937-1d47-4b0d-8bf2-fe7c7d9886c8.json` and `outputs/treasury-business-demo-48f17e6f-139e-4da4-a5c2-a24387380493.json`: Ethereum block 26246551, observed sender 0x000000000004444c5dc75cb358380d2e3de08a90, 1 outgoing transfer, 707.515211 USDC, largest-recipient share 10000 bps, review required. Independent RPC source reverification, exact allocation calculation, signed QuickJS report, canonical parent payment, exact gross local payment, one escrow per service, empty test queue and session revocation passed. An earlier transient RPC transport failure is retained separately; it created no purchase.

Focused checks: TypeScript check; two tests for mixed contracts and actual independent QuickJS policy/verifier runs (sub-cent values, 49.99%, 50%, zero values, tampered report rejection); one browser test for bilingual import/editor, edit/reset and reload review state, no accidental grants/purchases, mobile layout. Browser screenshot: `outputs/mixed-workflow-browser-proof.png`. No broad unit/build/browser regression was added to this increment.

Mixed extension compatibility follow-up: the business child commitment now hashes its fully resolved input, including the installed immutable skill definition. Actual plugin → `ext:community.treasury-concentration@1.0.0` → plugin payment acceptance passed in `outputs/mixed-workflow-demo-321889b4-7d23-4ecf-a3c9-39a411c38c1e.json`, with the test session revoked and queue empty. The normal mixed demo now includes this extension path. The initial full report `outputs/full-demo-83ff6cbf-c3cf-4f18-af47-fbbdd390b8a0/report.json` was explicitly interrupted at pre-funded verification to apply this correction; it is not a complete-demo pass. No matching test process or unfinished current pre-funded order remained after interruption. A fresh full run is required on the corrected source.

## Final current 44-step demo and cleanup

Implementation commit `ffaf883a2091fd1cd4991711cac5d3b2cc1f0144`, source digest `e43deea829433e8570823403d8e79a54909743f453320915b68d692c019df5c7`: `outputs/full-demo-b3ac1f6a-e230-49a1-88fe-a62a10a647a4/report.json` ended with 44/44 code 0. The one failed dispatcher attempt encountered an unavailable temporary HTTPS evidence publisher, and passed on explicit same-source resume. Original failure is retained; `verification.json` snapshots 43 artifacts and hashes all stage logs. Both pre-resume and post-resume model journals are included. This final sequence repeats mixed execution for both built-in and newly installed extension skills, paid-plugin memory adoption and actual current finalized USDC data.

Final doctor: nine checks ready, warnings empty. Model starts/stops: base 7/7, planning 6/6, memory 4/4. `processes-after-cleanup.json` confirms no owned model/CRE/tunnel/test processes, all three model ports closed and six retained runtime endpoints HTTP 200. Cleanup preserved application state and all histories. The subsequent commit updates documentation only; the runtime implementation is unchanged. Public deployment, public-chain payments, generic-plugin DON acceptance and hosted scheduling remain unverified/deferred.

## Unified mixed AI planning — 2026-10-22

The local planner compiles a bounded set of compatible, fee-checked linear routes from the current selected service catalog (business skills, configured suppliers and installed plugins), then asks the actual planning model to select the route matching the goal. Candidates use distinct services and full-object adapters; deeper routes are retained alongside shorter alternatives. The model does not invent prices, data casts or executable code. The selected route, catalog, buyer, deployment, input, fees, model and prompt/response hashes form a five-minute reviewed proposal. No task, execution grant or spending is created during planning. Approval is atomic with mixed creation and binds the exact draft; editing clears the review/payment selection. Existing manual mixed drafts remain supported.

Focused checks: two mixed-plan tests, website TypeScript check and actual HTTP/D1/Qwen/QuickJS/Vault/EVM evidence `outputs/mixed-planning-demo-74207b77-6ec3-4a51-9ba8-54008159c039.json`. The model selected normalizer → Sage → brief in a shuffled catalog; lost proposal response, no pre-approval grants/purchases, changed-draft refusal, one accepted workflow, canonical parent payments, empty test queue and session revocation passed. Owned planning model stopped. Earlier rejected model attempts and a long-title regression remain recorded; child titles now stay within existing limits. No public transaction, DON deployment or hosted scheduling was enabled.

## Business wizard without JSON editing — 2026-10-22

The mixed panel now defaults to editable transfer rows or finalized outgoing USDC import, a business-report choice and concentration threshold. Preparing a proposal installs only its required manifests, displays exact service order and fees, and requires explicit review before separate execution/payment authorization. Editing clears review and authority; reload requires review again. JSON remains an optional advanced editor. Plugin execution run grants and Vault price permissions use their separate strict schemas. Paid plugin memory has a separate scoped review cache in the mixed panel.

Focused validation: wizard unit test and TypeScript check; real-browser evidence `outputs/business-wizard-browser-wizard-browser-d17e9a6e-1d17-4089-866d-4684294d62d4.json`. Row editing, no early grants or purchases, lost creation response with one workflow, actual paid report totaling 7701 cents, refreshed review, English labels and mobile layout passed. The retained advanced-editor browser case also passed. Screenshot `outputs/mixed-business-wizard-proof.png`; test session revoked. The sandbox browser explicitly advances checkpoints through the recovery button; GET polling remains read-only.

## Durable bounded USDC monitoring — 2026-10-22

An owner-scoped monitor stores a finalized outgoing-USDC cursor, canonical block anchor, frozen source windows, service versions, original plugin grant epoch, Vault session, report cap, budget and expiry. A local authenticated consumer continues independently of the browser. Empty windows advance without a purchase; populated windows freeze their source and deterministic request ID, then atomically exchange a reserved ticket for the existing two-step mixed workflow. Future tickets reserve shared daily/Vault allowance, plugin runs, order and history capacity. Pausing retains unused reservations and lets funded work reconcile; stopping releases future tickets and cancels/reconciles active children. Changed permissions, service versions, finality anchors or single blocks exceeding 25 transfers stop further purchases. Transport failures retain checkpoints for retry. This is a finite authorized subscription (up to five reports), not unrestricted spending. Alerts are persisted in the panel; no external messaging or hosted scheduler was enabled.

Focused checks: two cursor/reservation tests and TypeScript check; bilingual browser form, explicit review, edit invalidation, reload and mobile layout. Screenshot `outputs/usdc-monitor-browser-proof.png`. Actual mainnet-read/local-payment evidence `outputs/usdc-monitor-demo-f29a461a-c522-4c63-8674-8e3b9cda6a88.json` verifies lost creation response, changed-parameter refusal, pause/resume/stop without purchase, frozen source before child creation, a stopped/restarted independently authenticated consumer, two completed paid reports, four unique local escrows, exact gross payment, exhausted two-run grant and empty test queue. Consumer processes stopped, credential and test Vault session revoked. Earlier failed test attempts remain recorded. Full demo now includes mixed AI planning, business wizard and this continuous-monitor acceptance (47 stages).

## Final 47-stage integration acceptance and process cleanup — 2026-10-22

Implementation commit `266c833a0b9ad1b9ecd57358898ed26f83648531`, source digest `92cc054d7cb5f529b25293655557704df20785f3e73218cec41694e6805fb37d`: `outputs/full-demo-49b9e91d-0b07-49fd-8df1-07b94d316785/report.json` passed 47/47 stages on the same source, including actual mixed model selection, the real-browser business wizard, paid-plugin memory and restarted continuous USDC monitoring. Started 2026-10-22T08:45:56.903Z, finished 2026-10-22T09:02:03.747Z. This run retained 0 failed stage attempts. `verification.json` snapshots 46 child artifacts and hashes all stage logs, with source equality verified before and after. Model start/stop counts: {"base": {"reusedUnowned": 0, "started": 7, "stopped": 7}, "memory": {"reusedUnowned": 0, "started": 4, "stopped": 4}, "planning": {"reusedUnowned": 0, "started": 7, "stopped": 7}}.

`processes-after-cleanup.json` confirms no owned temporary consumer, model, CRE, tunnel or demo-runner processes; model ports 11435–11437 are closed, and all six retained local service endpoints return HTTP 200. Application state and all acceptance histories are preserved. The following commit changes documentation only. This sequence is integration-demo evidence; focused unit, TypeScript and UI checks are documented separately above. Public-chain payments, DON deployment and hosted scheduling remain deferred.


## Local concurrent business-loop completion — 2026-10-22

Implementation `d5a7ac7eb411995775a76e7e007c865f44f3ab45`, implementation source digest before/after `facb046be706810b62731bf993db2e3220248acbc8312627aa150f53a106e50d`: `outputs/local-business-loop-406594cd-8bcb-4d32-88cb-a437ab30acb1.json` passed eight scenarios. It verifies A monitoring and B business active together without replacing shared authority; recovery after a mined-deposit acknowledgement and session-binding acknowledgement are lost; a failed paid attempt refunded and only the remaining plugin repurchased; human disposition and private source-linked notes; A completing independently; stopped/restarted consumer continuing a separately reviewed renewal from the durable cursor with rewind refusal; exact two-window USDC statistics; canonical cumulative receipts and empty pending/leased/dead queues. Seven unique local escrows: 1480 cents gross funded, 1380 paid and 100 refunded. Test consumer stopped, credential and application sessions revoked. This is current finalized mainnet read-only data with local test-token payments, without public-chain transactions or hosted scheduling.

Additional actual monitor-repair proof `outputs/monitor-repair-6abf386e-89fe-4b4f-b3ee-82aabfe4445f.json` verifies that a paid partial report cannot renew until its suffix is repaired and canonically adopted by the parent monitor. The original data acquisition is purchased once; repaired report adoption advances the stored cursor without new spending. The public demonstration-account picker reads finalized USDC logs and labels observed addresses as samples, without assuming wallet ownership.

Other completed local gaps: exact decimal thresholds and restored policy versions; separate recoverable bounded business authorizations; paid-prefix repair with lineage cumulative ceilings; paused-monitor expiry and snapshot-bound renewal; source-linked human review, canonical evidence export and explicit private memory; terminal-history archive/restore retaining immutable evidence; loopback on-demand model control with owned-model idle release; exact renewed-window recipient changes. Each completed increment was validated and committed. Archive/history/byte limits and bounded linear mixed planning remain explicit limits, not unlimited OS capability.

Focused checks on final implementation: 15 Node tests passed; website `tsc --noEmit` passed. Two Chromium receipt-backed tests passed using the final eight-stage evidence: refreshed 65% policy, exact 0.29% input without early grants, 560/460/100/0/0 cumulative repair costs (funded/paid/refunded/unsettled/reserved), inherited paid-result timeline, saved human disposition, source-linked note, English and 390px layout. Screenshot: `outputs/local-business-loop-browser.png`. A phantom reservation display was corrected by separating conservative daily allowance consumption from genuinely unspent business reservations; actual transfers were already correct. This does not claim a new all-tests/build or 47-stage regression run; prior 47-stage evidence remains above.

Cleanup: `outputs/process-cleanup-671b98df-ac17-4a18-935e-add04e142def.json` and `outputs/local-business-processes-final.json` confirm no owned temporary model/test/consumer/CRE/tunnel processes, model ports 11435/11436/11437 closed, and six retained runtime services plus lightweight model controller returning HTTP 200. State, transaction history, model files and evidence are preserved. `outputs/local-business-verification-final.json` hashes final artifacts. One initial sandbox-denied loopback fetch attempt is retained as `outputs/local-business-loop-9b57f556-3337-48dd-96de-dee49dbe2292.json`; the complete run succeeded with permitted local access and unchanged implementation. The following documentation commit does not alter executable code. Public-chain acceptance, DON deployment and hosted deployment/scheduling remain deferred.


## Blank-workspace browser business acceptance — 2026-10-22

Implementation `961b9763b0e54ccdbd889e84098bbfe09efd9180`, source digest before and after `575f11122cdbc09d970676278e33587f57766a57a1eea36791e1ee4a4dd6489f`. `npm run demo:browser-business` created a fresh non-current persistent isolated runtime, then passed one Chromium test with fourteen explicit checkpoints. Evidence: `outputs/full-business-browser-browser-full-135d1e2b-5854-4f92-b041-fa98ff253a30.json`; started 12:35:25 UTC and finished 12:36:58 UTC. The test completed without resuming a failed test attempt. Its intentional stop/resume of the application runtime is part of the scenario.

The browser creates an empty private workspace and a reviewed monitoring subscription, installs a controlled failing delivery through the supported plugin manifest editor, and imports its bounded program through the advanced editor. A known local EIP-1193 rejection is injected once; the same reviewed authorization retries successfully. Monitoring A and business B are running together before the scoped consumer starts. B pays its treasury prefix and refunds the failed report, then a first repair fails and refunds too. The entire isolated service stack is stopped and resumed from the same directory. Browser reconnection verifies unchanged wallet/deployment/workspace/payment references; an explicitly reviewed higher cumulative ceiling then funds only the final report. One treasury-prefix purchase is retained across all attempts.

The remaining browser checkpoints save human disposition and a source-linked private note; resolve a monitoring alert; renew from the old durable cursor; start planning and embedding models additively; generate and execute the actual Qwen-selected normalizer → treasury analysis → management brief route; explicitly index and semantically retrieve the business opinion; verify three grouped business roots and their canonical receipts; and check English, Chinese and 390px layout. New monitoring evidence remains available for follow-up rather than automatically approving an old opinion.

**Source boundary:** this final reproducible local acceptance uses `captured-finalized-replay`, displayed in the monitor/workbench and included in every exported business receipt. `tests/fixtures/usdc-finalized-capture.json` contains two previously live-verified, finalized, contiguous outgoing-USDC windows. Its SHA-256 is `bce416a4037717744f54e204d9f8d4bff3af1e36d5500f73006c7604676410bc`. A dedicated loopback read-only service replays those fixed historical facts; the final run does not establish current mainnet RPC availability or fresh oracle attestation. Ordinary local monitoring retains the live HTTPS source. Loopback replay is enabled only by an explicit development configuration; the default importer still rejects plain HTTP. Earlier live attempts retained checkpoints during RPC outages, and their original failures remain in outputs. They are not combined into the successful final run.

Canonical receipts: `outputs/full-business-receipts-browser-full-135d1e2b-5854-4f92-b041-fa98ff253a30.json`. Eleven distinct on-chain task identifiers, counted from verified funding artifacts, reconcile to 2140 local test-token cents gross funded, 1940 paid, 200 refunded, zero unsettled and zero reserved. Pending, leased and dead execution queues are zero. This is local EVM payment evidence, without public-chain transactions. Screenshots: `outputs/full-business-browser-final.png` and `outputs/full-business-browser-mobile.png`.

Final relevant checks: 43/43 Node tests, including actual persistent-EVM restart, HTTP wallet RPC, source provenance and replay isolation, authorization retry/fencing, terminal monitor repair lineage, model resource leases, capacity, alerts, navigation and runtime profiles; website TypeScript and production build passed. Logs: `outputs/local-business-targeted-tests-final.log`, `outputs/local-business-build-final.log`. Build reports a nonblocking chunk-size warning. This is a focused regression and complete browser business scenario; it does not claim a new run of every repository test or the historical 47-stage CRE sequence.

The consumer credential is revoked and all signed test application sessions are revoked. The test consumer and resumed runtime stopped. `outputs/local-business-final-process-audit.json` confirms no owned temporary runtime, browser, consumer or model process; test/replay/model ports closed; zero controller-owned models and active inference leases; and HTTP 200 from the six original services plus the lightweight model controller. The original 6097 runtime, all data, model files and evidence are preserved. Its older in-memory chain was not converted or reset. `outputs/local-business-browser-verification-final.json` hashes final artifacts and records matching implementation source digests. The following documentation commit does not change executable code. Public-chain acceptance, DON, hosted deployment and hosted scheduling remain deferred. History storage remains deliberately bounded with preflight and export guidance.

## Separate captured/live business-loop acceptance — 2026-10-22

See `docs/LOCAL_BUSINESS_ACCEPTANCE.md` for increment commits, exact evidence and reproducible commands. Implementation `1b98988` passed two independent 17-checkpoint browser demos with identical source digest: captured replay and live finalized RPC. Both verify authorization refresh recovery without a second transaction, RPC interruption while another business progresses, repaired monitor adoption/renewal, consistent pre-adoption receipts, consecutive repair failures, environment restart and exact 11-escrow accounting (2140 funded / 1940 paid / 200 refunded cents; zero unsettled/reserved). The live run reverified windows 26248322/26248323. Earlier primary-provider 403 and harness failures are retained, not counted as passes.

Final regression: 303 tests, TypeScript and build passed. A separate actual cold-copy restore reverified canonical receipts and reviewed planning inputs and preserved the old ledger through workspace rotation. Original 6097 and its data remain preserved; all temporary test/source/model processes were cleaned up. Legacy archival is explicitly not a restartable export of its in-memory chain. Public-chain transactions and hosted deployment remain deferred; bounded input/planning limits and long-soak/power-loss acceptance remain documented separately.
