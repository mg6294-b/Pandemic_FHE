pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PandemicFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error InvalidState();
    error TooFrequent();
    error BatchClosed();
    error BatchNotClosed();
    error InvalidBatch();
    error InvalidCooldown();
    error InvalidBatchSize();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId, address indexed opener);
    event BatchClosed(uint256 indexed batchId, address indexed closer);
    event BatchSizeUpdated(uint256 oldSize, uint256 newSize);
    event DiseaseSpreadSubmitted(address indexed player, uint256 indexed cityId, bytes32 encryptedSpread);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionComplete(uint256 indexed requestId, uint256 indexed batchId, uint256 totalSpread);
    event GameReset(address indexed owner);

    bool public paused;
    uint256 public constant MIN_INTERVAL = 5 seconds;
    uint256 public cooldownInterval = 30 seconds;
    uint256 public maxBatchSize = 50;
    uint256 public currentBatchId = 1;
    uint256 public gameVersion = 1;

    mapping(address => bool) public providers;
    mapping(address => uint256) public lastActionAt;
    mapping(uint256 => bool) public batchClosed;
    mapping(uint256 => euint32) public batchAccumulators;
    mapping(uint256 => uint256) public batchCounts;
    mapping(uint256 => mapping(address => bool)) public batchSubmissions;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastActionAt[msg.sender] + cooldownInterval) {
            revert TooFrequent();
        }
        lastActionAt[msg.sender] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[owner] = true;
        emit ProviderAdded(owner);
    }

    function setCooldownInterval(uint256 newCooldown) external onlyOwner {
        if (newCooldown < MIN_INTERVAL) revert InvalidCooldown();
        uint256 oldCooldown = cooldownInterval;
        cooldownInterval = newCooldown;
        emit CooldownUpdated(oldCooldown, newCooldown);
    }

    function setMaxBatchSize(uint256 newSize) external onlyOwner {
        if (newSize == 0) revert InvalidBatchSize();
        uint256 oldSize = maxBatchSize;
        maxBatchSize = newSize;
        emit BatchSizeUpdated(oldSize, newSize);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function openBatch() external onlyProvider whenNotPaused checkCooldown {
        currentBatchId++;
        batchClosed[currentBatchId] = false;
        emit BatchOpened(currentBatchId, msg.sender);
    }

    function closeBatch(uint256 batchId) external onlyProvider whenNotPaused {
        if (batchId != currentBatchId) revert InvalidBatch();
        if (batchClosed[batchId]) revert BatchClosed();
        batchClosed[batchId] = true;
        emit BatchClosed(batchId, msg.sender);
    }

    function submitDiseaseSpread(uint256 cityId, euint32 encryptedSpread) 
        external 
        onlyProvider 
        whenNotPaused 
        checkCooldown 
    {
        if (batchClosed[currentBatchId]) revert BatchClosed();
        if (batchCounts[currentBatchId] >= maxBatchSize) revert InvalidBatchSize();

        _initIfNeeded(batchAccumulators[currentBatchId]);
        batchAccumulators[currentBatchId] = batchAccumulators[currentBatchId].add(encryptedSpread);
        batchCounts[currentBatchId]++;
        batchSubmissions[currentBatchId][msg.sender] = true;

        bytes32 encryptedSpreadBytes = FHE.toBytes32(encryptedSpread);
        emit DiseaseSpreadSubmitted(msg.sender, cityId, encryptedSpreadBytes);
    }

    function requestBatchDecryption(uint256 batchId) 
        external 
        onlyProvider 
        whenNotPaused 
        checkCooldown 
    {
        if (!batchClosed[batchId]) revert BatchNotClosed();
        if (batchCounts[batchId] == 0) revert InvalidBatch();

        euint32 acc = batchAccumulators[batchId];
        _requireInitialized(acc, "Accumulator not initialized");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(acc);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.handleBatchDecryption.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function handleBatchDecryption(uint256 requestId, bytes memory cleartexts, bytes memory proof) 
        public 
    {
        DecryptionContext storage ctx = decryptionContexts[requestId];
        if (ctx.processed) revert InvalidState();

        euint32 currentAcc = batchAccumulators[ctx.batchId];
        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(currentAcc);

        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        if (currentStateHash != ctx.stateHash) revert InvalidState();

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256 totalSpread = abi.decode(cleartexts, (uint256));
        ctx.processed = true;

        emit DecryptionComplete(requestId, ctx.batchId, totalSpread);
    }

    function resetGame() external onlyOwner {
        delete batchAccumulators;
        delete batchCounts;
        delete batchClosed;
        delete batchSubmissions;
        currentBatchId = 1;
        gameVersion++;
        emit GameReset(msg.sender);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal view returns (euint32) {
        if (!FHE.isInitialized(x)) {
            return FHE.asEuint32(0);
        }
        return x;
    }

    function _requireInitialized(euint32 x, string memory tag) internal pure {
        if (!FHE.isInitialized(x)) {
            revert(string(abi.encodePacked(tag, " not initialized")));
        }
    }
}