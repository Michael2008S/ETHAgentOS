# 验证记录

## 2026-10-19 独立供应商增量验证

- `npm test`：63 项全部通过，`npm run typecheck` 通过。新增签名/请求/job/成果绑定、配置和重定向拒绝、响应大小与错误脱敏、租约、未注资和越权零调用、取消/撤权后的晚到结果拒绝。真实 EVM 测试另覆盖成果保存后供应商服务离线仍可付款，以及最终授权前撤销委托会退款。
- `npm run demo:supplier`：13 组实际 HTTP/D1/EVM 场景通过。包含未授权供应商拒绝、客户端 URL 注入拒绝、真实 Qwen + Atlas 独立执行、Sage 独立资金库报告、错误交付与中断恢复网页场景、日志提交后响应丢失重试、错误算术和伪造签名退款、能力拦截零调用、离线检查点恢复、取消/供应商委托撤销/工作区权限撤销丢弃晚到结果。每个订单只有一个 Settled 事件，沙盒账本保持独立。证据 `outputs/supplier-demo-570aeb22-2a3f-4583-840b-8766d0b0c08b.json`。
- 实际停止并重启自建供应商进程，执行 `node scripts/test-supplier-journal.mjs outputs/supplier-demo-570aeb22-2a3f-4583-840b-8766d0b0c08b.json`，原已付款订单返回相同 payload 与签名，重启后只读取一次、日志任务数不增加。证据 `outputs/supplier-journal-c1399a20-6757-416b-96c0-33d5853e24fb.json`。
- 原有 API、预注资五场景、真实模型三场景与身份六组场景回归通过：`outputs/prefund-demo-2ff212a9-a0da-4b10-819d-55c0a01e6daa.json`、`outputs/model-demo-04eff3bb-c004-4f1c-bac9-667e1334761f.json`、`outputs/identity-demo-5e01ab66-c0d5-4f4f-b410-60127c9724db.json`。
- 浏览器由身份 #2 的持有者在链上授权供应商签名地址，创建 `chain-4c40ac8c-06d7-4269-94cc-ea74164500b5`，顺序为注资确认、模型计划、供应商执行、签名/独立复算、最终付款。只调用一次，成果 579 分/两条记录，付款交易 `0x5bf51abc7adf96984b9dab584f1ab8358e151f7551346e214a82dc2b5cebc11f`。沙盒余额仍为 82.00；默认工作区上下文保存于 `outputs/browser-supplier-order.json`。
- 本轮实测的是独立本地进程与本地 EVM；远程 HTTPS 供应商、公开链、MCP/A2A 发现、通用插件沙箱和生产 SLA 尚未验收。开发时更改翻译字典会触发一次 HMR LanguageProvider 错误，整页刷新恢复，持久化订单不受影响；该开发期热更新缺陷仍待修复。

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
- ERC-8004 上链注册、链上声誉、CCIP、Data Feeds、x402。
- 第三方安全审计、任意外部 Agent 或 LLM 的攻击评测、生产负载测试。

网页与合约采用不同的演示单位：网页是整数分 testUSD，合约是 token 最小单位。接入 adapter 时必须读取并校验 decimals，不能直接复用网页金额。
