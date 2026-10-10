// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract StBOTV2 is ERC20 {
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

/// @title AmberV2 — liquid staking with a FUNDED reward pool.
/// v2 fixes vs v1: explicit fundRewards() so the 5% APY is paid from a visible
/// pool (no silent underfunding); rewardPool() view shows live coverage;
/// claims revert clearly when the pool is empty; dead public accrueRewards()
/// removed; owner pause switch (unstake claims always stay open so exits work).
contract AmberV2 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable botToken;
    StBOTV2 public immutable stToken;

    uint256 public constant REWARD_RATE = 5; // 5% simple APR, paid from the funded pool
    uint256 public constant UNSTAKE_DELAY = 2 days;
    uint256 public totalStaked;
    uint256 public totalPendingUnstake;
    uint256 public totalRewardsFunded;
    uint256 public totalRewardsClaimed;

    mapping(address => uint256) public staked;
    mapping(address => uint256) public unstakeRequestTime;
    mapping(address => uint256) public unstakeAmount;
    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public lastRewardAccrual;

    bool public paused;

    event Stake(address indexed user, uint256 amount);
    event UnstakeRequest(address indexed user, uint256 amount);
    event UnstakeClaim(address indexed user, uint256 amount);
    event RewardClaim(address indexed user, uint256 amount);
    event RewardFunded(address indexed from, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    constructor(address _botToken) Ownable(msg.sender) {
        require(_botToken != address(0), "Zero token");
        botToken = IERC20(_botToken);
        stToken = new StBOTV2(address(this));
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    /// WBOT the contract holds above locked stake+unstake = the reward pool.
    function rewardPool() public view returns (uint256) {
        uint256 bal = botToken.balanceOf(address(this));
        uint256 locked = totalStaked + totalPendingUnstake;
        return bal > locked ? bal - locked : 0;
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

    /// Live view of a staker's rewards (accrued on the fly — no tx needed).
    function earned(address user) external view returns (uint256) {
        uint256 last = lastRewardAccrual[user];
        if (last == 0 || staked[user] == 0) return pendingRewards[user];
        uint256 elapsed = block.timestamp - last;
        if (elapsed == 0) return pendingRewards[user];
        return pendingRewards[user] + staked[user] * REWARD_RATE * elapsed / 100 / 365 days;
    }

    function fundRewards(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        botToken.safeTransferFrom(msg.sender, address(this), amount);
        totalRewardsFunded += amount;
        emit RewardFunded(msg.sender, amount);
    }

    function stake(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be > 0");
        _accrue(msg.sender);
        botToken.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        stToken.mint(msg.sender, amount);
        emit Stake(msg.sender, amount);
    }

    function requestUnstake(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(unstakeAmount[msg.sender] == 0, "Unstake already pending");
        require(staked[msg.sender] >= amount, "Insufficient stake");
        _accrue(msg.sender);
        staked[msg.sender] -= amount;
        unstakeRequestTime[msg.sender] = block.timestamp;
        unstakeAmount[msg.sender] = amount;
        totalPendingUnstake += amount;
        stToken.burn(msg.sender, amount);
        emit UnstakeRequest(msg.sender, amount);
    }

    /// Always open, even while paused — exits must never be blocked.
    function claimUnstake() external nonReentrant {
        uint256 amount = unstakeAmount[msg.sender];
        require(amount > 0, "No unstake request");
        require(block.timestamp >= unstakeRequestTime[msg.sender] + UNSTAKE_DELAY, "Delay not elapsed");
        unstakeAmount[msg.sender] = 0;
        totalPendingUnstake -= amount;
        botToken.safeTransfer(msg.sender, amount);
        emit UnstakeClaim(msg.sender, amount);
    }

    function claimReward() external whenNotPaused nonReentrant {
        _accrue(msg.sender);
        uint256 reward = pendingRewards[msg.sender];
        require(reward > 0, "No rewards");
        require(reward <= rewardPool(), "Reward pool empty");
        pendingRewards[msg.sender] = 0;
        totalRewardsClaimed += reward;
        botToken.safeTransfer(msg.sender, reward);
        emit RewardClaim(msg.sender, reward);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function getStake(address user) external view returns (uint256) {
        return staked[user];
    }

    function getPendingUnstake(address user) external view returns (uint256, uint256) {
        return (unstakeAmount[user], unstakeRequestTime[user]);
    }
}
