// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC165 } from "./IERC165.sol";

/// @notice CRE Onchain Write receiver interface.
/// @dev The KeystoneForwarder calls `onReport(metadata, report)` after verifying DON signatures.
interface IReceiver is IERC165 {
  function onReport(bytes calldata metadata, bytes calldata report) external;
}

