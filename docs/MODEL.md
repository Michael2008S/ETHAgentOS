# 模型工具规划

预注资订单可以选择 `llm`。模型返回工具名称，服务端逐项检查技能 capability，并要求 `dataset.read → artifact.write`；随后运行确定性分析和独立复核。模型没有钱包私钥、付款权限、shell 或策略修改权限。当前仅支持这两个内置分析技能，不是任意代码执行平台。

## 本地运行

```sh
npm run model:setup
npm run model:local
```

保持模型终端、`npm run chain:local` 和端口 5177 的网页服务运行。在「钱包与托管」连接本地测试钱包，创建预注资订单，选择「大模型工具规划器」，固定输入后注资并授权。

`npm run demo:model` 在独立工作区实际验证正常、恶意标题和中断恢复；`outputs/model-demo-*.json` 保存模型计划、用量、哈希、EVM 交易和防重放结果。恶意标题若诱导出越权操作，应拒绝并退款；合法计划可以正常交付。测试不要求所有提示注入都被模型自身识别，能力检查负责最终边界。

自动安装支持 macOS arm64。下载来自官方发行源，固定版本并验证 SHA-256，约 503 MB，全部位于忽略的 `.sites-runtime/model/`，不会打包发布。其他平台可从官方安装 llama-server，并用 `AGENTOS_LLAMA_BIN`、`AGENTOS_MODEL_PATH` 指定路径。

| 工件 | 固定版本 | SHA-256 |
| --- | --- | --- |
| llama.cpp macOS arm64 | b11669 | `dbed55493d72bc1ba2babc8770d669c2289b5bc4ee9fb2a4dfc158d45b7d13fd` |
| Qwen2.5-0.5B-Instruct Q4_K_M | 仓库修订 `9217f5db79a29953eb74d5343926648285ec7e67` | `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db` |

官方源：[llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/b11669/tools/server/README.md)、[Qwen 模型](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF)。本地服务仅监听 `127.0.0.1:11435`，使用 CPU；不会创建账户或调用收费服务。

## 托管提供商

生产环境没有本地模型默认值。通过服务端配置 `AGENTOS_MODEL_CONFIGURATION`：

```json
{"url":"https://your-provider.example/v1/chat/completions","model":"your-model","revision":"your-pinned-revision","timeoutMs":30000,"maxTokens":128}
```

若提供商需要凭证，用独立服务端 secret `AGENTOS_MODEL_API_KEY`；不要把凭证放入 URL、该 JSON、浏览器或源码。协议要求 chat-completions、结构化 JSON 输出、停止原因与 token 用量。未配置时网页禁用大模型选项。HTTPS 提供商尚未实际验收，本轮发布保留未配置状态。

模型接收标题、技能、数据集标识和区块范围，不接收原始转账记录。输出上限 64 KiB、128 token（配置上限 512），请求默认 30 秒（上限 60 秒），重定向不跟随。错误响应和网络异常不会把提供商响应、地址或凭证写入订单。

## 授权与恢复

创建订单固定规划器和模型配置哈希，买方签名绑定该描述。确认注资后，D1 CAS 获取 65 秒租约，避免正常并发重复推理。模型返回后重新检查权限和期限，晚到的旧租约、已取消订单的结果不能继续执行。已持久化计划可直接恢复，不重复调用模型。

进程在模型响应前后崩溃时，租约过期可能重新请求推理；请求携带稳定 Idempotency-Key，但具体提供商未必支持，不能声称云模型计费严格一次。链上结算使用既有不可变请求和交易对账防重放。模型不可用、输出格式错误、越权操作或配置发生变化时停止技能执行，走退款路径；不会静默换成确定性规划器。

订单导出保存模型描述、操作、提示和响应内容的摘要、用量与完成 ID 摘要；不保存原始提供商响应、完成 ID 或凭证。摘要用于本地审计，不等同于模型提供商签名、链上 AI 推理证明或 CRE DON 证明。最终金额仍由确定性适配器和验证器计算。

## 付款前采购建议

`POST /api/purchase-plan` 是独立的只读建议入口。Qwen 判断最低价、资金分配报告或事件摘要意图，以及内置/已授权供应商执行方式；服务端从当前允许的技能、预算和真实报价中选择候选。无合法候选或模型格式错误时返回错误，不静默替换模型结果。

建议不创建订单、不执行技能、不签名或转账；点击采用后仍需用户创建、注资和授权，运行时会再次检查价格、身份及能力。小模型分类可能不准确，用户需审核建议。`npm run demo:planning` 验证真实模型的两个不同目标、工作区无副作用以及 URL 注入拒绝。建议日志中的摘要不等同于模型提供商签名或链上证明。
