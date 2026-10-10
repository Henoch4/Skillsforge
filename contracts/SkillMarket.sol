// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SkillMarket — agent skills marketplace with usage escrow and reputation.
/// Publishers list versioned skill modules; agents (or their owners) pay per use;
/// payment is held until the buyer confirms the execution settled correctly.
/// Reputation is derived from confirmed runs vs. dispute outcomes.
contract SkillMarket is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct Skill {
        address publisher;
        string metadataURI;
        uint256 pricePerUse;
        uint16 version;
        bool active;
        uint256 useCount;
        uint256 earned;
    }

    struct Receipt {
        uint256 skillId;
        address buyer;
        address agent;
        uint256 paid;
        uint64 boughtAt;
        uint8 state; // 0 open, 1 success, 2 disputed
    }

    IERC20 public immutable feeToken;
    address public treasury;
    uint256 public constant PLATFORM_FEE_BPS = 250; // 2.5%
    uint256 public totalSkills;
    uint256 public totalReceipts;
    uint256 public totalVolume;

    Skill[] private _skills;
    Receipt[] private _receipts;
    mapping(address => uint256) public successCount;
    mapping(address => uint256) public failCount;

    event SkillPublished(uint256 indexed skillId, address indexed publisher, string metadataURI, uint256 pricePerUse);
    event PriceUpdated(uint256 indexed skillId, uint256 newPrice);
    event SkillDeactivated(uint256 indexed skillId);
    event SkillUsed(uint256 indexed receiptId, uint256 indexed skillId, address indexed buyer, address agent, uint256 paid);
    event ExecutionConfirmed(uint256 indexed receiptId, uint256 indexed skillId, address indexed publisher, uint256 payout);
    event ExecutionDisputed(uint256 indexed receiptId, address indexed by);
    event DisputeResolved(uint256 indexed receiptId, bool publisherAtFault, address indexed arbiter);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    constructor(address _token) Ownable(msg.sender) {
        require(_token != address(0), "Zero token");
        feeToken = IERC20(_token);
        treasury = msg.sender;
    }

    function publish(string calldata metadataURI, uint256 pricePerUse) external returns (uint256) {
        require(bytes(metadataURI).length > 0, "Empty metadata");
        require(pricePerUse > 0, "Price must be > 0");
        Skill storage s = _skills.push();
        s.publisher = msg.sender;
        s.metadataURI = metadataURI;
        s.pricePerUse = pricePerUse;
        s.active = true;
        totalSkills += 1;
        emit SkillPublished(_skills.length - 1, msg.sender, metadataURI, pricePerUse);
        return _skills.length - 1;
    }

    function setPrice(uint256 skillId, uint256 newPrice) external {
        Skill storage s = _skills[skillId];
        require(msg.sender == s.publisher, "Publisher only");
        require(newPrice > 0, "Price must be > 0");
        s.pricePerUse = newPrice;
        s.version += 1;
        emit PriceUpdated(skillId, newPrice);
    }

    function deactivate(uint256 skillId) external {
        Skill storage s = _skills[skillId];
        require(msg.sender == s.publisher, "Publisher only");
        s.active = false;
        emit SkillDeactivated(skillId);
    }

    /// Buyer pays for one run. Funds are escrowed in the contract until the
    /// buyer confirms the execution or a dispute is resolved.
    function useSkill(uint256 skillId, address agent) external nonReentrant returns (uint256) {
        Skill storage s = _skills[skillId];
        require(s.active, "Skill inactive");
        if (agent == address(0)) agent = msg.sender;
        feeToken.safeTransferFrom(msg.sender, address(this), s.pricePerUse);
        Receipt storage r = _receipts.push();
        r.skillId = skillId;
        r.buyer = msg.sender;
        r.agent = agent;
        r.paid = s.pricePerUse;
        r.boughtAt = uint64(block.timestamp);
        s.useCount += 1;
        totalReceipts += 1;
        totalVolume += s.pricePerUse;
        emit SkillUsed(_receipts.length - 1, skillId, msg.sender, agent, s.pricePerUse);
        return _receipts.length - 1;
    }

    function confirmSuccess(uint256 receiptId) external nonReentrant {
        Receipt storage r = _receipts[receiptId];
        require(r.state == 0, "Not open");
        require(msg.sender == r.buyer, "Buyer only");
        r.state = 1;
        Skill storage s = _skills[r.skillId];
        uint256 fee = r.paid * PLATFORM_FEE_BPS / 10000;
        uint256 payout = r.paid - fee;
        s.earned += payout;
        successCount[s.publisher] += 1;
        feeToken.safeTransfer(treasury, fee);
        feeToken.safeTransfer(s.publisher, payout);
        emit ExecutionConfirmed(receiptId, r.skillId, s.publisher, payout);
    }

    function disputeExecution(uint256 receiptId) external {
        Receipt storage r = _receipts[receiptId];
        require(r.state == 0, "Not open");
        require(msg.sender == r.buyer, "Buyer only");
        r.state = 2;
        emit ExecutionDisputed(receiptId, msg.sender);
    }

    function resolveDispute(uint256 receiptId, bool publisherAtFault) external onlyOwner nonReentrant {
        Receipt storage r = _receipts[receiptId];
        require(r.state == 2, "Not disputed");
        Skill storage s = _skills[r.skillId];
        if (publisherAtFault) {
            r.state = 0; // closed as failed
            failCount[s.publisher] += 1;
            feeToken.safeTransfer(r.buyer, r.paid);
        } else {
            r.state = 1;
            uint256 fee = r.paid * PLATFORM_FEE_BPS / 10000;
            uint256 payout = r.paid - fee;
            s.earned += payout;
            successCount[s.publisher] += 1;
            feeToken.safeTransfer(treasury, fee);
            feeToken.safeTransfer(s.publisher, payout);
        }
        emit DisputeResolved(receiptId, publisherAtFault, msg.sender);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Zero treasury");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function getSkill(uint256 skillId)
        external
        view
        returns (address publisher, string memory metadataURI, uint256 pricePerUse, uint16 version, bool active, uint256 useCount, uint256 earned)
    {
        Skill storage s = _skills[skillId];
        return (s.publisher, s.metadataURI, s.pricePerUse, s.version, s.active, s.useCount, s.earned);
    }

    function getReceipt(uint256 receiptId)
        external
        view
        returns (uint256 skillId, address buyer, address agent, uint256 paid, uint64 boughtAt, uint8 state)
    {
        Receipt storage r = _receipts[receiptId];
        return (r.skillId, r.buyer, r.agent, r.paid, r.boughtAt, r.state);
    }
}
