// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  PHPA — Philippine Peso Stablecoin
//  Issuer: Axelion | axelion.group | phpa.ph
//  Version: 1.1.2
//  Chain: EVM (Ethereum, Polygon, BNB Smart Chain, Base, Ronin)
//
//  Architecture:
//  - ERC-20 base (OpenZeppelin 5.x)
//  - Role-based access control (OpenZeppelin AccessControl)
//  - Mintable:  MINTER_ROLE only
//  - Burnable:  BURNER_ROLE only (operator-initiated redemption)
//  - Pausable:  PAUSER_ROLE (2-of-3 Fireblocks approval: CEO, CPO, Compliance Officer)
//  - Freezable: FREEZER_ROLE (AML/CFT + BSP regulatory compliance)
//  - Non-upgradeable by design (BSP white paper commitment)
//  - No algorithmic stabilisation. No supply cap. 1 PHPA = PHP 1.00
//
//  Privileged roles (all require 2-of-3 via Fireblocks policy engine
//  before any on-chain call is submitted):
//    DEFAULT_ADMIN_ROLE — role management + token rescue
//    MINTER_ROLE        — mint new PHPA after verified PHP receipt
//    BURNER_ROLE        — burn PHPA after PHP disbursement confirmed
//    PAUSER_ROLE        — emergency pause / unpause all transfers
//    FREEZER_ROLE       — freeze / unfreeze individual addresses
//
//  NOTE: The Fireblocks policy engine enforces 2-of-3 multi-party
//  approval (CEO, CPO, Compliance Officer) BEFORE any privileged
//  transaction is submitted on-chain. The smart contract trusts the
//  caller address; the human approval gate lives in Fireblocks.
//  Once Fireblocks confirms their integration model (Q2 pending),
//  the MINTER_ROLE address will be updated to the confirmed
//  Fireblocks vault address.
//
//  Changelog:
//  v1.1.2 — Remove self-burn capability (Kengo review)
//
//  Removed ERC20Burnable inheritance. Token holders can no longer
//    burn their own PHPA balance. Burn is now exclusively operator-
//    controlled via BURNER_ROLE, ensuring the burn lifecycle remains
//    fully coupled to PHP reserve disbursement and BSP attestation.
//    Consistent with USDC and XSGD institutional standard.
//    White paper Section 2 burn mechanics to be updated before
//    publication (post-BSP pre-consultation meeting).
//
//  v1.1.1 — Post-audit additions (Kengo review)
//
//  Added rescueERC20: allows DEFAULT_ADMIN_ROLE to recover any
//    ERC-20 token accidentally sent to this contract address.
//    Cannot be used to withdraw PHPA itself. Uses SafeERC20
//    to handle non-standard ERC-20 return values safely.
//
//  Added rescueETH: allows DEFAULT_ADMIN_ROLE to recover native
//    ETH or MATIC accidentally sent to this contract address.
//    Contract now includes a receive() fallback to accept native
//    currency deposits.
//
//  Added VERSION: public constant string recording the contract
//    version on-chain for integrations, auditors, and BSP records.
//
//  v1.1.0 — Hexens audit fixes (AXE1-1, AXE1-2) + ordering fix
//
//  AXE1-1 (Low): decimals changed from 2 to 6.
//    Aligns with USDC standard for EVM ecosystem compatibility.
//    1 PHPA = 1,000,000 units at contract level (micro-peso).
//    Example: mint 1000000 = 1.000000 PHPA = PHP 1.00
//
//  AXE1-2 (Informational): operatorBurn now bypasses the freeze
//    check via a transient _frozenBurnBypass flag, allowing
//    BURNER_ROLE to seize and burn a frozen balance without
//    unfreezing first. This eliminates the front-run window
//    where a holder could move funds during a forced unfreeze.
//    The pause check is still fully enforced on operatorBurn
//    (consistent with USDC and XSGD industry standard).
//
//  Ordering fix (not in Hexens report): freeze check in _update
//    now runs BEFORE super._update. Previously, super._update
//    executed first (changing state) before the freeze revert
//    could fire. Now state changes only after all checks pass.
//
//  Auditor: Hexens (via Fireblocks partner network)
//  Audit report published at: phpa.ph before mainnet deployment
// ============================================================

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PHPA is ERC20, ERC20Pausable, AccessControl {

    using SafeERC20 for IERC20;

    // --------------------------------------------------------
    // VERSION
    // --------------------------------------------------------

    /// @dev On-chain version string. Queryable by integrations, auditors, and BSP.
    string public constant VERSION = "1.1.2";


    // --------------------------------------------------------
    // ROLES
    // --------------------------------------------------------

    /// @dev Can mint new PHPA. Assigned to Fireblocks vault address.
    bytes32 public constant MINTER_ROLE  = keccak256("MINTER_ROLE");

    /// @dev Can burn PHPA on redemption. Assigned to Fireblocks vault address.
    bytes32 public constant BURNER_ROLE  = keccak256("BURNER_ROLE");

    /// @dev Can pause and unpause all transfers. Emergency use only.
    bytes32 public constant PAUSER_ROLE  = keccak256("PAUSER_ROLE");

    /// @dev Can freeze and unfreeze individual addresses for AML/CFT compliance.
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");


    // --------------------------------------------------------
    // STATE
    // --------------------------------------------------------

    /// @dev Tracks frozen addresses. Frozen addresses cannot send or receive PHPA.
    mapping(address => bool) private _frozen;

    /**
     * @dev Transient flag used exclusively by operatorBurn.
     *      When true, the freeze check in _update is skipped.
     *      Set to true immediately before _burn, reset to false immediately after.
     *      Never persists across transactions.
     */
    bool private _frozenBurnBypass;


    // --------------------------------------------------------
    // EVENTS
    // --------------------------------------------------------

    /// @dev Emitted when an address is frozen for AML/CFT or regulatory compliance.
    event AddressFrozen(address indexed account, address indexed frozenBy);

    /// @dev Emitted when a frozen address is unfrozen.
    event AddressUnfrozen(address indexed account, address indexed unfrozenBy);

    /// @dev Emitted on every mint. Full audit trail for BSP reserve attestation.
    event Minted(address indexed to, uint256 amount, address indexed mintedBy);

    /// @dev Emitted on every burn. Full audit trail for BSP reserve attestation.
    event Burned(address indexed from, uint256 amount, address indexed burnedBy);

    /// @dev Emitted when a foreign ERC-20 token is rescued from this contract.
    event ERC20Rescued(address indexed token, address indexed to, uint256 amount);

    /// @dev Emitted when native ETH or MATIC is rescued from this contract.
    event ETHRescued(address indexed to, uint256 amount);


    // --------------------------------------------------------
    // CONSTRUCTOR
    // --------------------------------------------------------

    /**
     * @notice Deploys the PHPA stablecoin contract.
     * @dev    All privileged roles are assigned to the deployer at construction
     *         and must be transferred to the Fireblocks vault address immediately
     *         after deployment. The deployer address should be revoked from all
     *         roles after the Fireblocks vault address is confirmed.
     *
     *         DEFAULT_ADMIN_ROLE controls role management and token rescue.
     *         Fireblocks vault configuration for this role should be confirmed
     *         before mainnet deployment.
     *
     * @param fireblocksVault  The Fireblocks-managed vault address that will hold
     *                         MINTER_ROLE, BURNER_ROLE, PAUSER_ROLE, and FREEZER_ROLE.
     *                         Pass deployer address temporarily if Fireblocks vault
     *                         address is not yet confirmed at deploy time.
     */
    constructor(address fireblocksVault) ERC20("Philippine Peso Stablecoin", "PHPA") {
        require(fireblocksVault != address(0), "PHPA: vault address cannot be zero");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE,  fireblocksVault);
        _grantRole(BURNER_ROLE,  fireblocksVault);
        _grantRole(PAUSER_ROLE,  fireblocksVault);
        _grantRole(FREEZER_ROLE, fireblocksVault);
    }


    // --------------------------------------------------------
    // RECEIVE — accept native ETH / MATIC
    // --------------------------------------------------------

    /**
     * @dev Allows the contract to receive native ETH or MATIC sent directly
     *      to its address. Any received amount can be recovered via rescueETH.
     */
    receive() external payable {}


    // --------------------------------------------------------
    // DECIMALS
    // --------------------------------------------------------

    /**
     * @notice Returns 6 decimal places for EVM ecosystem compatibility.
     * @dev    Changed from 2 to 6 per Hexens audit finding AXE1-1.
     *         ERC-20 default is 18. PHPA uses 6, consistent with USDC,
     *         to avoid integration issues with exchanges, wallets, bridges,
     *         and DeFi protocols that assume standard precision.
     *         1 PHPA = 1,000,000 units at the contract level.
     *         All mint and burn amounts must be expressed in micro-peso units.
     *         Example: mint 1000000 = 1.000000 PHPA = PHP 1.00
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }


    // --------------------------------------------------------
    // MINT
    // --------------------------------------------------------

    /**
     * @notice Mints new PHPA tokens to a recipient address.
     * @dev    Called by the Fireblocks vault address ONLY after:
     *           1. PHP has been received and confirmed in the reserve account.
     *           2. 2-of-3 Fireblocks policy approval has been completed
     *              (CEO, CPO, Compliance Officer).
     *         Amount is expressed in micro-peso units (6 decimals).
     *         Example: mint 1000000 = 1.000000 PHPA = PHP 1.00
     *
     * @param to     Recipient wallet address.
     * @param amount Amount in micro-peso units (PHP x 1,000,000).
     */
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        require(to != address(0), "PHPA: mint to zero address");
        require(amount > 0, "PHPA: mint amount must be greater than zero");
        _mint(to, amount);
        emit Minted(to, amount, msg.sender);
    }


    // --------------------------------------------------------
    // BURN (OPERATOR-INITIATED REDEMPTION)
    // --------------------------------------------------------

    /**
     * @notice Burns PHPA tokens from a holder's address on redemption.
     * @dev    Called by the Fireblocks vault address ONLY after:
     *           1. PHP has been disbursed to the user's bank account.
     *           2. 2-of-3 Fireblocks policy approval has been completed.
     *         This is the only burn path available. Self-burn by token holders
     *         is not permitted. Burn is exclusively operator-controlled.
     *
     *         AXE1-2 fix: sets _frozenBurnBypass = true before calling _burn,
     *         then resets it to false immediately after. This causes _update
     *         to skip the freeze check for this burn only, allowing BURNER_ROLE
     *         to burn from a frozen address without unfreezing first.
     *
     *         The pause check (whenNotPaused) is still fully enforced.
     *         operatorBurn cannot execute while the contract is paused.
     *         This is consistent with USDC and XSGD industry standard.
     *
     * @param from   Address whose PHPA tokens are being burned.
     * @param amount Amount in micro-peso units.
     */
    function operatorBurn(address from, uint256 amount)
        external
        onlyRole(BURNER_ROLE)
        whenNotPaused
    {
        require(from != address(0), "PHPA: burn from zero address");
        require(amount > 0, "PHPA: burn amount must be greater than zero");
        _frozenBurnBypass = true;
        _burn(from, amount);
        _frozenBurnBypass = false;
        emit Burned(from, amount, msg.sender);
    }


    // --------------------------------------------------------
    // PAUSE / UNPAUSE
    // --------------------------------------------------------

    /**
     * @notice Pauses all PHPA transfers, mints, and burns.
     * @dev    Emergency use only. Triggers: BSP directive, security incident,
     *         force majeure. Requires PAUSER_ROLE (Fireblocks 2-of-3 approval).
     *         Public disclosure at phpa.ph required within 6 hours of pause.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses all PHPA transfers, mints, and burns.
     * @dev    Requires PAUSER_ROLE (Fireblocks 2-of-3 approval).
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }


    // --------------------------------------------------------
    // FREEZE / UNFREEZE
    // --------------------------------------------------------

    /**
     * @notice Freezes a specific address, blocking all sends and receives.
     * @dev    AML/CFT compliance tool. Triggers: BSP/court order, AMLC
     *         freeze directive, confirmed AML flag, security incident.
     *         Requires FREEZER_ROLE (same 2-of-3 Fireblocks approval as mint/burn).
     *         All freeze actions are logged on-chain via AddressFrozen event
     *         for BSP audit trail.
     *         Note: a frozen address can still have its balance burned by
     *         BURNER_ROLE via operatorBurn without requiring unfreeze.
     *
     * @param account Address to freeze.
     */
    function freeze(address account) external onlyRole(FREEZER_ROLE) {
        require(account != address(0), "PHPA: cannot freeze zero address");
        require(!_frozen[account], "PHPA: address already frozen");
        _frozen[account] = true;
        emit AddressFrozen(account, msg.sender);
    }

    /**
     * @notice Unfreezes a previously frozen address.
     * @dev    Requires FREEZER_ROLE (Fireblocks 2-of-3 approval).
     *
     * @param account Address to unfreeze.
     */
    function unfreeze(address account) external onlyRole(FREEZER_ROLE) {
        require(_frozen[account], "PHPA: address is not frozen");
        _frozen[account] = false;
        emit AddressUnfrozen(account, msg.sender);
    }

    /**
     * @notice Returns true if the address is currently frozen.
     * @param account Address to check.
     */
    function isFrozen(address account) external view returns (bool) {
        return _frozen[account];
    }


    // --------------------------------------------------------
    // TOKEN RESCUE
    // --------------------------------------------------------

    /**
     * @notice Rescues ERC-20 tokens mistakenly sent to this contract address.
     * @dev    Callable only by DEFAULT_ADMIN_ROLE.
     *         Cannot be used to withdraw PHPA itself — PHP reserves are protected.
     *         Uses OpenZeppelin SafeERC20 to handle non-standard ERC-20 return
     *         values safely (e.g. older USDT versions that do not return bool).
     *         Emits ERC20Rescued for on-chain audit trail.
     *
     * @param token  Address of the ERC-20 token contract to rescue.
     * @param to     Recipient address for the rescued tokens.
     * @param amount Amount of tokens to rescue.
     */
    function rescueERC20(address token, address to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(token != address(this), "PHPA: cannot rescue PHPA itself");
        require(to != address(0), "PHPA: rescue to zero address");
        require(amount > 0, "PHPA: rescue amount must be greater than zero");
        IERC20(token).safeTransfer(to, amount);
        emit ERC20Rescued(token, to, amount);
    }

    /**
     * @notice Rescues native ETH or MATIC mistakenly sent to this contract address.
     * @dev    Callable only by DEFAULT_ADMIN_ROLE.
     *         The contract accepts native currency via the receive() fallback.
     *         Emits ETHRescued for on-chain audit trail.
     *
     * @param to     Recipient address for the rescued native currency.
     * @param amount Amount in wei to rescue.
     */
    function rescueETH(address payable to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(to != address(0), "PHPA: rescue to zero address");
        require(amount > 0, "PHPA: rescue amount must be greater than zero");
        require(address(this).balance >= amount, "PHPA: insufficient ETH balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "PHPA: ETH rescue transfer failed");
        emit ETHRescued(to, amount);
    }


    // --------------------------------------------------------
    // INTERNAL TRANSFER HOOK
    // --------------------------------------------------------

    /**
     * @dev Internal hook called before every token transfer (including mint and burn).
     *      Enforces two conditions:
     *        1. Freeze check: neither sender nor recipient may be frozen,
     *           unless _frozenBurnBypass is active (operatorBurn path only).
     *           address(0) checks allow mint (from = 0) and burn (to = 0)
     *           to pass correctly — only the non-zero address is checked.
     *        2. Pause check: contract must not be paused (handled by
     *           ERC20Pausable via super._update).
     *
     *      Ordering fix vs v1.0.0: freeze check now runs BEFORE super._update
     *      so state does not change before a revert can fire.
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Pausable) {
        // Freeze check first — before any state change.
        // Skipped only when _frozenBurnBypass is active (operatorBurn).
        if (!_frozenBurnBypass) {
            if (from != address(0)) {
                require(!_frozen[from], "PHPA: sender address is frozen");
            }
            if (to != address(0)) {
                require(!_frozen[to], "PHPA: recipient address is frozen");
            }
        }

        // Pause check and balance/supply state update.
        super._update(from, to, amount);
    }


    // --------------------------------------------------------
    // ACCESS CONTROL OVERRIDE
    // --------------------------------------------------------

    /**
     * @dev Required override to resolve diamond inheritance between
     *      ERC20, ERC20Pausable, and AccessControl.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
