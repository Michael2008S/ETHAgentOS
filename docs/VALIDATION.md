# 验证记录

## 2026-10-19 增量验证

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
