# Portable workflow templates

The workflow editor can save, export, import, archive, restore and instantiate versioned programs. A template is an editable starting point. Saving, importing or applying one creates no order, workflow, durable job, quote, signature, budget reservation or transfer. Starting the resulting workflow remains a separate owner action under the normal Vault, policy, provider and evidence checks.

## Reuse in the UI

1. Compose 2–8 steps in the existing workflow editor, including each input source, optional accepted-result condition and fee ceiling. Set the execution window.
2. Enter a template name, revision and optional description; select **Save current workflow as template**. Save retries after response loss retain the same request UUID.
3. Select a saved template and explicitly bind each skill slot to a local service. Supplier slots also require an explicit supplier selection. There is no automatic provider substitution.
4. **Apply template to editor** fills the title, execution window and editable steps, preserves the current business input and clears the Vault selection. Review the draft and explicitly choose an active session before starting.
5. Copy **Portable template JSON** to another workspace and import it there. Its skills must be installed and its service slots rebound locally. Archive/restore changes library availability; it does not cancel or rewrite an existing workflow.

The existing editor keeps its input, steps and execution window through reload under the current wallet/workspace. The library is persisted in the owner workspace in D1, independently of that browser draft. Applying a template is not model inference or an endorsement of its business meaning. The UI exposes the steps and digest for review.

## Protocol and API

`agentos.workflow-template.v1` contains only a name, description, semantic revision, execution window and skill slots. Slots fix skill ID/version, extension recipe hash where applicable, fee ceiling, input dependency, optional typed condition and built-in/supplier execution kind. They exclude concrete Agent IDs, suppliers/payees, endpoints, business input, deployment, buyer, Vault/session identifiers, signatures, credentials and executable code. A name/revision pair cannot be overwritten with different content; a changed program uses a new revision. The current prototype retains up to 100 records, including archives.

The portable envelope is exactly `{definition,digest}`. The SHA-256 digest covers the canonical definition. Strict schemas reject extra fields, cycles/forward references, unsupported conditions and malformed versions. Extension identifiers must match their version and require the exact installed definition hash. These checks are structural and do not certify an author's identity. Operator administration of D1 remains trusted; this is not a signed global template registry.

`/api/workflow-templates` supports owner-only GET and JSON POST actions `save`, `import`, `instantiate`, `archive`, `restore`. Writes enforce same origin, streamed 64 KiB bounds and strict action schemas. Consumer credentials cannot access the library. Records bind their workspace hash, request UUID, definition digest and creation time; archive state is separate from the immutable definition. New records and library updates use the existing D1 CAS path and do not enqueue work.

`AgentWorkflowTemplateClient` in `sdk/workflow-templates.ts` supports the same actions. `instantiate(record, bindings)` returns title, steps, timeout, optional supplier pricing mode and `templateDigest`; it never returns a buyer, input or purchasing session. The SDK checks the returned program against the exact selected bindings and definition. Before calling the existing workflow client's `create`, remove `templateDigest`, supply a fresh workflow request UUID, the new input and an explicitly selected Vault session. Retries of that execution request reuse its UUID; intentional reuse starts with another UUID. The template digest identifies the starter, while the resulting workflow independently commits the reviewed executable program and its input; this unit does not add a separate onchain template identity.

Instantiation rechecks enabled services, exact skills/versions/extension hashes, workspace skill policy and per-step fee ceilings. A built-in price above the stored ceiling is refused. The draft is not a live quote or a reservation: remaining aggregate/session/daily capacity, canonical supplier identity/delegation/payee and exact supplier quotes are checked again by normal workflow creation and execution. Supplier IDs come from an explicit local binding; a template cannot add a supplier endpoint to operator configuration.

## Validation

Six focused Node tests cover export boundaries, immutable revisions, replay, archive/restore, cross-workspace binding, current price/policy/skill changes, exact extension recipes, supplier slots, digest tampering, invalid programs and SDK response refusal. The HTTP/D1 acceptance command is:

```sh
npm run demo:workflow-templates
```

It verifies lost save response replay, import into a second workspace, zero procurement during template operations, rejected actions and two separately authorized executions with distinct inputs. Payments, accepted-parent memory, unique Opened events, Vault/seller deltas and the final durable queue are checked against the actual local EVM. Browser regression additionally exercises refresh, portable export, explicit service binding, cleared session selection, retained input, manual start, archive/restore, bilingual labels and mobile width. Local acceptance does not establish public wallets, Sepolia, DON deployment or hosted operation.

Final local acceptance on 2026-10-22 (Hong Kong): `outputs/workflow-template-demo-722699b3-bffb-48b8-b03b-6ea5bdc8875e.json` passed three groups with four payments totaling 1,200 cents and one owner session signature; all six durable jobs completed. The current 169 Node / 15 Chromium regressions, five CRE SDK tests (80 assertions), type checks and build passed. Evidence, retained failures and the reviewed mobile screenshot are in `outputs/validation-workflow-templates-2026-10-22/`. The integrated full-demo runner now has 31 steps; final project acceptance remains open until the remaining capabilities are completed.
