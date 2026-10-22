# Bounded automatic plugin repair proposals

The existing durable consumer can now request a JSON service repair proposal
after an authorized plugin purchase fails. Business and JSON repair share the
same inference lease and attempt mechanics in `repair-control.ts`. The JSON path
uses the existing canonical paid-memory/review/purchase controller; it never
approves or buys a replacement on its own.

## Fixed policy and authority

An owner explicitly selects an unfinished purchase, remaining goal, cumulative
goal ceiling, remaining-plan/per-step limits, maximum 1–8 steps, 1–3 model
attempts, duration, root mode and permitted plugin services. Configuration freezes
the exact code/contracts/prices/runtime, execution grant epochs, signed Vault
session/binding, model descriptor and deployment. Expiry is clipped to the
existing session and execution grants; insufficient remaining time is refused.
No grant, quote reservation, execution count or purchase is created by enabling
the policy.

Each candidate needs an already installed immutable plugin and its exact current
execution/payment permissions. A renewed execution grant cannot revive an old
policy or an already proposed automatic plan. Approval must still use the policy's
original payment session. Model/runtime drift blocks generation. Capacity, current
policy/daily limits, signed gross allowance, Vault daily headroom and available
balance are checked before inference and again before publication.

`original` uses the original goal input. `latest-paid` uses the latest paid step in
the current goal lineage, falling back to the original input when nothing has
been paid. The full source funding/refunds and chosen signed result are verified
through SERVICE-REPLANNING.md. Model suggestions cannot introduce arbitrary code,
endpoints, services, permissions or fees.

Service-token budgets exclude model-provider bills and gas. A provider request
may be billed even when its result is lost; no strictly-once inference billing is
claimed.

## Attempts, leases and explicit approval

The queue creates a `service-repair` job only when an armed source stops running,
or an existing inference/wait needs recovery. A fenced claim and deterministic
request ID are committed before calling the model. Crashes, provider failures and
expired inference leases consume attempts. Backoff, a fixed maximum and absolute
expiry prevent an open-ended retry loop. Unavailable canonical evidence waits
without an inference attempt. Expiry/completion/cancellation can retire a policy
without contacting a model or plugin runtime.

A successful response saves the exact source/model/service proposal and attempt
history in the same workspace commit. No replacement exists until the owner
reviews and starts it. Approval rechecks the original execution epochs/session,
canonical lineage, source snapshot and shared budgets, then atomically supersedes
the original purchase through the existing controller.

Approving an active policy's proposal carries the same digest, goal ceiling,
expiry and cumulative attempt count to the replacement. Its completion is
observed without further inference. Manual competing repair cancels automation
for the old source. Stop fences in-flight publication and prevents future
generation; an already saved proposal remains explicitly reviewable until its
original expiry, but approving it does not rearm a stopped policy. Resume cannot
reset attempts, expiry, code or authority.

## Operation

In the paid-plugin workflow detail, connect the buyer wallet, select permitted
repair services and the exact session, review limits and enable. The scope/flow
draft and original configuration intent survive reload/lost response; no wallet
signature or consumer secret is stored in that draft. Read-only polling shows
policy history and generated proposals but never advances work. A local worker or
separate authenticated consumer is required.

Owner `/api/service-repairs` supports list/configure/cancel/resume with strict
scope, origin and streamed body limits. Consumer credentials cannot configure or
approve. `sdk/service-repairs.ts` verifies limits, authority, policy identity and
proposal provenance. Stop does not require a connected wallet; configure/resume
use the connected buyer. No hosted consumer or schedule is installed.

## Evidence

`npm run demo:service-auto-repair` uses real local model inference and a separate
authenticated consumer. While the owner only reads, the source pays one step,
rejects/refunds the next and produces one review proposal with zero replacements.
After explicit approval, a restarted consumer completes only the remaining work,
retains the original paid parent and observes policy completion with one attempt
and one session signature. Unique funding, balance changes and the empty queue
are checked. Consumers are stopped, credentials revoked and the test session
revoked in cleanup.

SQLite tests cover concurrent/failed-CAS claims, late replies, lease recovery,
attempt exhaustion, unavailable evidence, authority renewal, policy carry-forward
and stopped-policy approval. Browser acceptance covers lost configuration,
reload, independent consumer generation, stopping before approval, no rearming,
Chinese/English and 390px layout. Current evidence is in the roadmap. Public
chain/DON and hosted execution remain deferred.
