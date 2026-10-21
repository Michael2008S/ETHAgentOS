# Bounded AgentVault purchasing

## Authorization and money movement

The configured Vault is owned by the buyer. The owner deposits tokens, allows the configured seller, and grants the configured executor a per-purchase limit, UTC daily limit and expiry. Each grant or revocation increments `grantEpochs`; re-granting identical limits cannot revive an old session.

The owner then signs one workspace session. The signature binds chain, escrow, token, seller, owner, Vault, executor, epoch, skills, limits, expiry and workspace scope. Sessions last at most 24 hours. These setup transactions and the session signature are distinct wallet actions; this is not a claim of a single transaction or account-abstraction batching. Subsequent purchases reuse the bound session without an owner signature for each order.

Orders keep the human buyer and Vault payer separately. `Opened.buyer` and refunds identify the Vault; the immutable Vault owner identifies the authorized human. Signature-bound supplier requests can also distinguish the payment buyer from the task namespace owner. Identity feedback remains attached to the original human buyer with the actual Vault payment proof.

The workspace reserves the immutable quote against the session total, and reserves the requested budget against the workspace daily policy before contacting an executor. Refunded funded orders still consume the session allowance and the onchain daily allowance. Unsigned, unsent cancelled drafts release their reservation. The owner can withdraw unused Vault funds to the owner wallet.

The session total and the onchain UTC daily cap are separate signed limits. The daily cap includes purchases under earlier grants today and is never reset by granting or revoking a session. The SDK defaults the daily cap to the session total when omitted; the form exposes both. A larger daily cap does not expand the signed session total.

## Execution and recovery

The `funding` order checkpoint is queued atomically with workspace state. The runtime commits a fixed escrow intent and a 90-second funding lease before sending anything. It checks canonical Vault ownership, matching contracts, grant epoch/limits, seller authorization, balance and daily spend. Existing onchain funding is reconciled through its `Opened` event before another send is considered. A mined transfer can be recovered even if the session was subsequently revoked; this does not authorize another transfer.

Lost responses are not treated as proof that no money moved. A committed in-flight funding intent stays recoverable. It cannot be cancelled as an unfunded order merely because an RPC response was lost. After a coherent chain snapshot proves the original funding deadline passed with no escrow, it can terminate safely. The task ID prevents duplicate principal transfers; this does not promise that every external request or possible gas charge is strictly once.

Revocation prevents new funding. Already funded escrows follow their original settlement/refund conditions and current execution policy, rather than retroactively changing committed contract terms.

## Interfaces

- `GET /api/vault`: owner-scoped session history and current canonical Vault balances/limits.
- `POST /api/vault`: prepare, bind, or revoke a workspace session; signatures and onchain grants are rechecked.
- `POST /api/orders` with `vaultSessionId`: freeze an authorized purchase and queue automatic funding/execution. Clients cannot provide a Vault address or executor key.
- `sdk/vault.ts`: owner deposit/grant/sign/revoke/withdraw methods. The SDK verifies the server deployment and challenge before signing.
- The wallet page provides a Vault panel and a distinct funding-source selector. Restoring a draft does not silently replace its funding source.

Public execution additionally requires a trusted deployment and the server-only `AGENTOS_VAULT_EXECUTOR_PRIVATE_KEY` matching the configured executor. This secret is never passed to the browser, model, order export or supplier. Public-chain executor operation and multi-instance nonce coordination belong to the public/hosted acceptance gates; the presence of a sender implementation is not deployment evidence.

## Local verification

`tests/vault-orders.test.mjs` uses actual compiled contracts and EVM transactions: one signed session, two payments, one rejected-delivery refund to Vault, total-cap refusal, mined-response-loss recovery and old-epoch rejection. Policy tests cover owner/skill/budget/expiry/revocation, draft reservations, funding leases and the workspace daily cap before RPC calls.

`npm run demo:isolated` creates separate ports, database, supplier state and recognized Vite cache directories while preserving the existing demo. Vinext's supported `VINEXT_NO_DEV_LOCK` permits this second instance. A source-only snapshot records its inputs; credentials and runtime state are excluded. The current runtime manifest is `.sites-runtime/isolated-demo/current.json`.

For the Vault-specific API/browser check only, `AGENTOS_DEMO_SKIP_IDENTITY=1 npm run demo:isolated` avoids unused identity deployment. **This mode cannot satisfy the complete demo.** The full-demo runner explicitly requires identity-enabled services when given `--runtime`.

`npm run demo:vault` tests actual HTTP/D1/queue/SDK/EVM purchasing against the isolated instance, including cross-workspace refusal and refund accounting. It uses one signature for the primary purchases, then a separate grant to test revocation while capacity remains. Evidence goes to `outputs/vault-demo-*.json`.

The script records the existing Vault balance and daily spend before depositing its test amount. Repeated runs preserve both histories and compare balance deltas; they do not reset the chain. Browser regression targets the same environment with `AGENTOS_TEST_URL=http://127.0.0.1:5187 AGENTOS_CHAIN_URL=http://127.0.0.1:8555 npm run test:browser`. For the final full demo, use identity-enabled services and `npm run demo:full -- --runtime .sites-runtime/isolated-demo/current.json`.

Current acceptance: 91 automated tests, six Chromium regressions, TypeScript checks and production build passed. Actual HTTP/D1/queue/SDK/EVM acceptance is recorded in `outputs/vault-demo-2cf1fc72-aa6c-49fe-ba10-068b4bfec741.json`, including prior daily spend and nonzero starting Vault balance. `outputs/validation-vault-2026-10-21/` retains raw logs and summary. Public deployment and the final complete demo remain separate gates; see ROADMAP-IMPLEMENTATION.md.
