# AgentOS · ETH Shenzhen 2026

**Give agents a goal, a budget, and boundaries. Verify delivery before settlement.**

为本次黑客松制作的 Agent 操作系统 MVP。用统一的任务生命周期，连接身份、技能、权限、预算、交付校验、托管支付和可恢复执行。界面支持中文与英文，右上角切换并在当前浏览器记住选择，默认中文；文档为中文。切换语言不会更改任务数据、技能标识或导出凭证。

## 已实现

- Mission Control：任务、Agent、服务市场、钱包与托管、权限、任务记忆、集成状态、开发者工具。
- D1 持久化执行内核：授权 → 预留预算 → 执行 → 校验 → 结算 → 完成。
- 当前权限逐步检查、技能 capability allowlist、按任务及 UTC 日预算、并发预留、请求幂等、原子结算。
- 四条可操作演示：成功交付、越权指令拦截、付款后中断与恢复、错误结果退回预算。
- 服务启停与报价管理：停用即时阻止未付款任务并释放预留；已受理报价固定，已付款恢复保留原收据。
- 任务记忆：按智能体、状态、输入/成果/事件/哈希检索，20 条分页；单任务或全部匹配上下文导出。
- 结果和收据导出、SHA-256 完整性验证、任务记录、按已完成任务统计的服务履历。
- Solidity `AgentEscrow` 与 `AgentVault`：标准 ERC-20 托管、CRE forwarder + workflow metadata 双重限制、重复结算拒绝、超时退款、执行者限额与撤销。
- 自定义任务输入：1–100 条转账记录、区块范围筛选、受理时固定输入与 SHA-256 哈希、按原输入校验结果。
- 链上钱包界面：EIP-1193 浏览器钱包入口、独立本地测试钱包、链上余额、精确授权与托管、回执核验及超时退款。
- 可选 LLM 工具规划器：真实本地 Qwen 推理，模型计划经过 capability gate，失败退款；可导出模型描述、操作、哈希与 token 用量。
- ERC-8004 身份与信誉：官方合约本地部署、注册文档与钱包绑定、持有者签名、开单时固定身份、只计已付款订单的评价与撤销。
- 独立技能供应商：链上授权交付签名地址、预注资后 HTTP 执行、独立复算、签名成果日志与重启恢复。
- 使用真实 `@chainlink/cre-sdk` 的工作流源码与 TypeScript 客户端 SDK。

## 状态边界

**沙盒任务与链上订单是两条独立链路。** 沙盒使用 testUSD 积分；预注资订单通过真实 EVM 托管测试代币。两个版本化技能可分析内置或用户提交的转账记录，可选择内置适配器或受授权的独立 HTTP 供应商。预注资订单可选择真实 LLM 工具规划，服务端负责权限校验与独立复算；模型不签名、不计算最终金额。智能体档案可绑定真实 ERC-8004 注册表身份快照。任务由服务端后台推进，关闭浏览器不影响当前执行。请求中止或服务重启后，持久检查点可通过恢复 API 或本地恢复 worker 继续。自定义 Agent 绑定现有版本化技能，不执行任意第三方代码。

Solidity 在本地 EVM 中测试；CRE 工作流已通过 SDK 与官方 CLI 编译，并完成真实 HTTPS 读取、节点共识、报告生成和 EVM capability 的 CLI dry-run。**尚未部署 DON、验收真实浏览器钱包扩展或广播公共测试网交易。沙盒积分账本保持独立；预注资链上订单有单独的资金凭证与 D1 对账。** 不应将界面收据展示为链上证明或 Chainlink 签名。x402、CCIP、Data Feeds 是后续扩展；身份与信誉注册表已经本地 EVM 验证，公共测试网仍待配置。

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
npm run cre:prepare       # 生成本地 CRE 配置，保留已有配置
npm run cre:cli-build     # 通过官方 CLI 构建 outputs/agentos-cli.wasm
npm run cre:simulate      # 需实际配置、账户认证；默认不广播
npm run demo:cre          # 先编译，再运行 3 场景的本地 RPC + HTTPS dry-run
npm run demo              # 完整闭环，独立沙盒，不需要打开浏览器
npm run demo:deadline     # 自动超时、预留释放、已付款跨期限恢复
npm run demo:chain        # 网页成果 → 本地校验器 → 真实本地 EVM 托管与退款
npm run model:setup       # 官方 llama.cpp / Qwen 固定版本、SHA-256 校验，macOS arm64
npm run model:local       # 独立终端保持运行，127.0.0.1:11435
npm run demo:model        # 真实本地 Qwen + HTTP/D1/EVM，3 场景
npm run demo:identity     # 官方 ERC-8004 + HTTP/D1/EVM，6 组身份与评价场景
npm run supplier:local    # 独立技能服务与签名交付日志，127.0.0.1:7461
npm run demo:supplier     # 13 组独立服务、恢复、权限与付款/退款场景
npm run test:api          # 并发、撤销、收据 API 回归
npm run worker            # 可选：本地常驻恢复 worker
```

Ganache 在 Node 26 上可能提示 µWS 原生模块不可用并回退到 JS；测试不依赖其 HTTP 服务。

CRE 构建使用已安装的 `@chainlink/cre-sdk` 编译器。安装 Bun 并加入 PATH，或通过 `AGENTOS_BUN_BIN` 指定其可执行文件；脚本也支持本地 `.sites-runtime/cre-tools/node_modules/.bin/bun`。首次编译由 SDK 下载并校验 Javy，需访问官方 GitHub 发行文件并写入用户缓存。构建产物不入库；编译成功不代表工作流模拟或 DON 执行成功。

## CRE CLI 模拟

先安装官方 CRE CLI 并执行 `cre login`；脚本支持 PATH 中的 `cre`、本地 `.sites-runtime/cre-bin/cre` 或 `AGENTOS_CRE_BIN`。运行 `npm run cre:prepare` 后，可使用 `npm run demo:cre` 验证正确交付、错误交付和承诺不匹配三个场景。

该演示启动临时 Ganache、部署真实托管合约并注资，将 Sepolia selector 映射到本地 RPC，仅用于模拟。工作流从公共 HTTPS 读取脚本内的合成测试数据，在 CRE runtime 内检查链上承诺、运行共识、生成报告并调用 EVM write capability。正确/错误交付分别得到接受/拒绝；配置篡改在报告前失败。不会使用 `--broadcast`，完成后链上任务仍为 Funded，不能将 dry-run 日志称为已上链付款或 DON attestation。

临时链私钥只传给子进程环境，不写文件；HTTPS URL 只嵌入公开合成数据，不应替换成私人记录或密钥。结果与已脱敏 CLI 日志保存在忽略的 `outputs/cre-demo-*.json`。公共网络部署需要另行配置真实 forwarder、workflow metadata、RPC 与凭证。

## 本地 EVM 联调

`npm run demo:chain` 会在独立网页沙盒用自定义转账数据生成任务成果，再新建 Ganache 测试链，部署六位小数测试代币和 AgentEscrow。链适配器生成未签名的批准/托管交易，脚本仅使用该临时链的测试账户签名；随后验证任务承诺与成果，执行付款、拒绝退款、超时退款，并拒绝重复付款。交易回执、合约地址、区块哈希与核验结果保存到 `outputs/chain-demo-*.json`。

`sdk/chain.ts` 校验 chainId、代币、forwarder、workflow metadataHash、确认数、规范区块哈希、对应事件和历史区块中的任务状态。金额按代币 decimals 精确转换，不能表示的金额会拒绝。它不保管私钥，也不会自行发起真实网络交易。

这是实际执行交易的本地 EVM 联调，不是 DON 或公共测试网证据。演示脚本与网页钱包均能把已有成果接到独立 EVM 链路；链上视图和 testUSD 模拟账本分开，预注资路径由 `demo:prefund` 单独验证，公共网络与持续重组监控仍待验收。`demo:chain` 直接提供测试字节；真实 HTTPS 与 CRE CLI dry-run 由 `demo:cre` 单独验证，DON 执行仍须另行验收。

## 网页链上钱包

在「钱包与托管」中可连接本地测试钱包，或填写 Sepolia 的公开合约配置后连接 EIP-1193 浏览器钱包。只接收合约地址、收款方、chainId、metadataHash 等公开信息，不读取或存储私钥。每次签名前检查所选账户和网络，使用代币精度构建精确授权，并验证矿工回执、事件与任务承诺。

```sh
npm run chain:local # 127.0.0.1:8545，临时 Ganache、测试代币与托管合约
npm run demo:wallet # 独立临时链，网页 API → HTTP 钱包 → 付款/拒绝/超时退款
```

本地链启动后，网页点击「连接本地测试钱包」，选择一个已完成任务，点击「批准代币并注资托管」，再展开「本地验证演示」运行结算、篡改交付或推进测试时间。连接本地链只在回环页面可用；服务限制 Host/Origin，RPC 只允许测试买方向本次测试部署发交易。停止服务会丢弃临时链，工作区 D1 数据仍保留。

沙盒 testUSD 账本与链上代币账本独立。这一界面为已有交付另开真实 EVM 托管，链上资金视图来自合约；新增的预注资订单在确认链上注资后才由服务端执行。浏览器钱包路径已实现，真实扩展签名与公共 Sepolia 部署仍待验收。本地校验器是测试 EOA，不是 CRE DON。

钱包页可点击「签名并保存凭证到工作区」。服务端会验证五分钟挑战的买方签名，从指定 RPC 复核合约、历史区块、金额、事件和成果承诺，再以 D1 CAS 保存唯一记录。刷新后可查看和导出历史，也可在任务记忆中按交易哈希检索。`npm run demo:reconcile` 实跑付款、拒绝退款、超时退款，以及签名、并发重放与工作区隔离。生产环境需设置服务端 `AGENTOS_CHAIN_CONFIGURATION`，未配置返回 503；不接受调用方指定 RPC 或伪造 evidence。详见 [凭证对账](docs/RECONCILIATION.md)。这些是核验快照，持续链重组监控和公共信誉仍待完成。

公共网络的证据 URL 需发布与下载文件完全一致的 JSON 字节。网页提供证据与成果导出，`datasetHash` 按实际文件字节计算，不能增加缩进或换行后沿用旧哈希。

## 预注资智能体执行

在钱包页打开「预注资智能体执行」，先固定输入与报价，再注资并签名授权。服务端验证真实注资回执后才运行适配器，校验交付后生成不可变结算请求，核验链上付款或退款结果并保存 D1。沙盒积分不变。最终结算检查点是授权边界；已提交请求在网络故障后继续对账。

启动网页和 `npm run chain:local`，运行 `npm run demo:prefund` 验证五个场景。本地模式用临时 EOA 校验器自动完成真实 EVM 交易；公共测试网需实际 CRE 结算与成果发布配置，尚未验收。详见 [预注资设计](docs/PREFUNDED.md)。

## 代码导航

| 路径 | 内容 |
| --- | --- |
| `lib/agentos/engine.ts` | 纯状态迁移、能力检查、账本与收据 |
| `lib/agentos/store.ts` | 用户隔离、D1 compare-and-swap 原子持久化 |
| `app/api/` | workspace、command、receipt API |
| `app/page.tsx` | 完整控制台及演示交互 |
| `contracts/` | 托管和预算钱包；不含真实部署地址 |
| `cre/workflow/` | 买方承诺证据校验、节点共识、EVM report |
| `sdk/` | 客户端、ERC-8004 注册/签名绑定/反馈及撤销 |
| `sdk/chain.ts` | EVM 资金交易构建、合约身份与交易证据核验 |
| `docs/` | 架构、演示稿、Chainlink 接入步骤与验证记录 |

## 使用自己的转账数据

派发任务时选择「自定义转账记录」，输入区块范围和 JSON 数组。每条记录为 `{ "block": 5, "from": "treasury.eth", "to": "builder.eth", "cents": 1200 }`；金额是非负整数分，最多 100 条且总额必须是安全整数。不会自动访问其中的地址或名称。

SDK 的 `createTask` 支持 `input: { dataset: 'custom-transfers-v1', blockFrom: 0, blockTo: 100, records: [...] }`。事件分析返回总额、条数与收款方数量；资金库报告额外按收款方汇总。结果仅计算指定区块范围；输入在受理时固定，重用请求 ID 修改输入返回 409。收据的 `inputHash` 绑定整个输入，导出的上下文包含原记录。原始转账记录由当前工作区存储与分析；预注资订单选择独立供应商后，这些记录在确认托管后发送给该供应商。可选模型规划只接收任务标题、技能、区块范围和数据集标识。提供商配置和边界见 [docs/MODEL.md](docs/MODEL.md) 与 [docs/SUPPLIERS.md](docs/SUPPLIERS.md)。

## 自动执行与恢复

创建和恢复任务会通过框架的后台请求上下文执行；页面和 SDK 只观察状态，不再发送自动 advance 命令。每次后台调用有有限重试和步骤上限，失败时保留数据库检查点。`POST /api/runtime` 是当前 owner 的恢复入口；本地 `npm run worker` 可定期调用它。托管环境的长期调度仍需独立队列或定时调用，一次请求的后台处理不提供无限期调度保证。

每个任务有 1–86400 秒执行期限，默认 300 秒；截止时间由服务端创建且重试不会延长。每次未付款状态迁移都会重新检查期限，超时标记为 Expired 并释放预留资金；已提交付款的任务可在期限后恢复，保持原收据。旧任务按创建时间加 300 秒处理。`npm run demo:deadline` 在独立本地沙盒验证自动超时、并发退款和付款后的恢复。

`npm run demo` 自动验证成功、越权、错误交付、中断恢复、权限撤销、取消及并发重放，结果记录在忽略的 `outputs/demo-*.json`。精确的预留后撤销检查由 `npm run test:api` 完成，不依赖网络轮询命中短暂阶段。测试工作区仅在 loopback 可用，不改动默认演示数据。

## 任务记忆检索

`GET /api/memory` 支持 `q`、`agentId`、`status`、`artifactsOnly`、`offset`、`limit`（1–50，默认 20）。搜索范围包含任务名、原输入、成果、执行事件和哈希；结果按创建时间倒序分页。`format=export` 导出全部匹配上下文，保留原输入、输出、事件和付款凭证，不受当前分页限制。只读取当前认证工作区，不会触发任务执行。

SDK：`await os.memory({agentId:'sage',status:'completed',q:'research.eth'})`。这是持久任务记忆检索；尚未接入向量库或模型长期记忆。

## 独立技能供应商

先在智能体页授权供应商签名地址与配置，再在预注资订单选择独立执行。原始输入在确认注资后发送到该服务；返回的签名成果经独立复算后结算。服务离线保留检查点，已提交成果可从供应商日志恢复。详见 [docs/SUPPLIERS.md](docs/SUPPLIERS.md)。

## 身份与信誉

智能体页可连接供应商钱包，注册并签名绑定 ERC-8004 身份。新预注资订单固定此身份；付款后由买方发布 0–100 分评价，原评价者可撤销。评分按本工作区不同已付款订单统计，不将全网任意反馈当作可信评分。详见 [docs/IDENTITY.md](docs/IDENTITY.md)。

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
