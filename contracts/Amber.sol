// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract StBOT is ERC20 {
    address public immutable minter;

    constructor(address _minter) ERC20("Staked BOT", "stBOT") {
        minter = _minter;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Not minter");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == minter, "Not minter");
        _burn(from, amount);
    }
}

contract Amber is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable botToken;
    StBOT public immutable stToken;

    uint256 public constant REWARD_RATE = 5;
    uint256 public constant UNSTAKE_DELAY = 2 days;
    uint256 public totalStaked;
    uint256 public lastRewardUpdate;

    mapping(address => uint256) public staked;
    mapping(address => uint256) public unstakeRequestTime;
    mapping(address => uint256) public unstakeAmount;
    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public lastRewardAccrual;

    event Stake(address indexed user, uint256 amount);
    event UnstakeRequest(address indexed user, uint256 amount);
    event UnstakeClaim(address indexed user, uint256 amount);
    event RewardClaim(address indexed user, uint256 amount);

    constructor(address _botToken) Ownable(msg.sender) {
        botToken = IERC20(_botToken);
        stToken = new StBOT(address(this));
        lastRewardUpdate = block.timestamp;
    }

    function _accrue(address user) internal {
        uint256 last = lastRewardAccrual[user];
        if (last == 0) {
            lastRewardAccrual[user] = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - last;
        if (elapsed == 0 || staked[user] == 0) {
            lastRewardAccrual[user] = block.timestamp;
            return;
        }
        pendingRewards[user] += staked[user] * REWARD_RATE * elapsed / 100 / 365 days;
        lastRewardAccrual[user] = block.timestamp;
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        _accrue(msg.sender);
        botToken.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        stToken.mint(msg.sender, amount);
        emit Stake(msg.sender, amount);
    }

    function requestUnstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(unstakeAmount[msg.sender] == 0, "Unstake already pending");
        require(staked[msg.sender] >= amount, "Insufficient stake");
        _accrue(msg.sender);
        staked[msg.sender] -= amount;
        unstakeRequestTime[msg.sender] = block.timestamp;
        unstakeAmount[msg.sender] = amount;
        stToken.burn(msg.sender, amount);
        emit UnstakeRequest(msg.sender, amount);
    }

    function claimUnstake() external nonReentrant {
        uint256 amount = unstakeAmount[msg.sender];
        require(amount > 0, "No unstake request");
        require(block.timestamp >= unstakeRequestTime[msg.sender] + UNSTAKE_DELAY, "Delay not elapsed");
        unstakeAmount[msg.sender] = 0;
        botToken.safeTransfer(msg.sender, amount);
        emit UnstakeClaim(msg.sender, amount);
    }

    function claimReward() external nonReentrant {
        _accrue(msg.sender);
        uint256 reward = pendingRewards[msg.sender];
        require(reward > 0, "No rewards");
        pendingRewards[msg.sender] = 0;
        botToken.safeTransfer(msg.sender, reward);
        emit RewardClaim(msg.sender, reward);
    }

    function getStake(address user) external view returns (uint256) {
        return staked[user];
    }

    function getPendingUnstake(address user) external view returns (uint256, uint256) {
        return (unstakeAmount[user], unstakeRequestTime[user]);
    }

    function accrueRewards() external {
        uint256 timeElapsed = block.timestamp - lastRewardUpdate;
        if (timeElapsed == 0 || totalStaked == 0) return;
        lastRewardUpdate = block.timestamp;
    }
}
