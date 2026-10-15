// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// @notice Prototype for one standard ERC-20. No fee-on-transfer/rebasing tokens.
/// CRE forwarder and exact workflow metadata are pinned at deployment.
contract AgentEscrow {
    enum Status { None, Funded, Paid, Refunded }
    struct Task { address buyer; address seller; uint256 amount; uint64 deadline; bytes32 specHash; Status status; bytes32 outputHash; }
    IERC20 public immutable token;
    address public immutable forwarder;
    bytes32 public immutable metadataHash;
    mapping(bytes32 => Task) public tasks;
    bool private entered;
    event Opened(bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, bytes32 specHash);
    event Settled(bytes32 indexed id, bool accepted, bytes32 outputHash);
    modifier nonReentrant() { require(!entered, "reentrant"); entered=true; _; entered=false; }
    constructor(address token_, address forwarder_, bytes32 metadataHash_) {
        require(token_!=address(0) && forwarder_!=address(0) && metadataHash_!=bytes32(0), "configuration");
        token=IERC20(token_);forwarder=forwarder_;metadataHash=metadataHash_;
    }
    function openTask(bytes32 id, address seller, uint256 amount, uint64 deadline, bytes32 specHash) external nonReentrant {
        require(tasks[id].status==Status.None && id!=bytes32(0), "duplicate task");
        require(seller!=address(0) && seller!=address(this) && amount>0 && specHash!=bytes32(0), "task parameters");
        require(deadline>block.timestamp && deadline<=block.timestamp+7 days, "deadline");
        tasks[id]=Task(msg.sender,seller,amount,deadline,specHash,Status.Funded,bytes32(0));
        uint256 beforeBalance=token.balanceOf(address(this));
        require(token.transferFrom(msg.sender,address(this),amount), "fund transfer");
        require(token.balanceOf(address(this))-beforeBalance==amount, "unsupported token");
        emit Opened(id,msg.sender,seller,amount,specHash);
    }
    function taskCommitment(bytes32 id) external view returns(bytes32,uint8,uint64) {
        Task storage t=tasks[id]; return(t.specHash,uint8(t.status),t.deadline);
    }
    function onReport(bytes calldata metadata, bytes calldata report) external nonReentrant {
        require(msg.sender==forwarder && keccak256(metadata)==metadataHash, "untrusted report");
        (bytes32 id,bytes32 specHash,bytes32 outputHash,bool accepted)=abi.decode(report,(bytes32,bytes32,bytes32,bool));
        Task storage t=tasks[id];require(t.status==Status.Funded,"terminal or missing task");
        require(t.specHash==specHash && block.timestamp<t.deadline,"stale or wrong task");
        require(!accepted || outputHash!=bytes32(0),"missing output");
        t.status=accepted?Status.Paid:Status.Refunded;t.outputHash=outputHash;
        require(token.transfer(accepted?t.seller:t.buyer,t.amount),"settlement transfer");
        emit Settled(id,accepted,outputHash);
    }
    function refundExpired(bytes32 id) external nonReentrant {
        Task storage t=tasks[id];require(t.status==Status.Funded && block.timestamp>=t.deadline,"not expired");
        t.status=Status.Refunded;require(token.transfer(t.buyer,t.amount),"refund transfer");emit Settled(id,false,bytes32(0));
    }
}
