# Local monitor reliability acceptance — 2026-10-23

Status: isolated local acceptance passed. The preserved original 6097 instance remains unhealthy and is explicitly excluded from this acceptance result.

## Scope and preserved environment

This pass repairs local business-loop reliability. Public-chain transactions and hosted deployment remain deferred. Ethereum finalized data is read from public RPC; settlement, test-wallet signatures, funds and contracts run on an isolated persistent local EVM. No public-chain payment is implied by a live data read.

The original 6097 instance, original in-memory chain at 9455, current-runtime metadata and existing business data were retained. Tests create separate workspaces and persistent runtime directories, and revoke only their own credentials and grants. Snapshot, backup, failed-attempt and receipt evidence is retained.

## Changes delivered in order

| Change | Behavior and focused evidence | Commit |
| --- | --- | --- |
| Temporary runtime failure | UNAVAILABLE keeps the monitor, checkpoint and original limits eligible for retry; authoritative forbidden/conflicting context remains terminal | `3bb993b` |
| Fallback and empty-window consistency | Each endpoint proves chain ID and the same pinned finalized block/hash; empty windows recheck boundaries before committing their cursor | `05d59e4` |
| Oversized response handling | Raw-body and provider range limits halve the window repeatedly, never truncate; a single block that remains too large stops safely at its saved cursor | `cdc1c55` |
| Parent/child recovery | One queue driver owns monitor-generated child work; report failures propagate, revision races reread under the same lease, runtime failures remain visible | `618e11c` |
| Sustained monitoring health | Quiet successful scans remain healthy; stale scans and stalled finalized heads are reported separately | `3ad97f9` |
| Confirmed-funding crash | Opt-in one-shot SIGKILL occurs immediately after confirmed funding, with a durable consumed latch and public transaction evidence | `1ce743c` |
| Actual two-hour acceptance | New finalized windows, quiet scans, 20 real failed retries, quiescence, scoped retry, credential handoff and concurrent business | `77fa139` |

The opt-in crash mechanism is disabled outside the explicit local test environment. Queue repair does not broaden authorization, reset paid business prefixes or create new grants implicitly.

## Reproducible code and validation boundaries

Application snapshot: `66cd2085718f34a8b6812811cbffc8dac814dd3f`.

Application SHA-256 digest: `1178a70aa27ae73df4384c22ad72a950e140c902c7e25834c924d3d9c389ab64` (686 tracked source files).

Snapshot directory: `.sites-runtime/isolated-demo/acceptance-code-8df7b7f0-edf1-4e46-9707-dfe8f3ce035d/source`.

Both native services and the web preview execute the verified source copy. Restart uses the same source and copied backups include it. The Vite root and filesystem access rules are configured before the deny matcher is compiled. Dependencies are shared through the existing node_modules installation; no dependency upgrade is part of this acceptance.

This isolation was necessary because a separate development session changed shared source and package metadata while an earlier long observation was running. Current repository HEAD can therefore be newer than the application snapshot tested here. The snapshot is the implementation being accepted, not an unqualified claim about every concurrent change.

Browser test driver overlay: `bcc552b`, digest `19390add6c3cab2ab78c26e6e402b874e54bec5cae07ef43df16888392d9590c`. It waits for actual model readiness instead of matching static text while the model is still loading. Application files remain unchanged.

Live observer overlay: `c150727`, digest `3c3406ab7f1ad7ce5d87486ddcb67183fdc8a1b9f0286b555803ac6725e77d35`. Read-only GET probes retry transient transport/429/5xx failures with bounded delays. Observation gaps and retries are recorded and reset the consecutive healthy-quiet interval. Authorization errors, invalid successful JSON, writes and business errors are not silently retried. The final source scan must still be fresh, runtime failures recovered and the dead queue empty.

Overlay manifests: `outputs/monitor-reliability-driver-overlay.json`, `outputs/monitor-reliability-observer-overlay.json`.

## Completed short validation

- Full application snapshot suite: **322/322 passed**, zero skipped/cancelled/failed. Log: `outputs/monitor-reliability-final-tests.log`.
- Web and CRE typecheck: passed. Log: `outputs/monitor-reliability-final-typecheck.log`.
- Production build: passed. Log: `outputs/monitor-reliability-final-build.log`.
- Additional observer tests: 3 passed, covering bounded transient GET retries and refusal to hide permissions or invalid JSON.
- Sample-replay browser demo: **17/17 passed**, `outputs/full-business-browser-browser-full-f88219a8-cba1-4e7c-99bf-658c3d5d54f6.json`.
- Live-source browser demo: **17/17 passed**, `outputs/full-business-browser-browser-full-83f024f3-680b-4ad6-82fb-fb012e632a30.json`.

Each browser demo starts from a blank workspace and covers authorization rejection/retry, refresh after a lost bind response, concurrent businesses, all-source gateway outage, repeated repair failure/refund, durable backup plus whole-runtime restart, repair adoption, monitoring renewal, real local planning and memory retrieval, receipts, Chinese switching and mobile layout. Each reconciles eleven distinct escrows: 2140 funded, 1940 paid, 200 refunded, zero unsettled/reserved local token cents. Its test runtime is stopped afterward. The backup copy is restored and integrity-checked in a separate directory; the process restart in these browser checks uses the original isolated runtime directory. Booting the separately restored copy and rereading its receipts is an additional probe, not part of the 17 passed checks (see the retained failed attempts below).

## Final long observation

Report: `outputs/monitor-live-soak-d29dad52-08d1-4f37-804d-2b5eae8e98f7.json` — passed, no cleanup error.

- Actual monitoring: `2026-10-22T20:39:15.476Z` to the final validation at `2026-10-22T22:39:17.542Z`; **7,202,047 ms**, approximately **2 hours and 2 seconds**. Cleanup finished at `22:39:18.646Z` (Hong Kong 2026-10-23 06:39:18).
- Finalized head advanced from **26,250,537** to **26,251,108**. The active monitor starts strictly after the initial finalized head and completed one report; the quiet monitor advanced through **16 empty windows**, generated no report and paid nothing.
- Confirmed local escrow funding was followed by an actual SIGKILL. The same persistent environment resumed and the chain contains exactly one matching Opened event and the original funding transaction hash.
- Total-source interruption lasted **1,092,604 ms**, approximately **18 minutes 13 seconds**. Twenty actual backoff failures exhausted one queue entry; its cursor and report count remained unchanged for a further minute. An independent business completed during the interruption.
- Explicit mission-scoped retry recovered the saved cursor. Credential B started before A was revoked; the old worker exited with authorization refused, while B continued scanning.
- Observation was not gap-free: **13 probe retry records** and **one exhausted read-probe observation gap** occurred. These are retained in the report. The healthy-quiet clock reset on retries/gaps; the last persisted conservative interval is **2,651,022 ms (44 minutes 11 seconds)**, with **2,683,463 ms (44 minutes 43 seconds)** observed by the final check. Earlier progress messages estimating an hour of continuity must be read in light of these recorded resets. There is no claim of two uninterrupted hours of observations.
- Final source scan remained fresh, source and runtime failure counts were zero, and the final queue was **0 pending / 0 leased / 0 dead**.
- Four distinct escrow task IDs reconcile **920 funded / 920 paid / 0 refunded / 0 unsettled / 0 reserved** local token cents. The running quiet monitor's former 460-cent reservation was released when stopped.
- Two consumer credentials and two vault sessions were independently verified revoked. The temporary monitoring environment and extra failed-restore test ports were closed. The borrowed model controller remains alive with no owned model process and no active leases. Original launcher **46719**, frontend **46760** and its in-memory chain remain running; current-runtime metadata is unchanged.

Independent verification: `outputs/monitor-reliability-final-process-audit-20261023.json`. SHA-256 manifest for the accepted reports, receipt files, overlays and validation logs: `outputs/monitor-reliability-verification-20261023.json`. Failed earlier runs are not included in this pass manifest and their time is not added to this run.

### Reproduction

Run from the repository root. Use fresh isolated directories and keep the original current runtime untouched. The frozen copies referenced below are retained locally.

```sh
AGENTOS_DEMO_SOURCE_REFERENCE="$PWD/.sites-runtime/isolated-demo/acceptance-code-8df7b7f0-edf1-4e46-9707-dfe8f3ce035d/source" \
AGENTOS_BROWSER_DRIVER_CONFIG="$PWD/.sites-runtime/isolated-demo/acceptance-driver-bcc552b/source/playwright.business.config.mjs" \
node .sites-runtime/isolated-demo/acceptance-driver-bcc552b/source/scripts/demo-browser-business.mjs

# Add AGENTOS_BROWSER_LIVE=1 to run the browser demo against live finalized reads.

AGENTOS_DEMO_SOURCE_REFERENCE="$PWD/.sites-runtime/isolated-demo/acceptance-code-8df7b7f0-edf1-4e46-9707-dfe8f3ce035d/source" \
node .sites-runtime/isolated-demo/acceptance-observer-c150727/source/scripts/demo-monitor-soak.mjs
```

The long observer enforces a minimum of 7,200 actual seconds. It refuses occupied ports, does not rewrite current-runtime metadata, and cleans only its own isolated runtime, credentials and sessions. Full-suite/typecheck/build logs apply to the application snapshot above, not later concurrent repository changes.

## Earlier attempts retained, excluded from final acceptance

- `72c2cddd`: 153.57 minutes wall time and a raw passed status, but shared-source integrity failures and a paused controller created an observation gap. The explicit interruption notice invalidates it as final acceptance. Do not combine its time with a later run.
- `a2200d14`: stopped after approximately 38 minutes because a single observer GET transport failure aborted the old test driver. Its completed fault checks are diagnostic evidence, not a two-hour pass.
- Browser attempt `0b5327d7`: model cold-start test wait failed; superseded by the readiness-aware driver and the two completed 17-step demos.
- Additional independent cold-restore probes `86c77d2a` and `c7821408`: blocked by a separately occupied port, then by the persistent chain's origin binding when attempting a different port. No occupied process was stopped, no original data was rewritten, and no success is claimed from these probes. The complete browser demos already verify backup creation, integrity restoration and restart; the additional standalone receipt-reading probe was not completed. It is excluded from the passed checks.

## Explicit limits

The tested monitor has finite terms and budgets: 1–5 reports, up to 24 hours, and at most 25 transfers per report. An oversized single block is retained for explicit intervention rather than truncated. These controls are not an unlimited production indexing service.

The crash acceptance covers one real critical point after confirmed funding. It does not cover every transaction boundary, host power loss, disk corruption or arbitrary concurrent writes. All-RPC interruption is injected at the common local read-only gateway; this tests total-source unavailability and retry behavior, not every provider's distinct protocol defect. Endpoint identity/checkpoint/oversized-response edge cases are exercised separately by focused tests.

The preserved original 6097 process is not the isolated acceptance target. During this pass, read-only checks found its workspace endpoint returning HTTP 500 and plugin health returning HTTP 503 after concurrent source changes. A normal frontend configuration reload did not repair that worker error. The original process, chain identity, block and data were kept; this report does not claim that original instance is healthy. Repairing it requires a coordinated change that preserves its legacy in-memory chain rather than blindly restarting the bundle.

## Subsequent original-instance repair

The original 6097 HTTP 500 and plugin HTTP 503 described above were subsequently repaired without restarting its in-memory chain. See [original-instance component recovery](ORIGINAL_6097_RECOVERY_2026-10-23.md) for separate current evidence, preserved workspace rows and the demo actually run on 6097. This does not alter the historical evidence of the earlier isolated acceptance.
