// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./AgentEscrow.sol";

/// @notice CRE production receiver. Identity is immutable after one deployment-time binding.
/// Deploy escrow, register its workflow/config, then bind the returned workflow ID once.
contract AgentEscrowReceiver is AgentEscrow {
    address public immutable configurator;
    address public immutable workflowOwner;
    bytes10 public immutable workflowName;
    bytes32 public workflowId;
    event WorkflowBound(bytes32 indexed id);

    constructor(address token_,address forwarder_,address workflowOwner_,bytes10 workflowName_)
        AgentEscrow(token_,forwarder_,keccak256(abi.encodePacked(workflowName_,workflowOwner_))) {
        require(workflowOwner_!=address(0) && workflowName_!=bytes10(0),"workflow identity");
        configurator=msg.sender;workflowOwner=workflowOwner_;workflowName=workflowName_;
    }
    function bindWorkflow(bytes32 id) external {
        require(msg.sender==configurator && workflowId==bytes32(0) && id!=bytes32(0),"workflow binding");
        workflowId=id;emit WorkflowBound(id);
    }
    function _readyForFunding() internal view override returns (bool) { return workflowId!=bytes32(0); }
    function _authorizedMetadata(bytes calldata metadata) internal view override returns (bool) {
        // KeystoneForwarder passes 32-byte ID, 10-byte encoded name, 20-byte owner
        // and a 2-byte report ID. The report ID is not the workflow identity.
        if(metadata.length!=64 || workflowId==bytes32(0))return false;
        bytes32 id;bytes10 name;address owner_;
        assembly {
            id := calldataload(metadata.offset)
            name := calldataload(add(metadata.offset,32))
            owner_ := shr(96,calldataload(add(metadata.offset,42)))
        }
        return id==workflowId && name==workflowName && owner_==workflowOwner;
    }
}
