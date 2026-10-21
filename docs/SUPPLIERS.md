# 独立技能供应商

预注资订单支持独立 HTTP 技能执行进程。协议提供 `event-analysis`、`treasury-report` 和通过受限定义安装的版本化扩展技能，可由服务器配置 HTTPS 供应商；当前实际验收的是单独运行在本机的参考供应商，尚未验收远程 HTTPS 服务。新技能安装、权限及独立验收见 [SKILL-ONBOARDING](SKILL-ONBOARDING.md)。

## 本地演示

分别保持以下服务运行：

```sh
npm run dev -- --host 127.0.0.1 --port 5177
npm run chain:local
npm run model:local
npm run supplier:local
```

1. 智能体页连接供应商钱包，注册并绑定 Atlas 的 ERC-8004 身份。
2. 展开「技能供应商授权」，查看交付签名地址、版本及配置哈希，授权所选供应商。
3. 钱包页连接买方钱包，创建预注资订单；规划器可选真实 Qwen，技能执行服务选择「独立技能供应商」。输入记录会在确认注资后发送给该供应商。
4. 注资并授权执行。查看供应商签名交付、请求/成果哈希、任务标识、调用次数与付款凭证；支持错误交付、中断恢复和能力拦截场景。

`npm run demo:supplier` 在独立工作区执行 13 组实际 HTTP/D1/EVM 场景，包含真实 Qwen、两个独立技能、错误结果、伪造签名、响应丢失、服务离线、取消及两种撤权。结果保存在 `outputs/supplier-demo-*.json`。

供应商进程重启后，可以执行 `node scripts/test-supplier-journal.mjs outputs/supplier-demo-<id>.json`，验证相同已付款订单返回原签名成果、没有新增日志任务。该命令只检查恢复结果；必须先实际重启自己启动的供应商进程，才能将结果作为重启证据。

## 授权和交付

供应商使用独立交付签名密钥，生成于忽略的 `.sites-runtime/skill-supplier/signer.json`，权限 0600。它不持有测试链供应商钱包私钥。注册身份持有者通过官方 `setMetadata` 写入 `agentos.supplier.v1`，值为 ABI 编码的 `(address deliverySigner, bytes32 configurationHash)`。配置哈希绑定服务标识、版本、地址、技能和资源限制。

开单时，服务端从可信 RPC 核验身份与该 metadata，固定供应商描述及身份快照；买方签名承诺涵盖这些字段。输入未注资时不会发送给供应商。调用前、接收后、最终付款授权前重新核验链上委托；当前 D1 权限和期限也逐次检查。取消或撤权后的晚到成果不能继续写入输出或触发新付款。

请求是严格的 `agentos.skill-request.v1` JSON：包含链上任务 ID、原始输入及其摘要、技能、有限工具操作、托管和注资交易、身份引用、供应商描述及演示场景。供应商只处理已注资、买卖双方及金额匹配、数据承诺匹配、身份委托有效的请求。不会获取调用方提供的其他 URL 或执行脚本。

供应商单独使用 BigInt 累加和收款方映射计算结果，没有调用 AgentOS 的 `expectedOutput()`。交付是 `agentos.skill-delivery.v1`，包含请求哈希、配置哈希、稳定 job ID、成果、成果摘要与时间，使用 EIP-191 签名。AgentOS 严格解析、恢复签名地址、复核所有承诺，并用自己的实现重算结果，最后复用现有托管验证与结算流程。签名证明交付来源和内容完整性，不能证明任意研究结论正确。

## 恢复与失败

D1 CAS 获取 65 秒执行租约，正常并发只发送一个请求。稳定 job ID 绑定 chainId、escrow、链上任务 ID 和配置哈希；供应商对冲突请求返回 409。成功成果先写临时文件、fsync 再原子重命名，日志只保存请求摘要和签名成果，不保存原始转账记录。

响应丢失时重试同一 job，返回原签名成果。重启进程后读取相同签名身份与日志。日志提交前的进程崩溃可能再次计算，因此只保证已提交成果的幂等恢复；没有声称任意外部副作用严格一次。多实例供应商需要共享持久 job 存储，本地文件示例面向单进程。

网络错误/限流/5xx 会保留执行检查点，单次后台调用有限重试，可由恢复 API、本地 worker 或再次同步继续。权限撤销、签名或数据承诺错误、独立复算失败会进入退款路径。成功成果已保存后，结算只需重新核验链上委托及原成果，不依赖供应商服务继续在线。最终不可变结算请求提交后的恢复仍遵守原有链上对账规则。

每次授权与付款检查都有相应链上/D1 检查点，尚未提供跨链状态与数据库的原子交易，也未实现持续重组监控。迟到响应不会撤销已经提交的链上结算。

## HTTPS 服务配置

生产环境无本地默认供应商。通过服务端 `AGENTOS_SUPPLIER_CONFIGURATION` 设置：

```json
{"url":"https://skills.example/v1/execute","id":"my-supplier","name":"My supplier","revision":"1.0.0","signer":"0x1111111111111111111111111111111111111111","skills":["event-analysis","treasury-report"],"timeoutMs":30000}
```

这里的地址仅为格式示例，必须替换为真实服务的交付签名地址。若服务需要认证，将凭证单独配置为服务端 secret `AGENTOS_SUPPLIER_API_KEY`；不会写入订单、浏览器、请求 JSON 或交付日志。供应商需按协议实现稳定 job、签名、注资核验和客户端认证。该协议接入的是受限技能服务，不授予远程进程任意工具或钱包执行权限。

HTTPS 端点固定在服务端配置中，不接收买方自定义 URL。拒绝嵌入 URL 的凭证和 query/hash，不跟随重定向；请求默认 30 秒、上限 60 秒，响应上限 64 KiB。服务错误内容、URL 和认证头不会回传到工作区错误记录。

`GET /api/suppliers` 仅向当前 owner 返回公开供应商描述；`sdk/agent-identity.ts` 提供授权/撤销与链上读回；`sdk/orders.ts` 使用 `executor: 'supplier'` 选择已配置供应商。改变密钥、地址或配置后需要身份持有者重新授权，新订单会固定新的描述。

本地服务只监听 `127.0.0.1:7461`，拒绝浏览器 Origin 请求。`/testing` 与 `/stats` 仅用于此本地示例的故障注入和验收，不应暴露公网。公开部署仍需真实 RPC、注册表、HTTPS 供应商配置和相应服务认证；当前私有站点保持未配置状态。MCP/A2A 发现、通用第三方代码沙箱和生产 SLA 仍是扩展。


The runtime also supports 1–8 configured suppliers, exact per-order descriptor routing, per-provider authentication and independent registry payment wallets. The historical default descriptor remains available. See [MULTI-SUPPLIERS](MULTI-SUPPLIERS.md) for the current directory/API/SDK, multi-payee Vault sessions and the separate pending automatic-fallback work.
