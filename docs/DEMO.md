# 3 分钟演示稿

**开场 20 秒**：Agent 能调用工具，但让它花钱、采购另一位 Agent 的服务，仍缺少可恢复、受权限约束的执行基础设施。AgentOS 把任务、预算、交付验证和付款放在同一条执行链。

**成功路径 45 秒**：首页点 Successful delivery → Dispatch task。解释 10 testUSD 是上限，Atlas 报价 2.40。侧栏六阶段推进；完成后剩余 7.60 释放。查看结果、Verify 收据、Export JSON。说明可使用内置或自定义转账记录，当前执行账本是测试积分。

**权限路径 35 秒**：关闭详情，点 Injection defense → Dispatch task。恶意操作请求 wallet.transfer，实际 capability gate 拒绝，任务 Blocked，付款为 0，预留余额释放。Permissions 中展示允许技能、单次上限、日预算和 revoke 开关。

**恢复路径 35 秒**：点 Crash & recovery → Dispatch task。任务在 2.40 付款后 Paused，刷新页面再打开该任务，点 Resume safely。任务 Completed，Settled 仍是 2.40，同一 settlement ID 不产生第二条付款。

**验证失败 20 秒**：Invalid delivery 的输出总额被改动 1 分；校验拒绝，所有预留资金释放。

**收尾 25 秒**：展示钱包与托管中本地 EVM 的余额、已付款状态和经过核验的回执，再展示 CRE CLI dry-run 的接受/拒绝日志。明确说明：“任务执行使用本地适配器和 testUSD；独立托管已实跑本地 EVM；CRE 官方 CLI 模拟通过，公共测试网和 DON 待验收。”

## 提交前必须补齐的证据

1. 按主办方要求提供仓库链接、团队信息、演示视频和项目说明，确认赛道资格。
2. 合约网络、部署交易、合约地址、forwarder 和 workflow identity 配置。
3. CRE CLI 模拟输出；如参赛规则要求真实集成，提供 DON execution ID 与 settlement transaction。
4. 网页与链上 adapter 联调；录制成功、拒绝、退款、重放不重复付款。
5. 当前站点为私有；公开视频或给评委访问需另行调整分享范围。

## 延伸演示：本地 EVM 与 CRE

- 本地页面点击「钱包与托管」→「连接本地测试钱包」→选择已完成交付→批准并注资→「本地验证演示」→验证与结算。余额下降、状态 Paid、回执核验通过；再次注资和重复结算被拒绝。
- 错误交付先篡改本地 artifact 再验证，状态 Refunded；另一任务推进测试时间再退款。`npm run demo:wallet` 会独立自动验收这些场景及空范围零条交付。
- 已登录 CRE CLI 后运行 `npm run demo:cre`：实际 HTTPS + 本地 RPC，三个场景通过。CLI dry-run 不广播，托管仍为 Funded。不可混同本地 EOA 结算与 CRE DON 执行。
- 点击「签名并保存凭证到工作区」，服务端验证工作区挑战签名与链上回执后保存历史。刷新后记录保留；按交易哈希在记忆中查找，导出上下文。`npm run demo:reconcile` 验证付款、两种退款、并发重放和跨工作区拒绝。记录是核验快照，资金账本保持独立。
