# 当前本地产品验收 · 2026-10-23

本页是“版本与文档入口 → CCIP 网页闭环 → 统一资金证据 → 持续运行”的当前入口。**前三项已有实现及回归证据，正式持续运行验收仍进行中，四项整体尚未完成。** 公网部署、真实资产、真实 CCIP/Feed 与 DON 结算均不在本轮范围。

## 代码与证据版本

完整核心、浏览器及 demo 回归产品提交为 `1f17dbc1fbdb767b4b03d2ecba674a8ce128f24d`，源码摘要为 `811eae42be5ec5ec51b78c91a17789affa57a241144bbe05e30932669218dae6`。

持续验收使用独立 Git 工作树 `../agentos-product-soak`，固定提交 `c0175c963ebbf7c5b6eedf59cd77414bcbceb56a`，源码摘要为 `ae0831b48934326bfa2358b96d7bbe0662efcdcd77906d1f243bbe2709be99a5`。与回归提交仅三份文档/索引不同：`docs/CRE_DEPLOY_ACCESS_FOLLOWUP.md`、`docs/SEPOLIA_DEMO_ACCEPTANCE.md`、`docs/SEPOLIA_DEMO_EVIDENCE_INDEX.json`。其余 801 个 Git 条目完全一致。差异证明位于 `outputs/product-delivery/source-equivalence.json`；不同源码摘要不冒充同一摘要。

共享主工作区随后新增了独立 CRE 演示命令（`ad4dbc1`）及证据文档（`9c59dd1`）。它不包含在这两次已固定提交中；其本地 10/10 验收和边界另见 [CRE_HACKATHON_DEMO.md](CRE_HACKATHON_DEMO.md)。既有全仓报告不冒充新增命令的全仓回归。

## 已有回归

- Node 389/389，零失败、零跳过；严格 lint、网站/CRE 类型检查和生产构建通过。
- CRE SDK 6/6，92 次断言。
- 常规浏览器 33 项通过、3 项条件跳过；其中两项收据用例补跑 2/2，独立完整业务浏览器另通过，合计覆盖 36 个不同浏览器用例。不是把跳过直接计为通过。
- 完整 demo 60/60，无排除阶段。独立业务浏览器 17 个步骤、11 笔 Escrow；2140 分注资 = 1940 分付款 + 200 分退款，未结算与预留均零。

原始入口：`outputs/product-delivery/current-gates.json`；核心报告 `outputs/unified-validation-ad9ce8c1-85bb-48ae-a428-9cf5a63be45f/report.json`；完整 demo `outputs/full-demo-b0d080a0-d1f4-4fd9-9120-2303b239a2a4/report.json`。原流水线包含持续验收失败，整体 passed=false，不覆盖为成功。

## 可操作功能

[CCIP 网页闭环](CCIP_BUSINESS.md)：钱包页审核条款后创建，编辑/刷新撤销审核；丢响应重试同编号；待决展示预算；owner 显式取消/恢复。已验证成功、拒绝退款、取消、双语及移动端。

[统一资金证据](FUNDS_EVIDENCE.md)：区分沙盒、托管本金、供应商 token/gas 成本、CCIP 及未来采购预留；插件与独立钱包收据去重。三个共享 Vault 余额附带观测区块；未知/不可用不按零处理，检查点不冒充实时复核。

运行基线以 [LOCAL_BASELINE.md](LOCAL_BASELINE.md) 为准；按需使用 `npm run baseline -- status/start/stop` 的对应单一子命令。测试前已停止所选基线，保留部署、钱包和数据库。旧内存链保留归档证据，不能宣称已恢复为新链。

## 持续运行门禁：未完成

正式要求至少 7200 个真实秒；最大采样间隔 60 秒、足量采样、成功/拒绝退款/取消、实际 SIGKILL 后同部署恢复、唯一开单/结算、终态零预留和归属核验后清理。详见 [PRODUCT_SOAK.md](PRODUCT_SOAK.md)。

上次运行 `outputs/product-soak-16bc39d8-a4d4-4d54-9650-0409a640f33b/report.json` 在约 88 分钟、347 个样本后因共享 HEAD 变动被版本门禁中止，acceptancePassed=false，不能拼接计时。

新运行在固定工作树及独立持久化实例中从零开始，使用捕获数据回放和本地双链，不启动模型。当前等待真实时长与最终原始报告；本页随后更新最终结果、清理及逐项证据审核。
