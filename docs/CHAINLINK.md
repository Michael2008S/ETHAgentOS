# Chainlink 与测试网接入

## 当前选型

核心采用 **CRE：定时读取链上任务 → 获取已承诺的证据和交付 → 多节点相同结果共识 → 签名 report → EVM 托管结算**。入口为 `cre/workflow/main.ts`，处理逻辑为 `handler.ts`。它使用 SDK 的 CronCapability、HTTPClient、EVMClient、runInNodeMode、runtime.report、writeReport。[官方 onchain write 示例](https://docs.chain.link/cre/getting-started/part-4-writing-onchain-ts)。

Functions 不作为新项目依赖；当前官方文档已提示弃用。Data Feeds 已接入本地 AggregatorV3 Mock：ETH/USD 用于供应商 gas 美元成本，USDC/USD 用于可选脱锚风控；签名报价保存价格快照，已有退款继续处理。接口、验证和本地范围见 [P1/P2 验收](P1_P2_LOCAL_ACCEPTANCE_2026-10-23.md)。真实网络 Feed 尚未接入；CCIP 跨链消息与资金路由仍未实现。

## 当前验证任务

买方固定 `DeliverySpec`：datasetUrl、datasetHash（原始 JSON 文本 keccak256）、artifactUrl。`specHash` 是对规范排序 JSON 的 keccak256；由合约在 openTask 时锁定。工作流从最终确认区块读取该承诺，仅处理 Funded 的任务；下载固定 URL，检查证据字节 hash，新订单还固定 verification（技能、技能版本、数据集与区块范围）。工作流独立复算完整结果，包括 uniqueRecipients 或每个收款方的 allocations，并要求完整 v2 成果信封精确匹配；报告 outputHash 绑定整个成果信封。详见 [完整成果验收](FULL-DELIVERY.md)。

报告 ABI：`(bytes32 taskId, bytes32 specHash, bytes32 outputHash, bool accepted)`。合约不信任网页传入的 pass 标记。历史 AgentEscrow 固定 forwarder 和完整 metadata 哈希；公共 AgentEscrowReceiver 固定真实 forwarder、workflow ID、编码名称和 owner，并接受变化的 report ID。认证失败、错任务、重复 report 均失败。超时后任何人可触发退款，但资金只能回原买方。

网络故障、hash 不一致或解析失败不产生付款报告。保留历史单任务模式，并新增可复用 dispatcher：固定 receiver 和证据服务，通过有限 ready 队列发现新订单、轮转处理每批最多两个任务；单个任务暂不可用不会阻塞同批其他任务。结算最终确认后由持久任务重试归档 ready 项。详见 [CRE-DISPATCHER](CRE-DISPATCHER.md)。

## 本地构建

`npm run cre:build` 使用 SDK 编译器将当前 `cre/workflow/main.ts` 编译为 `outputs/agentos-cre.wasm`，需要 Bun >=1.2.21（可设置 `AGENTOS_BUN_BIN`）。已在 Bun 1.3.8、SDK 1.23.0、Javy 8.1.0 上实际通过。CLI v1.38.0 已安装至忽略的本地工具目录，并通过下述三个模拟场景。WASM 编译不需要钱包，不会部署或广播交易。

官方 CLI 构建也已实跑成功：

```sh
npm run cre:prepare   # 从 example 生成忽略的本地配置，不覆盖已有文件
npm run cre:cli-build # 官方 CLI build，输出 outputs/agentos-cli.wasm
```

YAML 结构来自[官方模板](https://github.com/smartcontractkit/cre-templates/tree/main/building-blocks/indexer-block-trigger/block-trigger-ts)。填写 `cre/workflow/config.local.json` 的实际地址、任务与不可变 HTTPS 证据，再登录 CLI 后执行 `npm run cre:simulate`。该命令使用已构建 WASM，默认不广播交易。新版配置要求 v2 verification，不能用旧摘要协议创建新工作流。工作流启动会拒绝占位地址、无效哈希、非 HTTPS URL 和不合理 gasLimit；构建不代表这些网络配置已验证。

用户已在本机终端完成登录，`cre whoami` 返回成功。账户凭证不提交到仓库或聊天。

`npm run demo:cre` 会先构建最新 WASM，再在临时 Ganache 上注资四个任务，并通过本轮自己的临时 HTTPS/workerd/R2 服务发布公开合成数据，运行官方 CLI dry-run。使用与分发器演示相同的 cloudflared 启动路径；不再请求 httpbin 的 base64 端点。发布先固定输入和成果，再匿名读回精确字节，暂时性传输故障最多重试三次，冲突/重定向/字节不符立即停止；报告保留分阶段尝试结果，不包含写凭证。事件分析和资金库报告正确交付生成接受报告；错误总额、总额不变但分配明细被篡改（且重算成果哈希）生成拒绝报告；承诺不匹配在生成报告前拒绝。真实执行了 HTTP、最终区块读取、节点共识、报告生成和 EVM write capability，但没有 `--broadcast`。链上状态保持 Funded；本地 RPC 借用 Sepolia selector 名称用于模拟，不是公共 Sepolia。不得将结果称为已部署 DON 或已上链结算。临时服务只承载脚本内合成数据，退出后关闭；仍依赖隧道网络、HTTPS 和 CRE 账户服务，不提供离线或公网服务 SLA。

## 公共网络启用步骤（尚未完成）

1. 按[官方安装文档](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux)安装并登录 CRE CLI，执行 `npm run cre:prepare`，检查基于官方模板的 project.yaml / workflow.yaml；本地样例仍需实际网络与账户配置。
2. 将 `workflow/main.ts` 和 `verify.ts` 加入生成的 TypeScript 工作流，安装项目已固定的 SDK 版本。复制 config.example.json 到忽略的 config.local.json，替换全部占位值。公开不可变 fixture 和交付文件，计算 hash。
3. 从[官方 forwarder 目录](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory)核实目标链的 forwarder。拿到实际 workflow metadata 字节（对应登记的 workflow identity）后计算 metadataHash；不能用本地 EVM 测试中的 mock 字节代替真实配置。测试用 forwarder 与生产 forwarder 不混用。
4. 公共网络使用 AgentEscrowReceiver，传入标准测试 ERC-20、核实后的真实 forwarder、工作流 owner 和编码名称；在实际工作流登记后由部署者一次性绑定返回的 workflowId，绑定前不能注资。SDK 会核验 ERC165 接口与绑定。见 PUBLIC-CRE.md；部署 AgentVault、存入测试代币、批准 executor 和 seller，设置小额度 grant。通过 owner 钱包签名，密钥留在钱包/秘密管理系统。
5. 用同一 DeliverySpec 计算 specHash，openTask 并保存 taskId、deadline。artifact JSON 使用 `deliveryArtifact()` 生成的 v2 完整成果信封，包含完整 output、outputHash、技能验收描述、datasetHash 与 taskId；不能继续发布旧摘要格式。
6. 用官方 CLI 模拟生成的 workflow；需要广播测试交易时按官方文档启用广播，并确认使用测试资金。本地 CLI dry-run 已通过，公共网络广播和 DON 仍未验收。[模拟文档](https://docs.chain.link/cre/guides/operations/simulating-workflows)。
7. 按账户权限申请 workflow 部署，并验证 report 通过真实 forwarder 到达合约。记录 execution ID、交易 hash、余额变化、相同任务二次 report 拒绝和超时退款。
8. 网站已提供 EIP-1193 连接、链上余额、回执核验、买方签名、预注资后台执行及服务端复核写回 D1。仍需持续链重组监控并验收公共网络配置。不得把本地 D1 余额简单切换标签当作链上资金。

ERC-8004 身份适配器位于 `sdk/identity.ts` 与 `sdk/agent-identity.ts`。已完成官方注册表的本地 EVM 注册、补齐 registrations、工作区签名绑定、订单身份快照、已付款反馈及撤销；公共测试网待验收。详见 `IDENTITY.md`。身份协议本身不承担付款。[ERC-8004 规范](https://ercs.ethereum.org/ERCS/erc-8004)。

公共接收合约、不可变证据发布、结算事件发现和可复用分发入口已实现。分发器已有临时 HTTPS/workerd/R2 与本地 EVM 的官方 CLI dry-run 记录；后续 Sepolia receiver 和 Worker+D1 部署的实际进度见 [Sepolia 验收记录](SEPOLIA_DEMO_ACCEPTANCE.md)。DON 部署与已注资结算仍待验收，不能把历史 dry-run 等同于这些验收。协议设计与阶段记录见 [PUBLIC-CRE](PUBLIC-CRE.md)。
