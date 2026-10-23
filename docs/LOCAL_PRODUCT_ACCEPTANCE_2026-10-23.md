# 当前本地产品验收 · 2026-10-23

完成核验时间：2026-10-24 01:09:07（Asia/Hong_Kong）。文件日期沿用本轮开始日期。

**版本与文档入口、CCIP 网页闭环、统一资金证据、最新版本持续运行四项逐项验收通过。** 本轮只完成本地产品交付；公网部署、真实资产、真实 CCIP/Feed 及 DON 结算继续后置。

## 同一代码与明确实例

产品代码为 `e990c9382a7ecec05283981d0b06b56a331f477a`，808 个源码文件摘要为 `399dd48a1a930af4056867cb234f9da149db6e9d305039f1f73cbf1206874ae7`。保留业务基线、常规浏览器、完整 demo 与正式持续观测均使用这份代码和摘要。后续文档提交单独记录，不冒充运行代码提交。

浏览器和完整 demo 位于固定工作树 `../agentos-product-final` 的两个独立持久化实例；持续观测位于 `../agentos-product-soak` 的第三个实例，两个工作树 HEAD 均固定。主工作区业务基线先备份再升级，测试采购及故障注入不在该业务基线上执行。旧指针未覆盖。

统一入口为 `outputs/product-delivery/current-gates.json`；逐项机器审计为 `outputs/product-delivery/summary.json`，逐文件哈希为 `manifest.json`。原始失败、续跑和模型诊断全部保留。

## 四项交付与验收

| 项目 | 已交付行为 | 当前证据 |
| --- | --- | --- |
| 版本及文档入口 | 当前代码、运行基线、验收版本和历史边界一致；入口链接到本页 | 四份入口文档、基线源码快照、808 文件摘要、逐项审计 |
| CCIP 网页闭环 | 审核创建、编辑/刷新撤销审核、同编号幂等重试、未决预算、显式取消/恢复、双链状态与区块证据 | 常规 Chromium、双链 API/D1/队列、成功/退款/取消和实际进程中断恢复 |
| 统一资金证据 | 主链及 A/B Vault 分池、订单及插件托管、上游 token/gas、CCIP 和未来授权，未知不按零，去重与 owner 隔离 | 纯投影及组合故障、常规 Chromium、完整业务 11 笔 Escrow（其中插件 7 笔） |
| 最新版本持续运行 | 同一持久化数据库和双链连续观测至少 7200 个真实秒，实际 SIGKILL 后恢复原任务 | 本轮实际 7200.044 秒，472 个样本全部正常，最大采样间隔 17.211 秒，正式报告与清理通过 |

## 完整回归

- Node **389/389**，零失败、零跳过；严格 lint 零错误/零警告，网站及 CRE 类型检查、生产构建通过。
- CRE SDK **6/6**、**92** 次断言。
- 常规 Chromium **33** 项通过、3 项条件跳过；收据用例实际补跑 **2/2**，独立完整业务浏览器另通过，合计 **36 个不同用例**。不把跳过直接计为通过。
- 完整 demo **61/61**，无排除阶段，包含官方 CLI 参赛演示 **10/10**。独立完整业务浏览器 **17 步**通过：**11 笔唯一 Escrow，2140 分注资 = 1940 分付款 + 200 分退款，未结算和预留均零**。资金视图按原始整数单位核对 21400000；7 笔插件托管未漏算或重复。
- CCIP、资金视图及完整业务的中文/英文和 390px 布局通过，最新截图已查看并保存哈希。

完整 demo 报告：`/Users/michael/Develop/ETH2026ShenZhenHackathon/agentos-product-final/outputs/full-demo-1ad68b44-cad9-46df-863b-233550552a91/report.json`。当前续跑汇总：`/Users/michael/Develop/ETH2026ShenZhenHackathon/agentos-product-final/outputs/product-final-v4/continuation5.json`。完整业务报告：`/Users/michael/Develop/ETH2026ShenZhenHackathon/agentos-product-final/outputs/full-business-browser-browser-full-d8bc8d29-3f1b-42cd-aa30-999974209379.json`。核心及常规浏览器日志位于独立工作树 `outputs/product-final-v4/`。

这次整套通过包含显式续跑：首次新工作树缺少历史 current 别名和本地 CRE 配置；临时 HTTPS 出现不可达；最后浏览器要求模型控制器自行持有进程，而外部热模型仍在运行。分别补齐私有夹具配置、使用已验证的进程级 IPv4、停止核验归属的外部热模型后，从失败阶段继续。此前阶段、断言和失败记录保持，不称为首次无中断通过。共保留 5 个失败阶段记录。

## 两小时持续观测

本轮从 `2026-10-23T15:08:16.977Z` 开始，至 `2026-10-23T17:08:16.847Z`，要求 7200 个真实秒，实际 7200.044 秒；472 个样本全部正常，最大间隔 17.211 秒（门槛 60 秒，含首尾边界）。时长按单调时钟计；首末样本跨度约 7172.867 秒，开始时的实际中断恢复及结束前的尾段也纳入覆盖检查。成功、错误交付退款、未发送取消三任务均已终态、预留为零。队列及三个共享 Vault 按实际区块持续核对，终态唯一 Opened/Settled 验证通过。

首次成功在 B 已付款但 Lane 尚未收集结果时实际 SIGKILL，观察到不可用后恢复同一部署、数据库和原条款；该计划恢复区间约 15.997 秒，单列记录，不声称全程无中断。`passed=true`、`acceptancePassed=true`、`runtimeStopped=true`。

原始报告：`/Users/michael/Develop/ETH2026ShenZhenHackathon/agentos-product-soak/outputs/product-soak-472b354b-82c4-4b49-8f6c-1677c6aa19ac/report.json`，监督器汇总：`/Users/michael/Develop/ETH2026ShenZhenHackathon/agentos-product-soak/outputs/product-soak-final/run.json`。先前约 88 分钟和 100.85 分钟的失败/停止尝试保留，均不计入本轮时长；不拼接版本或计时。详见 [PRODUCT_SOAK.md](PRODUCT_SOAK.md)。

## 数据保留与进程清理

保留业务基线先备份再升级，启动/只读健康核验/停止通过。业务表一致、99 个插件文件字节一致；独立只读 SQLite 复核只有运行心跳和内部元数据表变化。旧归档 193 个文件哈希与旧指针核验通过。原 9455 内存链已离线，归档明确 restartable=false；磁盘保留不等于恢复旧内存链，不将旧订单绑定新链。

业务基线与全部本轮回归、观测实例保持停止；数据库、链、收据和源码保留。外部热模型按 PID、父子关系、命令、cwd 及启动元数据核验后停止，控制器持有的模型也已释放。最终只读清理核对 53 个已知端口，全部关闭；未知和无关进程不操作。凭证位于 `outputs/product-delivery/final-cleanup.json`、`warm-planner-stopped.json`、`baseline-data-preservation.json`、`baseline-readonly-final.json` 和 `legacy-preserved-final.json`。

按需恢复保留业务基线：`npm run baseline -- status`、`npm run baseline -- start`、`npm run baseline -- stop`，网页为 `http://127.0.0.1:19977`。不需重建钱包或重新部署。详见 [LOCAL_BASELINE.md](LOCAL_BASELINE.md)。

## 运行条件与验收边界

普通规划回归复用真实已运行模型，原 60 秒上限及固定权重不变。最后独立业务浏览器实际由控制器启动规划模型、执行三步真实规划、切换记忆模型并清理通过。此前反复冷启动曾超时并出现一次 Metal 退出异常；一次完整生命周期通过不等于冷启动可靠性或生产 SLA。请求、响应、16 秒原生诊断及二进制指纹保存在 `planning-native-*` 和 `warm-planner-profile.json`。

本轮来源为捕获的 finalized 数据回放；x402 使用本地 DemoUSDC，Feed 为 Mock，CCIP 为受信 Mock Router 的应用状态机，资金各链分别托管。供应商完整钱包预留仍是其私有日志责任；共享 Vault 余额不是工作区独占额度，保存检查点不是实时持续核验。官方 CRE CLI 使用临时合成 HTTPS 和本地 RPC，测试 forwarder 不验证 DON 签名；未进行公网部署或广播。

新工作树复跑需准备依赖/模型/CLI、`cre:prepare` 和仅指向测试实例的 testOnly current 别名及监管基线；运行状态和进程元数据独立，主工作区旧指针不覆盖。临时 HTTPS 不公开工作区或 RPC，IPv4 仅进程级设置。协议和操作分别见 [CCIP_BUSINESS.md](CCIP_BUSINESS.md)、[FUNDS_EVIDENCE.md](FUNDS_EVIDENCE.md)、[CRE_HACKATHON_DEMO.md](CRE_HACKATHON_DEMO.md)。
