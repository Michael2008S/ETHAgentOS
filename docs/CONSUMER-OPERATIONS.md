# Authenticated recovery consumer

This delivers code and local operational acceptance for roadmap item 6. It does not deploy an external process, publish the Site, or create a schedule. The user's local-only scheduling decision is preserved. Public-wallet/DON acceptance and the final complete demo remain separate gates.

## Owner-managed credentials

In Mission control → Runtime status → Recovery consumer access, an authenticated owner can issue, list and revoke a credential. The token is displayed once in a password field and may be explicitly copied. It stays in component memory, not localStorage, task data or a download. Refresh/navigation clears the displayed value. Losing an issue response does not make its secret retrievable: revoke that credential and issue a new ID.

POST /api/runtime/consumers accepts a strict issue/revoke request with same-origin and owner authentication. Issuance chooses a 1-hour to 30-day lifetime and a 1–60 second polling interval; the UI offers one hour, one day or seven days with a five-second interval. At most five unexpired, unrevoked credentials may exist per workspace. Duplicate IDs cannot replace a secret. GET lists the latest 50 public metadata records. D1 stores only a SHA-256 digest of the 256-bit random secret; no raw token is stored.

The SDK is sdk/consumers.ts:

```ts
const consumers = new AgentConsumerClient(baseURL, ownerHeaders);
const {credential, token} = await consumers.issue({name: 'Recovery worker', ttlSeconds: 86400});
// Transfer token directly to the consumer host's secret environment.
await consumers.revoke(credential.id);
```

An owner/credential is a trusted application principal, not a blockchain capability proof. The Site gateway, D1 administrator and configured execution/RPC services remain trusted. A token has no wallet key. It cannot create orders, change permissions, issue new credentials, read owner workspace/artifact APIs, or select another workspace. It may advance server-selected jobs that already have authority, including funding an existing bounded Vault purchase under its original grant/session checks. Revoking a token denies new consumer requests; an already authorized in-flight request or mined payment is not undone.

## Service routes and process

The consumer uses X-AgentOS-Consumer-Token on only:

- POST /api/runtime/drain with no body/query/owner/task parameters.
- GET /api/runtime/consumer-status, which returns credential timing, aggregate queue counts and workspace consumer heartbeat/oldest pending time. It never returns task input, output, owner ID or credentials.

Invalid tokens never fall back to browser/loopback/legacy service authority. Browser Origin and sandbox override headers are refused on these service requests. Tokens are resolved to their stored owner server-side. The existing tokenless loopback worker remains owner/sandbox scoped. The older AGENTOS_RUNTIME_PRIVATE_ORIGIN drain is still an explicit owner-private gateway mode; do not enable it for a public/shared audience. Prefer the scoped token for new external consumers.

Supply these through the host's secret environment, not command arguments or source:

- AGENTOS_CONSUMER_URL: exact HTTPS application origin; plain loopback HTTP is allowed for local acceptance.
- AGENTOS_CONSUMER_TOKEN: issued token.
- AGENTOS_SITE_SERVICE_BEARER: separate current Site gateway service bearer, only if required by the owner-private Site. The AgentOS credential does not bypass the gateway. Gateway access may expire independently; provision/refresh it through supported platform access and restart with the refreshed secret.
- AGENTOS_CONSUMER_HEALTH_PORT: optional local monitoring port, bound only to 127.0.0.1. Zero selects an ephemeral port.

Run npm run consumer for the foreground process, or npm run consumer -- --once for one bounded drain plus a separate status readback. Issuing a credential does not start either mode. No supervisor/cron/automation is installed by these commands.

The process takes its interval from the issued credential, uses bounded response parsing, refuses redirects and never logs raw remote errors or credentials. Temporary transport failures back off up to one minute. A 401/403 stops the process with exit code 2 rather than retrying expired/revoked gateway or application access. A failed one-shot exits 1. SIGTERM aborts client requests and closes its owned health listener; existing server jobs retain the normal durable lease/checkpoint rules.

GET /health returns 200 only after a successful drain and independent status readback with no reported failed/dead jobs. It returns 503 while starting, unavailable, degraded or stale. The response contains only timestamps, aggregate counts and generic state. Runtime heartbeat freshness honors its declared interval; a recent failed drain is unavailable rather than a healthy contact. Monitoring is observed activity, not an SLA or a notification system. Alert routing and production supervision must be configured on the eventual host; no messages or notifications were sent.

## Database upgrade

Fresh databases use the existing db:local command. Existing databases already on migrations 0000–0002 apply only drizzle/0003_purple_virginia_dare.sql once; do not replay the full fresh schema. This adds the credentials table/index and the heartbeat interval column.

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to <existing-state-directory> --file drizzle/0003_purple_virginia_dare.sql
```

Three retained local demo databases were backed up through SQLite's online backup API before this migration. Each migration ran in a transaction and verified identical workspace/job snapshots before and after; histories were not reset. Records and private local backups live under ignored outputs/validation-consumer-2026-10-21/. Hosted D1 has not been upgraded or published in this unit.

## Acceptance and remaining gates

npm run demo:consumer uses actual local HTTP/D1 and a separate process with an owner-scoped credential. A loopback facade injects an outage and drops a drain response after committed work. The demo checks isolation, independent status readback, visible failure, automatic retry, process kill/restart, revocation exit and one payment per task. It waits for a newer successful readback after the lost response, not an old green health value. Owned test consumers/facades are stopped and credentials revoked at completion; the shared application/chain/supplier processes stay intact.

Unit tests additionally exercise actual SQLite issuance races, active limits, digest-only storage, expiry, revocation, fixed-route transport, size limits and redacted errors. Browser acceptance verifies issue-once display, reload clearing, workspace isolation and bilingual revocation. Earlier Node SDK syntax and API denial-status failures are retained in the validation directory.

Current acceptance evidence: outputs/consumer-demo-f210d6d3-d1e0-4202-9cfc-603573466a03.json. Final checks passed 115 Node tests, nine Chromium regressions, four SDK CRE tests, type checks and production build. The browser proof shows revoked metadata with no displayed token.

The complete 23-step local sequence passed at aae3f7e, including demo:consumer: outputs/full-demo-eaf0c4f4-310b-42cc-9e63-34363da15c55/report.json. Its retained verification manifest and child artifacts are in that run directory.

Actual externally deployed consumer, unattended occurrences, production monitoring/alerts, public gateway behavior and real public-chain recovery remain unverified. No hosted schedule has been enabled. The local full-demo pass does not satisfy those public gates.
