// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./AgentEscrow.sol";

/// @notice Owner-funded budget vault. Executors cannot withdraw or pick arbitrary tokens/escrows.
contract AgentVault {
    struct Grant { uint128 perTask; uint128 daily; uint64 expires; }
    address public immutable owner;
    AgentEscrow public immutable escrow;
    IERC20 public immutable token;
    mapping(address=>Grant) public grants;
    mapping(address=>bool) public sellers;
    mapping(address=>mapping(uint256=>uint256)) public spent;
    bool private entered;
    modifier onlyOwner(){require(msg.sender==owner,"owner only");_;}
    modifier nonReentrant(){require(!entered,"reentrant");entered=true;_;entered=false;}
    constructor(address escrow_){owner=msg.sender;escrow=AgentEscrow(escrow_);token=escrow.token();}
    function grant(address executor,uint128 perTask,uint128 daily,uint64 expires) external onlyOwner {grants[executor]=Grant(perTask,daily,expires);}
    function allowSeller(address seller,bool allowed) external onlyOwner {sellers[seller]=allowed;}
    function revoke(address executor) external onlyOwner {delete grants[executor];}
    function withdraw(uint256 amount) external onlyOwner nonReentrant {require(token.transfer(owner,amount),"withdraw transfer");}
    function execute(bytes32 id,address seller,uint256 amount,uint64 deadline,bytes32 specHash) external nonReentrant {
        Grant memory g=grants[msg.sender];uint256 day=block.timestamp/1 days;
        require(g.expires>block.timestamp && amount>0 && amount<=g.perTask,"executor limit");
        require(sellers[seller] && spent[msg.sender][day]+amount<=g.daily,"seller or daily limit");
        spent[msg.sender][day]+=amount; // Conservative cap: refunds do not replenish today's allowance.
        require(token.approve(address(escrow),0) && token.approve(address(escrow),amount),"approval");
        escrow.openTask(id,seller,amount,deadline,specHash);
    }
}
