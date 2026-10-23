// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./AgentVault.sol";

/// @notice Application-state prototype only. Not an audited CCIP transport adapter.
/// The local relayer is trusted like a Mock Router; it does not prove CCIP delivery.
library LocalCCIP {
    struct TokenAmount { address token; uint256 amount; }
    struct Message { bytes32 messageId; uint64 sourceChainSelector; bytes sender; bytes data; TokenAmount[] destTokenAmounts; }
    struct Payload { uint8 kind; bytes32 id; uint256 amount; uint64 expires; bytes32 spec; bool accepted; bytes32 output; }
}
interface LocalCCIPReceiver { function ccipReceive(LocalCCIP.Message calldata message) external; }

contract LocalMockRouter {
    address public immutable operator = msg.sender;
    uint256 public nonce;
    event Sent(bytes32 indexed messageId, uint64 destination, address sender, address receiver, bytes data);
    function send(uint64 destination, address receiver, bytes calldata data) external returns(bytes32 id) {
        id=keccak256(abi.encode(block.chainid,address(this),++nonce,msg.sender,destination,receiver,data));
        emit Sent(id,destination,msg.sender,receiver,data);
    }
    // Deliberately privileged fault injector. Never deploy this mock to public networks.
    function deliver(address receiver, LocalCCIP.Message calldata message) external {
        require(msg.sender==operator,"mock operator only");
        LocalCCIPReceiver(receiver).ccipReceive(message);
    }
}

contract LocalCCIPTaskLane {
    enum Phase { None, Pending, Ready, Executing, ResultPending, Complete }
    struct Task { uint256 amount; uint64 expires; bytes32 spec; Phase phase; bool revoked; bool accepted; bytes32 output; }
    address public immutable owner=msg.sender;
    LocalMockRouter public immutable router;
    AgentVault public immutable vault;
    AgentEscrow public immutable escrow;
    uint64 public immutable peerSelector;
    bool public immutable source;
    address public peer;
    address public seller;
    uint256 public immutable cap;
    uint256 public reserved;
    mapping(bytes32=>Task) public tasks;
    mapping(bytes32=>bool) public received;
    mapping(bytes32=>bool) public budgetHeld;
    event Transition(bytes32 indexed id, Phase phase);
    modifier onlyOwner(){require(msg.sender==owner,"owner only");_;}
    constructor(address router_,address vault_,uint64 selector_,bool source_,uint256 cap_){
        require(router_!=address(0)&&vault_!=address(0)&&selector_!=0&&cap_>0,"configuration");
        router=LocalMockRouter(router_);vault=AgentVault(vault_);escrow=vault.escrow();peerSelector=selector_;source=source_;cap=cap_;
    }
    function bind(address peer_,address seller_) external onlyOwner {require(peer==address(0)&&peer_!=address(0)&&seller_!=address(0),"bind once");peer=peer_;seller=seller_;}
    function _send(bytes32 id,uint8 kind) internal {
        Task storage t=tasks[id];require(peer!=address(0),"unbound");
        router.send(peerSelector,peer,abi.encode(LocalCCIP.Payload(kind,id,t.amount,t.expires,t.spec,t.accepted,t.output)));
    }
    function authorize(bytes32 id,uint256 amount,uint64 expires,bytes32 spec) external onlyOwner {
        require(source&&id!=bytes32(0)&&tasks[id].phase==Phase.None,"new source task only");
        require(amount>0&&reserved+amount<=cap&&reserved+amount<=vault.token().balanceOf(address(vault)),"local budget");
        require(expires>block.timestamp&&expires<=block.timestamp+7 days&&spec!=bytes32(0),"terms");
        tasks[id]=Task(amount,expires,spec,Phase.Pending,false,false,bytes32(0));reserved+=amount;_send(id,1);
        emit Transition(id,Phase.Pending);
    }
    function revoke(bytes32 id) external onlyOwner {
        Task storage t=tasks[id];require(source&&t.phase==Phase.Pending,"pending only");
        t.revoked=true;_send(id,2); // No timeout/revocation release without authenticated result.
    }
    function resend(bytes32 id) external onlyOwner {
        Task storage t=tasks[id];require(t.phase!=Phase.None,"missing");
        if(source){_send(id,t.phase==Phase.Complete?4:(t.revoked?2:1));}
        else {require(t.phase==Phase.ResultPending||t.phase==Phase.Complete,"no result");_send(id,3);}
    }
    function ccipReceive(LocalCCIP.Message calldata m) external {
        require(msg.sender==address(router),"wrong router");
        require(m.sourceChainSelector==peerSelector,"wrong source");
        require(m.sender.length==32&&keccak256(m.sender)==keccak256(abi.encode(peer)),"wrong sender");
        require(m.destTokenAmounts.length==0&&m.messageId!=bytes32(0),"message only");
        if(received[m.messageId])return;
        LocalCCIP.Payload memory p=abi.decode(m.data,(LocalCCIP.Payload));
        require(p.id!=bytes32(0)&&p.amount>0&&p.spec!=bytes32(0),"payload");
        Task storage t=tasks[p.id];
        if(source){
            require(p.kind==3&&t.phase!=Phase.None,"unexpected result");_terms(t,p);
            if(t.phase==Phase.Complete){require(t.accepted==p.accepted&&t.output==p.output,"conflicting result");}
            else {require(t.phase==Phase.Pending&&(!p.accepted||p.output!=bytes32(0)),"result");reserved-=t.amount;t.accepted=p.accepted;t.output=p.output;t.phase=Phase.Complete;}
            _send(p.id,4);
        } else if(p.kind==4){
            _terms(t,p);require(t.phase==Phase.ResultPending||t.phase==Phase.Complete,"unexpected ack");
            require(t.accepted==p.accepted&&t.output==p.output,"ack mismatch");
            if(t.phase==Phase.ResultPending){if(budgetHeld[p.id]){reserved-=t.amount;budgetHeld[p.id]=false;}t.phase=Phase.Complete;}
        } else {
            require(p.kind==1||p.kind==2,"unexpected command");
            if(t.phase==Phase.None){
                // Refuse over-budget messages without marking them consumed; relay can retry later.
                bool needsBudget=p.kind==1&&block.timestamp<p.expires;
                if(needsBudget){require(reserved+p.amount<=cap&&reserved+p.amount<=vault.token().balanceOf(address(vault)),"local budget");budgetHeld[p.id]=true;reserved+=p.amount;}
                tasks[p.id]=Task(p.amount,p.expires,p.spec,Phase.Ready,false,false,bytes32(0));t=tasks[p.id];
            } else {_terms(t,p);}
            if(p.kind==2)t.revoked=true; // Tombstone survives reordered/duplicate authorization.
            if(t.phase==Phase.ResultPending||t.phase==Phase.Complete){_send(p.id,3);}
            else if(t.phase==Phase.Ready&&(t.revoked||block.timestamp>=t.expires)){t.phase=Phase.ResultPending;_send(p.id,3);}
        }
        received[m.messageId]=true;emit Transition(p.id,t.phase);
    }
    function _terms(Task storage t,LocalCCIP.Payload memory p) internal view {require(t.amount==p.amount&&t.expires==p.expires&&t.spec==p.spec,"terms mismatch");}
    function execute(bytes32 id) external onlyOwner {
        Task storage t=tasks[id];require(!source&&t.phase==Phase.Ready&&!t.revoked&&block.timestamp<t.expires,"not executable");
        t.phase=Phase.Executing;vault.execute(id,seller,t.amount,t.expires,t.spec);emit Transition(id,t.phase);
    }
    // Observe the existing local Escrow's verified settlement; never accept a caller's claimed outcome.
    function collect(bytes32 id) external {
        Task storage t=tasks[id];require(!source,"destination only");
        if(t.phase==Phase.Ready){require(t.revoked||block.timestamp>=t.expires,"still authorized");}
        else {
            require(t.phase==Phase.Executing,"not executing");
            (,,,,,AgentEscrow.Status status,bytes32 output)=escrow.tasks(id);
            require(status==AgentEscrow.Status.Paid||status==AgentEscrow.Status.Refunded,"unsettled");
            t.accepted=status==AgentEscrow.Status.Paid;t.output=output;
        }
        t.phase=Phase.ResultPending;_send(id,3);emit Transition(id,t.phase);
    }
}
