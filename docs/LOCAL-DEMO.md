# 本地完整 Demo 交付

本轮按用户确认，以本地完整 demo 为交付范围，暂不启用托管调度。真实 DON、公共测试网、远程 HTTPS 模型/供应商和生产运维不在本次验收范围；不能把本地 EVM 或 CRE dry-run 当成这些能力的运行证据。

## 当前入口

- 网页：<http://127.0.0.1:5177/>，支持中英文；默认工作区保留已完成任务、身份、评价及链上凭证。
- 本地 EVM：`127.0.0.1:8545`。此链是临时链，重启会重建部署；旧 D1 记录仍保留原部署信息，需要重新注册/绑定身份和新建订单。
- Qwen：`127.0.0.1:11435`，真实 llama.cpp CPU 推理。
- 独立技能供应商：`127.0.0.1:7461`，签名交付与幂等日志。
- 本地恢复 worker：独立于浏览器轮询 D1 持久化队列。

这些服务当前保持运行。服务配置、模型、测试钱包/供应商私钥和测试输出均在忽略目录，不进入 Git。不要将本地测试密钥用于公共网络。

## 从新环境启动

安装 Node.js 24+ 后：

```sh
npm ci
npm run build
npm run db:local # 仅全新数据库；旧版本升级见 RUNTIME-QUEUE.md
npm run model:setup # 首次下载固定版本及校验模型
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

启动器复用健康服务，拒绝覆盖未知端口，退出仅停止自己启动的子进程；日志在 `.sites-runtime/demo/`。`demo:prepare` 只补不足的测试代币、注册/绑定 Atlas 并授权供应商，不重置历史或重新启用撤销策略。也可继续分别运行 chain:local、model:local、supplier:local、dev、worker。

旧数据库升级还需应用 `drizzle/0002_dazzling_lady_bullseye.sql`，新增消费者联系状态表；不要对已有数据库重复运行全量 db:local。

不要为重试一个失败请求而重启或重置整条链。SQLite/D1、模型与签名日志的持久化目录也应保留。

## 演示路线

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
