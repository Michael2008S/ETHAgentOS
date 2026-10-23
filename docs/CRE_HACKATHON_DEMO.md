# Hackathon：本地 CRE 完整验收 demo

本 demo 使用官方 CRE CLI 执行当前生产 dispatcher；所有链上写操作都限定在本轮新建的 Ganache `31337`。不需要 managed DON 部署权限，不读取 Sepolia 钱包密钥，不修改 Sepolia workflow/receiver/支付配置，不使用 `--broadcast`。

## 已完成的验收

2026-10-23（Asia/Hong_Kong）当前代码完整联跑通过 **10/10** 项；官方 fresh build、接受/拒绝 dispatcher 和归档后空队列 simulation 均一次成功。另运行 CRE dispatcher 聚焦测试 **6/6**、identity/receiver 测试 **3/3**，新增脚本 ESLint 和语法检查通过。首次本地签名适配失败、随后 CLI 绝对入口路径失败的报告分别保留，成功运行已修正这两处，不覆盖失败证据。

- 成功运行：[report.json](../outputs/cre-hackathon-e8d4e567-6938-4172-a7c8-aa87e033a65f/report.json)
- 机器索引：[CRE_HACKATHON_EVIDENCE_INDEX.json](CRE_HACKATHON_EVIDENCE_INDEX.json)
- 同一 Paid 订单的[评价](../outputs/cre-hackathon-e8d4e567-6938-4172-a7c8-aa87e033a65f/feedback-active.json)与[撤销独立回执](../outputs/cre-hackathon-e8d4e567-6938-4172-a7c8-aa87e033a65f/feedback-revoked.json)
- [D1 最终快照](../outputs/cre-hackathon-e8d4e567-6938-4172-a7c8-aa87e033a65f/workspace-final.json)重启读回一致，revision 26；最终 receiver 余额、ready 队列、active feedback 均为 0。

共保存 11 笔本地业务/测试部署交易完整回执，均为 chain 31337；底层 local-chain fixture 预置合约地址保存在 deployment 描述。官方 CLI 构建的 WASM SHA-256 为 `9b8e03977e2e176eeee72afc6ff619d17cb1228bd8d1d12b1f473a73e980b4ce`。这些结果完成本轮本地 simulation 目标；不升级为 Sepolia/DON 结算、浏览器验收或全仓回归声明。

## 复跑

在仓库根目录、Node >=24 且项目依赖已安装的环境执行：

```sh
npm run demo:cre-hackathon
```

需要 `.sites-runtime/cre-bin/cre`、已登录的 CRE 账户、`.sites-runtime/cre-tools/node_modules/.bin` 中的 Bun，以及 `.sites-runtime/cre-tools/cloudflared/cloudflared`。cloudflared 可通过 `AGENTOS_CLOUDFLARED_BIN` 指定；它只公开临时合成证据服务，不公开钱包 RPC 或工作区。CRE 账户登录仅用于 CLI，部署审批不是本地 simulation 前提。私钥不需要用户提供：31337 的临时账户由脚本在进程内创建，CLI 日志会脱敏。

每次执行分配新的本地 EVM、D1、临时 HTTPS 服务和 `outputs/cre-hackathon-<UUID>/`。端口自动分配，不停止现有 AgentOS 实例；不复用或清理此前的订单。运行结束后停止本轮服务并删除短路径临时 WASM 副本，保留凭证原件。临时 HTTPS URL 在服务停止后不保证继续可访问，原始输入/成果字节另存 JSON，可由下一次复跑重新发布。

只运行聚焦 CRE 测试：

```sh
npm run test:cre
```

## 同一订单贯穿的执行路径

1. 新建本地 `31337` EVM，部署 vendor ERC-8004 registry 实现及测试合约。创建本地测试 receiver/forwarder，绑定明确标记为 synthetic LOCAL 的 ID。它与 Sepolia ID 11207、receiver、真实 workflow ID 无关。
2. 供应商本地钱包注册身份、补全文档、签 owner challenge；生产 identity reducers 验证后，通过生产 `commitWithJobs` CAS 写入持久本地 D1。该脚本调用领域层及 D1，不启动网页/API 层，不将此结果声明为浏览器验收。
3. 同一身份下创建正确交付、错误交付两笔新订单，冻结 spec/input/identity snapshot；本地买方签资金授权并向本地 escrow 注资。付款前反馈被拒绝。
4. 生产 order runner 生成并发布成果到本轮临时 HTTPS workerd/R2 服务；官方 CLI 从源码重新 build WASM，然后 dry-run 生产 dispatcher。
5. 官方 CLI 读取本地 finalized commitment 和真实临时 HTTPS 字节，独立验证并为接受/拒绝两条路径生成 report。输出必须解码为 `reported`，verdict 和输出 hash 必须逐单匹配独立复算；dry-run 后两笔订单仍 Funded，证明模拟未偷换成真实付款。
6. 根据已核验的 CLI outcome 重新编码 ABI settlement payload，由**独立本地测试 forwarder**执行 callback：正确成果付款给供应商，错误成果退回买方。验证精确代币余额差、canonical receipt、D1 reconciliation、callback 重放拒绝和重复对账幂等。
7. 仅 Paid 订单由原买方发布 ERC-8004 feedback；核对 NewFeedback、付款证明、readFeedback 与 D1 active 状态。退款订单不能准备评价；重复确认不得增加评价记录。
8. 非原评价者不能撤销；原买方撤销后，独立保存 revoke transaction hash/完整 receipt，读回 isRevoked=true，D1 变为 revoked。
9. 归档本轮 ready 项，官方 CLI 再次模拟空队列，不再生成 report。重启 D1 worker 后重新读取，核对 Paid/Refunded/Revoked 状态与完整快照一致。

## 模拟和链上证据的边界

CRE workflow 中的 `ethereum-testnet-sepolia` 是 SDK 使用的 selector alias；本轮 project.yaml 将其 RPC 映射到脚本新建的 loopback EVM，实际交易 chain ID 固定 `31337`。临时证据协议 URL 的 `11155111` 也是该协议 namespace，不是 Sepolia 写交易。

官方 CLI 实际调用 `runtime.report` 和 EVM dry-run capability，但本地结算 callback 不验证 DON 签名。脚本记录的 ABI payload 根据官方 CLI 已核验的 outcome 编码，**不是声称从 CLI 提取了可在生产使用的 DON 签名 report**。生产 receiver 不接受本地 synthetic ID；脚本不会把任何本地身份安装到 Sepolia。

## 凭证内容

| 文件 | 用途 |
| --- | --- |
| `report.json` | 执行时间、范围、逐项 pass/fail、CLI 命令、源码/二进制指纹、部署描述、链上交易完整回执及最终状态 |
| `build-attempt-*.log` | 官方 CLI fresh build 和二进制 hash |
| `accepted-and-rejected-attempt-*.log` / `*-result.json` | CLI 接受/拒绝的验证、report 生成、解码后的逐单结果 |
| `accepted-evidence.json` / `rejected-evidence.json` | 原始输入/成果、订单身份快照、spec、独立 verdict、CLI outcome 和本地 callback ABI payload |
| `identity-binding.json` | 本地注册、文档、已消费 challenge 和 owner 签名 |
| `*-funding-authorization.json` | 买方订单授权消息、签名和本地 funding hash |
| `feedback-active.json` | 付款后评价索引和首次评价交易 |
| `feedback-revoked.json` | 撤销状态及**独立撤销交易完整回执** |
| `workspace-final.json` | D1 最终 revision 和完整工作区状态 |
| `project.yaml` / `workflow/` / `workflow.wasm` | 本次实际 RPC 映射、配置、入口和 fresh build WASM |
| `checksums.json` | 可移交文件 SHA-256；D1/R2 运行时内部文件不纳入，便携 JSON 快照纳入 |

日志仅对明确的 CRE 初始化组织查询故障进行最多 3 次重试；业务验证、HTTP/成果差异、report/receiver 失败均保留失败，不将其改记通过。失败执行也会保留独立报告；修复后新建运行目录，不覆盖旧记录。
