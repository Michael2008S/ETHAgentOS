// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MockToken {
    uint8 public constant decimals = 6;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    function mint(address to,uint256 n) external {balanceOf[to]+=n;}
    function approve(address to,uint256 n) external returns(bool){allowance[msg.sender][to]=n;return true;}
    function transfer(address to,uint256 n) external returns(bool){balanceOf[msg.sender]-=n;balanceOf[to]+=n;return true;}
    function transferFrom(address from,address to,uint256 n) external returns(bool){allowance[from][msg.sender]-=n;balanceOf[from]-=n;balanceOf[to]+=n;return true;}
}
