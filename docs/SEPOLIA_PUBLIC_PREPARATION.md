# Sepolia workflow and public evidence preparation

The verified receiver is `0xbd805f9bc3f655b82f99da6077fbccc9a5e0cdce`, test token `0x5f66e3636252ceaa4be0cec6584ac2dba2caba20`, on Sepolia 11155111. The receiver pins owner `0xa94b3b3A8398087aB05CB85A97771f5367110062`, name `agentos-delivery-staging` (encoded `0x66363765303630383763`), and production forwarder `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`. It remains unbound and unfunded. No synthetic workflow ID is used.

## Current evidence

Live checks on 2026-10-23 Asia/Hong_Kong confirmed CRE authentication, deploy access **Not enabled**, zero linked owners, CLI v1.39.0, and availability of both `private` and `onchain:ethereum-mainnet` registries. Wrangler was not authenticated. The deployment configuration explicitly chooses **private**. This registry needs deploy approval, but does not require mainnet wallet linking. A private workflow's actual report owner still must be checked against the receiver's immutable owner before accepting a deployment or binding an ID.

Public onchain key linking and registry registration involve Ethereum Mainnet and a permanent organization bond. They are outside this Sepolia acceptance stage and are not executed. See [CRE registry models](https://docs.chain.link/cre/guides/operations/deploying-workflows) and [key linking](https://docs.chain.link/cre/organization/linking-keys).

## Prepared files

Run `node scripts/sepolia-console/prepare-public.mjs` from the repository root. It uses the verified unbound deployment and writes:

- `.sites-runtime/sepolia-public/cre/project.yaml`: public Sepolia read RPC.
- `.sites-runtime/sepolia-public/cre/workflow/workflow.yaml`: fixed workflow name and `deployment-registry: private`.
- `.sites-runtime/sepolia-public/cre/workflow/config.json`: reusable dispatcher, actual receiver, 30-second trigger and 500000 gas limit.
- `.sites-runtime/sepolia-public/wrangler.json`: evidence Worker, private R2 bucket binding and actual receiver.
- `.sites-runtime/sepolia-public/write-token`: random server-only writer credential, mode 0600, preserved on reruns. Never copy it into a Page, chat, public artifact or Git.

Public config copies and the manifest are under `outputs/erc8004-sepolia-2026-10-23/public-preparation/`. Until the actual Cloudflare account ID and public origin are supplied, those fields are conspicuous placeholders and the manifest reports a draft. A build/dry-run does not make the draft deployable. Neither this preparation nor its manifests installs an active AgentOS chain configuration.

## User actions needed now

1. In a terminal at the repository root, run:

   ```sh
   node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js login
   ```

   Complete the Cloudflare login/authorization yourself. Select the intended account. If R2 has not been enabled, review and complete its account setup yourself; [Cloudflare's R2 prerequisites](https://developers.cloudflare.com/r2/get-started/) explain the subscription step.
2. Provide the selected **account ID** and actual **workers.dev subdomain or custom HTTPS origin**. Do not provide any API token or password. The planned Worker name is `agentos-evidence-bd805f9b`; the bucket name is `agentos-sepolia-evidence-bd805f9b`.
3. Review the existing CRE deploy-access request in your CRE account. Approval remains an external prerequisite. No MetaMask action is needed at this stage. Do not run `link-key`, `bindWorkflow`, mint, approve or funding operations for this preparation.

## After Cloudflare login and origin selection

Regenerate using actual values, for example by replacing the quoted placeholders:

```sh
node scripts/sepolia-console/prepare-public.mjs --account-id "YOUR_ACTUAL_ACCOUNT_ID" --origin "https://agentos-evidence-bd805f9b.YOUR_ACTUAL_SUBDOMAIN.workers.dev"
```

The selected PUBLIC_ORIGIN must exactly match the deployed HTTPS hostname, without a trailing slash. Then the operator can create the named bucket, deploy the Worker and install the credential without printing it:

```sh
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js r2 bucket create agentos-sepolia-evidence-bd805f9b
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js deploy --config .sites-runtime/sepolia-public/wrangler.json
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js secret put WRITE_TOKEN --config .sites-runtime/sepolia-public/wrangler.json < .sites-runtime/sepolia-public/write-token
```

These are pending authenticated deployment steps; no remote bucket or Worker has been created by this preparation. Validate anonymous `/v1/config` and `/v1/11155111/0xbd805f9bc3f655b82f99da6077fbccc9a5e0cdce/ready?slot=0`, receiver scope, authenticated synthetic writes, immutable anonymous readback, conflict rejection and ready-index behavior before declaring public evidence acceptance.

For AgentOS, `AGENTOS_EVIDENCE_CONFIGURATION` will contain only the actual origin; `AGENTOS_EVIDENCE_WRITE_TOKEN` must be installed through server secret management. Neither belongs in browser configuration. Keep them inactive while public chain activation prerequisites remain unmet.

## Workflow and no-funding gate

After CRE approval, recheck private-registry availability and verify the intended report owner/name/forwarder can match the existing receiver. Validate the final actual evidence origin using `validateConfig`; then build and dry-run the actual configuration. Register only the private workflow; verify the returned real workflow ID and metadata before preparing a separate binding action. No deploy command is bundled into the preparer, and no binding or funding action is automated.

## Verification already available

The focused evidence/config/dispatcher/receipt tests run actual local workerd/R2 and cover authenticated writes, anonymous readback, immutable conflicts and concurrent ready-index updates. SDK handler tests exercise the actual dispatcher under mocked capabilities. Official CLI/Javy builds and Wrangler `deploy --dry-run` package the artifacts.

`scripts/sepolia-console/simulate-public-empty.mjs` attempts a separate official CLI empty-queue dry-run through an owned temporary HTTPS fixture, reads the public Sepolia receiver before/after, never uses `--broadcast`, and closes the fixture on exit. It does not create a real order or prove DON settlement. This run was blocked by Cloudflare Tunnel DNS/network connectivity before CLI simulation; its failed report and tunnel diagnostics remain retained. Retry only after network conditions change or use the actual deployed evidence service.

## Authenticated Cloudflare discovery and deployment runner

The account is now authenticated. Live API discovery found account `a22fa439129d350efa5ae54255082859` and workers.dev subdomain `michael2008s`. The configured evidence origin is `https://agentos-evidence-bd805f9b.michael2008s.workers.dev`. At the last check, R2 returned HTTP 403 / code 10042 asking for Dashboard enablement, so no bucket, Worker or remote writer secret was created. The actual-account/origin Worker packaging dry-run passed.

After R2 is enabled in the Dashboard, use:

```sh
node scripts/sepolia-console/deploy-public-evidence.mjs
```

The runner captures existing Wrangler credentials only in memory, discovers accounts/subdomains/R2 readiness, requires one unambiguous account, and stops before writes if prerequisites are missing. Once ready, it prepares actual configuration, creates/reuses the task's named R2 bucket, deploys the evidence Worker, installs the server writer secret through stdin without displaying it, and runs public synthetic-data acceptance. It never deploys CRE, binds a workflow, or funds an escrow.

`verify-public-evidence.mjs` checks anonymous service configuration, rejects unauthorized and browser-origin writes, publishes synthetic input/artifact bytes, verifies anonymous exact readback, checks idempotent retries and immutable conflict refusal, then archives only that run's synthetic queue item while retaining immutable evidence. Reports never contain writer/OAuth credentials. Deployment logs and `cloudflare-service-deployment.json` are retained in the public-preparation evidence directory. `cloudflare-discovery.json` records the exact account readiness/errors.
