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
- 自动采购改购：审核多份供应商签名报价，预留全部尝试的累计额度；确认原订单退款后购买另一家服务，支持持久队列、取消、撤销及崩溃恢复。
- 使用真实 `@chainlink/cre-sdk` 的工作流源码与 TypeScript 客户端 SDK。

## 状态边界

**沙盒任务与链上订单是两条独立链路。** 沙盒使用 testUSD 积分；预注资订单通过真实 EVM 托管测试代币。两个版本化技能可分析内置或用户提交的转账记录，可选择内置适配器或受授权的独立 HTTP 供应商。预注资订单可选择真实 LLM 工具规划，服务端负责权限校验与独立复算；模型不签名、不计算最终金额。智能体档案可绑定真实 ERC-8004 注册表身份快照。任务由服务端后台推进，关闭浏览器不影响当前执行。请求中止或服务重启后，持久检查点可通过恢复 API 或本地恢复 worker 继续。自定义 Agent 绑定现有版本化技能，不执行任意第三方代码。

Solidity 在本地 EVM 中测试；CRE 工作流已通过 SDK 与官方 CLI 编译，并完成真实 HTTPS 读取、节点共识、报告生成和 EVM capability 的 CLI dry-run。**尚未部署 DON、验收真实浏览器钱包扩展或广播公共测试网交易。沙盒积分账本保持独立；预注资链上订单有单独的资金凭证与 D1 对账。** 不应将界面收据展示为链上证明或 Chainlink 签名。x402、CCIP、Data Feeds 是后续扩展；身份与信誉注册表已经本地 EVM 验证，公共测试网仍待配置。

## 运行

本轮交付以本地完整 demo 为准，暂不启用托管调度。启动顺序和演示路线见 [本地交付说明](docs/LOCAL-DEMO.md)。

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
npm run model:setup:planning # 独立的官方 3B 规划模型，约 2.1 GB，固定校验值
npm run model:planning    # 独立终端保持运行，127.0.0.1:11436；demo:start 可代为启动
npm run demo:model        # 真实本地 Qwen + HTTP/D1/EVM，3 场景
npm run demo:identity     # 官方 ERC-8004 + HTTP/D1/EVM，6 组身份与评价场景
npm run supplier:local    # 独立技能服务与签名交付日志，127.0.0.1:7461
npm run demo:supplier     # 13 组独立服务、恢复、权限与付款/退款场景
npm run demo:queue        # 丢失后台请求后，从 D1 队列独立恢复并单次付款
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

创建和恢复任务会通过框架的后台请求上下文执行，同时在同一个 D1 事务中写入持久化恢复队列。页面和 SDK 只观察状态，不再发送自动 advance 命令。消费者有租约、并发领取、退避和失败重试，原请求中断后也能继续；`POST /api/runtime` 保留 owner 手动恢复入口。`npm run worker` 独立调用队列消费者；`npm run demo:queue` 实测丢失后台请求后的恢复、并发单次付款、撤权/到期和真实模型链上订单。私有站点的服务访问、调度及数据库升级步骤见 [持久化运行队列](docs/RUNTIME-QUEUE.md)。调度为尽力执行，不能保证短期限订单及时完成。

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

先用 `docs/DEMO.md` 演示三分钟主线，再按 `docs/CHAINLINK.md` 补齐测试网部署证据。当前发布是 owner-private，仅本人可访问；给评委分享前需要明确调整访问范围。

## 本地演示与浏览器回归

首次安装按 [LOCAL-DEMO.md](docs/LOCAL-DEMO.md) 完成依赖、数据库和模型准备后，运行 `npm run demo:start`；`demo:doctor` 检查实际服务状态，`demo:prepare` 准备本地测试身份/代币。`demo:showcase -- --fresh` 执行新的成功付款与错误交付退款，`demo:evidence` 独立复核统一证据。

`npm run test:browser` 使用独立 Chromium 和隔离工作区，验证丢响应重试、钱包/草稿与语言持久化、订单深链接/证据隔离及故障健康状态。首次运行需安装浏览器：`PLAYWRIGHT_BROWSERS_PATH=.sites-runtime/playwright-browsers npx playwright install chromium`。CI 配置为 GitHub Actions 的 local-validation.yml；配置存在不代表远端已运行。测试追踪仅在失败时保存在忽略目录，不能提交包含用户数据的追踪文件。

完整成果验收：新订单以 v2 协议固定技能/版本/输入范围，CRE 与本地验证器独立复算完整输出，链上 outputHash 绑定完整成果信封。篡改资金分配明细或收款方数量，即使重新计算哈希，也会拒付。历史订单保留原承诺。详见 [FULL-DELIVERY](docs/FULL-DELIVERY.md) 与 [后续实施顺序](docs/ROADMAP-IMPLEMENTATION.md)。

真实业务数据：钱包页可选择「以太坊 USDC · 真实来源」，导入指定地址的已最终确认事件。保留原始金额、区块和交易证据，并在创建任务前重新复核。`npm run demo:data` 实跑真实主网读取 → HTTP/D1 资金流报告 → 独立临时链完整成果付款；费用网络与数据来源网络分别标明，见 [REAL-DATA](docs/REAL-DATA.md)。

Vault 连续采购：钱包页可存入测试代币、设置单笔/会话总额/链上每日额度并签名会话，随后选择该会话创建自动注资订单，后续采购无需逐单签名。撤销阻止新注资，已注资订单保留原结算条件，退款回到 Vault 且不补回已用额度。配置与边界见 [VAULT](docs/VAULT.md)。`npm run demo:isolated` 使用 5187/8555/7471/7472 和独立数据库、双供应商进程，不覆盖已有环境；运行 `npm run demo:vault` 验证采购与退款。最终完整演示使用启用身份的隔离实例及 `npm run demo:full -- --runtime .sites-runtime/isolated-demo/current.json`；Vault 专项的跳过身份模式不算完整演示。

可配置工作流：钱包页可组合 2–8 步已安装技能，引用前序已验收成果并根据结果决定是否采购；支持条件跳过、预算释放、嵌套成果复核、丢失响应与并发恢复。保留原两步 API。运行 `npm run demo:workflow-configurable`，协议与信任边界见 [WORKFLOWS](docs/WORKFLOWS.md)。公共网络仍按路线图单独验收。

供应商组合工作流：每步可选独立供应商，固定注册身份、签名配置和收款方；在批准的单步费用上限内，待前序已付款成果确定后获取并验证签名报价。超额或撤权阻止新采购，报价丢响应保留持久检查点。运行 `npm run demo:workflow-suppliers`，协议与边界见 [SUPPLIER-WORKFLOWS](docs/SUPPLIER-WORKFLOWS.md)。

目标驱动规划：模型从已授权服务目录生成 2–8 步计划，可引用前序成果并在明确启用后添加结果条件。规划只保存审核记录，批准摘要后才创建对应工作流和订单；价格或供应商身份变更会拒绝沿用旧计划。运行 `npm run demo:workflow-planning`，协议及模型配置见 [WORKFLOW-PLANNING](docs/WORKFLOW-PLANNING.md)。

新技能接入：智能体页可安装带版本的受限技能定义，注册服务并在权限页明确授权。示例“资金集中度分析”由独立供应商计算，完整规则及成果经 CRE 独立复算后付款或退款。运行 `npm run demo:skill`；协议、SDK、参考供应商及边界见 [SKILL-ONBOARDING](docs/SKILL-ONBOARDING.md)。定义不加载任意代码，也不会自动扩大已有 Vault 会话权限。

消费者运行：任务总览的运行状态面板可签发仅绑定当前工作区、可过期和撤销的消费者凭证。`npm run consumer` 提供独立重试进程及本地健康接口，`npm run demo:consumer` 验证断网、响应丢失、进程重启与撤销；配置和数据库升级见 [CONSUMER-OPERATIONS](docs/CONSUMER-OPERATIONS.md)。代码和本地验收不代表已部署托管消费者；未开启调度。

公共 CRE 接入准备：新增符合 ERC165/生产 metadata 布局的 AgentEscrowReceiver、一次性工作流绑定、独立 R2 证据发布、自动结算事件发现与可复用分发器。同一份配置可发现新增订单；最终确认后的证据归档有持久恢复检查点。`npm run test:cre` 执行实际处理器的 SDK 专项测试，`npm run demo:cre-dispatcher` 验证临时 HTTPS/R2 与本地 EVM 的官方 CLI dry-run。实际公网部署、登记后的 DON 执行与真实钱包验收仍待完成；见 [PUBLIC-CRE](docs/PUBLIC-CRE.md) 和 [CRE-DISPATCHER](docs/CRE-DISPATCHER.md)。


多供应商目录与独立收款：支持 1–8 家配置、按订单固定供应商、不同注册身份收款钱包，以及显式批准的多收款方 Vault 会话。运行 `npm run demo:multi-supplier`；配置、认证、SDK 和边界见 [MULTI-SUPPLIERS](docs/MULTI-SUPPLIERS.md)。当前按原供应商恢复；新供应商订单已有[签名报价](docs/SUPPLIER-QUOTES.md)，退款后自动改购仍待完善。完整本地演示现为 26 步，并记录仅限本地 MockToken 的测试资金预检。

供应商签名报价：钱包页先查看签名价、收款方和有效期，再提交采购；修改草稿需重新报价。SDK 支持独立报价与显式采用，创建新供应商订单也会自动验证报价。运行 `npm run demo:quotes` 验证持久化重放、篡改拒绝和付款有效期。

付款前真实报价比较：`npm run demo:quote-planning` 验证双供应商独立签名价格、真实 Qwen 建议、原报价采用、失效拒绝与 Vault 付款。协议及限制见 [PURCHASE-COMPARISON.md](docs/PURCHASE-COMPARISON.md)。退款确认后的自动改购现已提供，见下方说明。

自动改购：`npm run demo:purchase-routes` 验证审核多个签名报价后，确认原订单退款再购买另一家供应商服务；预留全部尝试的总额度，支持崩溃恢复、取消和撤销。SDK、界面与验证边界见 [PURCHASE-ROUTES.md](docs/PURCHASE-ROUTES.md)。
