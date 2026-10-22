# Local business-loop acceptance — 2026-10-22

Public-chain transactions and hosted deployment/scheduling remain deferred. Ethereum USDC data is read-only. All acceptance service payments use an isolated local EVM and test tokens.

## Implemented increments

| Commit | Result |
| --- | --- |
| `5dd8497` | Persist exact monitor proposals, buyer/deployment binding and original request ID across refresh. A lost bound-session response resumes without another transaction. Unknown submissions have an original-hash reconciliation control. |
| `a4b7c45` | Renewal checks the entire reciprocal repair lineage, including a paid successor when the original failed before payment. Resolve/adopt repair before continuing its cursor. |
| `94077cb` | Workbench, details and canonical receipts select the same complete repair lineage; shared paid prefixes count once even before monitor adoption. |
| `8d5442b`, `1b98988` | Bounded read-only RPC retry/failover; refused providers switch to configured alternatives. Preserve the response-size limit and complete provenance verification. Actual primary `403 eth_call` was reproduced; dRPC independently verified the same frozen source. |
| `968e9ca` | Two independent queue workers per drain, four claims maximum, source-scan deadline, scan/failure/lag metrics, per-business dead-job visibility and scoped retry. Existing authority, reservation and CAS fences remain authoritative. |
| `ff75300` | Stopped persistent runtime backup/restore with hashes, no overwrite, separate restoration destination. Legacy evidence archive leaves its original in-memory chain running. |
| `39cd85b` | Local workspace rotation provides fresh retained capacity and preserves old workspaces/ledgers. New permissions and a scoped consumer are required for new background work. |
| `fc004a5` | Current reviewed opinions can seed a fresh bounded AI planning input; this creates no work or permission. |
| `159c676` | Current alert dispositions can prepare a new reviewed monitoring renewal. Creation rechecks the alert evidence/review and its source monitor. |

Tests for each increment were run before its commit. Subsequent harness synchronization/readiness corrections and runtime-restore acceptance are committed separately.

## Two separate complete demos

Both final runs used implementation `1b98988e7ad114b3827d4910bda433082cc331f1` and source snapshot digest `efec5e9ab318495192d0916414afa5688ed1e369e338380ffa719d4823b9f4c1`. Each passed one Chromium test with 17 explicit business checkpoints, in its own new non-current persistent runtime. They were not assembled from failed attempts.

| Mode | Evidence | UTC time |
| --- | --- | --- |
| Captured finalized replay | `outputs/full-business-browser-browser-full-786045e0-d681-4170-ba4e-08664ec778bc.json` | 13:24:45–13:26:23 |
| Live finalized RPC | `outputs/full-business-browser-browser-full-3e6a0e0a-8dc5-4adf-953c-b3a6b4d3fbcb.json` | 13:21:02–13:23:29 |

Each covers: blank workspace; lost authorization-bind response followed by refresh and exact-intent retry with zero additional wallet transactions; explicit wallet rejection; concurrent businesses; intentional RPC outage while independent business execution/refund proceeds; source recovery; stopped partially paid monitor repair; matching workbench/receipt amounts before adoption; repair adoption before renewal; consecutive failed business repairs; full environment stop/resume; verified backup restoration to another directory; human dispositions; renewed cursor; actual local planning and embedding models; unique escrows, final queue and bilingual/mobile UI.

Controlled RPC outage affects only the dedicated loopback test source proxy. Controlled faulty plugins use the supported advanced manifest/program editor. Bounded single-transition API recovery is used to stop a monitor exactly after its paid prefix; this fault scenario is not presented as an entirely click-only business journey. Reviews and financial permissions remain explicit in the browser.

Both runs independently reconcile 11 unique escrow task IDs to 2140 cents funded, 1940 paid, 200 refunded, zero unsettled and zero reserved. Consumer credentials and application sessions are revoked; consumers and test runtimes stop after each run.

The replay uses the tracked two-window historical capture. The live run fetched and reverified real finalized windows 26248322 and 26248323, two outgoing transfers in each, with finality checkpoint 26248334. This proves this bounded live session, including a controlled interruption/recovery, rather than hours of unattended reliability or future address activity.

## Regression and independent cold restore

- `npm test`: 303/303 passed, `outputs/business-loop-tests-final.log`. Local HTTP/EVM/MCP tests require loopback network permission; an earlier sandbox-only run failed on `listen EPERM` and was retained separately.
- `npm run typecheck`: website and CRE TypeScript, `outputs/business-loop-typecheck-final.log`.
- `npm run build`: passed, `outputs/business-loop-build-final.log`; nonblocking bundle-size warning remains.
- `outputs/cold-restore-acceptance-aad6f5f1-73b3-4c67-a4e0-2460a4c44a21.json`: a separate copy of the stopped live runtime was actually started, every canonical business receipt matched, a reviewed opinion produced planning-only input without state mutation, and workspace rotation/switch-back preserved the original ledger. The restored runtime was stopped.
- `outputs/business-loop-final-process-audit.json`: original 6097 PID 46719 retained; all seven retained endpoints HTTP 200; no owned temporary processes, models or inference leases; test/source/model ports closed.

The later `verify-runtime-restore.mjs` commit adds acceptance tooling only. No application implementation changed after the two final browser runs.

## Existing data and operational limits

The current `http://127.0.0.1:6097` is the preserved legacy in-memory chain, not silently converted to persistent storage. Its directory and process were left intact. `outputs/legacy-archive-current.json` identifies an archive of all three SQLite databases, 3714 blocks and 2990 transaction receipts. This is a historical evidence/database archive, not a restartable export of its in-memory wallet/EVM. Do not stop that legacy instance assuming it can use the new restore path.

New isolated instances use persistent chain, database and delivery/signer journals. Backups require a stopped persistent instance; restore refuses an existing destination. Runtime copies may contain local test signer material, so retain the private directory/file permissions.

Retained history is bounded. Rotation preserves history and starts a separate workspace; it does not delete old ledgers or provide unlimited storage. A new workspace needs new reviewed authority and, for background work, its own scoped consumer. The mixed planner remains a reviewed 2–8-step sequential planner with distinct services; this increment does not add a generic branching/looping AgentOS planner. USDC windows remain bounded to 25 transfers and use finalized outgoing logs. A single denser block stops safely without truncation. Power-loss/kill-at-every-transaction crash matrices and prolonged soak testing remain separate acceptance work.

## Reproduce locally

```sh
# Fixed historical data, real local services/payment/model execution
npm run demo:browser-business

# Current public RPC data, real local services/payment/model execution
AGENTOS_BROWSER_LIVE=1 npm run demo:browser-business

# After selecting a successful, stopped full-browser report
node scripts/verify-runtime-restore.mjs outputs/full-business-browser-browser-full-3e6a0e0a-8dc5-4adf-953c-b3a6b4d3fbcb.json

# General persistent backup and restore; destinations must be new
node scripts/runtime-backup.mjs backup /absolute/stopped/runtime.json /absolute/new-backup
node scripts/runtime-backup.mjs restore /absolute/new-backup /absolute/new-runtime
node scripts/demo-isolated.mjs --resume /absolute/new-runtime/runtime.json
```

Development RPC fallback defaults are publicnode, dRPC and the alternative PublicNode hostname. `AGENTOS_DATA_RPC_FALLBACK_URLS` accepts a server-configured JSON array of plain HTTPS endpoints; production has no implicit fallback list. Local replay/live HTTP transports require explicit development configuration and loopback requests. The proxy exposes only bounded read-only data methods and rejects browser-origin control calls.


## Monitor reliability follow-up (2026-10-23)

See [the isolated local monitor acceptance](MONITOR_RELIABILITY_ACCEPTANCE_2026-10-23.md) for the fixed application snapshot, 322 passing tests, separate 17-step replay/live browser demos, actual two-hour live observation, recorded probe gaps, exact receipt reconciliation and preserved-original-instance limitations. Public-chain and hosted deployment are outside this pass.
