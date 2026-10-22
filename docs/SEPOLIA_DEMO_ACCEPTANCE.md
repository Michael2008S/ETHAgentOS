# Sepolia demo 验证结果、凭证索引与后续验收

整理日期：2026-10-23（Asia/Hong_Kong）。本页汇总已有验证文件，并根据当前代码、CLI 帮助及官方文档整理后续步骤；本次整理没有重新广播交易、重新部署或刷新所有链上状态。时间和区块以各原始报告为准。

**当前进度：身份注册 → 文档关联 → 工作区签名绑定 → 未注资身份草稿 → 测试代币/未绑定接收合约 → D1 公共证据 → 官方 CRE HTTPS dry-run 已验证。真实 DON 部署、绑定、注资、付款、付款后评价及撤销仍待验收。拿到真实 workflow ID 前继续不绑定、不注资。**

## 1. 已验证结果及边界

| 项目 | 已验证结果 | 范围和限制 |
| --- | --- | --- |
| ERC-8004 身份 | Sepolia Agent ID `11207`，owner/payment wallet 与注册回执一致 | 早期独立文档已被后续工作区文档替换；不重复注册 |
| 链上文档 | Atlas 工作区文档、自引用注册信息、文档哈希已核验 | 文档 web/image 指向本机 `127.0.0.1:6397`，未证明公共 AgentOS 可用 |
| 工作区绑定 | owner personal-message 签名、nonce、到期前消费、D1 持久化通过 | 工作区是本地持久 D1；与 Cloudflare 公共证据 D1 是两个不同存储 |
| 订单身份 | 不可变身份快照及草稿 commitment 复算通过 | `identity-preview`、`fundingEnabled=false`，链上订单数为 0；须另建真实订单 |
| 测试代币 | 部署回执、创建字节码、运行代码及 6 位小数通过 | 无价值测试代币，不代表 USDC |
| 托管接收合约 | 构造参数、forwarder、owner/name、接口及运行代码通过 | `workflowId=0`、余额为 0；`openTask` 的 eth_call 返回 `workflow not bound` |
| 公共证据服务 | Workers + D1 实际部署；匿名精确读回、写鉴权、幂等、冲突拒绝、归档保留通过 | 原型级应用不可覆盖约束；管理员仍控制数据库，哈希用于独立完整性核验 |
| 生产 dispatcher | 官方 CLI：空队列、发现未注资任务后 `not-finalized`、归档后空队列三组通过 | 实际 HTTPS + Sepolia 读取；未进入 funded 结算/report 分支 |
| 证据读取 | 独立只读 CRE 探针通过 HTTP capability/node consensus 读取输入和成果，复算一致 | 复用生产 `verifyDelivery`，无 EVM/report/write 能力；与生产 dispatcher 测试分开记录 |
| CRE 权限 | 最近检查已登录，`deployAccess=false` | 检查于 `2026-10-22T21:52:00.449Z`（香港 10 月 23 日 05:52）；后续部署前须重查 |

最近 dry-run 的链上前后快照为区块 `11972321` / `11972329`，两次 workflow ID 都为零、receiver 测试代币余额都为零，未提交交易。合成 ready 项已归档，队列为零，输入/成果字节仍保留。探针输出哈希：`0xfdbcdffbd5cd22ddf72754142d88c3c5a761985be1bb22394c28ce3570882498`。

历史报告中的 `pending` 是当时快照，部分“receiver 部署/公共证据服务”待办已在后续完成；不要修改历史报告，按本页与后续凭证判断当前进度。

## 2. 固定网络及配置

| 字段 | 值 |
| --- | --- |
| 网络 | Sepolia，chain ID `11155111` |
| Identity registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Agent / 本地 profile | `11207` / `atlas` |
| Owner、付款接收钱包、receiver configurator | `0xa94b3b3A8398087aB05CB85A97771f5367110062` |
| 测试代币 | `0x5f66e3636252ceaa4be0cec6584ac2dba2caba20` |
| Receiver | `0xbd805f9bc3f655b82f99da6077fbccc9a5e0cdce` |
| Receiver 部署块 | `11971998` |
| Forwarder（部署时核验值） | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |
| Workflow 名称 / bytes10 编码 | `agentos-delivery-staging` / `0x66363765303630383763` |
| metadataHash | `0x7cc5c41caaa171ea048b47eb4bfabb8463b3d2847d02594aad7f52066a654d70` |
| Workflow ID | 尚未取得；链上当前保留报告为全零，不能用占位值绑定 |
| CRE 配置 | dispatcher，`*/30 * * * * *`，gasLimit `500000`，registry `private` |
| 公共证据 origin | <https://agentos-evidence-bd805f9b.michael2008s.workers.dev> |
| 公共配置 | <https://agentos-evidence-bd805f9b.michael2008s.workers.dev/v1/config> |
| 远端证据 D1 | `agentos-sepolia-evidence-bd805f9b` / `6c6a3c13-f574-4185-ba85-161416821aec` |

工作区文档的 `agentos.workspaceHash` 是 ownerId 的摘要 `0x4048d89130daedd218a2175ba10c9dbc1fbd0b5737426b28c19267a2ef2db7a3`；D1 store 的 workspace scope/草稿 namespace 为 `0x8565e95add2054587b80b595c037fbae6e109d5f0eb8b2210eab9fbf6ff871f3`。两者用途不同，不应直接判为必须相等。

## 3. 凭证入口

下列路径相对仓库根目录。机器索引 [SEPOLIA_DEMO_EVIDENCE_INDEX.json](SEPOLIA_DEMO_EVIDENCE_INDEX.json) 保存文件大小、SHA-256、阶段与交易摘要。本次对索引文件进行了存在性和哈希核对；不等于重新运行原始链上验收。

| 阶段 | 原始凭证 | 查阅内容 |
| --- | --- | --- |
| 全部已提交交易 | [transactions.json](../outputs/erc8004-sepolia-2026-10-23/transactions.json) | 5 笔交易哈希、完整回执、区块、日志、状态 |
| 身份初始阶段 | [identity-verified.json](../outputs/erc8004-sepolia-2026-10-23/identity-verified.json) | 注册及首次补全的历史检查点 |
| 工作区当前检查点 | [workspace-verified.json](../outputs/erc8004-sepolia-2026-10-23/workspace-verified.json) | 签名核验、当前文档、链上身份、预检草稿 |
| 原始签名及 challenge | [workspace-binding.json](../outputs/erc8004-sepolia-2026-10-23/workspace-binding.json)、[challenge](../outputs/erc8004-sepolia-2026-10-23/workspace-challenge-80c0a2c2-3abf-4898-948b-2d38b2a55bdc.json) | 消息、签名、nonce、有效期；仅用于核对历史已消费挑战 |
| 本地 D1 | [d1-binding-evidence.json](../outputs/erc8004-sepolia-2026-10-23/d1-binding-evidence.json)、[order-identity-preview.json](../outputs/erc8004-sepolia-2026-10-23/order-identity-preview.json) | revision 3、challenge 已消费、订单身份快照、commitment、无链上订单 |
| 合约部署 | [deployment-verified.json](../outputs/erc8004-sepolia-2026-10-23/deployment-verified.json)、[deployment-unbound.json](../outputs/erc8004-sepolia-2026-10-23/deployment-unbound.json) | 源码指纹、回执、构造参数、字节码、不能注资及 inactive 配置 |
| 公共服务部署 | [cloudflare-service-deployment.json](../outputs/erc8004-sepolia-2026-10-23/public-preparation/cloudflare-service-deployment.json)、[worker-deployments.json](../outputs/erc8004-sepolia-2026-10-23/public-preparation/worker-deployments.json) | D1、部署阶段、版本；secret 安装后的版本以 deployments 记录为准 |
| 实际 HTTPS 验收 | [public-evidence-acceptance.json](../outputs/erc8004-sepolia-2026-10-23/public-preparation/public-evidence-acceptance-90da0f7f-ba65-4ca3-877f-89ed2148b09b.json)、[远端 D1 留存](../outputs/erc8004-sepolia-2026-10-23/public-preparation/d1-public-evidence-rows.json) | HTTP 状态、写入/读回、冲突及归档 |
| 官方 CLI dry-run | [summary.json](../outputs/erc8004-sepolia-2026-10-23/public-preparation/cre-public-d1-dry-run-abe46dce-f735-4a1c-936a-bb690819b24e/summary.json) | 三组 dispatcher、只读探针、链上前后状态、权限、边界 |
| dry-run 完整证据 | [report.json](../outputs/erc8004-sepolia-2026-10-23/public-preparation/cre-public-d1-dry-run-abe46dce-f735-4a1c-936a-bb690819b24e/report.json)、[只读探针](../outputs/erc8004-sepolia-2026-10-23/public-preparation/cre-public-d1-dry-run-abe46dce-f735-4a1c-936a-bb690819b24e/readonly-probe/report.json)、[checksums](../outputs/erc8004-sepolia-2026-10-23/public-preparation/cre-public-d1-dry-run-abe46dce-f735-4a1c-936a-bb690819b24e/checksums.sha256.json) | 同目录保存 CLI 日志、配置、源哈希、WASM、合成原始字节及权限检查 |

### 已成功的链上交易

| 用途 | 区块 | Sepolia 浏览器 |
| --- | --- | --- |
| 注册 11207 | 11971867 | [0x9ffc…972b](https://sepolia.etherscan.io/tx/0x9ffc9224a108ebb72289bf1dec3aa6b929bd073969bcb2240799cb1ac572972b) |
| 首次文档补全 | 11971874 | [0x4746…8e74](https://sepolia.etherscan.io/tx/0x47464f9aeb75f635f4196a6d5877ae34892aa46220487ab11978a5665ad68e74) |
| 工作区文档更新 | 11971928 | [0x6aff…6241](https://sepolia.etherscan.io/tx/0x6affff01efd14e578172d5953301e6ecefc7af94e8ebe0780c04d28a66fb6241) |
| 测试代币部署 | 11971990 | [0x4c60…e934](https://sepolia.etherscan.io/tx/0x4c6065ae577a8a4e091bfba700dfae5a7332c433d3385997e717f5816238e934) |
| Receiver 部署 | 11971998 | [0xde6b…de1c](https://sepolia.etherscan.io/tx/0xde6b4b3139eca7469df64dcfa0f7e50c881c5bac6079088bf184ddddb36ade1c) |

工作区绑定是个人消息签名，草稿保存是 D1 写入，公共服务部署是 Cloudflare 操作，dry-run 是模拟执行；均不应补造 Sepolia 交易哈希。两次早期 `--wasm` 路径失败报告保留在 `public-preparation/cre-public-d1-dry-run-a2c448fa-*` 和 `cre-public-d1-dry-run-c30fe7f2-*`，成功运行已解决短绝对路径限制。

凭证原件位于本地 `outputs/`，未随本页全部提交到 Git。移机时需单独复制索引覆盖的文件及 dry-run 整个目录并核对哈希。不要把私钥、助记词、Cloudflare 凭据或 `.sites-runtime/sepolia-public/write-token` 放入凭证包。

## 4. 权限获批后的分阶段步骤（本页仅列步骤，不执行）

### A. 重查权限与部署输入，仍不绑定、不注资

从仓库根目录执行只读命令，输出脱敏后留存至新的验收目录，不覆盖历史凭证：

```sh
./.sites-runtime/cre-bin/cre version
./.sites-runtime/cre-bin/cre whoami
./.sites-runtime/cre-bin/cre registry list
./.sites-runtime/cre-bin/cre workflow supported-chains
./.sites-runtime/cre-bin/cre workflow list --registry private --output json
```

必须确认 deploy access 已获批、目标组织及 private registry 可用，并按最新支持网络再次核对真实 forwarder。检查 `.sites-runtime/sepolia-public/cre/` 的 project/config/workflow YAML，保持第 2 节的 receiver、origin、chain、name、dispatcher 参数一致。重新核验身份 owner/wallet/文档、receiver 未绑定与余额、公共证据匿名读取及鉴权；可按 [公共准备文档](SEPOLIA_PUBLIC_PREPARATION.md) 重跑官方 HTTPS dry-run。不要使用空队列结果冒充结算验收。

### B. 部署 reusable dispatcher，保存真实 ID 与执行身份

当前目标 `deployment-registry: private` 使用 CRE 登录态管理，无需主网 gas 或 wallet key linking；这是官方区分的管理方式。参见 [CRE registry 对比](https://docs.chain.link/cre/guides/operations/deploying-workflows)。现有合约固定的报告 owner 不会因选择 private 自动得到证明。

权限和配置通过后，未来部署命令为：

```sh
./.sites-runtime/cre-bin/cre workflow deploy ./workflow \
  --project-root "$PWD/.sites-runtime/sepolia-public/cre" \
  --target sepolia-settings
./.sites-runtime/cre-bin/cre workflow get ./workflow \
  --project-root "$PWD/.sites-runtime/sepolia-public/cre" \
  --target sepolia-settings --output json
./.sites-runtime/cre-bin/cre workflow list --registry private --output json
```

部署命令会改变远端状态，不能当作无副作用预检。保存 CLI 版本、源码 commit/哈希、配置/二进制哈希、部署输出、真实 workflow ID、registry、DON/health、activation 状态和执行记录。若未激活，核对当时 `workflow activate --help` 后激活并查询状态，不假定 deploy 输出即已执行。private registry 没有主网注册交易时保留平台记录，不捏造回执。

**绑定前单独核验实际报告 metadata：ID、bytes10 name、owner、真实 forwarder 及 64-byte 格式必须与 receiver 兼容。** 仅拿到非零 ID、只看到同名记录或 dry-run 成功均不足。保存平台提供的身份元数据；若平台不暴露足够信息，需先向 Chainlink 确认或通过另行准备的无资金诊断 receiver 取得真实报告证明，诊断部署也应单独记录。现有 owner/name/forwarder 不可修改；不兼容时停止，制定新 receiver/配置方案并重新验收。不能通过改成本地 mock、伪造 ID 或主网 key linking 绕过这一关。

若改走 onchain registry，需单独评估主网 gas 和永久组织 key 关联；本计划不包含该切换。参见 [官方 key-linking 说明](https://docs.chain.link/cre/organization/linking-keys)。

### C. 真实 ID 和执行身份全部匹配后，才准备一次性绑定

使用 `sdk/cre-receiver.ts` 的 `bindCREWorkflowTransaction` 生成 unsigned calldata，先做只读模拟，再由 configurator 的 MetaMask 签名。目标为第 2 节 receiver、ETH value 为 0，调用 `bindWorkflow(bytes32 realId)`。绑定不可二次修改；签名前展示完整真实 ID、owner/name/forwarder 对照。

收到回执后，核对交易发送者、合约、函数参数、成功状态、至少 2 个确认及 canonical block；保存 `WorkflowBound(realId)`，读回 `workflowId()`，通过 `verifyCREReceiver`。此时仍不自动铸币、approve、转账或开单。

### D. 补齐实际 AgentOS 支付配置和两钱包条件

按 `sdk/wallet.ts`、`sdk/chain.ts` 校验部署描述，再配置服务端 `AGENTOS_CHAIN_CONFIGURATION`（HTTPS RPC + deployment）、`AGENTOS_EVIDENCE_CONFIGURATION` 和服务端 secret `AGENTOS_EVIDENCE_WRITE_TOKEN`。deployment 包含真实 ID 的 `receiver:{format:'cre-v1',workflowId,workflowName,workflowOwner}`、mode `testnet`、chainId、token/escrow/forwarder/metadataHash、确认数、seller、receiver 部署块及两个 registry。

当前身份验收启动器 `scripts/sepolia-console/workspace.mjs` 仅配置身份服务；完整付款运行器/配置尚须补齐并实测，不要把 inactive `deployment-unbound.json` 安装为 active 配置，也不要覆盖身份 D1。证据 writer secret 只进入服务器环境；CRE 读取公共证据不需要该 secret。保留同一工作区/身份绑定，必要时重新请求新挑战；买方的新工作区必须先完成真实身份绑定，不能直接搬入旧签名。

供应商使用 11207 的 payment wallet；买方必须是另一个地址，且 `isAuthorizedOrOwner(buyer,11207)==false`。现有草稿买方等于 owner，不能用于付款后评价验收。买方准备 Sepolia ETH，后续明确核对测试代币数量并由钱包逐笔执行。新的小额订单不得沿用旧预检草稿或旧 synthetic task ID。

### E. 完整主流程与通过标准

| 顺序 | 操作 | 必须保存并核验 |
| --- | --- | --- |
| 1 | 两钱包连接及新订单身份绑定 | 供应商 identity 11207、owner/wallet/文档刷新有效；买方不同且非 operator；D1 订单身份快照固定，seller 等于 identity wallet |
| 2 | 发布真实订单输入 | D1 draft 的确切输入字节、datasetHash、v2 specHash、公开 URL；匿名读取一致，只有该单范围进入验收 |
| 3 | 准备测试币、限额 approve、openTask | 每笔交易哈希及 canonical receipt；Opened 的 taskId/buyer/seller/amount/specHash 与 D1 一致；状态 Funded；不要直接转币到 receiver 代替 openTask |
| 4 | 交付与公共成果发布 | 真实执行输出、artifact 原始字节/哈希、taskId/specHash、ready index；证据有明确公开提示 |
| 5 | 等待真实 DON 分发/验证/report | 实际 execution ID、执行时间、workflow ID、HTTP 读取及验证结果；等待 finalized 链读取，deadline 使用公共链至少一小时窗口策略 |
| 6 | Forwarder 付款并对账 | 实际 Sepolia report/settlement 交易、Settled accepted=true、任务 Paid、outputHash 与重算一致、供应商余额增量等于金额；D1 reconciliation 对应同一链上凭证 |
| 7 | 付款后评价 | 买方给出评分 0–100，giveFeedback 指向 11207；NewFeedback 中买方、feedbackIndex、score、URI/hash、tag2/taskId 与 proofOfPayment 对应，readFeedback isRevoked=false；工作区状态 active |
| 8 | 撤销评价 | 同一买方对准确 agentId/feedbackIndex 调用 revokeFeedback；保存**独立撤销交易**回执，readFeedback isRevoked=true，工作区刷新为 revoked，评分聚合排除撤销项 |
| 9 | 收尾 | 最终任务、两钱包/receiver 余额、D1 状态、ready 归档及不可变证据留存；仅归档本轮订单，保留原始记录 |

每笔链上写入至少按配置的 2 个确认与 canonical block 检查；报告另附 finalized 可见区块及执行记录。CRE execution ID、平台部署 ID、Sepolia tx hash 分字段保存。`sdk/agent-identity.ts` 撤销后会用原评价 transactionHash 刷新评价状态，故原评价记录不能代替撤销交易凭证，必须从本次钱包发送结果额外保存 revoke hash/receipt。

### F. 异常分支与恢复验收

1. 付款前评价、owner/operator 自评、非原评价者撤销应被拒绝；优先使用 API 预检/eth_call，避免为拒绝测试消耗链上 gas。
2. 错误 sender/metadata、重放、重复绑定等按合约约束做无广播模拟；已有本地测试不能写成 Sepolia 真实 DON 验收。
3. 另建专用小额订单验证“可解析但结果错误”的成果：真实 DON 验证 rejected、Settled accepted=false、状态 Refunded、买方余额恢复；不能把证据服务 409 或任务 absent 当作退款通过。
4. 另建无可结算交付的订单验证真实过期退款：等到链上 deadline，调用 refundExpired，核验资金和终态；不改公链时间、不复用已支付订单。
5. 只在指定验收订单上验证重复 reconcile、进程重启后的回执发现、ready 归档幂等、不可变证据仍可读；重复消费不得产生第二次付款或第二次计分。HTTP/RPC 故障应保持待重试状态，不能转成付款成功。
6. 每个场景单独记录 pass/fail/pending 及原因。只有真实 DON 付款、拒绝退款、到期退款、评价及撤销凭证齐全，才标记完整公共链 demo 通过；权限获批或 dry-run 不能代替这些项。

## 5. 需要用户手动操作（与自动核验分开）

| 时机 | 用户操作 | 钱包/网络与需要核对的内容 |
| --- | --- | --- |
| CRE 登录失效/审批 | 完成登录、MFA，确认组织；如平台要求，处理部署权限申请 | CRE 账户；private registry 管理不应要求主网 key linking |
| 执行身份不兼容 | 审阅新 receiver 或诊断方案；若需要部署，由钱包签名 | Sepolia，参数和用途另列；不对不兼容现有合约硬绑定 |
| 真实 ID 及 metadata 已核验 | MetaMask 确认一次 bindWorkflow | configurator `0xa94b…0062`，Sepolia，receiver `0xbd80…cdce`，0 ETH、真实完整 ID |
| 完整验收开始前 | 准备第二个买方地址并切换/连接，补充测试 ETH | 买方与 11207 owner/operator 不同，不提供私钥/助记词 |
| 身份绑定确需刷新 | owner 签新的五分钟消息挑战 | prefix、workspace hash、11207、文档哈希、nonce、expiry；个人消息签名，无 gas |
| 绑定后需要测试币 | 确认限额测试币 mint（如需）及买方 approve | Sepolia，无价值 token；approve spender 为准确 receiver、金额限本轮需求 |
| 每个独立真实订单 | 确认 openTask 注资 | 买方钱包，核对金额、seller、deadline、taskId/specHash，ETH value=0 |
| 真实 DON 付款后 | 买方在“Paid-order feedback”发布评价 | reputation registry，11207、0–100 评分、付款凭证；一笔交易 |
| 评价已确认后 | 同一买方点击“Revoke feedback” | 同一 agentId/feedbackIndex；另一笔交易，额外保存撤销 tx hash |
| 到期退款分支 | 钱包发送 refundExpired | 准确测试 taskId、链上已到期；额外交易 |

自动侧负责配置与源码核对、公开证据读回、CLI dry-run、部署/执行状态查询、unsigned 交易准备、回执/事件/余额/身份/D1 核验与索引更新。真实 DON report 由部署的 workflow 经 forwarder 提交，不要求用户手动伪造 onReport。

## 6. 本次整理的完成项

- 已对索引所列凭证逐个读取、生成 SHA-256，并核对现有 dry-run 校验清单。
- 已整理 5 笔历史成功交易、阶段边界、private registry 兼容性关卡和两钱包要求。
- 未执行 deployment、activation、bind、mint、approve、openTask 或任何链上写入；未更改 active 支付配置。
- 后续执行完成一个阶段，添加新凭证和验收结论，保留当前历史快照，不把待办直接改成通过。
