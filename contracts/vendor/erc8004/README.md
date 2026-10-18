# ERC-8004 upstream sources

Unmodified MIT-licensed `IdentityRegistryUpgradeable.sol` and `ReputationRegistryUpgradeable.sol` from [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts/tree/b9e466c250744a7e06b13dff9d3c2844ed64f825/contracts), commit `b9e466c250744a7e06b13dff9d3c2844ed64f825`. SPDX notices retained. Dependencies pinned to OpenZeppelin 5.4.0 in package-lock.json.

Local tests deploy these implementations behind ERC1967 proxies, using `contracts/test/IdentityBootstrap.sol` to initialize the local administrator before the upstream v2 initializer. This test bootstrap replaces the upstream vanity deployment placeholder's hard-coded administrator. No changes to the identity or reputation implementations, no mainnet deployment claim.
