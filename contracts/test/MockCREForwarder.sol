// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface ITestReceiver {
    function supportsInterface(bytes4 id) external view returns(bool);
    function onReport(bytes calldata metadata,bytes calldata report) external;
}
/// @notice Test harness for the receiver callback only. It does not verify DON signatures.
contract MockCREForwarder {
    function deliver(address receiver,bytes calldata metadata,bytes calldata report) external {
        require(ITestReceiver(receiver).supportsInterface(bytes4(keccak256("onReport(bytes,bytes)"))),"receiver interface");
        ITestReceiver(receiver).onReport(metadata,report);
    }
}
