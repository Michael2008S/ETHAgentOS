# Sepolia identity acceptance

Run from the repository root in two terminals:

```sh
node scripts/sepolia-console/workspace.mjs
node scripts/sepolia-console/server.mjs
```

The console is http://127.0.0.1:6297. The actual AgentOS API uses port 6397 and a dedicated persistent D1 directory `.sites-runtime/sepolia-identity/db`. Console requests select the fixed `sepolia-11207` sandbox workspace through the normal AgentOS authentication/store APIs. This is a local acceptance workspace, not a deployed public AgentOS service. The identity-only configuration cannot enable escrow funding or settlement.

## Existing Agent 11207

Do not register another identity. Refresh the console and connect the owner of 11207 on Sepolia. Use:

1. **5. 将 11207 文档关联工作区**: one `setAgentURI` transaction to the official registry. The new document names Atlas, includes the actual workspace hash, local agent ID and skill, and self-references 11207. It replaces the earlier standalone acceptance document; previous receipts remain retained checkpoints. Its service URL is local and makes no public availability claim.
2. **6. 签名绑定 11207 到 Atlas**: one personal-message signature, no gas. Review the `AgentOS identity binding v1` prefix, chain 11155111, registry/token 11207, owner, payment wallet, workspace hash, document hash, nonce and five-minute expiry. The real API verifies the current owner signature and live chain state, consumes the challenge, then saves the binding through the D1 CAS store. If it expires, request a fresh signature; no new registration is needed.
3. **7. 保存未注资订单身份预检草稿**: no wallet signature or transaction. The server reads the bound identity, independently refreshes its chain state, and stores an immutable identity snapshot and draft commitment. It creates no `chainOrder`, queue work, funding authorization or payment. Repeating the same request is idempotent. The draft is an identity preview, not an order accepted by a deployed escrow. A fresh real order is required after settlement deployment.

Refresh/read back using **查看工作区绑定和草稿**. Evidence is written under `outputs/erc8004-sepolia-2026-10-23/`: submitted hashes and receipts, workspace binding with signature/challenge, and the identity preview. Do not rerun the earlier standalone-document verifier after changing to the workspace document; its retained report describes the earlier checkpoint.

After all three steps:

```sh
node scripts/sepolia-console/verify-workspace.mjs
```

This independently reads Sepolia and the persisted API state, verifies the binding signature and canonical identity snapshot, recomputes the preview commitment, and saves `workspace-verified.json`.

CRE deployment access, actual workflow/receiver deployment and binding, public immutable evidence hosting, fundable orders, paid reviews and revocation remain pending. No substitute workflow ID, mock forwarder or payment claim is used.
