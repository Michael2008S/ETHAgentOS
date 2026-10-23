# P0 本地恢复与验收基线 · 2026-10-23

本轮范围：保留原 6097/6098 业务实例与 9455 内存链，补齐备份，核实组件修复，统一版本与验收证据。不新增公网部署、DON 部署或公共资金交易。其他轮次已经发生的公共网络操作保留在独立 Sepolia 记录中。

## 原实例和备份

- 原运行目录：`.sites-runtime/isolated-demo/691195a9-415d-46ee-b210-0bf613603444`，current 指针不切换。
- 原内存链 PID **46733**、RPC **9455**，合同配置保持不变。不能停止链、调用全环境重启或把普通文件备份称为可恢复的 EVM 快照。
- 首份只读历史归档：`.sites-runtime/p0-backup-20261023`，3 个 SQLite 数据库、3,741 个区块、3,014 个交易回执。
- 验收前封存备份：`.sites-runtime/p0-sealed-backup-20261023`，3 个数据库、2,128 个文件，包括供应商状态、插件 journal 与签名身份、原插件源码和恢复后的网页源码。目录/文件权限为 0700/0600；私有文件不提交 Git。完整 SHA-256 清单和 SQLite integrity_check 已验证；可重复校验不改变归档。
- 验收后备份：`.sites-runtime/p0-final-backup-20261023`，同样为 3 个数据库、2,128 个文件，覆盖本轮新增测试审核、记忆与工作区。链仍为归档区块 3740、3,014 个回执；配置不变。报告 `backup-final.json`。
- 中间归档 `.sites-runtime/p0-complete-backup-20261023` 保留用于问题追踪；只使用最终 sealed 备份作为验收依据。修复了归档副本 WAL 模式导致只读校验产生 sidecar 的问题；没有调整在线原数据库的 journal 模式。
- 首次比对保留 **413 个原工作区、182 份插件回执**，包括原工作区 revision/data 和签名私钥字节完全一致。证据：`outputs/p0-acceptance-20261023/backup-sealed.json`、`preserved-before.json`。

备份可以恢复数据库和私有运行文件，**不能重建这条内存 EVM 的钱包与状态**。必须继续保留原链进程。

## 修复和版本兼容基线

6097 与 6098 的组件修复已分别由 `48703b0`、`853e4e6` 提交，并在 `a0d9d22` 验证原实例完整业务闭环。本轮复核六个服务端点均 HTTP 200，保留已修复进程，无需再次重启。故障原因、交接机制和原实例业务验收见 [组件恢复记录](ORIGINAL_6097_RECOVERY_2026-10-23.md)。

版本统一采用可核验的兼容基线，不强行改变已付款业务绑定的插件执行承诺：

| 对象 | 固定基线 | 验证方式 |
| --- | --- | --- |
| 原 6097 网页 | `f7374efcf7483a4f529e2138741f8fe8c33a6228`；摘要 `a9609bd4291c341e3a5c560401de7d16ba8aa5cdd060bdc13edfeee03a4f5de4` | 348 个应用、SDK、校验器、构建配置和依赖文件与当前 checkout 字节一致；源码快照清单完整校验 |
| 原 6098 插件 | 原快照 `d5a7ac7eb411995775a76e7e007c865f44f3ab45`；摘要 `facb046be706810b62731bf993db2e3220248acbc8312627aa150f53a106e50d` | health revision 与原源码计算一致，原 signer 和历史 journal 字节一致 |
| 插件 revision | `agentos.quickjs-mcp.v1:9b9c48b4097529e22de78616170aa72849eb4d7441089f5bcde8c44e3c27baf5` | 不轮换旧业务绑定的 revision、configHash 或 signer |
| 独立完整验收实例 | 提交 `0bdd27e` 的不可变快照；应用实现与原 6097 一致，插件使用该快照创建新测试身份 | `.sites-runtime/isolated-demo/ea8ef8e6-6a72-4943-9092-376050392277/source.json` |
| 完整浏览器重启实例 | 提交 `6a3d771`；摘要 `77d2a95f2719f3233586d63aa7d0f2eda3b772225a6178a07ed5548af969b29a`，相同应用实现 | `.sites-runtime/isolated-demo/e4529fef-1b1f-47f6-b9c8-d2065ca02eaf/source.json` |
| 后续变更 | `d3a4453` 只修恢复脚本 lint；最终文档提交只更新说明 | 不替换运行中的应用源码或插件身份 |

完整 CLI 验收工具随后由 `3d2f8cd` 修复数据源绑定：网页和 CLI 读取同一个选定的回放/实时代理，并将模式写入报告。`c3ab884` 收紧归档数据库权限。这些变更没有改变运行中的应用、合约或插件执行版本。

浏览器基线修复：`6a3d771` 更新 10 处逐会话撤销按钮选择器；`2bbf63e` 通过钱包界面显式准备共享额度，消除前序用例遗留小额度的顺序依赖；`05ba680` 保留只读历史回归的中英文与移动端检查。没有放宽业务自动授权规则。

固定源码禁用共享 checkout 的热重载；插件完整性保护保持开启。新测试身份仅用于独立实例，不能声称它继承旧插件收据。原插件的未来升级需要显式业务迁移。

## 可重复操作

```sh
# 创建新目录；备份保持私有，不覆盖已有归档，不停止服务。
node scripts/preserved-runtime-backup.mjs \
  .sites-runtime/isolated-demo/current.json \
  .sites-runtime/p0-backup-NEW

# 只读核对在线原实例、历史工作区、插件回执、原链进程和归档。
node scripts/verify-preserved-runtime.mjs \
  .sites-runtime/isolated-demo/current.json \
  .sites-runtime/p0-sealed-backup-20261023 \
  outputs/p0-acceptance-20261023/preserved-after.json \
  outputs/p0-acceptance-20261023/browser-review-append.json
```

需要恢复单个组件时使用恢复记录中的组件命令；不得对原实例使用 `stopTestRuntime`、`demo-isolated --resume` 或全环境停止。完整浏览器重启与冷备份测试必须选择 `persistent=true`、`manageCurrent=false` 的独立实例。

## 本轮完整回归

运行证据位于 `outputs/p0-acceptance-20261023/`。最终全量单元测试 **348/348 通过、零跳过**；严格 lint **0 error / 0 warning**、TypeScript 检查和生产构建通过。组件恢复测试 3/3 通过。

完整 CLI demo 的 **46 个本地执行阶段全部通过**，报告 `outputs/full-demo-ae57ec14-ee57-43e6-b381-df698989ba83/report.json`。两个外部 CRE 阶段明确排除，`allStagesPassed=false`，不能改写为 48/48。第 24 阶段首次因 CLI 实时采样与网页回放不一致失败；修复后从该阶段恢复，原失败保留于 `failedAttempts` 和原日志。

x402 报告 `outputs/x402-demo-95630fd2-6485-4ebb-a0ac-21e750c1c525/report.json`：正常交付付款、错误交付退款、付款后丢失响应恢复全部通过。用户托管 3.00 = 支付 2.00 + 退款 1.00 DemoUSDC，供应商上游另付 0.60；包含桌面、中英文和移动端浏览器检查。

独立业务闭环报告 `local-business-report.json`：8 组业务检查通过，7 个唯一 escrow，1480 / 1380 / 100 分注资、付款、退款，测试队列 pending/leased/dead 均为 0。

完整浏览器业务 demo **1 个测试、17 个检查点全部通过**，报告 `outputs/full-business-browser-browser-full-ee59f166-d9b7-4e34-9d4c-6d84dca3489e.json`。从空工作区验证授权中断、拒签、RPC 故障、两次失败退款、已付款前缀保留、完整实例停止/恢复、实际规划模型及向量记忆、续订、中英文和移动端。11 个唯一 escrow，2140 / 1940 / 200 分；消费者及该测试实例已停止、凭证已撤销、测试活动会话为 0。

该浏览器用例验证备份在新目录恢复并通过摘要校验，再恢复原持久化测试实例；没有将新目录另起服务器作为独立冷启动验收，不能混称为完成了所有崩溃恢复矩阵。

常规浏览器最终整套 **33/33 通过，零失败、零跳过**，报告 `browser-final-results.json`，日志 `browser-final.log`。第一次运行保留旧按钮失败及中断记录；第二次 32 通过、1 个向导额度前置条件失败；相应定向修复均已通过，再重跑全部 6 个常规浏览器文件形成最终 33/33 结果。历史失败保留于 `browser-initial-results.json`、`browser-second-results.json` 及对应截图、日志。

原实例浏览器检查 2/2 通过。首次重放旧收据测试在此前的测试工作区追加了 1 条人工审核记录和对应记忆笔记：旧审核记录、资金、付款凭证及其余业务字段保持不变；该工作区 revision 增加 1。没有回滚或删除该审计记录。其精确 owner/review ID 单列在 `browser-review-append.json`；校验器仅接受这一个明确条目的追加，并拒绝其他业务字段变化。随后增加 `AGENTOS_BROWSER_PRESERVE_HISTORY=1` 路径，原实例只读重跑 2/2 通过，原历史不再追加；证据 `original-browser-readonly-results.json`。

原实例专用配置没有 webServer。重跑旧业务报告的浏览器检查时必须设置 `AGENTOS_BROWSER_PRESERVE_HISTORY=1`；测试新增工作区与既有历史分别核对。运行中消费者的 last_seen 心跳正常更新，不视作业务记录修改。

最终逐表核验 `business-tables-preserved.json`：12 张业务表的原记录均保留；除上述 1 个工作区追加审核和消费者 last_seen 外无原记录改写。包括 1,301 条队列、238 条插件执行、155 条插件采购、218 条插件授权、32 条消费者凭证及全部原记忆记录。新增 3 个测试工作区、3 条插件安装记录和 1 条审核记忆；182 份历史插件 journal 收据和签名私钥字节不变。`preserved-after.json` 同时确认原链 PID 46733、六个服务 HTTP 200 和 348 个应用文件与 checkout 一致。

最终结果索引与 SHA-256 清单：`outputs/p0-acceptance-20261023/summary.json`、`manifest.json`。独立验收实例在测试后停止，数据、备份和源码快照保留；current 指针和原实例继续运行。测试会话清理只针对本轮浏览器报告明确列出的工作区，见 `browser-cleanup.json`；原业务不作批量清理。

最终清理复核：常规浏览器报告明确列出 26 个本轮工作区，撤销其中 9 个剩余测试会话；两次首次失败/中断的测试会话已另行精确撤销。24 个本轮独立服务端口已关闭，三个模型端口 11435–11437 已关闭；预先存在的 6100 模型控制器保留。原六个服务端口保持监听，见 `processes-after-cleanup.json`。验收清单同时记录完整 CLI 各阶段与原失败阶段日志的 SHA-256。

## 保留的范围边界

- x402：本地 DemoUSDC 采购、Vault 托管、独立验收、失败退款和丢失响应恢复已有实现；真实支付资产/公网结算没有在本轮验收。
- CCIP、Data Feeds：尚未实现。本轮不扩展协议功能。
- CRE：本轮本地 demo 显式排除两个外部 HTTPS/CLI dry-run 阶段，不能将排除记为通过；历史 CLI 和 Sepolia 证据分别查阅原记录。
- 两小时监控 soak 属于独立、旧固定源码的验收，详见 `MONITOR_RELIABILITY_ACCEPTANCE_2026-10-23.md`，不改标成本轮重新执行。
