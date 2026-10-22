# Reviewed repair of JSON plugin purchases

Failed/cancelled terminal JSON purchases can now be repaired through the same
versioned service catalog, model planner, review format and paid-purchase
controller. This is a new purchase for remaining work; existing escrows and paid
artifacts retain their original commitments and receipts.

## Canonical lineage and cumulative fees

`buildServiceReplan` reads the original owner-scoped purchase lineage. All funded
steps must have matching canonical funding and settlement receipts; refunds are
not assumed final merely because the database says so. A possibly broadcast
intent without funding remains unresolved until its chain deadline has passed
and the original no-funding proof is present. Running/unresolved, completed or
already superseded sources cannot be replanned.

The first repair fixes a cumulative goal ceiling. Further repairs retain that
same goal ID and ceiling. Every funded attempt in the lineage, including refunded
ones and earlier replacements, consumes that ceiling. Only the remaining amount
may be proposed; a new replacement cannot reset the goal's budget. Existing Vault
session/daily/price/payee/execution limits continue to apply independently.

The reviewed context binds source terms, terminal status, every funding and
settlement reference, gross spend, selected input and history. These application
rules do not add independent goal/session interpretation to the Vault contract.

## Paid input

The owner explicitly chooses either the original goal input or a paid step from
this same goal's lineage. A paid root is checked against its installed immutable
code, authenticated runtime delivery and current canonical funding/payment. No
arbitrary note, unaccepted output or caller-provided JSON becomes paid authority.

`acceptedRoot` binds the source workflow/step/task, payment transaction and signed
execution digest. At purchase approval the server rebuilds the complete context;
before funding a root-dependent step the runner checks the paid source again.
The local independent chain authority also verifies the original accepted record,
scope, buyer, output, canonical payment and exact cross-purchase parent reference.
Rehashing fabricated parent metadata cannot authorize funding. Descendant specs
commit the original parent, so its payment is not repeated.

The wallet-bound SDK recursively verifies the original delivery/payment with a
bounded, cycle-checked lineage. Without a wallet/RPC binding, read-only SDK checks
retain the existing server/signed-delivery trust boundary. Continuous public-chain
reorg monitoring and DON acceptance remain separate work.

## Review and atomic replacement

`POST /api/service-replans` provides inspect/propose under strict owner, same-origin,
scope and request-size checks. The server supplies the canonical root JSON to the
configured model; requests cannot inject a replacement input, code or endpoint.
Model selection and schema/fee checks remain unchanged. Proposing never reserves
execution counts or creates a purchase.

The proposal fixes the full repair context and has the normal five-minute review
window. On approval, one D1 CAS/batch accepts the exact proposal, reserves every
new execution/fee, writes the replacement and marks the old purchase superseded.
Concurrent approvals and lost replies return the same replacement. Changing
source, input, payment proof, fee or review digest refuses a new purchase. Reusing
an accepted request still recovers its original terms after source supersession.

In Agents → Paid plugin workflows → history, inspect a failed/cancelled workflow.
Verify its payments, choose the reviewed root, enter the remaining goal and fee
limits, generate and inspect a repair, then apply it to the editor. Applying clears
payment selection. Reconnect after refresh, choose a matching current session and
explicitly start. The editor restores only the draft and public review/root
references, never wallet signatures. Execution/payment grants remain separate.

## Validation and scope

`npm run demo:service-replanning` uses the real pinned local planning model,
HTTP/D1/SDK, signed QuickJS execution, independent replay and local Vault/EVM. One
inventory is paid, a report is rejected/refunded, then only the remaining report
is purchased from the original paid inventory. It checks lost model/approval
responses, zero purchases during planning, forged-root refusal, one superseding
purchase, original receipts and unique funding, gross refund accounting, balance
changes, one session signature and an empty queue. Test authority is revoked in
`finally`.

The actual SQLite/EVM test additionally exercises failed CAS/concurrent approval,
canonical evidence drift and independently rejected rehashed paid-root metadata.
Browser coverage verifies root selection, real-model review, reload, reuse of the
existing session, real remaining-work payment, Chinese/English and 390px layout.
See the roadmap and validation outputs for the current results.

Bounded automatic repair proposals are the next increment. Public chain, actual
DON, hosted deployment and hosted scheduling remain deferred; guest permissions
are still limited to explicitly reviewed read-only MCP.
