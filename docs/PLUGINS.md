# Isolated JavaScript plugins and read-only MCP

This execution layer accepts general bounded JSON rather than requiring transfer records. A versioned manifest contains JavaScript, a separately reviewed verifier, input/output schemas, exact MCP tool pins and resource limits. Installation grants no execution authority. The Agents page lets the owner review code and capabilities, grant a run quota, submit input, inspect the output/transcript, recover work and revoke permission.

Free plugin jobs have no spending authority. They do not create escrow orders, use Vault sessions or produce CRE reports. Generic-plugin paid JSON workflows now have a separate controller, API/SDK and bilingual browser entry; see [PLUGIN-PURCHASES](PLUGIN-PURCHASES.md). The existing deterministic paid-skill pipeline keeps its original semantics. Public-chain generic-plugin settlement remains unfinished; local EOA acceptance is not DON acceptance.

## Dependencies and local processes

`quickjs-emscripten@0.32.0` and official `@modelcontextprotocol/sdk@1.32.1` are exact, lockfile-pinned dependencies. Node.js 24+ is required; actual validation uses Node 26. Guest code executes inside an independent QuickJS WASM instance in a disposable worker thread. The worker has an empty inherited environment and no host module loader, filesystem, network, process or wallet objects injected into its interpreter. It does not use Node's vm as an isolation boundary.

```sh
npm ci
# Use the app/chain URLs of one identity-enabled local runtime:
AGENTOS_CHAIN_URL=http://127.0.0.1:9255 npm run mcp:local
AGENTOS_APP_ORIGIN=http://127.0.0.1:5887 npm run plugins:local
```

The reference MCP service listens on 11439 and the plugin service on 11438. The MCP fixture reads the actual configured local-chain Vault balance at a specific block. Its separately advertised synthetic write tool is deliberately unavailable to plugins. `demo:start` starts/reuses matching default services and refuses an occupied service bound to another app or chain. A new `demo:isolated` uses separate plugin/MCP ports derived from its web port, preserves all older instances, and records their URLs. Browser/full-demo profiles carry those URLs. Runtime status and doctor include the execution service; the plugin catalogue performs actual MCP discovery when explicitly requested.

Current managed operation: `npm run baseline -- start`, `npm run baseline -- status`, `npm run baseline -- stop`. Use the selected runtimePath from `.sites-runtime/local-baseline/current.json` for direct browser commands; this pointer is a profile, not a runtime.json. Historical ports and standalone examples below do not select the current baseline. Journals and signing identities remain private and are preserved by baseline backups.

The plugin runtime pins its execution source files and dependency lockfile into its revision. Its descriptor also binds the execution origin, trusted application callback origin, engine and tools. Source changes make health/catalogue/capability checks unavailable until that owned service is restarted. New code or tool versions require a matching reviewed grant; old receipts retain their historical runtime hash.

## Manifest and code interface

IDs are `plugin:<namespace>@<major.minor.patch>`. One owner may install twenty immutable versions. A different manifest under an existing ID is rejected. The entire manifest, including code, verifier, schemas, tool hashes and limits, is SHA-256 committed.

The `code` field is the body of an async function with `(input, tools)` arguments:

```js
const snapshot = await tools.call('local-chain', 'vault_snapshot', {});
return { balance: snapshot.balanceBaseUnits };
```

The `verifier` field is the body of a separate function with `(input, output, transcript)` arguments. It runs in a fresh interpreter without tool access and must return exactly true. A returned result must independently match the output schema. Code cannot change the verifier's globals, and a denied capability or unawaited tool call cannot be hidden by catching an exception and returning a plausible output.

Two example builders are in `lib/agentos/plugin-examples.ts`: arbitrary-label normalization/deduplication without tools, and a real MCP Vault-readiness monitor. The UI can load either; the MCP builder uses the current discovered tool hash. Neither transfers tokens. This is source execution, not an expanded table of transfer-analysis recipes.

Supported schemas explicitly describe objects, arrays, strings, finite numbers, integers, booleans and null, with enums and bounds. Objects prohibit additional properties. References, executable expressions, patterns and unsupported schema keywords are refused. Schemas are at most 128 nodes/eight levels; JSON values are at most 2048 nodes/twelve levels. This bounded schema profile is not full JSON Schema support.

Limits: manifest 32 KiB; code and verifier 8 KiB each; input 16 KiB; output 8 KiB; combined tool transcript 32 KiB; at most eight declared tools and eight calls. A job specifies 25–1000 ms of actual worker-thread CPU, 8–32 MiB of interpreter heap and 1–30 seconds per interpreter wall deadline. The worker wakes on tool responses rather than charging an idle polling loop to guest CPU. A parent timer terminates stalled workers, while the interpreter interrupt handler, heap allocator and stack limit constrain computation. The service admits at most two active execution requests.

## MCP capability broker

Operators configure `AGENTOS_MCP_SERVERS` as an array of `{id,url,revision,readTools}`. HTTP callers and manifests cannot add endpoints or launch stdio commands. Up to eight servers may be configured; the returned runtime catalogue is bounded to sixteen approved tools and 60,000 characters. Outside the development loopback profile, URLs require HTTPS. URLs cannot contain credentials, query parameters or fragments.

Optional `AGENTOS_MCP_API_KEYS` maps server IDs to separate credentials. They remain in the broker, are not inherited by guest workers and are never placed in manifests, inputs, output receipts or tool transcripts. A hosted app additionally needs server-only `AGENTOS_PLUGIN_RUNTIME_CONFIGURATION={"origin":"https://your-runtime.example"}` and optional `AGENTOS_PLUGIN_RUNTIME_API_KEY`. Hosted callback/authentication/operations are not accepted by the local test results.

The official SDK performs initialize, tools/list and tools/call over Streamable HTTP. Only operator-allowlisted tools also advertising readOnlyHint=true, without destructiveHint=true, enter the catalogue. Tool hashes bind the complete raw advertised declaration, including schema documentation and annotations, plus the operator configuration. A normalized bounded schema is separately used for validation. Duplicate tool names, unsupported schema assertions, oversized responses and excessive pagination are refused. Every actual call rechecks the declaration, validates arguments/results and refuses changed hashes. JSON structured content or one JSON text block is supported; media, roots, model sampling, elicitation and arbitrary client capabilities are not exposed.

The transport accepts requests only to the exact configured endpoint, refuses redirects, bounds streaming response bytes and has timeouts. No credentials are forwarded to redirect targets. MCP annotations describe server claims; they do not prove the server implementation is read-only. Operator configuration remains a trust boundary. The actual reference handler and tests independently verify zero write calls and zero chain transactions.

## Grants, persistence and recovery

The owner grants one immutable manifest/runtime pair a 1–100 run quota and 60-second to 24-hour lifetime. Grant/revocation requests have persistent idempotency journals. Renewing or revoking increments the epoch and cancels unfinished jobs of the previous epoch. Retrying a lost old grant response cannot revive it. Creating a job reserves exactly one run; cancellation, failure and retry do not replenish it. An interrupted submission can recover its existing job even when the last available run was reserved.

Manifests, grants, grant requests and full job data are stored in four separate D1 tables. Only compact job references appear in workspace JSON. The workspace CAS, side-table writes, quota reservation and durable queue publication share one guarded D1 batch. Failed CAS reducers publish neither jobs nor quota consumption. At most eight jobs may be active and one hundred retained jobs/grant requests are supported per workspace. Existing history is not automatically dropped.

The durable consumer and owner recovery endpoint run plugin jobs independently of browser polling. A 90-second execution lease has a random, server-only 256-bit bearer; its value is redacted from APIs. The service must validate this lease with the trusted app before execution, before each tool call and after computation. The app checks workspace policy, manifest/runtime, grant epoch, expiry and job state. Revocation/cancellation and expired leases fence late results. The existing workspace execution switch applies to plugins as well.

An actual execution result is journaled under the immutable scoped request before responding. A service restart or lost response can recover the same accepted result without another tool invocation. A crash before journaling may repeat a read or provider charge; the system does not promise strictly-once external execution or billing. Transient execution failures have at most three claimed attempts, with the existing queue backoff. An unreachable runtime does not prevent deadline termination. Invalid code, schemas, capabilities or verifier results fail without accepted output.

Receipts bind job, scope, input, manifest, runtime, output, ordered actual tool transcript and verifier hash in a digest. They are owner-scoped application checkpoints, not provider signatures, hardware attestations, proof of arbitrary semantic truth or Chainlink DON attestations. The owner-reviewed verifier can itself be incorrect; arbitrary plugin payments need a separately accepted verification design.

## API and SDK

`GET /api/plugins` reads owner metadata without tool discovery or execution. Add `runtime=1` to discover the catalogue, or `id=<job>` to inspect a full redacted job. POST actions: install, grant, revoke, create, cancel. Writes enforce same-origin, authentication, strict schemas and a streamed 64 KiB bound. An expected scope from the SDK is checked before writes; it never selects a different owner. Consumer credentials cannot use owner plugin APIs.

`POST /api/plugins/capability` is a fixed server-to-server lease check; it cannot create or authorize jobs. A guessed job ID or owner session is insufficient without the current lease bearer. It returns only allowed/requestHash. Secrets and arbitrary callback origins cannot be supplied by a manifest or public caller.

`sdk/plugins.ts` exports AgentPluginClient for scoped catalogue/install/authorize/revoke/create/job/cancel/recover. It validates returned manifests, quota terms, request/input commitments, execution evidence and workspace scope, and bounds responses. Use the same request ID after uncertain response loss and a new ID for an intentionally new run. UI drafts and submission intents are scoped in sessionStorage; stored results and authorization live in D1.

## Validation

```sh
node --test tests/plugin-runtime.test.mjs tests/browser-runtime.test.mjs
npm run demo:plugins
npm run validate:local -- browser
# Direct focused browser run: pass the profile runtimePath to --runtime; append --grep 'generic plugin'
```

Core tests execute real QuickJS and SQLite and an official SDK MCP fixture, covering resources, host/module access, orphan calls, verifier rejection, lost CAS, quotas, revocation, stale leases, deadline handling, raw schema-document drift and a service restart with a persistent result. The unit fixture's chain snapshot is controlled; the HTTP demo reads actual local EVM contracts through a separate MCP process and the app's real lease callback. Its six groups preserve Vault balance, block height, zero chain orders/transactions/signatures and an empty queue. Browser acceptance covers explicit review, lost grant/create replies, reload, final-slot recovery, real MCP output, queued revocation, bilingual text and mobile width.

Primary implementation references: [QuickJS WASM runtime isolation and limits](https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten/classes/QuickJSRuntime.md), [official MCP SDK client](https://ts.sdk.modelcontextprotocol.io/client). Actual local evidence and the final overall regression gate are recorded in ROADMAP-IMPLEMENTATION.md. No public network, hosted runtime or generic paid-plugin acceptance is claimed.
