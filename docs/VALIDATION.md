# 验证记录

## 2026-10-19 增量验证

- `npm test`：42 项通过；`npm run typecheck` 通过。新增 owner/沙盒隔离、幂等冲突、严格收据、后台执行恢复、链适配器和附件导出检查。
- 服务管理：单测覆盖报价快照、停用释放、已付款恢复；API 实跑及浏览器启停、调价通过。
- `npm run demo:deadline`：自动超时、预留检查点的并发释放、已付款任务跨期限恢复 3 项通过。
- `npm run test:api`：并发与重复请求、精确预留后撤销、附件内容与跨沙盒拒绝通过。
- `npm run demo`：独立沙盒的 8 项完整流程通过；`npm run demo:chain`：本地 EVM 的成功付款、拒绝退款、超时退款与重复结算拒绝通过。结果保存在忽略的 `outputs/`，见 `docs/PROGRESS.md`。
- 浏览器实际操作正常完成、受理后离开页面仍执行、结算暂停后安全恢复且不重复付款、越权零付款、错误交付退款。附件点击有服务端 HTTP 200 记录；未验证浏览器落盘文件。
- `npm run cre:build`：SDK 将实际工作流编译成 WASM，文件头 `0061736d01000000`；Bun 1.3.8、SDK 1.23.0、Javy 8.1.0。CLI v1.38.0 可运行，尚未通过 CLI 模拟。

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

- CRE CLI 模拟、真实 DON 部署及 execution 验证（SDK WASM 编译已于 2026-10-19 通过）。
- 测试网合约部署、真实 wallet 连接、网页链上对账。
- ERC-8004 上链注册、链上声誉、CCIP、Data Feeds、x402。
- 第三方安全审计、任意外部 Agent 或 LLM 的攻击评测、生产负载测试。

网页与合约采用不同的演示单位：网页是整数分 testUSD，合约是 token 最小单位。接入 adapter 时必须读取并校验 decimals，不能直接复用网页金额。
