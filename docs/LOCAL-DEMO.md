# 本地完整 Demo 交付

本轮按用户确认，以本地完整 demo 为交付范围，暂不启用托管调度。真实 DON、公共测试网、远程 HTTPS 模型/供应商和生产运维不在本次验收范围；不能把本地 EVM 或 CRE dry-run 当成这些能力的运行证据。

## 当前入口

- 当前保留的隔离网页：<http://127.0.0.1:6097/>，支持中英文；工作区保留任务、身份、评价及链上凭证。准确入口以 `.sites-runtime/isolated-demo/current.json` 为准，不要在已有健康实例旁重复启动默认端口实例。
- 当前本地 EVM：`127.0.0.1:9455`。此链是临时链，重启会重建部署；旧 D1 记录仍保留原部署信息，需要重新注册/绑定身份和新建订单。全新默认环境的端口仍为网页 5177、链 8545。
- Qwen：`127.0.0.1:11435`，真实 llama.cpp CPU 推理。
- 工作流规划模型：`127.0.0.1:11436`，独立的固定版本 Qwen 3B；默认 macOS GPU offload，可切换 CPU。
- 语义记忆嵌入模型：`127.0.0.1:11437`，固定版本 Qwen3-Embedding-0.6B，独立于规划模型。
- 当前两家独立技能供应商：`127.0.0.1:8371` / `8372`，签名交付与幂等日志。
- 当前通用插件运行服务与只读 MCP：`127.0.0.1:6098` / `6099`；新隔离实例的端口记录于 runtime JSON。
- 独立恢复消费者按需启动；本轮验收消费者均已退出并撤销令牌。后台队列不依赖浏览器轮询来授权或推进工作。

只保留当前一套网页、链、供应商、插件和 MCP 服务。完整验收结束后关闭三个模型及其启动器，模型文件保留；需推理时再按需启动，关闭时 health/doctor 如实显示模型未就绪。服务配置、模型、测试钱包/供应商私钥和测试输出均在忽略目录，不进入 Git。不要将本地测试密钥用于公共网络。

## 从新环境启动

安装 Node.js 24+ 后：

```sh
npm ci
npm run build
npm run db:local # 仅全新数据库；旧版本升级见 RUNTIME-QUEUE.md
npm run model:setup # 首次下载固定版本及校验模型
npm run model:setup:planning # 首次下载并校验独立规划模型，约 2.1 GB
npm run model:setup:memory # 首次下载并校验语义嵌入模型，约 639 MB
```

安装完成后，推荐使用一个前台启动器：

```sh
npm run demo:start
# 另一个终端
npm run demo:doctor
npm run demo:prepare
npm run demo:showcase -- --fresh
npm run demo:evidence
```

启动器复用健康服务，拒绝覆盖未知端口，退出仅停止自己启动的子进程；日志在 `.sites-runtime/demo/`。`demo:prepare` 只补不足的测试代币、注册/绑定 Atlas 并授权供应商，不重置历史或重新启用撤销策略。也可继续分别运行 chain:local、model:local、model:planning、model:memory、supplier:local、dev、worker。

旧数据库升级还需应用 `drizzle/0002_dazzling_lady_bullseye.sql`，新增消费者联系状态表；不要对已有数据库重复运行全量 db:local。

不要为重试一个失败请求而重启或重置整条链。SQLite/D1、模型与签名日志的持久化目录也应保留。

## 演示路线

智能体页提供通用插件执行层：安装通用 JSON/JavaScript 清单，审阅代码、独立校验器及固定只读 MCP 工具，明确授权次数和有效期后运行。免费作业没有付款权，`npm run demo:plugins` 验证实际隔离执行/MCP/撤权，见 [PLUGINS](PLUGINS.md)。下方“付费插件工作流”支持标签归一化→报告示例、任意已安装插件的一至八步 JSON 程序、前序付费成果及对象路径。另行审阅并签署精确 Vault 插件付款权限后才采购；丢响应刷新沿用原编号，显示签名成果、资金凭证、恢复/取消/撤销。`npm run demo:plugin-purchases` 验证真实本地付款和退款，见 [PLUGIN-PURCHASES](PLUGIN-PURCHASES.md)。旧库先在线备份，再按已应用版本分别追加 0005/0006，不重放全量建库。

任务记忆页可保存私有知识笔记并显式建立索引，再用中文或英文按语义检索。已付款成果可跳转钱包审阅并填入工作流输入，采用会清空已选会话，重新审阅并选择授权后才采购；不会重复购买原成果。`npm run demo:memory` 的真实模型、D1 和本地链验收见 [SEMANTIC-MEMORY](SEMANTIC-MEMORY.md)。旧数据库升级到 0003 后需备份并单独应用 0004，不要重放全量建库。

工作流可先保存为版本化模板，再导出/导入并显式绑定服务。套用只更新编辑器，保留当前输入并清空 Vault 会话选择；重新审阅并选择会话后启动。`npm run demo:workflow-templates` 实跑同一模板在两份输入上的独立采购，详见 [WORKFLOW-TEMPLATES](WORKFLOW-TEMPLATES.md)。

并行模式可在编辑器或模型规划器中明确选择 2–4 个在途采购上限，并选择两个以上的前序已付款成果汇合。`npm run demo:workflow-parallel` 验证双独立供应商实际重叠执行、汇合后的签名交付、取消退款、失败阻断及真实模型生成并行方案。当前环境以 runtime JSON 为准；旧环境目录和数据保留，不通过重启旧链替换其部署。详见 [PARALLEL-WORKFLOWS](PARALLEL-WORKFLOWS.md)。

未完成工作流可在规划来源中选择并生成替代方案。先处理完待定注资/退款，再审阅剩余步骤、已付款成果与含此前尝试的累计上限；批准前旧工作流不变。`npm run demo:workflow-replanning` 实跑错误供应商退款 → 真实模型一步/两步方案 → 批准丢响应恢复 → 复用已付款成果采购，详见 [WORKFLOW-REPLANNING](WORKFLOW-REPLANNING.md)。

1. 任务总览运行成功、越权、错误交付、中断恢复四场景。观察授权、预算预留、成果、独立验证、付款/退款与收据。关闭页面后由服务端和队列继续推进。
2. 钱包页连接本地测试钱包，创建预注资订单。先固定自定义输入，再注资和签署限定工作区的执行授权；确认注资前不会执行技能。沙盒积分与链上代币为独立账本。
3. 智能体页注册并绑定当前部署的 ERC-8004 身份，在链上授权供应商。选择 Qwen 工具规划和独立供应商执行，观察输入承诺、模型记录、供应商签名成果及单次链上结算。不要复用旧链的身份编号。
4. 对已付款且绑定身份的订单提交买方评价，读取链上反馈；任务记忆按成果、内容或交易哈希检索并导出上下文。
5. 在钱包表单中切换中英文，语言变化不会丢失草稿、连接和当前视图。字典热更新也已实测保留这些状态。

## 验证命令

服务和模型文件准备完成且 CRE 已登录后，使用 `npm run demo:full -- --runtime .sites-runtime/isolated-demo/current.json --manage-models` 串行执行完整 41 步，按场景启动和释放模型。日志及报告保存到 `outputs/full-demo-*/`，单元、类型、构建和浏览器回归另行执行；浏览器也支持同一 `--runtime`。失败立即停止。仅在源码、链部署和服务实例保持不变时，使用相同 `--runtime` 加 `--resume outputs/full-demo-<id>/report.json` 显式续跑，保留 failedAttempts；实现变化后必须从第一步重跑。

历史 37 步记录：`4ccad5b` 的 37 项最终步骤全部通过；完整 228 Node、21 Chromium、6 CRE SDK 回归及类型/构建也通过。第 35 步曾因默认 UDP DNS 失败，在同源码下经进程级网络参数续跑成功，原失败保留。报告及精确配置在 `outputs/full-demo-8001b0aa-da62-4655-bf28-b885ad6b3f44/`，详见 ROADMAP-IMPLEMENTATION.md 的最终验收。

本机 DNS 故障没有通过修改系统设置来处理。只读 HTTPS DNS 查询确认 Cloudflare 边缘记录后，本次验收使用既有 `TUNNEL_EDGE` 内部测试选项指定实时解析地址，先独立验证匿名 HTTPS 夹具和正常 TLS，再显式续跑；完整记录在 network-resumption.json。不要将其中的临时地址硬编码为默认值，也不要将此诊断选项当作生产网络方案。正常默认隧道路径是否恢复仍应单独核查；网络参数变化不等于应用实现变化，源码或链部署变化则必须重新从第一步验收。

```sh
npm test
npm run typecheck
npm run build
npm run test:api
PLAYWRIGHT_BROWSERS_PATH=.sites-runtime/playwright-browsers npx playwright install chromium
npm run test:browser
npm run demo
npm run demo:queue
npm run demo:prefund
npm run demo:reconcile
npm run demo:chain
npm run demo:model
npm run demo:identity
npm run demo:supplier
npm run demo:planning
npm run demo:showcase -- --fresh
npm run demo:evidence
npm run demo:cre # CRE 已登录；官方 CLI dry-run，不广播
```

HTTP demo 使用独立测试工作区。链上集成 demo 使用本地测试代币；反复运行会消耗本地买方余额。供应商故障演示会短暂切换本地供应商的测试模式，结束后恢复健康，因此应依次运行涉及该供应商的 demo。

`docs/VALIDATION.md` 记录测试数量、实际场景、证据文件及尚未验收的边界。每个完整功能均有独立代码提交。已有私有站点 v11 保留队列验证成果；本轮最终 API 修复按本地交付范围保存在代码中，未继续发布新站点版本，也未创建托管调度。

资源使用：完成一项验收后停止已不用的本项目隔离实例与模型启动器，保留 D1、交易历史、供应商日志和模型文件。仅在模型场景或完整回归前按需启动 model:local、model:planning、model:memory；已停止模型时 doctor 会如实显示未就绪。不要用 killall node 或 killall llama-server 清理其他项目。

安全清理命令（macOS，需 ps/lsof 权限）：

- npm run demo:cleanup：只预览本仓库旧隔离实例；保留 current.json 对应实例和模型。
- npm run demo:cleanup -- --apply：停止上述旧实例，不删除数据。
- npm run demo:cleanup -- --apply --models：同时停止本项目模型启动器和子进程；仅在模型相关验证结束后执行。
- npm run demo:cleanup -- --apply --all --models：结束整项工作后停止当前实例和已识别辅助服务。下次需要重新启动本地 demo。

清理器通过工作目录、限定启动命令、父子关系及进程启动时间/命令摘要核验归属，逐次重查 PID 后只发送 SIGTERM。运行浏览器、Node 测试或完整演示时拒绝清理；不会停止任意 Node、编辑器或其他仓库进程。模型权重、D1、交易证据与日志均保留，报告保存到 outputs/process-cleanup-*.json。

## 按场景管理模型

完整验收可使用 `npm run demo:full -- --runtime .sites-runtime/isolated-demo/current.json --manage-models`；浏览器使用 `npm run test:browser -- --runtime .sites-runtime/isolated-demo/current.json --manage-models`。原有启动方式保持兼容。

管理器仅启动当前关卡需要的模型并在不再需要时停止；首尾 doctor 仍同时核验三个真实模型，验收关卡没有删减。规划、并行规划和修复使用规划模型，语义记忆使用 embedding，其余模型场景使用基础模型。浏览器每例结束释放本次启动的模型。日志和 PID 启停记录保留在 outputs。

只停止当前管理器实际启动的子进程；匹配的预先运行服务可复用但不停止，未核实的占用端口拒绝替换。启动失败、退出和中断均清理拥有的句柄，中断后不能继续启动模型。续跑必须保留最初的管理模式。运行期间不另行执行 demo:cleanup；验收结束后再核查遗留进程，保留当前应用、链、供应商、插件和 MCP 以及全部历史。

当前 41 步验收：实现提交 709bcd3，最终全部通过，报告与摘要清单在 outputs/full-demo-68ac37bf-7900-4cd9-a6f5-2daf67354a3b/。保留临时 HTTPS 超时、账户 API EOF 及两次同源码续跑。过程使用已核验的进程级 TUNNEL_EDGE，未修改系统 DNS/代理/TLS，不保证默认网络路径可达。

验收后六项本地服务正常，三个模型已停止。网页需要 AI 规划时，在项目目录单独运行 `npm run model:planning`；完整命令的 --manage-models 自行管理模型。公共链、实际 DON 与托管部署/调度继续暂缓。
