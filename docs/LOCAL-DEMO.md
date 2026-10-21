# 本地完整 Demo 交付

本轮按用户确认，以本地完整 demo 为交付范围，暂不启用托管调度。真实 DON、公共测试网、远程 HTTPS 模型/供应商和生产运维不在本次验收范围；不能把本地 EVM 或 CRE dry-run 当成这些能力的运行证据。

## 当前入口

- 网页：<http://127.0.0.1:5177/>，支持中英文；默认工作区保留已完成任务、身份、评价及链上凭证。
- 本地 EVM：`127.0.0.1:8545`。此链是临时链，重启会重建部署；旧 D1 记录仍保留原部署信息，需要重新注册/绑定身份和新建订单。
- Qwen：`127.0.0.1:11435`，真实 llama.cpp CPU 推理。
- 工作流规划模型：`127.0.0.1:11436`，独立的固定版本 Qwen 3B；默认 macOS GPU offload，可切换 CPU。
- 语义记忆嵌入模型：`127.0.0.1:11437`，固定版本 Qwen3-Embedding-0.6B，独立于规划模型。
- 独立技能供应商：`127.0.0.1:7461`，签名交付与幂等日志。
- 通用插件运行服务与只读 MCP：默认 `127.0.0.1:11438` / `11439`；新隔离实例使用独立端口并记录于当前 runtime JSON。
- 本地恢复 worker：独立于浏览器轮询 D1 持久化队列。

这些服务当前保持运行。服务配置、模型、测试钱包/供应商私钥和测试输出均在忽略目录，不进入 Git。不要将本地测试密钥用于公共网络。

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

智能体页提供通用插件执行层：安装通用 JSON/JavaScript 清单，审阅代码、独立校验器及固定只读 MCP 工具，明确授权次数和有效期后运行。文本转换与真实 Vault 读取为两个示例；新功能不发起付款，原 DAG/链上采购集成仍待继续。`npm run demo:plugins` 验证真实 HTTP/D1/隔离运行/MCP 与撤权，见 [PLUGINS](PLUGINS.md)。旧数据库需先在线备份，再只应用新增的 0005 插件表迁移。

任务记忆页可保存私有知识笔记并显式建立索引，再用中文或英文按语义检索。已付款成果可跳转钱包审阅并填入工作流输入，采用会清空已选会话，重新审阅并选择授权后才采购；不会重复购买原成果。`npm run demo:memory` 的真实模型、D1 和本地链验收见 [SEMANTIC-MEMORY](SEMANTIC-MEMORY.md)。旧数据库升级到 0003 后需备份并单独应用 0004，不要重放全量建库。

工作流可先保存为版本化模板，再导出/导入并显式绑定服务。套用只更新编辑器，保留当前输入并清空 Vault 会话选择；重新审阅并选择会话后启动。`npm run demo:workflow-templates` 实跑同一模板在两份输入上的独立采购，详见 [WORKFLOW-TEMPLATES](WORKFLOW-TEMPLATES.md)。

并行模式可在编辑器或模型规划器中明确选择 2–4 个在途采购上限，并选择两个以上的前序已付款成果汇合。`npm run demo:workflow-parallel` 验证双独立供应商实际重叠执行、汇合后的签名交付、取消退款、失败阻断及真实模型生成并行方案。新验证协议的完整本地环境独立运行于 5887/9255/8171/8172，准确入口以 `.sites-runtime/isolated-demo/current.json` 为准；旧环境和数据保留，不通过重启旧链替换其部署。详见 [PARALLEL-WORKFLOWS](PARALLEL-WORKFLOWS.md)。

未完成工作流可在规划来源中选择并生成替代方案。先处理完待定注资/退款，再审阅剩余步骤、已付款成果与含此前尝试的累计上限；批准前旧工作流不变。`npm run demo:workflow-replanning` 实跑错误供应商退款 → 真实模型一步/两步方案 → 批准丢响应恢复 → 复用已付款成果采购，详见 [WORKFLOW-REPLANNING](WORKFLOW-REPLANNING.md)。

1. 任务总览运行成功、越权、错误交付、中断恢复四场景。观察授权、预算预留、成果、独立验证、付款/退款与收据。关闭页面后由服务端和队列继续推进。
2. 钱包页连接本地测试钱包，创建预注资订单。先固定自定义输入，再注资和签署限定工作区的执行授权；确认注资前不会执行技能。沙盒积分与链上代币为独立账本。
3. 智能体页注册并绑定 ERC-8004 身份，在链上授权供应商。默认工作区 Atlas #2 已准备好。选择 Qwen 工具规划和独立供应商执行，观察输入承诺、模型记录、供应商签名成果及单次链上结算。
4. 对已付款且绑定身份的订单提交买方评价，读取链上反馈；任务记忆按成果、内容或交易哈希检索并导出上下文。
5. 在钱包表单中切换中英文，语言变化不会丢失草稿、连接和当前视图。字典热更新也已实测保留这些状态。

## 验证命令

服务准备完成且 CRE 已登录后，`npm run demo:full` 串行执行下列集成 demo（含新 showcase），日志及报告保存到 `outputs/full-demo-*/`；单元、类型、构建和浏览器回归仍单独执行。失败会立即停止；检查原因后用 `npm run demo:full -- --resume outputs/full-demo-<id>/report.json` 从失败项继续，保留原失败记录，不重置服务或重复已通过项。

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
