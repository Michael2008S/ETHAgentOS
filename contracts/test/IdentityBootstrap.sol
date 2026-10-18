// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @notice Local test administrator bootstrap; never used for public deployments.
contract IdentityBootstrap is OwnableUpgradeable, UUPSUpgradeable {
    constructor() { _disableInitializers(); }
    function initialize(address admin) external initializer {
        __Ownable_init(admin);
        __UUPSUpgradeable_init();
    }
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
