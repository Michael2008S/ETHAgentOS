# Complete delivery acceptance

New purchases commit `DeliverySpec.verification` in the on-chain `specHash`: delivery protocol v2, skill ID, skill version, dataset name and exact block bounds. The dataset hash commits the exact filtered transfer bytes before funding. API, wallet and runtime check that the verification matches the selected skill and input.

The delivered JSON contains protocol version, task ID, the verification descriptor, dataset hash, **the entire skill output**, and `outputHash = keccak256(canonical(output))`. The settlement report's output hash is `keccak256(canonical(entire artifact))`, binding the complete delivered envelope. It is distinct from the runtime's SHA-256 output log.

CRE and the local HTTP verifier independently compute the expected complete output from committed records, using a separate BigInt/recipient-map implementation. Acceptance requires an exact canonical match of the entire envelope. For event analysis this includes unique recipients; for treasury reports it includes every allocation, as well as dataset/range/count/total. Extra/missing fields, changed details even after recomputing their hash, wrong task/version/skill/input, or summary-only downgrade cannot pass a v2 order.

Rejection artifacts never pass acceptance. Invalid committed data aborts verification rather than inventing a payable result; the existing deadline refund remains available. A valid rejection verdict follows the existing authenticated report/refund mechanism.

Existing v1 orders keep their original spec and frozen settlement artifact. Their old summary receipts remain readable and can be reconciled against the original commitment; they are not upgraded or labeled full-result proofs. New orders and the current CRE configuration require v2. This preserves funded terms without allowing new orders to select weaker historical acceptance.

This proves the deterministic transfer-analysis result from committed input. It does not prove that user-supplied transfers came from a public chain, that a model ran a particular inference, or that an arbitrary research report is correct. Supplier signature verification and identity delegation remain separate runtime/evidence checks.

Tests cover mutation of all result fields, recomputed malicious hashes, downgrade, input bounds, empty datasets, special recipient names, historical hashes, and actual HTTP/EVM payment or refund for correct and forged details. `demo:cre` additionally exercises accepted treasury output and a forged allocation through the official WASM/CLI dry-run; dry-run is not DON deployment or broadcast.
