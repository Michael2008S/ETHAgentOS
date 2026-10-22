# Sepolia public evidence: Workers + D1, no R2 activation

For the consolidated identity/contract/service evidence index, remaining acceptance gates and separate user-wallet steps, see [Sepolia demo acceptance](SEPOLIA_DEMO_ACCEPTANCE.md).

## Deployed service

Public configuration: https://agentos-evidence-bd805f9b.michael2008s.workers.dev/v1/config

- Worker: `agentos-evidence-bd805f9b`
- Cloudflare account: `a22fa439129d350efa5ae54255082859`
- D1 database: `agentos-sepolia-evidence-bd805f9b` (`6c6a3c13-f574-4185-ba85-161416821aec`)
- Sepolia receiver: `0xbd805f9bc3f655b82f99da6077fbccc9a5e0cdce`
- Expected workflow owner: `0xa94b3b3A8398087aB05CB85A97771f5367110062`
- Immutable workflow name: `agentos-delivery-staging` (`0x66363765303630383763`)
- Production forwarder: `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`

D1 was created and the Worker deployed using the existing account without a credit-card step, R2 activation or a paid-plan upgrade. [D1 free quotas](https://developers.cloudflare.com/d1/platform/pricing/) cover this prototype; quota exhaustion can make the service unavailable. This is not an unlimited-storage or production-availability claim.

## Reused protocol and storage adapter

`services/evidence/d1-worker.ts` invokes the existing evidence Worker unchanged. `d1-bucket.ts` implements only its get/head/conditional-put subset with primary D1 queries. SQLite `INSERT OR IGNORE` enforces write-once insertion; `UPDATE ... WHERE etag=?` provides atomic compare-and-swap for the ready index. Unconditional writes are refused. The existing request authentication, schema validation, exact-byte checks, public read URLs, cache policy, conflict refusal and bounded ready index are shared with the R2 version.

`d1-schema.sql` stores keys, text bodies and opaque version etags. Evidence is constrained to the existing 64 KiB payload policy. There is no public database/list/delete interface. Protocol writes cannot replace conflicting evidence, but the Cloudflare account administrator retains database control; the evidence hashes remain the independent integrity check.

## Deployment and credentials

From the repository root:

```sh
node scripts/sepolia-console/deploy-public-evidence.mjs
```

The runner now defaults to D1. It discovers the authenticated account/subdomain, creates or reconciles this dedicated database, prepares the real config, applies its additive schema, deploys the Worker, installs the writer secret through stdin, and runs public acceptance. No plan/R2 activation or billing flow is included. The old R2 route is available only through the explicit `--r2` option and remains subject to its separate prerequisites.

Generated configuration is under `.sites-runtime/sepolia-public/`. The server-only `write-token` file has mode 0600, is preserved across preparation runs, and is never printed or copied into public evidence/Git. The value is installed as the Worker secret `WRITE_TOKEN`. Only the remote secret name is retained as evidence.

For explicit regeneration of the current D1 configuration:

```sh
node scripts/sepolia-console/prepare-public.mjs --storage d1 --database-id 6c6a3c13-f574-4185-ba85-161416821aec --account-id a22fa439129d350efa5ae54255082859 --origin https://agentos-evidence-bd805f9b.michael2008s.workers.dev
```

A preparer run alone does not deploy or verify a service. The authoritative deployment/acceptance receipts live in the outputs directory below.

## Verification and evidence

Local actual workerd/D1 tests verify atomic create-only insertion, stale-CAS rejection, parallel publication, retry idempotency, immutable conflicts, anonymous exact-byte readback, eight concurrent ready entries, archive behavior and retained immutable evidence. The unchanged R2 test also passed. Type checking passed before deployment.

Public acceptance uses only synthetic transfers, creates no blockchain order and submits no chain transaction. It validates anonymous `/v1/config`, rejects missing credentials and browser-origin writes, publishes and anonymously reads exact input/artifact bytes, checks the ready index, permits identical retries and rejects altered artifacts with 409. It archives only that run's synthetic queue item while retaining the immutable proof bytes. No unrelated work is cleaned up.

Evidence directory: `outputs/erc8004-sepolia-2026-10-23/public-preparation/`.

- `cloudflare-service-deployment.json`: phases, database identity, uploaded code version and source hashes.
- `public-evidence-acceptance-*.json`: real HTTPS request statuses, synthetic commitments and checks.
- `worker-deployments.json`: actual deployment versions after secret installation.
- `worker-secret-names.json`: secret names only.
- `d1-public-evidence-rows.json`: remote synthetic evidence persistence.
- `chain-no-funding-after-d1-deploy.json`: independently read Sepolia no-binding/no-funding state.
- Worker/database creation, schema and deployment logs.

For a new explicit public acceptance run:

```sh
node scripts/sepolia-console/verify-public-evidence.mjs
```

## CRE remains pending

The configuration fixes the actual receiver, evidence origin, 30-second dispatcher trigger and 500000 gas limit, and explicitly selects `deployment-registry: private`. CRE deploy approval remains an external prerequisite. The private registry's actual report owner/name/forwarder must match the receiver before any deployment is accepted or ID binding is prepared.

The receiver remains `workflowId == 0` and has zero test-token balance. No active AgentOS chain/payment configuration is installed. The service deployment does not register a DON workflow. There is no synthetic workflow ID, no binding, mint, approval or escrow funding in this delivery. After a real ID and matching metadata are obtained, binding and any funding are separate actions.

The public onchain registry route involves Ethereum Mainnet and permanent organization key linking; it is outside this Sepolia stage. See [CRE deployment registry models](https://docs.chain.link/cre/guides/operations/deploying-workflows) and [key-linking requirements](https://docs.chain.link/cre/organization/linking-keys).

Historical failed R2 enablement and temporary-tunnel checks remain retained in prior reports; they do not invalidate this separately verified D1 deployment.

## Official CRE dry-run against the deployed D1 service

```sh
node scripts/sepolia-console/dry-run-public-d1.mjs
```

This builds the current production dispatcher with the official CLI, validates the exact public HTTPS configuration, and runs empty queue → one synthetic unfunded item → archived empty queue. The middle case must read the actual Sepolia task commitment and return `not-finalized`; it is not allowed to report, settle or bypass the funding check. Only the explicitly created synthetic evidence item is archived, and its input/artifact bytes remain public. Chain snapshots before/after must retain a zero workflow ID and zero escrow test-token balance.

The CLI uses an ephemeral in-memory simulation key and never receives `--broadcast`. No user wallet key is accessed. CLI v1.39.0 limits the WASM path length and validates its existence; the runner copies its retained WASM to a short temporary absolute path, then deletes that temporary copy after the run. The original WASM, source hashes, config, commands, synthetic bytes and redacted logs remain in the report directory. Failed path-validation attempts are retained separately.

When a previous official build has matching recorded source SHA-256 hashes, `--reuse-build /absolute/path/to/prior/report.json` reuses its retained WASM without rebuilding.

After a successful dispatcher report, run:

```sh
node scripts/sepolia-console/dry-run-evidence-readonly.mjs /absolute/path/to/cre-public-d1-dry-run-ID/report.json
```

This is a separate, explicitly read-only CRE probe sharing the production `verifyDelivery` function. It anonymously retrieves the retained input and artifact through the actual CRE HTTP capability under node consensus, independently recomputes the output and checks the expected hash. It has no EVM/report/write capability and cannot settle anything. Its role is to exercise evidence retrieval without pretending an unfunded production task passed the production dispatcher gate.

These are local official CLI executions with real HTTPS/public-chain reads, not deployed DON workflows or mined settlement evidence. CRE deploy access, compatible registered identity and a real workflow ID remain separate pending gates.

### Verified execution on 2026-10-23 (Asia/Hong_Kong)

Evidence is retained under `outputs/erc8004-sepolia-2026-10-23/public-preparation/cre-public-d1-dry-run-abe46dce-f735-4a1c-936a-bb690819b24e/`. Start with `summary.json`, then `report.json`, `readonly-probe/report.json` and the simulation logs; `checksums.sha256.json` fingerprints the retained files, including both WASM binaries. The successful dispatcher reused the official build from the retained preceding path-validation attempt after matching all recorded source hashes.

All three dispatcher cases passed. The separate read-only CRE probe returned `accepted=true` with output hash `0xfdbcdffbd5cd22ddf72754142d88c3c5a761985be1bb22394c28ce3570882498`. The synthetic ready item was archived and the queue returned to zero; immutable evidence remains public. Sepolia snapshots at blocks 11972321 and 11972329 both showed zero workflow ID and zero receiver test-token balance. The live CLI access check remained `deployAccess=false`. No transactions were submitted, no workflow was bound, and no funding was performed. Funded settlement, DON deployment and post-payment ERC-8004 feedback/revocation remain pending.
