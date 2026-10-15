# 3 分钟演示稿

**开场 20 秒**：Agent 能调用工具，但让它花钱、采购另一位 Agent 的服务，仍缺少可恢复、受权限约束的执行基础设施。AgentOS 把任务、预算、交付验证和付款放在同一条执行链。

**成功路径 45 秒**：首页点 Successful delivery → Dispatch task。解释 10 testUSD 是上限，Atlas 报价 2.40。侧栏六阶段推进；完成后剩余 7.60 释放。查看结果、Verify 收据、Export JSON。说明数据来自公开 fixture，当前是测试积分。

**权限路径 35 秒**：关闭详情，点 Injection defense → Dispatch task。恶意操作请求 wallet.transfer，实际 capability gate 拒绝，任务 Blocked，付款为 0，预留余额释放。Permissions 中展示允许技能、单次上限、日预算和 revoke 开关。

**恢复路径 35 秒**：点 Crash & recovery → Dispatch task。任务在 2.40 付款后 Paused，刷新页面再打开该任务，点 Resume safely。任务 Completed，Settled 仍是 2.40，同一 settlement ID 不产生第二条付款。

**验证失败 20 秒**：Invalid delivery 的输出总额被改动 1 分；校验拒绝，所有预留资金释放。

**收尾 25 秒**：Integrations 页面展示 CRE、Ethereum escrow、ERC-8004 源码状态。若尚未完成测试网联调，应直接说“网页为本地模拟；合约在本地 EVM 测试；CRE 源码通过类型检查，DON 部署待完成”。只有获得真实 workflow execution 和交易回执后才展示链上验证结算。

## 提交前必须补齐的证据

1. 按主办方要求提供仓库链接、团队信息、演示视频和项目说明，确认赛道资格。
2. 合约网络、部署交易、合约地址、forwarder 和 workflow identity 配置。
3. CRE CLI 模拟输出；如参赛规则要求真实集成，提供 DON execution ID 与 settlement transaction。
4. 网页与链上 adapter 联调；录制成功、拒绝、退款、重放不重复付款。
5. 当前站点为私有；公开视频或给评委访问需另行调整分享范围。
