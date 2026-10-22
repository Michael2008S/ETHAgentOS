# Portable JSON service templates

`agentos.service-template.v1` extends the shared service/planning system with
reusable JSON plugin programs. It uses the same input/output composition checks,
reviewed proposal format and paid-purchase approval path as model-generated
programs. Existing business templates retain their original adapter and protocol.

## Portable definition

A definition contains a name/revision, exact plugin IDs and manifest hashes,
bounded input/output schemas, a sequential program with root/paid-parent paths,
per-service fee ceilings, total/per-step ceilings and a timeout. Save from a
reviewed model or template plan; or import a definition plus its SHA-256 digest.
Names/revisions are immutable. Forward references, incompatible paid edges,
unbounded schemas and unknown fields are rejected.

The export never copies the source JSON, runtime descriptor, execution grants,
buyer, Vault session, signatures, provider credentials, model prompt or inference
evidence. Exported schemas describe data; they are not source data. Template
metadata is explicitly user-entered text. Templates do not install plugins or
grant authority in a receiving workspace.

## Reuse

Choose fresh JSON and fee limits, install the exact plugin versions, then prepare
the template. The server checks the current shared catalog, exact code/contracts,
available runtime capabilities, actual prices and all template ceilings. Prices
may decrease under the saved ceilings; increases beyond them are refused.

Preparation saves a new five-minute review proposal with a template provenance
snapshot and current runtime/fees. No model is called and no inference evidence
is fabricated. The SDK independently verifies both the portable definition and
the executable draft. Model and template requests cannot repurpose each other's
request ID, even when their remaining parameters happen to match.

Review and apply the proposal to the paid-plugin editor. Its original timeout is
retained. Explicit execution grants and a current exact Vault payment session
remain required; changing the editable program clears its plan/authority
selection. Starting a purchase atomically accepts that exact review and reserves
fees/quotas through the existing durable controller.

Archiving prevents new preparations and new approvals of existing unapproved
template proposals. Restore allows reuse. Already-created purchases retain their
original escrow obligations and remain recoverable after archive; templates are
not a way to rewrite paid history or reverse a broadcast transaction.

## API, SDK and evidence

Owner-scoped `/api/service-templates` supports list, save, import, archive, restore
and instantiate. Writes have strict schemas, same-origin/scope checks and bounded
stream reads. Save/import/application IDs preserve the original result after a
lost response. Read-only polling never instantiates or purchases.

`sdk/service-templates.ts` exposes `AgentServiceTemplateClient`.
`npm run demo:service-templates` proves actual import/review/SDK/D1 and local
QuickJS/Vault/EVM purchase, lost import replay, a new input, workspace isolation,
archive fencing, preserved funded work, canonical parent receipts, unique funding,
one session signature, balance changes and an empty queue. It starts no model and
revokes its test session in `finally`.

The browser case uses the actual import form, lost response, refresh, archive and
restore, a template-derived proposal and two paid steps with a 300-second timeout;
it checks Chinese/English and 390px layout. Unit checks cover strict portability,
schema composition, identity conflicts and independent SDK verification. See the
roadmap for current results. The full runner includes this stage; failure repair
and the final complete sequence remain subsequent work. Public-chain settlement,
DON and hosted execution are deferred.
