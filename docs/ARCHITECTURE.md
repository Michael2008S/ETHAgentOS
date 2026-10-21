# AgentOS MVP 架构

## 产品范围

| 模块 | 当前实现 | 后续工作 |
| --- | --- | --- |
| Identity | 官方 ERC-8004 本地注册、链上 data URI 校验、持有者签名与支付钱包绑定、订单身份快照 | 公共测试网与真实浏览器扩展验收 |
| Wallet | 模拟余额；AgentVault 合约；网页 EIP-1193/本地钱包与链上余额 | 真实浏览器扩展与公共测试网验收 |
| Memory | 按智能体/内容/哈希检索任务；已付款成果信封、可信输入引用、多父成果汇合与上下文导出 | 语义选择与租户级私有向量知识库 |
| Skills | 两个版本化技能、内置或独立 HTTP 执行进程、链上签名委托、成果签名与独立复算 | MCP/A2A 发现与通用代码沙箱 |
| Reputation | 官方信誉表交易、原买方付款证明核验、独立订单去重评分、撤销与对账 | 公共网络、持续重组监控与全网索引 |
| Payments | 模拟账本、单链 ERC-20 托管、回执核验与 UI 同步；买方签名绑定工作区、服务端复核、D1 幂等历史 | 公共测试网、持续重组监控与 x402 采购 |
| Permissions | 服务端 typed operation gate；预算；实时撤销；Vault 签名会话与链上执行者限额 | 公共网络会话验收与通用目标合约/selector 委托 |
| Escrow | 原子预留/结算/退款；真实托管回执、输入预承诺、先注资后后台执行、失败链上退款 | 公共网络验收与持续重组监控 |
| Marketplace | 本地目录、固定报价、已配置供应商描述与链上委托，订单固定执行方 | 多供应商发现、真实服务 SLA |
| Execution | D1 持久队列及租约、幂等恢复、期限、受限多步/并行工作流、条件跳过、多父汇合、目标规划、模板与受限自动修复提案 | 循环/子工作流、生产队列运维与外部执行 SLA |

## 两条执行路径

```mermaid
flowchart LR
 U[Mission Control / SDK] --> A[Sandbox task API]
 A --> P[Policy + capabilities]
 P --> E[Deterministic data adapters]
 E --> V[Local recomputation]
 V -->|sandbox| D[D1 task + ledger + receipt]
 B[Buyer wallet] --> G[ERC20 approve + openTask]
 B --> AV[AgentVault bounded grant + signed session]
 AV --> G
 G --> C[AgentEscrow]
 C --> R[Server funding and signature verification]
 R --> Q[D1 order checkpoints]
 Q --> P
 Q --> X[Authorized HTTP skill supplier]
 X --> Z[Signed delivery + persisted job]
 Z --> V
 V -->|onchain| H[Immutable delivery artifact]
 H --> L[Local HTTP + EOA verifier]
 L --> C
 H -. public configuration pending .-> W[CRE DON]
 W -. authenticated report .-> C
 C --> F[Canonical receipt verifier]
 F --> Q
```

两条支付模式均已接通网页。预注资订单通过 `demo:prefund` 验证先确认真实托管、再执行并结算的链路；既有成果还可通过 `demo:chain`/`demo:reconcile` 接入独立托管并保存回执。资金账本分别记录。AgentVault 订单可通过已签名会话自动注资，保留人类买方与 Vault 实际付款方的区别；会话与每日额度、撤销、退款和恢复边界见 VAULT.md，当前验收状态见 ROADMAP-IMPLEMENTATION.md。CRE CLI 已通过本地 RPC 与真实 HTTPS 的 dry-run；DON/公共测试网尚未联调。

## 并发与恢复

每个用户持有一份 workspace aggregate，`revision` 是 CAS 版本。任务、预留金额、付款记录、收据与队列写入通过 D1 原子 batch 提交；版本冲突最多重新计算 12 次。CAS 防止两个并发请求对同一旧余额分别成功扣款。达到重试上限返回 409，调用方用同一 requestId 重试。

`advance` 携带 expectedStep。过期请求保持原状态；任务结算与 receipt 同时持久化。故障演示在已提交付款后转入 paused，resume 只补最后一步。此保证限于当前 D1 aggregate；外部真实转账需以链上 taskId、最终回执及 reconciliation 实现同等保证。

余额：`available = deposits − settled − active reservations`。服务费使用创建时固定报价；多余预算释放。日预算按 UTC 结算额加全部在途预留进行保守核算。

## 信任边界

- 模型/外部工具不能直接转账；当前数据适配器只允许 dataset.read 与 artifact.write。模型输出解析为有限 typed operations；不能把字符串当脚本运行。
- 演示攻击是一个确定性恶意 tool-operation 测试用例，并不意味着已经评测真实模型对 prompt injection 的普遍抵抗能力。
- 本地 SHA-256 收据验证数据完整性，不提供签发方真实性：任何人都可以修改内容再重算 hash。真实凭证需要签名或链上事件。
- D1 由服务运营者管理。当前操作日志不是防运营者篡改的审计链。
- 托管站依赖可信身份网关注入 `oai-authenticated-user-id`。部署到其他基础设施前必须移除此信任假设并实现自己的鉴权。禁止把回环匿名模式直接暴露公网。
- EVM 合约只支持可信、标准返回值、无手续费、非 rebasing ERC-20。合约未经独立审计。测试代币不代表生产代币行为。
- CRE 确保指定工作流执行及报告认证，不保证数据源本身真实。当前校验的是买方事先固定的数据字节与简单算术结果，不能验证任意研究报告质量。
- 钱包权限撤销影响后续开单；已经 funded 的 escrow 仍按原交付规则结算或超时退款。退款不补回当日 vault allowance，避免循环重置限额。

## 规模限制

原型单用户最多 300 个任务；整体 JSON aggregate 适合演示和小规模使用。正式版需按 task/account/ledger 拆表，扩展现有 D1 队列的监控和吞吐，加入请求速率、账本体积与存储留存限制。预注资订单支持可选真实 LLM 工具规划，推理在独立服务运行；模型输出经能力检查后调用现有确定性适配器。模型的配置哈希、计划与推理证据随订单保存，详见 MODEL.md。当前没有跨链、通用插件沙箱、生产 session key 或生产级队列运维保障。

业务工作流独立于六阶段订单生命周期：顺序程序支持 2–8 步，审阅式修复可含一步；并行模式显式限制 2–4 个在途采购并核验所有依赖父成果后汇合。旧两步协议保留原语义。工作流有独立持久队列任务，覆盖步骤之间的崩溃窗口；并行图由同一个带租约的作业调度，已注资子订单仍有结算和退款义务。详见 WORKFLOWS.md、WORKFLOW-PLANNING.md、AUTOMATIC-REPAIR.md 与 PARALLEL-WORKFLOWS.md。
