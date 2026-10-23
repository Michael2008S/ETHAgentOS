// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Local AggregatorV3-compatible fixture only. Updates are deliberately unrestricted.
contract MockPriceFeed {
    uint8 public immutable decimals;
    string public description;
    uint256 public constant version = 1;
    uint80 private currentRound;
    int256 private currentAnswer;
    uint256 private currentUpdatedAt;
    uint80 private currentAnsweredInRound;
    constructor(uint8 precision, string memory pair, int256 answer) {
        decimals = precision; description = pair;
        setRoundData(1, answer, block.timestamp, 1);
    }
    function setRoundData(uint80 roundId, int256 answer, uint256 updatedAt, uint80 answeredInRound) public {
        currentRound=roundId; currentAnswer=answer; currentUpdatedAt=updatedAt; currentAnsweredInRound=answeredInRound;
    }
    function latestRoundData() public view returns(uint80,int256,uint256,uint256,uint80) {
        return(currentRound,currentAnswer,currentUpdatedAt,currentUpdatedAt,currentAnsweredInRound);
    }
    function getRoundData(uint80 roundId) external view returns(uint80,int256,uint256,uint256,uint80) {
        require(roundId==currentRound, "No data present"); return latestRoundData();
    }
}
