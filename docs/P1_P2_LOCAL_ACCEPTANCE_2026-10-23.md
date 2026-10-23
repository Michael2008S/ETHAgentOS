# P1 / P2 本地实现与验收 · 2026-10-23

本轮实现 x402 故障恢复、第二套独立协议实现，以及 Data Feeds 本地最小用途。原 6097/6098/9455 继续使用 P0 固定快照；本轮验收使用独立实例和测试资产。测试后关闭本轮进程，保留报告及演示数据。没有公网部署或公共资金交易。

## P1：恢复与互操作

| 要求 | 实现与验证 |
| --- | --- |
| 广播后、交易哈希落盘前故障 | 广播前以 SQLite FULL 同步持久化原生 nonce、签名交易及其本地计算哈希；实际 SIGKILL 发生在广播后、结果更新前，重启用同一交易哈希恢复 |
| gas 不确定结果 | 观测 RPC 失败期间保留费用上限，不按零支出处理；恢复后验证 canonical receipt，以 gasUsed × effectiveGasPrice 核算；余额变化独立对账 |
| 多服务联合重启 | 提交前、付款后分别重启采购库、供应商、报告、Facilitator 和持久化 EVM；同一采购仍使用原支付 nonce，付款恰好一次 |
| 磁盘写失败 | 实际 SQLite query_only 写失败注入到签名交易、采购 payload、付款证明、报告结算落盘；恢复后仍保留原 intent 和预算占用 |
| 第二套独立实现 | 第二服务手写 HTTP/402 编解码及报告计算；第二 Facilitator 手写 EIP-712 校验、EIP-3009 calldata 和收据验证。复用通用私有日志与 gas 发送器，支付处理不调用官方 Facilitator SDK |
| 兼容性 | 两套服务 × 两套 Facilitator 共四种组合，使用不同商家收款地址、报告签名人及 Facilitator 钱包；官方 x402 客户端实际支付、丢失响应恢复、重放与 gas 对账通过 |
| 用户退款 | 两套实现均实际跑过 Vault 错误交付全额退款；广播结果丢失归类为可重试 503，付款证明和供应商费用单独保留 |

未知原生费用和未知 token 支出各自占额；没有生成替代支付 nonce。已付款授权通过 AuthorizationUsed、Transfer、canonical block 与 receipt 对账。原有缺少交易标识的旧 gas 日志继续保守占额，需要补充可核验凭证后才能释放。

主要验证文件：

- `tests/x402-facilitator-recovery.test.mjs`：广播故障、gas 观测中断、Facilitator 磁盘失败及联合恢复。
- `tests/x402-facilitator-kill.test.mjs`：真实 SIGKILL。
- `tests/x402-disk-recovery.test.mjs`：采购和报告写失败。
- `tests/x402-stack-restart.test.mjs`：整栈含 EVM 两个中断点恢复。
- `tests/x402-interop.test.mjs`、`tests/x402-interop-vault.test.mjs`：四组合互操作、独立商家路由及用户退款。

这里的第二套实现为仓库内独立编写的本地协议实现；第三方公网 Facilitator 和真实资产兼容性尚未验收。

## P2：ETH/USD gas 展示及 USDC/USD 风控

使用 [官方 AggregatorV3Interface](https://docs.chain.link/data-feeds/api-reference) 的 `decimals()`、`description()`、`latestRoundData()`。本地 `MockPriceFeed` 提供兼容接口；价格由测试设置，不是实时 Chainlink 网络报价。

- ETH/USD 用于供应商上游交易 gas 的美元成本展示。原生 gas 上限保持独立，美元金额用 BigInt 计算并向上取整到微美元，不使用浮点货币计算。
- USDC/USD 使用整数基点判断偏离 1 USD 的程度，默认阈值 200 bps。恰好 2% 在阈值内，超过则拒绝。
- 校验精度 0–18、价格正值及上界、非零 round/更新时间、更新时间不在未来、默认新鲜度 3600 秒；保留原始 answer、decimals、updatedAt、roundId。answeredInRound 作为兼容返回字段保留。
- 一个报价在同一 canonical block 读取两条 Feed，将地址、区块号/哈希、价格、精度、更新时间、风控状态及 gas 上限美元估算写入签名报价 `supplierQuote.payload.priceSnapshot`，再随订单持久化。
- 结算证据保存实际 gasUsed、effectiveGasPriceWei、costWei、usdMicros；应用独立回读付款收据及报价区块的历史 Feed，核验美元成本。历史订单按原报价快照展示，不随最新价格改写。
- 风控开启时，新报价和每次未确认付款的采购提交检查最新 Feed。零/负价格、过期、未来时间和 USDC 脱锚均阻止新采购；未知在途支付仍保留预算。
- 已付款结果恢复、退款和历史证据使用原报价快照，不调用最新价格作为退款门槛。已验证付款后发生脱锚，用户仍能全额退款，供应商 gas 仍按原 ETH/USD 报价对账。

固定 DemoUSDC 的服务费、预算、退款本金均保持原整数单位，没有按 Feed 重新计价。默认启用本地 Feed 展示，风控需显式开启。显示模式下脱锚不阻止采购；Feed 不可用时不伪造零美元价格。

本地供应商接口 `GET /v1/data-feeds` 返回 `ok / blocked / unavailable / disabled`、模式及可用价格快照。订单页面显示价格快照、更新时间、gas 上限美元估算；统一证据面板显示收据核算的供应商 gas 美元成本，已加入中英文和移动端检查。

```sh
# 默认参考实现，本地 Feed 展示；独立实例自动停止。
npm run demo:x402

# 第二套实现，显式启用最新价格风控。
AGENTOS_X402_IMPLEMENTATION=alternate \
AGENTOS_X402_FEED_RISK=1 \
AGENTOS_DEMO_COMMITTED_SOURCE=1 npm run demo:x402
```

`AGENTOS_X402_DATA_FEEDS=0` 可用于新建的不启用 Feed 的兼容测试实例。重启元数据保存实现和 Feed 开关；持久化目录拒绝静默改变已有 Feed 风控配置。调整风控策略时建立新实例并重新审核报价。

主要验证：`tests/data-feeds.test.mjs`、`tests/x402-data-feeds.test.mjs`、`tests/x402-feed-restart.test.mjs`。包括 6/8/18 位精度、异常时间和价格、脱锚边界、价格快照防篡改、风控前后行为及重启后策略保留。

## 本轮证据与提交

功能源码基线：`4fefe8f183a7bc7f2560fdda81838d9e7446ae45`。完整 demo 实例源码摘要 `d2c52d5c32c5ae8917c2cd4a7e49081cb33d54f08867be24d5651df705c665ef`。浏览器校验器的工作区头修复为 `efa1e47`；后续文档不改变产品实现。

- `8bc5fe3`：广播前持久化与 gas 对账，7 项定向通过。
- `4e1b0a7`：实际 SIGKILL 恢复，1 项通过。
- `ce24f14`：独立实现、四组合兼容及两套 Vault 退款，3 项通过。
- `fbf3219`：采购/报告磁盘失败，3 项通过。
- `7947d21`：Feed 适配器与 Mock，3 项通过。
- `fb8bd19`：报价快照、gas 美元展示与风控，3 项业务和 1 项重启验收通过。
- `4fefe8f`：整栈含 EVM 两个中断点、不同商家路由，2 项定向通过。
- `efa1e47`：价格展示浏览器校验读取正确工作区。

全量 `npm test` **366/366 通过、零跳过**；随后新增整栈重启测试单独通过，合计覆盖 367 个不同用例。严格 lint 0 error / 0 warning，TypeScript 和生产构建通过。新增用例没有替换已有断言。

第二套实现启用 Feed 风控的完整 x402 demo：`outputs/x402-demo-614b4bde-04a0-47f1-8f18-00f0fbbb1157/report.json`，正常交付付款、错误交付退款、丢失响应恢复均通过，含浏览器创建、价格快照、gas 美元证据、中英文及移动端检查。用户托管 3.00 = 支付 2.00 + 退款 1.00 DemoUSDC；上游另付 0.60，采购预留和未结算金额均为 0。首次浏览器校验因 API 请求未携带工作区头失败，记录保留于 `outputs/x402-demo-8f849468-e405-4b01-9936-21a9396ed26e/report.json`，修复后新实例完整重跑。

完整本地 demo **46 个本地执行阶段全部通过**，报告 `outputs/full-demo-fdee06b7-0002-4639-bfb4-7b34bfeb6ee0/report.json`。两个外部 CRE 阶段明确排除，报告 `allStagesPassed=false`，没有记为 48/48。模型由本轮管理器启动 18 次、停止 18 次。

参考实现最终 x402 报告为 `outputs/x402-demo-0b8eda30-9d65-4c63-9e3b-67b901aeef49/report.json`，同样完成三单、价格快照和实际 gas 美元显示的浏览器验收，金额为 3.00 / 2.00 / 1.00，上游另付 0.60。本轮两套实现均完成正向与退款全流程；没有只用单元测试代替最终 demo。

日志、统一结果和 SHA-256 清单位于 `outputs/p1-p2-acceptance/`。`original-preserved.json` 与 P0 验收后备份逐表核对，原 12 张业务表、182 份插件收据和签名身份保持不变，运行中心跳仅正常更新时间；原六个服务均 HTTP 200，9455 仍为 PID 46733，历史链区块锚点不变。原实例源码仍固定于 P0，没有热更新成 P1/P2。

`summary.json` 逐项列出 9 组要求、对应测试和源码摘要；`manifest.json` 固定本轮日志、两套实现的报告和截图，以及完整 demo 阶段日志的 SHA-256。`processes-after-cleanup.json` 确认本轮 18 个临时服务端口、三个模型端口均关闭，18 次模型启动/停止配对。原六个服务和预先存在的 6100 控制器保留。演示的数据库、源码快照与链文件保留，便于复核。

## 保留的边界

原实例继续保留 P0 源码和运行数据，原 9455 内存链不得停止。本轮功能运行于新建的独立实例，不能将 checkout 的更新当作原实例已经升级。完整演示显式排除两个外部 CRE HTTPS 阶段；公网部署、公共链 Feed、生产支付和任意第三方 Facilitator 均不在本轮验收。CCIP 仍未实现。
