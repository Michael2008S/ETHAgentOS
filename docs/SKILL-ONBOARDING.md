# Versioned skill onboarding

AgentOS now supports installing a new data-only transfer-analysis skill without changing the two built-in skill enums or rebuilding a per-order CRE workflow. The reference package is examples/skills/treasury-concentration.json. Its provider computation lives separately in examples/skills/ranked-flows-provider.mjs.

This is a bounded recipe interpreter, not arbitrary JavaScript execution. The current input contract is transfers.v1, and the output contract is ranked-flows.v1. A definition chooses sender/recipient grouping, top 1–10 accounts and a 0–10000 basis-point threshold. Ranking uses descending amount and code-point account order for ties; shares floor amount × 10000 / total. Empty/zero totals never flag concentration. Amounts are the committed integer cents, including the documented source projection when mainnet data is used; the result is not a financial risk judgment.

## Install and authorize

1. In Agents, import or paste the definition JSON, review its name, version, permissions and hash, then install it. Only dataset.read and artifact.write are permitted. URLs, code, wallet operations and extra fields are refused.
2. Register an Agent service using the installed skill. Installation and service registration do not enable the skill in the workspace execution policy.
3. In Permissions, explicitly allow the skill. Existing Vault sessions also need their own signed skill grant; installing a definition does not extend an old session.
4. Create a sandbox task or pre-funded order. The server inserts the installed definition into the frozen input and complete delivery verification. A supplied conflicting definition is refused before funding. The original bytes/version remain on existing orders.
5. For an independent supplier, bind its ERC-8004 identity and authorize the supplier configuration as before. Its advertised skill list must contain the exact versioned ID. A fresh reference supplier advertises the bundled extension; already-running processes retain their original configuration and delegation hash.

IDs use ext:<namespace>@<major.minor.patch>. One ID/version is immutable within its owner workspace. A changed recipe needs a new versioned ID; byte-identical installation retries are idempotent. Up to 20 extension definitions may be installed. The namespace is not a globally registered ownership claim, and installation alone does not authenticate a provider. Supplier delegation/signature and paid-order reputation remain separate.

SDK:

```ts
await os.installSkill(definition);
await os.registerAgent({name: 'Flow concentration', description: 'Rank treasury recipients', skill: definition.id});
const state = await os.workspace();
await os.updatePolicy({...state.policy, allowedSkills: [...state.policy.allowedSkills, definition.id]});
```

These are authenticated owner operations through the existing API, with same-origin checks, workspace isolation and CAS persistence. No new unauthenticated upload/code endpoint is introduced. Built-in skills cannot be replaced by an extension definition. The current fixed two-step workflow still uses its original two skills; generic workflow composition is outside this onboarding unit.

## Provider conformance and settlement

```sh
npm run skill:conformance -- --definition examples/skills/treasury-concentration.json --provider examples/skills/ranked-flows-provider.mjs
npm run demo:skill
```

The conformance command explicitly imports a trusted local developer module with the caller's OS privileges. It is not a provider sandbox, remote authentication, or payment acceptance. It exercises bounds, ties, zero amounts and safe-integer edges against the independent verifier. The server never imports code from a manifest.

The website interpreter, reference supplier and CRE verifier calculate rankings separately. The v2 commitment embeds the entire definition and its version; changing the rule changes specHash. Rehashing a modified ranking does not make the delivery acceptable. CRE accepts only supported, bounded definitions and independently recomputes the complete output. Historical built-in commitments keep their previous encoding. The fixed receiver/evidence-origin dispatcher discovers extension orders without per-order configuration changes.

demo:skill requires local identity-enabled HTTP/D1/chain/supplier services. It creates an isolated workspace, installs and authorizes the package, binds an identity and exercises built-in execution, independent signed delivery, invalid-result refund, lost-response recovery and forbidden-capability refund. It checks one settlement per task and unchanged sandbox credits for chain orders. The reference supplier is a separate process in this repository, not an independently operated public service.

Current HTTP evidence: outputs/skill-demo-e7287178-6db8-4a37-9fc3-ba9f3a8afb5e.json. Official CLI evidence: outputs/cre-dispatcher-41ba5889-6d5a-4fb2-85b4-b61c90355daf.json. Four dry-runs use unchanged dispatcher configuration, including accepted/rejected extension deliveries. Actual fixture evidence uses HTTPS/workerd/R2; actual transactions use local EVM 31337 and a test callback. No public broadcast, workflow registration or DON attestation is claimed.

The full runner now includes demo:skill and has 22 steps. Its new complete run, public-wallet/DON gate and authenticated hosted operation remain separate unfinished acceptance items. No hosted schedule has been enabled.
