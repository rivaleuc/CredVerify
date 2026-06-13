// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import {HireGate} from "../src/HireGate.sol";

contract HireGateTest is Test {
    HireGate gate;
    address resolver = address(0xBEEF);
    address candidate = address(0x1);

    function setUp() public {
        gate = new HireGate(resolver);
        gate.createRole("Senior Rust Dev", 0);
    }

    function test_grant_access() public {
        vm.prank(resolver);
        gate.grant(0, candidate);
        assertTrue(gate.isQualified(0, candidate));
        assertEq(gate.getUserRoles(candidate).length, 1);
    }

    function test_revoke() public {
        vm.prank(resolver);
        gate.grant(0, candidate);

        gate.revoke(0, candidate);
        assertFalse(gate.isQualified(0, candidate));
    }

    function test_only_resolver_grants() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(HireGate.NotResolver.selector);
        gate.grant(0, candidate);
    }

    function test_no_double_grant() public {
        vm.startPrank(resolver);
        gate.grant(0, candidate);
        vm.expectRevert(HireGate.AlreadyGranted.selector);
        gate.grant(0, candidate);
        vm.stopPrank();
    }

    function test_deactivate_role() public {
        gate.deactivateRole(0);
        vm.prank(resolver);
        vm.expectRevert(HireGate.RoleNotActive.selector);
        gate.grant(0, candidate);
    }
}
