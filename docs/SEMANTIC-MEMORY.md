# Semantic memory and reviewed paid-result reuse

The Memory page now retrieves related task snapshots, stored paid results and private knowledge notes using real embeddings. It keeps the existing keyword search and exports below the semantic panel. The wallet workflow panel searches paid results for the connected buyer and can apply a reviewed result as new root input. Indexing, searching and applying do not create an order or sign a new spending authorization.

## Local model and setup

```sh
npm run model:setup        # existing official llama-server runtime
npm run model:setup:memory # official embedding artifact, size and SHA-256 verified
npm run model:memory       # retained foreground process on 127.0.0.1:11437
```

The standard `demo:start` launcher starts or reuses this service; `demo:doctor` and Runtime status check it. The isolated application uses the same separate model service. Models and process manifests remain under ignored `.sites-runtime/`, outside source snapshots and publishing artifacts.

The pinned artifact is the official Qwen/Qwen3-Embedding-0.6B-GGUF Q8_0 model, repository revision `370f27d7550e0def9b39c1f16d3fbaa13aa67728`, 639150592 bytes, SHA-256 `06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439`. The existing llama-server uses last-token pooling, 1024 model dimensions and an instruction prefix for queries. The application stores the first 256 dimensions after float32 L2 normalization. The model revision, endpoint configuration, dimensions, normalization protocol and query instruction bind the public configuration hash. No keyword fallback substitutes for a failed embedding request.

Hosted use requires the independent server-only `AGENTOS_MEMORY_MODEL_CONFIGURATION` and optional `AGENTOS_MEMORY_MODEL_API_KEY`. It never inherits the planning provider's credential. Only HTTPS is allowed outside loopback development. This unit does not deploy or accept a hosted provider.

## Sources and consent

Before each index batch, the page shows which summaries will be sent. A batch is at most eight summaries and 6000 characters, each at most 2400 characters. Task summaries contain titles, service/skill, status, dataset/range and aggregate result facts. Paid-result summaries contain the title, skill, dataset and aggregate facts. Raw transfer records, allocation lists, wallet signatures and credentials are not automatically sent. A private note sends its user-entered title and body; placing sensitive content in a title or note places it in that reviewed model input.

Notes are owner-scoped D1 records, not end-to-end encrypted storage. They support revision-checked edits and idempotent save recovery. Editing changes the source hash, so the old vector cannot participate in a new query. Deletion atomically removes the note's vector and completed saved searches containing its text; unrelated history remains. The editor draft is scoped in sessionStorage to support retry after a lost save response.

## Persistence and integrity

Three separate tables store notes, vectors and request journals; vector arrays never enlarge the main workspace JSON or appear in the catalogue response. Existing databases already through 0003 apply only `drizzle/0004_married_mauler.sql` once, after an online backup and verification of existing state. Fresh databases use `npm run db:local`. Do not replay the fresh schema against a database with history. The current 5887 runtime was backed up, migrated and checked to retain identical workspace/job snapshots; other retained databases were not changed.

The corpus is bounded by the existing 300 tasks and 300 chain orders plus 100 notes. Exact cosine ranking scans at most 700 vectors in D1; this is not an unbounded ANN service. Searches expose eligible/indexed/pending coverage and never silently include stale model/source vectors. Source hashes include current inputs, output commitments, note revisions and paid-result settlement references as appropriate.

Owner APIs apply authentication, same-origin writes, strict schemas and 64 KiB streamed request bounds. Consumer tokens cannot index, search, edit or adopt. The SDK binds the expected workspace, checks result schemas/digests and bounds response bodies. Request identifiers freeze parameters. A completed retry returns the saved result; an active duplicate cannot start another valid inference. A fenced 90-second lease and an atomic D1 batch protect vectors and result publication from expired workers, deleted requests, changed notes and changed workspace revisions. A provider may still charge again after an expired inference lease; its stable Idempotency-Key is not a billing guarantee.

Each saved search binds the model, query, filters, source summaries, scores and coverage in a digest. It can be reviewed after refresh; using a hit expires exactly 15 minutes after search generation. History is capped at 100 requests and explicitly cleared by the owner rather than silently dropping active requests. Saved searches are historical snapshots, not a current payment claim.

## Adoption and authority

Only an unchanged paid-result hit owned by the selected buyer on the same deployment can be adopted. The server retrieves the saved search from its owner journal, verifies its digest/expiry/source version and rechecks canonical payment and the complete accepted artifact lineage. A note or sandbox task cannot become paid-artifact authority. New workflow creation and actual funding recheck that original paid root again.

Applying the selected input clears the editor's selected Vault session. The user reviews steps and explicitly selects authority before starting. Moving from Memory to the wallet carries only a saved-search review cursor, never a signature or spending grant. Subsequent steps consume the original paid result as derived input; its original payment is not repeated or overwritten. Model similarity does not establish result correctness, financial authorization or public DON provenance.

## API, SDK and acceptance

`GET /api/memory/semantic` returns scoped summaries, index coverage, the next reviewed batch, optional notes and request metadata. `GET ?id=<uuid>` retrieves a saved request. POST actions are `index`, `search`, `save-note`, `delete-note`, `forget-request` and `adopt`. Callers cannot supply an endpoint, owner or credential.

`sdk/semantic-memory.ts` exposes `AgentSemanticMemoryClient`: catalogue, index, search, saved, saveNote, deleteNote, forget and adopt. Supply an expected workspace hash when binding a client. Use a fresh request UUID for an acknowledged failed query; preserve its UUID after uncertain response loss.

```sh
node --test tests/semantic-memory.test.mjs tests/configurable-workflows.test.mjs
npm run demo:memory
npm run test:browser -- --runtime .sites-runtime/isolated-demo/current.json --grep 'semantic memory'
```

The HTTP demo uses real multilingual embeddings, D1 and two independent signed local suppliers, then reuses a paid result in a new two-step workflow on actual local Vault/EVM contracts. It checks English-result retrieval by Chinese meaning, unrelated ranking, saved-response-loss replay, owner/buyer/model constraints, note invalidation/deletion, unchanged original payment, one session signature, unique funding events, balance deltas and an empty queue. Unit fixtures exercise actual SQLite atomicity and controlled vector responses for deterministic races; those controlled responses are not evidence of semantic quality. The full runner includes this unit, but its final complete run and public-network gates remain separate.
