# AgentOS · ETH Shenzhen 2026

**Give agents a goal, a budget, and boundaries. Verify delivery before settlement.**

为本次黑客松制作的 Agent 操作系统 MVP。用统一的任务生命周期，连接身份、技能、权限、预算、交付校验、托管支付和可恢复执行。界面支持中文与英文，右上角切换并在当前浏览器记住选择，默认中文；文档为中文。切换语言不会更改任务数据、技能标识或导出凭证。

## 已实现

- Mission Control：任务、Agent、服务市场、钱包与托管、权限、任务记忆、集成状态、开发者工具。
- D1 持久化执行内核：授权 → 预留预算 → 执行 → 校验 → 结算 → 完成。
- 当前权限逐步检查、技能 capability allowlist、按任务及 UTC 日预算、并发预留、请求幂等、原子结算。
- 四条可操作演示：成功交付、越权指令拦截、付款后中断与恢复、错误结果退回预算。
- 服务启停与报价管理：停用即时阻止未付款任务并释放预留；已受理报价固定，已付款恢复保留原收据。
- 结果和收据导出、SHA-256 完整性验证、任务记录、按已完成任务统计的服务履历。
- Solidity `AgentEscrow` 与 `AgentVault`：标准 ERC-20 托管、CRE forwarder + workflow metadata 双重限制、重复结算拒绝、超时退款、执行者限额与撤销。
- 使用真实 `@chainlink/cre-sdk` 的工作流源码、viem ERC-8004 身份注册 calldata 适配器、TypeScript 客户端 SDK。

## 状态边界

**网页是可运行的模拟环境。** Agent 是两个确定性 fixture 适配器，没有调用 LLM；余额是 testUSD 测试积分，没有真实资金；身份是本地档案。任务由服务端后台推进，关闭浏览器不影响当前执行。请求中止或服务重启后，持久检查点可通过恢复 API 或本地恢复 worker 继续。注册自定义 Agent 当前只绑定已有适配器，不会执行任意第三方代码。

Solidity 在本地 EVM 中测试；CRE 源码有独立 TypeScript 检查、纯校验器测试，并已通过 SDK 编译为 WASM。**尚未完成 CRE CLI 模拟、部署 DON、连接测试网钱包或广播公共测试网交易。网页账本与合约没有同步适配器。** 不应将界面收据展示为链上证明或 Chainlink 签名。x402、CCIP、Data Feeds、链上 Reputation Registry 是后续扩展。

## 运行

要求 Node.js 24+、npm。使用当前工作目录中的项目：

```sh
npm ci
npm run build
npm run db:local # 仅首次建库执行，已应用后不要重放
npm run dev -- --host 127.0.0.1 --port 5177
```

打开 http://127.0.0.1:5177 。首次分配 100 testUSD，不产生外部支出。若 5177 被占用，使用空闲端口。

```sh
npm test                  # 状态机、独立校验器、身份适配器与内存 EVM 合约测试
npm run typecheck         # 网站、SDK、CRE 各自类型检查
npm run contracts:compile # 生成 ABI 与 bytecode（忽略的 artifacts 目录）
npm run cre:build         # 需要 Bun >=1.2.21；生成 outputs/agentos-cre.wasm
npm run demo              # 完整闭环，独立沙盒，不需要打开浏览器
npm run demo:deadline     # 自动超时、预留释放、已付款跨期限恢复
npm run demo:chain        # 网页成果 → 本地校验器 → 真实本地 EVM 托管与退款
npm run test:api          # 并发、撤销、收据 API 回归
npm run worker            # 可选：本地常驻恢复 worker
```

Ganache 在 Node 26 上可能提示 µWS 原生模块不可用并回退到 JS；测试不依赖其 HTTP 服务。

CRE 构建使用已安装的 `@chainlink/cre-sdk` 编译器。安装 Bun 并加入 PATH，或通过 `AGENTOS_BUN_BIN` 指定其可执行文件；脚本也支持本地 `.sites-runtime/cre-tools/node_modules/.bin/bun`。首次编译由 SDK 下载并校验 Javy，需访问官方 GitHub 发行文件并写入用户缓存。构建产物不入库；编译成功不代表工作流模拟或 DON 执行成功。

## 本地 EVM 联调

`npm run demo:chain` 会在独立网页沙盒生成任务成果，再新建 Ganache 测试链，部署六位小数测试代币和 AgentEscrow。链适配器生成未签名的批准/托管交易，脚本仅使用该临时链的测试账户签名；随后验证任务承诺与成果，执行付款、拒绝退款、超时退款，并拒绝重复付款。交易回执、合约地址、区块哈希与核验结果保存到 `outputs/chain-demo-*.json`。

`sdk/chain.ts` 校验 chainId、代币、forwarder、workflow metadataHash、确认数、规范区块哈希、对应事件和历史区块中的任务状态。金额按代币 decimals 精确转换，不能表示的金额会拒绝。它不保管私钥，也不会自行发起真实网络交易。

这是实际执行交易的本地 EVM 联调，不是 DON 或公共测试网证据。当前演示脚本把网页成果接到独立 EVM 链路；网页钱包仍显示 testUSD 模拟账本，尚未实现真实钱包连接、链上资金视图和生产对账。证据 URL 仅用作本地承诺，脚本直接提供测试字节；CRE 的 HTTP/DON 执行仍须另行验证。

## 代码导航

| 路径 | 内容 |
| --- | --- |
| `lib/agentos/engine.ts` | 纯状态迁移、能力检查、账本与收据 |
| `lib/agentos/store.ts` | 用户隔离、D1 compare-and-swap 原子持久化 |
| `app/api/` | workspace、command、receipt API |
| `app/page.tsx` | 完整控制台及演示交互 |
| `contracts/` | 托管和预算钱包；不含真实部署地址 |
| `cre/workflow/` | 买方承诺证据校验、节点共识、EVM report |
| `sdk/` | 客户端及 ERC-8004 注册交易构建 |
| `sdk/chain.ts` | EVM 资金交易构建、合约身份与交易证据核验 |
| `docs/` | 架构、演示稿、Chainlink 接入步骤与验证记录 |

## 自动执行与恢复

创建和恢复任务会通过框架的后台请求上下文执行；页面和 SDK 只观察状态，不再发送自动 advance 命令。每次后台调用有有限重试和步骤上限，失败时保留数据库检查点。`POST /api/runtime` 是当前 owner 的恢复入口；本地 `npm run worker` 可定期调用它。托管环境的长期调度仍需独立队列或定时调用，一次请求的后台处理不提供无限期调度保证。

每个任务有 1–86400 秒执行期限，默认 300 秒；截止时间由服务端创建且重试不会延长。每次未付款状态迁移都会重新检查期限，超时标记为 Expired 并释放预留资金；已提交付款的任务可在期限后恢复，保持原收据。旧任务按创建时间加 300 秒处理。`npm run demo:deadline` 在独立本地沙盒验证自动超时、并发退款和付款后的恢复。

`npm run demo` 自动验证成功、越权、错误交付、中断恢复、权限撤销、取消及并发重放，结果记录在忽略的 `outputs/demo-*.json`。精确的预留后撤销检查由 `npm run test:api` 完成，不依赖网络轮询命中短暂阶段。测试工作区仅在 loopback 可用，不改动默认演示数据。

## SDK

```ts
import { AgentOSClient } from './sdk/index.ts';
const os = new AgentOSClient('http://127.0.0.1:5177');
const task = await os.createTask({agentId:'atlas',title:'Analyze treasury transfers',budget:1000});
const result = await os.run(task.id);
console.log(result.status, result.receipt);
```

`budget` 单位为整数分。私有托管站点依赖 Sites 身份网关和浏览器会话；SDK 示例面向本地回环 API，未实现远程 API key 发放。

## 比赛展示建议

主张：**让 Agent 的授权、交付与付款进入同一条可审计执行链。** 主展示 AI Agent 基础设施与 CRE 验证结算；具体奖项资格应按比赛最新规则及真实集成证据确认。[赛事页面](https://hackathon.xyz/events/public/c3b55fc8-f30a-4291-b7e3-ca32830b938d)。

先用 `docs/DEMO.md` 演示四条路径，再按 `docs/CHAINLINK.md` 补齐测试网部署证据。当前发布是 owner-private，仅本人可访问；给评委分享前需要明确调整访问范围。
