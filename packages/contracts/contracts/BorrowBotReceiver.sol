// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { ReceiverTemplate } from "./cre/ReceiverTemplate.sol";
import { BorrowVault } from "./BorrowVault.sol";

/// @notice CRE receiver that decodes a BorrowAndPay plan and calls a `BorrowVault` executor.
contract BorrowBotReceiver is ReceiverTemplate {
  struct BorrowAndPayPlan {
    address borrowAsset;
    uint256 borrowAmount;
    address payee;
    uint256 planExpiresAt;
    uint256 planNonce;
  }

  BorrowVault public immutable vault;

  event ReportProcessed(
    address indexed borrowAsset,
    uint256 borrowAmount,
    address indexed payee,
    uint256 planExpiresAt,
    uint256 planNonce
  );

  constructor(address _owner, address _forwarder, address _vault) ReceiverTemplate(_owner, _forwarder) {
    require(_vault != address(0), "VAULT_0");
    vault = BorrowVault(_vault);
  }

  function _processReport(bytes calldata report) internal override {
    BorrowAndPayPlan memory plan = abi.decode(report, (BorrowAndPayPlan));

    vault.executeBorrowAndPay(plan.borrowAsset, plan.borrowAmount, plan.payee, plan.planExpiresAt, plan.planNonce);

    emit ReportProcessed(plan.borrowAsset, plan.borrowAmount, plan.payee, plan.planExpiresAt, plan.planNonce);
  }
}

