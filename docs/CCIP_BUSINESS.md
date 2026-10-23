# CCIP 本地业务集成

入口：`/api/ccip-tasks`、`sdk/ccip.ts`、`npm run demo:ccip-business`。只在本机开发模式启用，不接入真实 CCIP、真实资产或 DON。资金仍分别托管，B 链支付本链 MockToken。

## 授权与持久执行

owner 显式审核输入、金额、到期时间与场景，提交 `approved:true` 的草稿。API 先将不可变条款、部署、工作区 scope、请求 ID 和预算预留写入 D1，与 `kind=ccip` 的队列任务原子提交；相同 ID 重试不再次授权，条款改变拒绝。

队列调用固定 loopback CCIP 服务。两条 Ganache 链（31338/31339）、钱包种子、合约部署、交付与中继日志全部保存在实例的 `ccip/` 下；重启不重新铸币、部署或重授额度。接收校验及本地 Vault/日额度沿用 P3 合约。未决预算不会因为请求失败、到期或撤权而直接清空。

B 链业务为 1–25 条转账的财库汇总：现有执行器计算输出，独立 `verifyDelivery` 复算完整成果。根据真实 Escrow 付款/退款回传结果；D1 通过只读 RPC 独立读取两链固定区块的 Task、Escrow 和预留，验证金额、期限、spec、收款方与结果一致，再复验成功成果。A 完成且 B 收到 ACK 后才释放 D1 预留。无服务端“HTTP 成功即付款”的路径。

尚未上链授权的取消由 A 生成不可重用的本地取消 tombstone，不占新预算；在途撤权仍等结果和 ACK。已发生的付款不因迟到撤权而伪造退款。异常接收和不确定的执行保留原任务和资金占用，`recover` 仅重试该 owner 的任务；不会代替 owner 增加预算或授权。

主链现有 Vault 与 CCIP 的 A/B Vault 是不同资金池。D1 的 CCIP 日额度按毛授权保守累计，退款不恢复当天该额度；原 testUSD 积分账和其他链的资金不混算。本地 CCIP 服务的 operator 管理测试钱包；这不是浏览器钱包签署真实跨链授权，也不新增多租户不可撤销资金锁。

## 验证

- `tests/ccip-business.test.mjs`：真实 SQLite/D1 原子入队、幂等、未决结果预留、两条持久化链重启、独立成果校验、错误交付退款和取消。
- `tests/ccip-process-recovery.test.mjs`：B Escrow 已付款、Lane 尚未收集结果时实际 SIGKILL；重开 D1 和两个 EVM 数据库，结果/ACK 恢复，Opened 与 Settled 都恰好一次。
- 原 P3 的来源、Router、发送者、重复、乱序、延迟、撤权及退款用例继续执行。
- API demo 覆盖错误 scope 拒绝、跨工作区 404、相同请求幂等、成功/退款/取消和队列清空；新增至完整 demo 清单。

服务只允许无 Origin 的本地服务调用，提供的 RPC 为只读白名单。它仍是受信本机 Mock Router 工具，不提供生产身份隔离或 CCIP 网络证明。真实网络相关验收继续按 [P3 原型边界](CCIP_LOCAL.md) 单列。
