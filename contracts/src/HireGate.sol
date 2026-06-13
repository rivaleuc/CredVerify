// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title HireGate — on-chain access control gated by GenLayer credential verification
/// @notice DAOs/orgs use this to gate contributor access. The resolver reads
///         CredVerify.check_qualified() and grants roles on-chain.
///         Unlike a simple allowlist, access is earned through verified credentials.
///
/// Use cases:
///   - DAO grants contributor role only to verified developers
///   - Protocol gates testnet access to qualified auditors
///   - Bounty platform restricts high-value bounties to proven builders
contract HireGate is Ownable {
    struct Role {
        string title;
        uint256 genLayerRoleKey;  // maps to CredVerify role
        uint256 grantedCount;
        bool active;
    }

    address public resolver;
    mapping(uint256 => Role) public roles;
    uint256 public roleCount;

    // roleId => address => granted
    mapping(uint256 => mapping(address => bool)) public hasAccess;
    // address => array of roleIds granted
    mapping(address => uint256[]) public userRoles;

    event RoleCreated(uint256 indexed roleId, string title, uint256 genLayerKey);
    event AccessGranted(uint256 indexed roleId, address indexed account);
    event AccessRevoked(uint256 indexed roleId, address indexed account);
    event ResolverUpdated(address resolver);

    error NotResolver();
    error RoleNotActive();
    error AlreadyGranted();
    error NotGranted();

    constructor(address _resolver) Ownable(msg.sender) {
        resolver = _resolver;
    }

    function setResolver(address _resolver) external onlyOwner {
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    /// @notice Create a gated role linked to a GenLayer credential check.
    function createRole(string calldata title, uint256 genLayerRoleKey) external onlyOwner returns (uint256 id) {
        id = roleCount++;
        roles[id] = Role({
            title: title,
            genLayerRoleKey: genLayerRoleKey,
            grantedCount: 0,
            active: true
        });
        emit RoleCreated(id, title, genLayerRoleKey);
    }

    /// @notice Resolver confirms candidate is qualified → grant access.
    function grant(uint256 roleId, address account) external {
        if (msg.sender != resolver) revert NotResolver();
        Role storage r = roles[roleId];
        if (!r.active) revert RoleNotActive();
        if (hasAccess[roleId][account]) revert AlreadyGranted();

        hasAccess[roleId][account] = true;
        userRoles[account].push(roleId);
        r.grantedCount++;
        emit AccessGranted(roleId, account);
    }

    /// @notice Owner can revoke access.
    function revoke(uint256 roleId, address account) external onlyOwner {
        if (!hasAccess[roleId][account]) revert NotGranted();
        hasAccess[roleId][account] = false;
        emit AccessRevoked(roleId, account);
    }

    function deactivateRole(uint256 roleId) external onlyOwner {
        roles[roleId].active = false;
    }

    function getUserRoles(address account) external view returns (uint256[] memory) {
        return userRoles[account];
    }

    function isQualified(uint256 roleId, address account) external view returns (bool) {
        return hasAccess[roleId][account];
    }
}
