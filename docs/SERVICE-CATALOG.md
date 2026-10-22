# Unified services and reviewed JSON plugin planning

`agentos.service.v1` gives business skills, signed supplier choices and installed
JSON plugins the same versioned description: service ID, execution adapter,
input/output contracts, fee kind, capabilities and immutable bindings. Existing
business planning now sends these descriptions to its model as well. The JSON
planning panel displays the shared directory, including business services.

Execution adapters keep their actual contracts. A `transfers.v1` service cannot
consume arbitrary JSON. Business workflows continue through the existing
supplier/CRE protocol; JSON plugins continue through signed QuickJS delivery,
independent replay and local Vault/Escrow. The catalog does not fabricate transfer
rows or imply that a local verifier is a DON. Cross-contract conversion requires
an explicit, validated adapter; incompatible selections are refused.

## Schema composition

Plugin edges are checked before any execution quota or fee is reserved. Root
inputs are validated as actual JSON. For a paid parent, the output schema must
guarantee every value fits the next input schema, including required properties,
closed object keys, numeric bounds, string/array bounds and enum restrictions.
Object paths may traverse only required properties. Runtime validation and
canonical parent-payment verification remain in place. Manual plugin purchases
use the same preflight, so an incompatible second step cannot cause an avoidable
first-step payment.

## Planning and approval

`GET /api/service-plans?catalogue=1` returns the owner-scoped shared directory and
saved plans. Plain GET observes history without model inference. POST propose
sends the explicitly selected goal, bounded original JSON and service metadata to
the configured planning model. It does not run guest code, reserve execution
counts, create purchases or grant wallet authority. Model output may select only
existing compatible services under the per-step and total fee limits. No endpoint,
code, tool, permission or fee can be introduced by the model.

The saved `agentos.service-plan.v1` binds the complete catalog, normalized program,
executable draft, original input, model descriptor and prompt/response hashes.
Proposals expire five minutes after generation. The SDK independently rebuilds
the draft rather than trusting its digest alone. A persisted request ID returns
the original proposal; concurrent model requests are not a promise of exactly-once
provider billing.

In Agents → Paid plugin workflows, install services, refresh the shared catalog,
generate a goal plan, review it and apply it to the editor. Applying or editing a
program clears selected payment authority. Execution grants and exact signed
Vault permissions remain separate explicit steps. Only the draft and review
identifiers are restored in browser storage; no signature or consumer credential
is stored there.

Starting a reviewed plan sends its original request ID and digest to the existing
plugin-purchase API. The same D1 CAS/batch accepts the plan, reserves every plugin
occurrence and fee, and creates its durable purchase. Changed input/program,
price, runtime, code, scope, expired/dismissed proposal or absent grants cannot
create a new purchase. A lost approval response retries the original purchase
even when its final execution count is already reserved or the runtime is offline.
Its plan reference is included in immutable purchase terms and chain commitments.

## Verification and scope

`npm run demo:service-plans` uses the real pinned local planning model, actual
HTTP/D1, signed QuickJS delivery, independent replay and local Vault/EVM. It checks
zero execution before approval, changed-input/scope rejection, approval response
loss, one accepted plan/purchase, two unique funding events, canonical paid-parent
reuse, one session signature, token balance changes and an empty queue. Test
authority is revoked at completion. The full runner now includes this stage.

Schema and adversarial planning tests are in `tests/service-plans.test.mjs`;
browser coverage exercises plan review, refresh, wallet approval, actual payment,
Chinese/English and mobile layout. Current evidence is recorded in the roadmap.

Portable plugin templates now reuse this reviewed proposal and purchase path; see SERVICE-TEMPLATES.md. Failure repair is the next increment. Public-chain
settlement, actual DON acceptance and hosted consumers remain deferred. This
increment does not extend guest privileges beyond reviewed read-only MCP.
