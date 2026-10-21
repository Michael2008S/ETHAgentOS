# Reusable CRE order dispatcher

The same registered workflow configuration can now process new AgentOS orders. It fixes only the schedule, network, receiver and evidence origin, instead of a task ID or a particular delivery. Its registered workflow ID therefore stays unchanged as orders arrive.

Use cre/workflow/config.dispatcher.example.json as the template for the existing ignored config.local.json. The old single-task configuration remains supported for historical simulations. The dispatcher is intentionally limited to the configured Sepolia receiver and evidence service; it cannot select arbitrary hosts/contracts from a feed.

## Discovery and verification

The evidence Worker adds a task to a separate ready index only after its immutable artifact is published. The index uses R2 conditional compare-and-swap, holds at most 64 task IDs, and sorts them canonically. Concurrent publication retries cannot create duplicate entries or silently overwrite the index. A full/busy index returns a retryable error; the original artifact and order checkpoint remain recoverable.

CRE derives a slot from its logical runtime time in 30-second intervals and fetches:

```text
GET /v1/11155111/{escrow}/ready?slot={slot}
```

Each batch has at most two tasks. Slots rotate through a stable pending set, so a terminal or unavailable task at the beginning does not hold the whole queue. This is a bounded demo policy, not a production throughput or scheduling SLA. Changing index contents while DON nodes observe it may prevent identical consensus for that tick; the next trigger retries safely.

For each selected task the workflow:

1. Validates the feed envelope, scope, count, duplicate IDs, v2 verification descriptor and exact evidence URL paths.
2. Reads the escrow commitment at a finalized block. An absent/unfinalized, terminal, expired or mismatched task cannot produce a payment report.
3. Rechecks the latest state to avoid knowingly reporting an already settled task while finalized state still lags.
4. Independently recomputes the complete artifact under node consensus.
5. Generates the existing authenticated settlement payload and calls the EVM write capability. A failed transmission/receiver callback is deferred.

One unavailable artifact or bad commitment does not prevent another valid task in the batch from being handled. A malformed global feed fails the tick. Report generation or a successful simulation is never presented as a mined public payment.

## Finality and durable queue acknowledgement

After a payment/refund receipt is verified and saved, public orders retain an evidencePendingAck checkpoint. The runtime rechecks the receipt and waits for its block to be finalized before removing the task from the ready index. While finality is pending it schedules another check in one minute without counting that wait as a consumer failure. The paid/refunded record and the financial state stay intact.

POST /v1/complete requires the private writer credential and original specification hash. It records an immutable archive marker and updates the operational index; it does not delete the input, artifact or manifest. Concurrent/late publication retries cannot resurrect archived tasks. An acknowledgement outage leaves a durable order job to retry, including after the workflow itself has completed. The service trusts the authenticated runtime's chain check; its archive endpoint is not an independent chain-proof verifier.

This uses the same finalized-state assumption as CRE. It does not implement continuous monitoring after finalization or repair a consensus-level finality failure. Those broader operational boundaries remain separate.

## Validation commands

- npm test: protocol, actual workerd/R2 index concurrency, EVM receipt/finality/acknowledgement recovery and existing regressions.
- npm run test:cre: the official SDK's Bun TestRuntime/capability harness runs the actual handler. It checks correct/incorrect deliveries, new tasks under unchanged config, finalized/latest state, expired/unavailable tasks, callback failure and host escape refusal. These are mocks of capabilities, not DON execution.
- npm run cre:cli-build: official CLI/Javy builds both modes into the same WASM. The SDK handler is in handler.ts; the entry exports only the expected runner/init functions. Website and CRE type checks stay separate because the CRE SDK deliberately marks ordinary fetch as unavailable.
- npm run demo:cre: the original five single-task HTTPS/CLI dry-run cases.
- npm run demo:cre-dispatcher: builds WASM, runs SDK tests, then uses an actual temporary HTTPS tunnel, bundled workerd/R2 service and private local EVM. Requires the official cloudflared binary on PATH, AGENTOS_CLOUDFLARED_BIN, or the ignored checkout-local tool path. Install from [Cloudflare's official instructions](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

The dispatcher demo publishes only generated synthetic data. It funds before executing, commits/publishes the delivery, and runs three official CLI simulations with an unchanged config: two ready orders, terminal orders before archive, and a newly created order. Each dry-run is checked to leave the chain Funded. Separate local test-forwarder callbacks then exercise real local payment/refund and canonical receipt recovery. The temporary gateway forwards only the fixture evidence Worker, never the workspace or wallet RPC. Its writer token and ephemeral wallet key remain in process memory; logs redact both. Owned fixture processes are closed after the run.

Current evidence: outputs/cre-dispatcher-ea77bbde-f05a-4b35-b1ef-58572be7626b.json. It has explicit separation between CLI dry-runs and local test callbacks. The synthetic workflow ID is not a registered identity. Original single-task regression: outputs/cre-demo-955657a1-dc36-465c-a2ce-29badc3b78d2.json.

## Remaining public acceptance

The reusable dispatcher implementation and local/CLI checks do not complete roadmap item 5. Actual evidence hosting, Sepolia contracts, a browser wallet, deploy access, a registered DON workflow and real production-forwarder execution IDs/receipts are still required. Item 6 and the final complete demo remain open. The final local runner includes this dispatcher check and now has 21 steps; its final run has not been claimed here.
