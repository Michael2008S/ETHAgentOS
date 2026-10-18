# Chainlink 与测试网接入

## 当前选型

核心采用 **CRE：定时读取链上任务 → 获取已承诺的证据和交付 → 多节点相同结果共识 → 签名 report → EVM 托管结算**。源码：`cre/workflow/main.ts`。它使用 SDK 的 CronCapability、HTTPClient、EVMClient、runInNodeMode、runtime.report、writeReport，而不是将普通 fetch 命名为 CRE。[官方 onchain write 示例](https://docs.chain.link/cre/getting-started/part-4-writing-onchain-ts)。

Functions 不作为新项目依赖；当前官方文档已提示弃用。Data Feeds 可在以后对非稳定币预算换算时接入；CCIP 可在单链闭环完成后扩展跨链任务消息与资金路由。两者当前均未实现，不作为已完成的赛道集成声称。

## 当前验证任务

买方固定 `DeliverySpec`：datasetUrl、datasetHash（原始 JSON 文本 keccak256）、artifactUrl。`specHash` 是对规范排序 JSON 的 keccak256；由合约在 openTask 时锁定。工作流从最终确认区块读取该承诺，仅处理 Funded 的任务；下载固定 URL，检查证据字节 hash，重新计算 transferCount 和 totalCents，再核对 artifact 的 taskId。

报告 ABI：`(bytes32 taskId, bytes32 specHash, bytes32 outputHash, bool accepted)`。合约不信任网页传入的 pass 标记，只接受不可变 forwarder 且 `keccak256(metadata)` 匹配配置的报告。认证失败、错任务、重复 report 均失败。超时后任何人可触发退款，但资金只能回原买方。

网络故障、hash 不一致或解析失败会中止工作流，不误付款；待合约 deadline 后退款。一个 workflow 配置演示一个 task，扩展队列/日志触发尚未实现。

## 本地构建

`npm run cre:build` 使用 SDK 编译器将当前 `cre/workflow/main.ts` 编译为 `outputs/agentos-cre.wasm`，需要 Bun >=1.2.21（可设置 `AGENTOS_BUN_BIN`）。已在 Bun 1.3.8、SDK 1.23.0、Javy 8.1.0 上实际通过。CLI v1.38.0 已安装至忽略的本地工具目录，并通过下述三个模拟场景。WASM 编译不需要钱包，不会部署或广播交易。

官方 CLI 构建也已实跑成功：

```sh
npm run cre:prepare   # 从 example 生成忽略的本地配置，不覆盖已有文件
npm run cre:cli-build # 官方 CLI build，输出 outputs/agentos-cli.wasm
```

YAML 结构来自[官方模板](https://github.com/smartcontractkit/cre-templates/tree/main/building-blocks/indexer-block-trigger/block-trigger-ts)。填写 `cre/workflow/config.local.json` 的实际地址、任务与不可变 HTTPS 证据，再登录 CLI 后执行 `npm run cre:simulate`。该命令使用已构建 WASM，默认不广播交易。工作流启动会拒绝占位地址、无效哈希、非 HTTPS URL 和不合理 gasLimit；构建不代表这些网络配置已验证。

用户已在本机终端完成登录，`cre whoami` 返回成功。账户凭证不提交到仓库或聊天。

`npm run demo:cre` 会先构建最新 WASM，再在临时 Ganache 上注资两个任务，以公开合成数据的 HTTPS 端点运行官方 CLI dry-run。正确交付与错误交付分别生成接受/拒绝报告；承诺不匹配在生成报告前拒绝。真实执行了 HTTP、最终区块读取、节点共识、报告生成和 EVM write capability，但没有 `--broadcast`。链上状态保持 Funded；本地 RPC 借用 Sepolia selector 名称用于模拟，不是公共 Sepolia。不得将结果称为已部署 DON 或已上链结算。

## 公共网络启用步骤（尚未完成）

1. 按[官方安装文档](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux)安装并登录 CRE CLI，执行 `npm run cre:prepare`，检查基于官方模板的 project.yaml / workflow.yaml；本地样例仍需实际网络与账户配置。
2. 将 `workflow/main.ts` 和 `verify.ts` 加入生成的 TypeScript 工作流，安装项目已固定的 SDK 版本。复制 config.example.json 到忽略的 config.local.json，替换全部占位值。公开不可变 fixture 和交付文件，计算 hash。
3. 从[官方 forwarder 目录](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/forwarder-directory)核实目标链的 forwarder。拿到实际 workflow metadata 字节（对应登记的 workflow identity）后计算 metadataHash；不能用本地 EVM 测试中的 mock 字节代替真实配置。测试用 forwarder 与生产 forwarder 不混用。
4. 编译、部署 AgentEscrow，构造器传标准测试 ERC-20、核实后的 forwarder 和 metadataHash；部署 AgentVault、存入测试代币、批准 executor 和 seller，设置小额度 grant。通过 owner 钱包签名，密钥留在钱包/秘密管理系统。
5. 用同一 DeliverySpec 计算 specHash，openTask 并保存 taskId、deadline。artifact JSON 格式为 `{ "taskId": "0x…", "totalCents": 75000, "transferCount": 6 }`。
6. 用官方 CLI 模拟生成的 workflow；需要广播测试交易时按官方文档启用广播，并确认使用测试资金。本地 CLI dry-run 已通过，公共网络广播和 DON 仍未验收。[模拟文档](https://docs.chain.link/cre/guides/operations/simulating-workflows)。
7. 按账户权限申请 workflow 部署，并验证 report 通过真实 forwarder 到达合约。记录 execution ID、交易 hash、余额变化、相同任务二次 report 拒绝和超时退款。
8. 网站已提供 EIP-1193 连接、链上余额、回执核验、买方签名及服务端复核写回 D1。仍需实现预注资任务执行与持续链重组监控，并验收公共网络配置。不得把本地 D1 余额简单切换标签当作链上资金。

ERC-8004 身份适配器位于 `sdk/identity.ts`。返回注册文档和 register(string) calldata；需 owner 签名，并在获得 agentId 后补 registrations。身份协议本身不承担付款。[ERC-8004 规范](https://ercs.ethereum.org/ERCS/erc-8004)。
