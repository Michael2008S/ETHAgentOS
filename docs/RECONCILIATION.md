# 链上凭证写回工作区

钱包页将通过客户端核验的回执提交给服务端复核，保存为独立的链上历史。沙盒 testUSD 余额不随这次操作增减；这不是预注资后启动任务的执行路径。

## 验证链路

1. 服务端从已认证工作区读取已完成任务，检查本地收据与任务、报价、输入和成果相符。
2. 服务端生成五分钟有效的挑战，绑定工作区摘要、nonce、任务、买方、交易、阶段、证据承诺与完整公开部署配置。
3. 买方用钱包签名。客户端核对挑战与选中的回执、钱包及部署相符；服务端通过配置的链验证签名，不接收浏览器提供的“验证成功”结果。
4. 服务端从指定 RPC 读取部署标识、交易回执、规范区块、确认数、任务历史状态和事件。金额按代币精度核验；已付款的 outputHash 还必须对应网页的交付成果。
5. 通过共享 D1 CAS 将凭证和挑战消费状态原子写入工作区。相同 chainId、escrow、transactionHash、phase 只有一条记录；并发重放不重复入账。

历史记录是 `verifiedAt` 时的核验快照。可以重新核验并签署新挑战；未实现持续的全链重组监控、预注资执行或公共声誉 registry。它证明所配置合约的事件，不证明报告来自真实 CRE DON；本地部署仍是测试 EOA。

## 本地演示

启动网页和 `npm run chain:local`，再运行 `npm run demo:reconcile`。测试使用独立工作区，实际经过 HTTP 钱包、签名、网页服务、EVM RPC 和 D1：付款、错误交付退款、超时退款三场景；每场景都验证重复/并发提交、错误签名、跨工作区访问、禁止调用方附带伪造 evidence、网络选择、来源检查、记忆检索和导出。脚本在每个场景前显式推进本地测试时钟，避免旧区块时间影响短期托管。

浏览器操作：钱包与托管 → 连接本地测试钱包 → 注资/结算 →「签名并保存凭证到工作区」。刷新后「已保存的链上凭证」仍保留；可导出 JSON，或在任务记忆中按交易哈希搜索。停止临时链会丢弃测试合约，但保留 D1 历史快照。

开发模式仅在回环请求中从固定的 `127.0.0.1:8545` 读取本地部署。生产构建没有这个回退；调用方不能指定 RPC URL。

## 公共测试网配置

在服务端设置 `AGENTOS_CHAIN_CONFIGURATION` 为 JSON 字符串，包含 `rpcUrl` 和 `deployment`。`rpcUrl` 必须是 HTTPS，不能在 URL 的 userinfo 中嵌入凭证；需要供应商凭证时通过服务端环境管理，不放在客户端或仓库。

`deployment` 必须与钱包配置一致：`mode: "testnet"`、`chainId: 11155111`，以及真实的 `escrow`、`token`、`forwarder`、`metadataHash`、`seller`、`confirmations` 和字符串 `deployedBlock`。服务端会读取并核验合约中的 token、forwarder 和 metadataHash。未配置时返回 503，不能用客户端配置代替服务端可信配置。公共 Sepolia 的真实扩展签名和 DON 尚待验收。

接口：`POST /api/chain`，`action: "challenge"` 获取挑战，`action: "reconcile"` 提交 nonce/signature。公开 `/api/command` 不暴露凭证写入命令。`GET /api/exports?kind=chain-receipts` 导出当前工作区历史；任务 context 和记忆导出也包含对应的链上记录。
