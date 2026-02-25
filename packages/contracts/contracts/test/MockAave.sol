// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20 } from "../lib/IERC20.sol";

contract MockPool {
  uint256 public constant DEFAULT_HEALTH_FACTOR = 2e18;

  mapping(address => uint256) private _healthFactorByUser;
  mapping(address => bool) private _hasHealthFactorOverride;

  function setHealthFactor(address user, uint256 hf) external {
    _healthFactorByUser[user] = hf;
    _hasHealthFactorOverride[user] = true;
  }

  function supply(address asset, uint256 amount, address /*onBehalfOf*/, uint16 /*referralCode*/) external {
    IERC20(asset).transferFrom(msg.sender, address(this), amount);
  }

  function borrow(
    address asset,
    uint256 amount,
    uint256 /*interestRateMode*/,
    uint16 /*referralCode*/,
    address onBehalfOf
  ) external {
    IERC20(asset).transfer(onBehalfOf, amount);
  }

  function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
    IERC20(asset).transfer(to, amount);
    return amount;
  }

  function repay(
    address asset,
    uint256 amount,
    uint256 /*interestRateMode*/,
    address /*onBehalfOf*/
  ) external returns (uint256) {
    IERC20(asset).transferFrom(msg.sender, address(this), amount);
    return amount;
  }

  function setUserUseReserveAsCollateral(address /*asset*/, bool /*useAsCollateral*/) external {}

  function getUserAccountData(address user)
    external
    view
    returns (uint256, uint256, uint256, uint256, uint256, uint256)
  {
    uint256 hf = _hasHealthFactorOverride[user] ? _healthFactorByUser[user] : DEFAULT_HEALTH_FACTOR;
    return (0, 0, 0, 0, 0, hf);
  }
}

contract MockPoolAddressesProvider {
  address public pool;

  constructor(address _pool) {
    pool = _pool;
  }

  function setPool(address _pool) external {
    pool = _pool;
  }

  function getPool() external view returns (address) {
    return pool;
  }
}
