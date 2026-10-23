# P3：CCIP 本地双链任务消息原型

当前运行基线、CCIP 业务集成及本轮 60 阶段完整验收见 [当前本地验收总览](LOCAL_INTEGRATION_ACCEPTANCE_2026-10-23.md)。下文旧测试数量、旧实例状态和旧功能边界按各自阶段理解。

范围：A 链提交任务授权 → B 链在本地预算内通过现有 AgentVault/AgentEscrow 执行 → 回传结算结果 → A 链确认。只传消息、不跨链转移代币。两条独立 Ganache EVM 的 chainId 为 31338 / 31339，Mock selector 为 1001 / 1002；这些 selector 不是官方网络配置。

## 运行与实现

```sh
npm run demo:ccip
node --test tests/ccip-local.test.mjs tests/contracts.test.mjs
```

完整 P3 demo 包含成功结算、拒绝交付退款、超时退款和消息故障恢复，输出 `outputs/ccip-demo-*/report.json`。两条 EVM 在进程内创建，退出时 disconnect；SQLite 中继临时目录在 finally 删除。不启动 HTTP 服务、模型或子进程，不使用 9455、6097、6098，也不修改原实例数据库。项目全量 `demo:full` 已追加 `demo:ccip` 阶段。

- `contracts/LocalCCIPTaskLane.sol`：固定对端链 selector、一次性绑定对端合约和本地卖方，执行与接收分离。接收入口先检查 Router、来源链和 ABI 编码的发送者地址，拒绝带代币的消息。
- `scripts/ccip/local-fixture.mjs`：部署两组独立 Token、Vault、Escrow、Router、Lane；B 的 Vault 只给本地 Lane 授权，并固定卖方白名单、单任务和每日预算。Lane owner 是本地执行操作员；远端消息不能任选卖方或直接调用任意合约。
- `scripts/ccip/acceptance.mjs`：完整故障注入及余额守恒断言；SQLite 日志关闭后重开，重试已上链但未写检查点的消息。链状态在中继恢复期间持续保留。

## 消息状态与预算

| 阶段 | A 链 | B 链 | 释放条件 |
|---|---|---|---|
| 授权发出、未到达 | Pending，保留任务预算 | 无任务 | A 不因超时或本地撤权自行释放 |
| 收到授权、待执行 | 继续保留 | Ready，检查独立本地 cap 和 Vault 余额后保留预算 | 已预留任务撤权或过期需生成取消结果 |
| 本地执行 | 继续保留 | Executing，Vault 把本链代币转入本链 Escrow | 以本地 Escrow 的 Paid/Refunded 状态为准 |
| 结果未确认 | 未收到结果则继续保留 | ResultPending，已有预留在成功、退款、取消后均继续保留 | A 收到可信结果后释放 A 预算并发送 ACK |
| ACK 收到 | Complete | Complete，释放 B 预算 | 重复结果或 ACK 不重复结算 |

`cap` 是并发未决预算；Vault 的日累计支出是另一重限制，退款不恢复当日额度。A 的资金始终留在 A Vault；实际采购只消耗 B Vault。B 退款返回 B Vault，不会凭回传消息向 A 铸币或付款。原 Vault owner 的充值、提现、授予权限保持原语义；原型假定双方使用专属 Vault、受信 owner，并未新增不可撤销的资金锁或多租户全局预留机制。余额不足会阻止执行，预留不会被静默清空。

任务 ID 和金额、到期时间、specHash 一经建立不可更改。messageId 去重之外还按任务阶段去重，换一个消息 ID 重放授权也不会再次执行。撤权采用不可逆 tombstone，不允许旧授权覆盖；每个任务只授权一次，不支持同 ID 续期或修改版本，应创建新任务 ID。执行已进入 Escrow 后，撤权不会伪造“尚未消费”的结果；必须等实际结算或 Escrow 到期退款。网络尚未送达的撤权无法立即阻止 B 已经合法完成的执行。

失败接收事务不标记消息已消费，可在恢复本地额度或授权后重试。尚未接收/预留的任务允许在 B 额度不足时直接建立取消 tombstone 并回传结果，不新增 B 预留；这样不会让 A 因 B 预算永久不足而无法撤销。已有预留仅在 ACK 后释放。执行失败原子回滚到 Ready；实际执行后不能二次执行。`resend` 可重发授权、撤权、结果或 ACK；没有假设收到重复 messageId 就一定产生新的 ACK，丢失 ACK 时由 A 的 resend 或 B 重发结果恢复。

## 简单验证范围

新增两项 Node 测试和现有 Escrow/Vault 合约测试通过。P3 demo 执行 12 组断言：来源校验、延迟、重复、任务条款冲突与乱序 ACK、SQLite 中继恢复、结果/ACK 重发、撤权先到、执行权限恢复及失败退款、B 预算反压、过期授权、已托管任务超时退款、最终余额守恒。

当前简单验证记录：3/3 相关测试通过，全仓 lint 0 错误、0 warning；P3 完整 demo 为 12/12 组断言。原实例只读核验保留 6 个服务、12 张业务表、182 份插件收据与 9455 原进程（PID 46733）。报告保存在 `outputs/p3-acceptance/`。

最终四个本地采购：一次支付、两次拒绝交付退款、一次超时退款。A Vault 保持 10,000,000 最小代币单位；B Vault 9,000,000，卖方 1,000,000，Escrow 余额零，两端 reserved 均零。这里只使用 6 位小数的 MockToken。

最初独立原型的验收器直接用测试 owner 作为本地 Escrow forwarder 注入接受/拒绝报告，以验证消息与托管状态衔接。后续已增加 [API、D1、队列及持久化双链业务集成](CCIP_BUSINESS.md)，仍没有调用真实 CRE，也没有跨链桥接资金。本轮完整 demo 指独立 P3 端到端 demo，未重新运行整个项目的模型、浏览器和全部历史业务 demo。

## 真实 CCIP 网络验收：尚未进行

本地 MockRouter 的 operator 可以注入消息，是明确的受信测试工具；它没有实现 CCIP 的网络共识、最终性、计费、跨链证明或生产 RouterClient/CCIPReceiver 全套适配。参考[官方安全要求](https://docs.chain.link/ccip/evm/concepts/best-practices)验证了应用接收边界；本地通过只证明应用状态机。公网部署继续不做。

未来单列验收：

1. 选择真实受支持 lane，核实双方官方 Router 地址、chain selector、发送者与目的地址；采用固定版本的官方 CCIP 合约/接口及对应 extraArgs。
2. 实测 ccipSend 费用、目标 gasLimit、接收权限、异常执行和官方 manual execution；不能复用本地任意注入接口。
3. 在两条真实测试网上保留源交易、CCIP messageId、目的执行、结果和 ACK 的完整证据及余额变化，验证实际延迟、最终性及乱序。
4. 验证接收失败、重试、撤权竞态、消息长时间未决及服务重启；增加长期未决监控、人工恢复策略和多租户预算集成。
5. 完成接收合约审查与安全测试后，再评估是否接入现有网站/任务 API；真实网络消息和资金桥接是分开的范围。
