# Original 6097 instance: component recovery, 2026-10-23

Both reported faults are repaired and validated on the original instance. No whole-environment restart, public-chain transaction or hosted deployment was performed in this pass.

## Diagnosis and recovery

**Workspace HTTP 500.** The running development worker threw at `env.__VITE_RUNNER_OBJECT__.get(...)` because its internal runner binding was undefined. A normal configuration reload had not repaired it. The recorded old/current/installed versions of Cloudflare Vite plugin, Vinext, Vite, Miniflare and workerd match; dependency upgrades are therefore not an established cause. The precise hot-reload trigger was not reproduced. The established failure is an invalid running worker binding.

The local repair recreates only the web process and its development worker, retaining the original database directory and origin. It runs directly through Vite against a verified committed source snapshot with source watching/HMR disabled. Subsequent checkout edits cannot reset that web worker through shared-source watching. This repairs the running instance without claiming a general fix for every upstream hot-reload defect.

**Plugin health HTTP 503.** The plugin's integrity guard compared live shared files with its boot digest and correctly refused a changed source tree. Disabling that guard or restarting against a new revision would silently change execution commitments. The original source snapshot's calculated revision exactly matched the old runtime, so the component was restarted from that snapshot, with its original journal and delivery identity. Revision remains `agentos.quickjs-mcp.v1:9b9c48b4097529e22de78616170aa72849eb4d7441089f5bcde8c44e3c27baf5`. All **179 existing journal receipts** remain byte-for-byte unchanged, and the delivery signer is unchanged.

**Safe supervisor handoff.** The old supervisor shut down every child when any one component exited. Ending web/plugin first would therefore destroy the in-memory chain. Recovery first verifies listener ownership, checks no plugin execution is in flight, creates three consistent SQLite backups, prepares source, and opens a private control socket. Only then does it freeze and retire the legacy supervisor without invoking its all-child shutdown handler. A component manager adopts the existing services and replaces web and plugin separately. It has no chain restart command. Its control socket is owner-only and fits macOS Unix socket path limits. The first attempt failed on an overlong socket path before any original process was stopped; that was corrected and tested.

## Preserved state and final checks

- Same runtime/data directory: `.sites-runtime/isolated-demo/691195a9-415d-46ee-b210-0bf613603444`.
- **All 411 pre-existing workspace rows compare exactly equal**, including revision and serialized data. Two test workspaces were added; none of the original rows was deleted or rewritten.
- Original in-memory chain PID **46733**, MCP **46758**, supplier **46757** and second supplier **46756** are retained. Contract configuration/addresses match the before-recovery baseline. Demo transactions advance this same local chain normally.
- Recreated web PID **35616**, plugin PID **35976**, component manager **32460**. The faulty original web/plugin processes and retired supervisor are not left running. The original worker remains active.
- Final probes: workspace 6097, plugin health/catalogue 6098, chain 9455, MCP 6099 and both suppliers return **200**.
- Web application snapshot: commit `f7374efcf7483a4f529e2138741f8fe8c33a6228`, digest `a9609bd4291c341e3a5c560401de7d16ba8aa5cdd060bdc13edfeee03a4f5de4` (726 files). Later recovery-script/document commits do not modify this application snapshot.

This supersedes the earlier monitor-acceptance report's observation that the preserved 6097 instance remained unhealthy. The separate two-hour monitor acceptance is not rerun or relabeled as a 6097 test here.

## Validation on 6097

- Recovery tests: **3 passed** — chain/foreign-target refusal, preservation of original database/journal/origin/endpoints, short and distinct private socket paths.
- Complete business demo: **8 scenario groups passed**, including two simultaneous businesses, interrupted authorization recovery, failed delivery/refund/remaining-step repair, human review, continuous finalized USDC monitoring, consumer restart and subscription renewal, source-linked memory and canonical receipts.
- **7 unique escrows**, **1480 funded / 1380 paid / 100 refunded** local token cents; zero unsettled/reserved amount and zero pending/leased/dead test queue entries.
- Browser acceptance: **2 passed** — reviewed policy survives refresh and decimal threshold preparation grants no authority; paid repair timeline/receipt and bilingual human disposition persist correctly.
- Test consumer exited, its credential was revoked, and **4 test vault sessions** were revoked. Existing servers, chain and component manager remain available; no additional preview, model or chain server was started for browser testing.

The browser configuration intentionally has no `webServer`; it cannot launch or stop existing services. Neither this business demo nor its browser checks terminate or restart the original in-memory chain. This turn did not rerun the prior 322-test suite or the prior 17-step isolated-runtime demos; the listed checks are what ran after this component repair.

## Evidence and commands

- `outputs/original-6097-recovery-before.json`
- `outputs/original-6097-web-recovery-check.json`
- `outputs/original-6097-plugin-recovery-check.json`
- `outputs/local-business-loop-a930b44d-bf82-4530-a583-0eb1d4862723.json`
- `outputs/original-6097-browser-results.json`
- `outputs/original-6097-recovery-final.json`
- `outputs/original-6097-recovery-evidence.json` (SHA-256 manifest)

Backups, source snapshots and recovery logs remain under the runtime's `component-recovery-*` directories. Do not overwrite the original plugin snapshot or its journal: existing jobs bind its revision and signer.

```sh
# Component-level recovery through the live adopted manager; never restarts chain.
node scripts/local-component-recovery.mjs .sites-runtime/isolated-demo/current.json web
node scripts/recover-local-plugin.mjs .sites-runtime/isolated-demo/current.json

AGENTOS_TEST_URL=http://127.0.0.1:6097 \
AGENTOS_CHAIN_URL=http://127.0.0.1:9455 \
node scripts/demo-local-business-loop.mjs

# Supply the passed report emitted by the preceding command.
AGENTOS_BUSINESS_REPORT=outputs/local-business-loop-a930b44d-bf82-4530-a583-0eb1d4862723.json \
AGENTOS_TEST_URL=http://127.0.0.1:6097 \
PLAYWRIGHT_BROWSERS_PATH="$PWD/.sites-runtime/playwright-browsers" \
node node_modules/@playwright/test/cli.js test --config playwright.original-business.config.mjs
```

Repair commits: `48703b0` (safe component handoff and web recovery), `853e4e6` (matching-revision plugin recovery with preserved identity/receipts).
