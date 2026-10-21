# Durable runtime queue

## State and authority

`agentos_runtime_jobs` lives in the same D1 database as workspaces. A workspace compare-and-swap and its newly runnable jobs are committed in one D1 batch transaction. A losing reducer cannot publish orphan work. The migration backfills automatic legacy tasks and funded orders; manual test tasks and unfunded drafts are excluded.

Queue messages contain only owner, task/order ID, scheduling metadata and a generic retry error. Inputs, permissions, spending authority and checkpoints remain in the owner workspace. Consumers select their own jobs and use the existing runtime reducers. They cannot create orders, choose arbitrary funding, change permissions or select another caller-supplied workspace. Existing bounded Vault purchase intents may fund through their original grant/session checks. Current permission, deadline, model and supplier gates still apply.

An atomic SQL claim has a two-minute lease and a unique token. Expired claims can be recovered after process/request loss. Acknowledgements require both the current token and the exact workspace revision, so a stale response cannot overwrite a replacement consumer or swallow a concurrent resume. Runtime and settlement idempotency also protect against overlapping workers. Temporary failures back off up to one minute. Twenty consecutive failures move work to `dead`; an authenticated owner may retry it. Terminal checkpoints become completed queue records without another payment.

## API and local worker

- `GET /api/runtime/health`: owner-scoped real service probes, queue counts and last consumer contact; missing, busy and stale consumers are distinct. Health reads do not advance work.
- `GET /api/runtime/queue`: authenticated owner's aggregate counts.
- `POST /api/runtime/queue`: requeue only that owner's dead jobs; no parameters.
- `POST /api/runtime/drain`: bounded consumer, at most four claims and a twenty-second loop budget. An in-progress external call may outlast that budget; checkpoints and leases handle interruption. No body or owner/task parameters are accepted.
- `POST /api/runtime`: existing authenticated direct recovery remains available.

On loopback the drain is owner/sandbox scoped. `npm run worker` polls it independently of an open browser. Stop/restart the worker without resetting D1 or the chain.

Fresh local databases use `npm run db:local` after a build. For an existing pre-queue database, apply **only** the new migration once:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_chemical_famine.sql
```

The runtime status panel also requires the consumer contact table. Existing databases with migrations 0000 and 0001 already applied run only:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_dazzling_lady_bullseye.sql
```

Do not replay table-creation migrations on an existing database. Publishing the saved Site version applies its new migration through Sites.

## Hosted consumer

New scoped consumer credentials, a standalone retrying process and aggregate monitoring are implemented and locally accepted; see [CONSUMER-OPERATIONS](CONSUMER-OPERATIONS.md). They have not been deployed or scheduled. The following older owner-private gateway mode remains supported only under its original audience restriction.

The owner-private Site may opt into a shared service drain by setting server-only `AGENTOS_RUNTIME_PRIVATE_ORIGIN` to its exact HTTPS origin. The platform must retain owner-private access. Sites dispatch authenticates service callers using a freshly obtained Site service bearer; it does not provide a visitor identity. This endpoint deliberately consumes already-authorized queued work and returns aggregate counts, without returning any workspace data. Keep this flag disabled for a public/shared audience until application-level service authorization is added.

A scheduled cloud task obtains service access using Sites `get_site`, calls the parameterless drain and reads the aggregate response. Never store credentials in source, prompts or browser code. A saved schedule is not evidence that a scheduled occurrence ran; record actual writer verification separately. Timing is best effort and does not guarantee a short escrow deadline. For public-chain settlement, the trusted RPC, external evidence publishing and authorized CRE/DON deployment are additional requirements.

The private v11 writer was exercised through official service access and its completed queue record read back in a second invocation. The platform rejected a one-minute schedule because it allows at most one scheduled run per hour. No schedule was created. A deployment for a separate minute-level consumer remains outstanding; an hourly cleanup would not guarantee the default five-minute execution window.

## Verification

`node --test tests/queue.test.mjs` exercises real SQLite SQL transactions, rollback, CAS races, concurrent claims, crash recovery, acknowledgement fencing, migration backfill and scope checks. `npm run demo:queue` uses the actual HTTP/D1 service, deliberately drops the inline continuation only in an isolated local test, and recovers via separate consumer requests. It verifies one payment, owner/manual isolation, permission revocation, expiry, rejection, and a pre-funded real Qwen/EVM order across queue checkpoints. The test-only header is ignored on hosted requests.
