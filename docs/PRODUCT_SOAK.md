# 当前产品版本持续运行验收

入口 `npm run test:product-soak -- --runtime /absolute/isolated/runtime.json --stop-runtime`。运行环境必须是干净提交、同一提交的固定源码、显式持久化 CCIP 双链、manageCurrent=false 的隔离实例。不要选择旧内存链，也不覆盖旧指针。独立实例使用明确空闲端口、AGENTOS_DEMO_CCIP=1、AGENTOS_DEMO_NO_CURRENT=1、AGENTOS_DEMO_COMMITTED_SOURCE=1、AGENTOS_DEMO_CAPTURED_SOURCE=1 启动 demo:isolated。

这是独立于短时 demo:full 的持续测试门禁；最终交付需同时核对完整 demo 与此报告。正式验收至少 7200 个真实秒，不修改时间来加速观测。独立测试工作区在开始、中段和后段分别执行成功、错误交付退款和未发送取消。首次成功在 B 已付款但尚未收集结果时实际 SIGKILL 本次 CCIP 进程，观测不可用，等自有启动器完成退出，再恢复同一数据库、两链及源码；原条款和预算保持，最终 Opened/Settled 各一次。每十五秒核对资金视图、三个共享 Vault、工作区任务/预算和死队列，记录真实时刻、区块及采样间隔。源码或提交变化拒绝继续，失败不拼接为新版本成功。

`--smoke --seconds 120` 只检查驱动和真实中断恢复，报告 acceptancePassed=false，不是两小时验收。正式报告需 passed=true、acceptancePassed=true、实际时长达到要求、至少 80% 预期样本、所有观测成功、最大采样间隔不超过 60 秒、三任务终态与零预留，以及清理完成。计划中的恢复区间单列 outageMs，不声称无中断运行；此项也不证明真实主网来源、第三方 RPC 或生产 SLA。

--stop-runtime 仅通过归属检查停止指定隔离实例；保留数据库、交易、报告和源码，模型不启动。报告位于 outputs/product-soak-*/report.json。持续验收期间不要改代码或并行复用同一实例跑会变更时间/重启服务的 demo；其他版本的历史长跑不能代替此报告。
