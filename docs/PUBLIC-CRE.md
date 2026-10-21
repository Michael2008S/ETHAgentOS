# Public CRE receiver, evidence and reconciliation

This is implementation progress toward roadmap item 5. **No public testnet transaction, wallet-extension acceptance or DON execution is claimed.** The account's last verified deployment access was `no`; the public workflow and operational acceptance gates remain open.

## Receiver compatibility

The previous AgentEscrow compares the entire supplied metadata hash. Its behavior remains available for existing local deployments. New compilations also advertise ERC165/IReceiver support. Already running contracts are not upgraded by source changes.

`AgentEscrowReceiver` is the public-network variant. It accepts the production 64-byte metadata layout: 32-byte workflow ID, 10-byte encoded name, 20-byte owner and two-byte report ID. It strictly checks the sender, ID, name and owner; the report ID may vary. Name encoding follows the CRE engine: SHA-256 the configured name, take the first ten hex characters, and encode those ASCII characters as bytes10. See [Chainlink's consumer contract guide](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts).

Deployment has two phases to avoid a circular dependency between the receiver address in workflow configuration and the final workflow ID:

1. Deploy the receiver with the actual forwarder, workflow owner and encoded name. No tasks can be funded yet.
2. Register the workflow containing that receiver address, obtain its actual workflow ID, then have the receiver deployer call bindWorkflow once. A zero ID, another caller or any second binding is refused.

After binding, all identity fields are fixed. Changing the registered workflow ID requires a new receiver deployment; existing escrows keep their original terms. The SDK validates interface support and the onchain binding before preparing funding. In receiver mode, metadataHash commits the immutable encoded name and owner; the separately pinned workflowId is verified too. Public wallet configurations require the receiver descriptor. No old funded commitments are rewritten.

```json
"receiver": {
  "format": "cre-v1",
  "workflowId": "0x<actual registered workflow ID>",
  "workflowName": "0x<10 encoded ASCII bytes>",
  "workflowOwner": "0x<actual CRE workflow owner>"
}
```

Use sdk/cre-receiver.ts to compute the name/identity hash and construct the unsigned bind transaction. Private keys remain in the wallet. The deployer's wallet and CRE workflow owner can differ. The test MockCREForwarder checks the receiver callback/interface only; it does not verify DON signatures and must not be used as public execution evidence.

Public Vault escrows now have at least a one-hour chain window, independently of the default five-minute adapter execution timeout. CRE reads finalized blocks; a short execution timeout must not also expire the payment contract before those reads can observe its funding. This is a bounded demo policy, not a guarantee that a stalled network will finalize within an hour. Existing committed funding deadlines are preserved.

## Evidence service

services/evidence/worker.ts is a separately deployable R2-backed service. Its writes require a server-only Bearer token and reject browser Origin requests. Public reads contain only explicitly published input/artifact bytes. It does not share the private Sites workspace API or expose that API's credentials.

- POST /v1/drafts freezes a task's input hash, v2 specification and URLs.
- POST /v1/artifacts publishes a task-bound artifact against the original specHash.
- GET /v1/11155111/{escrow}/dataset/{hash} reads exact input bytes.
- GET /v1/11155111/{escrow}/artifact/{taskId} reads a ready artifact. Missing artifacts return an uncached 404.

Every write uses an atomic R2 If-None-Match condition. Identical retries succeed; conflicting bytes return 409 and cannot overwrite the original. There is no write-side delete API. This is application immutability backed by trusted storage administration, not protection against an operator deleting or replacing the underlying bucket outside the service. Committed hashes still prevent changed bytes from passing acceptance.

Configure the service's PUBLIC_ORIGIN and ESCROW_ADDRESS using services/evidence/wrangler.example.json as a template. Provision its bucket, use an ignored wrangler.local.json, and set WRITE_TOKEN through secret management. Never put that token in vars, URLs or browser configuration. The template alone does not deploy a service. A custom publicly reachable HTTPS host and actual deployment are still required.

The AgentOS server uses AGENTOS_EVIDENCE_CONFIGURATION and AGENTOS_EVIDENCE_WRITE_TOKEN. With a valid public-chain configuration it publishes input before creating/funding the order and publishes the exact committed settlement artifact after execution. The client anonymously reads back the exact bytes, rejects redirects, different URLs/specifications and oversized responses, and never sends the write token on public reads. The same adapter supports two-step workflows. Without this configuration the existing manual single-order evidence URLs remain available; automatic public workflows refuse to proceed.

The wallet page displays a public-data notice when automatic publishing is enabled. SDK callers must likewise treat creation as permission to publish those bytes. Existing local default behavior does not publish to an external service. The R2 service and public application configuration have not been deployed in this item.

## Confirmed receipt discovery

The runtime can now discover external payment/refund events without a pasted hash. It queries only confirmed blocks for the exact escrow/task in bounded windows (at most four ranges of 2000 blocks per tick), preserves its cursor in D1, and resumes from it. Each scanned range is anchored to a canonical block hash. If that anchor changes or the chain moves behind it, discovery restarts from funding; it does not skip replacement-chain events.

An event candidate is never treated as proof by itself: the existing full receipt, parties, amount, specification, canonical block, confirmation and output checks still run before updating the order. Concurrent results are fenced against the saved cursor. Discovery never signs a transaction or fabricates a report. Once an order is terminal, this is not continuous reorganization monitoring; that operational requirement remains open.

## Current evidence and remaining gates

Local tests cover real compiled contracts, ERC165 callback delivery, one-time binding, wrong identities/senders/lengths, varied report IDs, replay refusal, rejection and deadline refund. Discovery tests execute a real local payment/refund and an EVM snapshot/revert that invalidates a saved scan anchor. R2 tests run the bundled service inside actual workerd with its R2 binding, concurrent conditional writes, conflict refusal, credential separation and anonymous readback. None of these tests is a public DON execution.

The current CRE main.ts still has a single taskId/configuration. A reusable public order dispatcher/trigger is still needed before one bound workflow can process newly created orders without changing its registered ID. Do not deploy a new per-order workflow and assume the already bound receiver accepts it.

Item 5 still requires an actual public evidence deployment, funded Sepolia wallet and contracts, registered reusable workflow, actual forwarder payment/refund receipts and DON execution IDs. Item 6 and the final complete demo remain required. Account approval alone will not prove these gates.
