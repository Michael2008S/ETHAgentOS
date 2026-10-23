# 可恢复本地基线

当前入口为 `.sites-runtime/local-baseline/current.json`，与旧 `.sites-runtime/isolated-demo/current.json` 分开。旧实例已离线，旧指针不改、不将旧订单绑定到新链。初始化生成私有磁盘归档，包含旧 D1、插件日志和哈希清单，并明确 `restartable:false`；旧内存链不是可恢复磁盘备份。

```sh
npm run baseline -- status
npm run baseline -- start
npm run baseline -- stop
npm run baseline -- backup
AGENTOS_BASELINE_BACKUP=/absolute/backup npm run baseline -- restore
# 停止后备份到新目录，再为新副本固定当前已提交源码；旧副本保留。
npm run baseline -- upgrade
```

新基线固定源码与持久化 EVM。start/stop 记录前后端口状态、部署和区块锚点到 `.sites-runtime/local-baseline/events.jsonl`；恢复后核验部署及停止前锚点。restore 显式选择恢复副本为新基线，使用原端口；不得与旧副本同时启动。升级复制数据库与链，不覆写旧源码快照。私有目录只作为本机运行资产，不提交 Git。

P0 实测：`outputs/baseline-vault.log` 中两笔付款、一笔拒绝交付退款通过；之后停止、备份、恢复到新目录、启动锚点核验、停止全部通过。凭证为 `outputs/baseline-{init,stop,backup,restore,restored-start,restored-stop}.json`。本轮结束时基线可保持停止以释放资源，通过 start 恢复，无需重新部署或重建钱包。

## 统一验收

```sh
# 提交代码，停止并 upgrade 基线，start 后运行：
npm run validate:local -- core
npm run validate:local -- browser
npm run validate:local -- demo
# 或顺序执行以上全部检查：
npm run validate:local -- all
```

core 包含严格 lint、全部 Node 测试、CRE SDK 测试、网站/CRE 类型检查、生产构建；browser 包含常规 Chromium 测试集；demo 包含全部历史验收型 demo。浏览器和 demo 均显式绑定所选基线，按需管理模型。报告固定 commit、源码摘要、运行路径及日志哈希；要求干净工作区；产品代码变化必须先 upgrade。仅 README.md 或 docs/ 下 Markdown 变更可继续使用已校验快照，报告分别记录 runtimeCommit、checkoutCommit、documentationOnly 及变更文件，不将文档提交冒充运行代码提交，阶段之间若代码变动则停止，不将不同版本结果混为一次验收。

公网部署、真实资产、真实 CCIP/Feed 和 DON 结算均继续后置。各阶段记录是特定提交的验收，不应将旧测试数量或旧服务状态当作当前状态。
