// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IReceiver } from "./IReceiver.sol";
import { IERC165 } from "./IERC165.sol";
import { Ownable } from "../lib/Ownable.sol";

/// @notice Minimal receiver template for Chainlink CRE onchain writes.
/// @dev Implements IReceiver + ERC165 and provides forwarder + optional metadata validation.
abstract contract ReceiverTemplate is IReceiver, Ownable {
  address public forwarder;

  bytes32 public expectedWorkflowId; // optional
  address public expectedAuthor; // optional
  bytes10 public expectedWorkflowName; // optional (requires expectedAuthor)

  error UnauthorizedForwarder();
  error InvalidForwarder();
  error InvalidMetadata();
  error WorkflowIdMismatch(bytes32 expected, bytes32 got);
  error AuthorMismatch(address expected, address got);
  error WorkflowNameMismatch(bytes10 expected, bytes10 got);
  error WorkflowNameRequiresAuthorValidation();

  event ForwarderUpdated(address indexed forwarder);
  event ExpectedWorkflowIdUpdated(bytes32 indexed workflowId);
  event ExpectedAuthorUpdated(address indexed author);
  event ExpectedWorkflowNameUpdated(bytes10 indexed workflowName);

  constructor(address _owner, address _forwarder) Ownable(_owner) {
    _setForwarder(_forwarder);
  }

  function setForwarder(address _forwarder) external onlyOwner {
    _setForwarder(_forwarder);
  }

  function _setForwarder(address _forwarder) internal {
    if (_forwarder == address(0)) revert InvalidForwarder();
    forwarder = _forwarder;
    emit ForwarderUpdated(_forwarder);
  }

  function setExpectedWorkflowId(bytes32 workflowId) external onlyOwner {
    expectedWorkflowId = workflowId;
    emit ExpectedWorkflowIdUpdated(workflowId);
  }

  function setExpectedAuthor(address author) external onlyOwner {
    expectedAuthor = author;
    emit ExpectedAuthorUpdated(author);
  }

  function setExpectedWorkflowName(bytes10 workflowName) external onlyOwner {
    // Name-only validation is unsafe due to 40-bit truncation; require author too.
    if (workflowName != bytes10(0) && expectedAuthor == address(0)) {
      revert WorkflowNameRequiresAuthorValidation();
    }
    expectedWorkflowName = workflowName;
    emit ExpectedWorkflowNameUpdated(workflowName);
  }

  function onReport(bytes calldata metadata, bytes calldata report) external {
    if (msg.sender != forwarder) revert UnauthorizedForwarder();

    if (expectedWorkflowId != bytes32(0) || expectedAuthor != address(0) || expectedWorkflowName != bytes10(0)) {
      (bytes32 workflowId, bytes10 workflowName, address workflowOwner) = _decodeMetadata(metadata);

      if (expectedWorkflowId != bytes32(0) && workflowId != expectedWorkflowId) {
        revert WorkflowIdMismatch(expectedWorkflowId, workflowId);
      }
      if (expectedAuthor != address(0) && workflowOwner != expectedAuthor) {
        revert AuthorMismatch(expectedAuthor, workflowOwner);
      }
      if (expectedWorkflowName != bytes10(0) && workflowName != expectedWorkflowName) {
        revert WorkflowNameMismatch(expectedWorkflowName, workflowName);
      }
    }

    _processReport(report);
  }

  /// @dev metadata is abi.encodePacked(bytes32 workflowId, bytes10 workflowName, address workflowOwner)
  function _decodeMetadata(bytes calldata metadata)
    internal
    pure
    returns (bytes32 workflowId, bytes10 workflowName, address workflowOwner)
  {
    // bytes32 (32) + bytes10 (10) + address (20) = 62 bytes.
    if (metadata.length < 62) revert InvalidMetadata();

    assembly {
      workflowId := calldataload(metadata.offset)
      workflowName := calldataload(add(metadata.offset, 32))
      let ownerWord := calldataload(add(metadata.offset, 42))
      workflowOwner := shr(96, ownerWord)
    }
  }

  function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
    return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
  }

  function _processReport(bytes calldata report) internal virtual;
}

