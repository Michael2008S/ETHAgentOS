# AgentOS implementation roadmap

User request: complete improvements in the review order, test and commit each item separately, then execute the complete demo. Local evidence, public-chain evidence and deployment remain separate acceptance gates.

| Order | Deliverable | Required evidence | State |
| --- | --- | --- | --- |
| 1 | Complete delivery commitment and independent acceptance | Versioned skill/input contract; complete result hash; detail tampering rejected by runtime-independent verifier and EVM settlement; CRE WASM/CLI evidence | Implemented and checked; validation below |
| 2 | Real business data skill | Actual source fetch, immutable provenance and scope, useful output and reproducible acceptance | Implemented and checked; validation below |
| 3 | Vault in actual ordering | One owner grant, two bounded purchases, revocation denies subsequent purchase; refund/buyer accounting | Pending |
| 4 | Two-step workflow and memory references | Persisted dependencies, previous accepted artifact as next input, recovery without duplicate payment | Pending |
| 5 | Public testnet and CRE settlement | Real wallet, registered workflow execution, actual forwarder payment/refund transactions; account access verified rather than assumed | Pending |
| 6 | Third-party onboarding and hosted operation | New skill onboarding with integration acceptance; authenticated deployed consumer, monitoring and failure recovery | Pending |

The complete demo is a final gate after the individual changes. Public workflow deployment depends on actual account capabilities and configured infrastructure; local simulation does not satisfy item 5. No unattended schedule is enabled merely to represent deployment.

## Item 1 validation — 2026-10-21

- 83 automated tests passed, including actual temporary HTTP/EVM payment/refund for modified allocation details and recipient counts; existing pre-funded model/supplier execution also passed.
- TypeScript checks and production build passed. Focused reconciliation, evidence and language regression: 9 passed after their integration changes.
- Official CRE CLI WASM build succeeded. Five dry-run cases passed: event acceptance, incorrect-total rejection, specification mismatch rejection before reporting, treasury acceptance, and altered-allocation rejection even with a recomputed output hash. Evidence: `outputs/cre-demo-81ff696d-9374-4b4f-9c4b-f471bdb7adb8.json`. No broadcast or DON deployment.
- Existing running services and their historical state were preserved. Source changes do not imply the older running chain/supplier processes have been upgraded. A fresh isolated runtime must be used for the final complete demo, or a state-preserving service upgrade must be implemented.

## Item 2 validation — 2026-10-21

- Read-only mainnet USDC import, full raw provenance commitment, exact base-unit report, canonical-source recheck and bilingual source-input form implemented.
- Actual mainnet → HTTP/D1 treasury execution → temporary local EVM full-artifact payment passed: `outputs/data-demo-598e76de-1865-4527-b377-ef5876930e1b.json`. The first attempt stopped at source reverification before authorization (`outputs/data-demo-772f77eb-dd65-4d5d-a6d2-9d6e4e366d1d.json`); retained, not counted as success.
- 86 automated tests passed with bounded concurrency, plus the Chromium source-draft refresh/language regression. TypeScript checks, production build and official CRE WASM compilation passed. Raw logs: `outputs/validation-data-2026-10-21/`. The source parser was compiled into WASM; this item does not claim a new source-origin DON execution.
- Full-demo runner includes `demo:data`; the final complete demo remains outstanding.
