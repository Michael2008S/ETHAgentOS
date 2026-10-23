# 可恢复基线、CCIP 业务集成与本地保障验收

2026-10-23。用户本轮六项要求全部按本地范围完成。验收产品代码固定为 `2f6ac6dce42b2d70147663205114f9228ff053f0`，源码 SHA-256 为 `994b85975491aced42c04ae2d91a069514acb2dcb4e8c5205c3986c954ff70c3`。验收后的文档提交只更新 Markdown，不改变已测产品代码；不要将旧阶段的测试数量或实例在线状态混入本轮结论。

## 逐项结果

| 要求 | 实现与实际证据 |
|---|---|
| P0 可恢复基线 | 新 `.sites-runtime/local-baseline/current.json` 与旧 current 分离；旧 D1/插件日志及签名身份私有归档并核对哈希。新实例真实完成两笔付款、一笔退款，再停止、备份、在新目录恢复和启动，核验原部署与区块锚点。每次生命周期记录前后状态。 |
| P1 统一验收与文档 | 干净工作区、运行快照与提交一致；严格 lint、383 项 Node 测试、6 项 CRE SDK 测试/92 次断言、网站/CRE 类型检查、生产构建全部通过。常规浏览器与完整 demo 显式绑定所选实例，报告固定提交和源码摘要。 |
| P1 CCIP 本地业务 | API/SDK、D1 原子入队、队列驱动、A 链授权、B 链 Vault/Escrow、独立成果复算、结果/ACK、退款与取消全部接通。两个 EVM、钱包种子和日志持久化；真实 SIGKILL 后重开 D1 与双链，不重复开单或付款。 |
| P2 组合故障 | 同一工作区同时保持 CCIP 结果未决、Feed 脱锚和 x402 已付款但收据未知；六组断言通过。用户退款、供应商未知成本和 CCIP 预算分别处理；只读对账不签名、不生成新 nonce。 |
| P2 本地运行保障 | 生命周期互斥、十分钟最多三次恢复、本地去重告警、跨工作区队列统计、容量与授权告警；实际终止本次 CCIP 进程后恢复原交易，并从独立冷备副本启动两链核对收据。 |
| 公共网络边界 | 没有新增公网部署、真实资产付款、真实 CCIP/Feed 或 DON 结算。历史 CRE dry-run 不等于这些验收。 |

功能与修复提交：`8ce7b04`（基线）、`878cc54`（统一门禁）、`ec5a2e9`（SQLite 初始化锁竞争）、`0f52339`（CCIP 业务）、`20512c2`（组合故障）、`a693870`（运行保障）、`2f6ac6d`（历史完成日志告警对账）。每项均先执行对应测试再提交。

早期失败保留：首次全量测试 375 项中一项暴露 SQLite 在设置 busy_timeout 前切换 WAL 的竞争，已用实际跨进程文件锁复现并修复；首次监管 demo 将旧日志中已完成的 CCIP 任务误报为未决，已根据真实链上终态重建标记。它们不属于最终固定提交的失败项。

## 最终完整验证

统一入口：`npm run validate:local -- all`。

- Node：**383/383，通过，零跳过**。
- CRE SDK：**6/6，92 次断言**。
- 严格 lint、网站/CRE typecheck、生产构建：通过。
- 常规 Chromium：**31 项通过、3 项条件跳过**。其中两项需要实际业务收据，已在同一提交和主实例上补跑 **2/2**；另一项需要独立重启夹具，已在完整 demo 的独立业务浏览器中通过。因此本轮覆盖全部 **34 个浏览器用例**，没有把跳过直接计为通过。
- 完整历史及新增 demo：**60/60，无排除项、无失败尝试**。包括两项官方 CRE dry-run、x402、CCIP 原型与 API 业务、组合故障、监管/冷恢复和独立完整浏览器。
- 独立业务浏览器：17 个业务步骤，11 笔独立 Escrow；2140 分注资 = 1940 分付款 + 200 分退款，预留和未结算均为零。

证据入口：

- 逐要求汇总与 SHA-256 清单：`outputs/local-goal-acceptance/summary.json`、`manifest.json`。
- 统一门禁：`outputs/unified-validation-9f67d1b7-4f2d-4cb2-89ff-2846e79be06d/report.json`。
- 60 阶段 demo：`outputs/full-demo-7b61f282-b533-4459-9b82-2ef1a1f63bb2/report.json`。
- CCIP API：`outputs/ccip-business-88ac28b3-8ecd-45f1-9064-0b983dabc976.json`。
- 组合故障：`outputs/combined-faults-62eed41f-70a5-447e-bf48-8de6f1399a50.json`。
- 监管与冷恢复：`outputs/local-operations-7f607364-f364-4976-ad09-0fc5d6ac7129.json`。
- 收据型浏览器补跑：`outputs/local-goal-acceptance/receipt-browser.log`。

## 收尾与恢复

本轮核对 35 个测试、模型及控制器端口均已关闭；新基线有意停止以释放资源，数据库、双链、钱包和部署全部保留。可用以下命令按需恢复，不重新部署、铸币或续授权：

```sh
npm run baseline -- status
npm run baseline -- start
npm run ops:local
# 使用后停止，模型保持按需加载：
npm run baseline -- stop
```

旧 9455 及旧应用仍离线，旧指针、签名身份与归档文件不变。旧内存链没有被新链冒充恢复；其历史只能按已归档证据读取。新旧链资产、订单和实例边界明确分开。

操作说明：[可恢复基线](LOCAL_BASELINE.md)、[CCIP 业务](CCIP_BUSINESS.md)、[组合故障](COMBINED_LOCAL_FAULTS.md)、[本地保障](LOCAL_OPERATIONS.md)。本轮是本地受控验证，不是长期生产 SLA、任意宿主机断电/磁盘损坏、真实钱包扩展或真实 CCIP 网络证明。工作区 CCIP 日额度按毛授权统计，B 链日支出由 Vault 独立约束，未决链上并发预算保留至对应结果确认。
