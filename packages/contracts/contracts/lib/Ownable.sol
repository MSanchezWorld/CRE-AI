// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

abstract contract Ownable {
  address public owner;

  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  constructor(address _owner) {
    require(_owner != address(0), "OWNER_0");
    owner = _owner;
    emit OwnershipTransferred(address(0), _owner);
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "NOT_OWNER");
    _;
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "OWNER_0");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }
}

