// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Local acceptance token only. Anyone can mint; never deploy for real funds.
contract MockAuthorizationToken {
    string public constant name = "DemoUSDC";
    string public constant version = "1";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    bytes32 private constant TRANSFER_TYPEHASH = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant RECEIVE_TYPEHASH = keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this)));
    }
    function mint(address to, uint256 value) external { balanceOf[to] += value; emit Transfer(address(0), to, value); }
    function approve(address spender, uint256 value) external returns (bool) { allowance[msg.sender][spender] = value; emit Approval(msg.sender, spender, value); return true; }
    function transfer(address to, uint256 value) external returns (bool) { _transfer(msg.sender, to, value); return true; }
    function transferFrom(address from, address to, uint256 value) external returns (bool) { allowance[from][msg.sender] -= value; _transfer(from, to, value); return true; }
    function _transfer(address from, address to, uint256 value) private { require(to != address(0), "zero recipient"); balanceOf[from] -= value; balanceOf[to] += value; emit Transfer(from, to, value); }
    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        _authorize(TRANSFER_TYPEHASH, from, to, value, validAfter, validBefore, nonce, v, r, s);
    }
    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes calldata signature) external {
        (uint8 v, bytes32 r, bytes32 s) = _split(signature); _authorize(TRANSFER_TYPEHASH, from, to, value, validAfter, validBefore, nonce, v, r, s);
    }
    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        require(msg.sender == to, "payee only"); _authorize(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce, v, r, s);
    }
    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes calldata signature) external {
        require(msg.sender == to, "payee only"); (uint8 v, bytes32 r, bytes32 s) = _split(signature); _authorize(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce, v, r, s);
    }
    function _split(bytes calldata signature) private pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(signature.length == 65, "signature length");
        assembly { r := calldataload(signature.offset) s := calldataload(add(signature.offset, 32)) v := byte(0, calldataload(add(signature.offset, 64))) }
    }
    function _authorize(bytes32 typehash, address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) private {
        require(block.timestamp > validAfter && block.timestamp < validBefore, "authorization time");
        require(!authorizationState[from][nonce], "authorization used");
        require((v == 27 || v == 28) && uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0, "signature form");
        bytes32 structHash = keccak256(abi.encode(typehash, from, to, value, validAfter, validBefore, nonce));
        address signer = ecrecover(keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash)), v, r, s);
        require(signer != address(0) && signer == from, "authorization signer");
        authorizationState[from][nonce] = true; emit AuthorizationUsed(from, nonce); _transfer(from, to, value);
    }
}
