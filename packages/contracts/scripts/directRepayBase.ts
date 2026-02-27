import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { formatUnits } from "ethers";

const DEFAULT_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const VARIABLE_RATE_MODE = 2;

function getVaultAddressFromCreConfig(): string {
  const p = path.join(__dirname, "../../../cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json");
  return String(JSON.parse(fs.readFileSync(p, "utf-8")).vaultAddress || "").trim();
}

function fmt(raw: bigint, decimals: number) {
  return formatUnits(raw, decimals);
}

async function main() {
  const vaultAddress = ethers.getAddress(
    (process.env.VAULT_ADDRESS?.trim() || getVaultAddressFromCreConfig()).trim()
  );
  const usdc = ethers.getAddress(DEFAULT_USDC_BASE);
  const [signer] = await ethers.getSigners();

  // Resolve Aave pool
  const ap = await (
    await ethers.getContractAt(["function aaveAddressesProvider() view returns (address)"], vaultAddress)
  ).aaveAddressesProvider();
  const poolAddr = await (
    await ethers.getContractAt(["function getPool() view returns (address)"], ap)
  ).getPool();

  const pool = await ethers.getContractAt(
    [
      "function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf) returns (uint256)",
      "function getReserveData(address asset) view returns (tuple(uint256,uint128,uint128,uint128,uint128,uint128,uint40,uint16,address,address,address,address,uint128,uint128,uint128))",
    ],
    poolAddr,
    signer
  );

  const rd = await pool.getReserveData(usdc);
  const debtToken = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], rd[10] as string);
  const usdcToken = await ethers.getContractAt(
    [
      "function balanceOf(address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
      "function decimals() view returns (uint8)",
      "function allowance(address,address) view returns (uint256)",
    ],
    usdc,
    signer
  );
  const decimals = Number(await usdcToken.decimals());

  const debt = (await debtToken.balanceOf(vaultAddress)) as bigint;
  const wallet = (await usdcToken.balanceOf(signer.address)) as bigint;
  console.log(`Signer: ${signer.address}`);
  console.log(`Vault:  ${vaultAddress}`);
  console.log(`Pool:   ${poolAddr}`);
  console.log(`Debt:   ${fmt(debt, decimals)} USDC`);
  console.log(`Wallet: ${fmt(wallet, decimals)} USDC`);

  if (debt === 0n) {
    console.log("No debt. Done.");
    return;
  }
  if (wallet === 0n) {
    throw new Error("Wallet has 0 USDC.");
  }

  // Check existing allowance first
  const currentAllowance = (await usdcToken.allowance(signer.address, poolAddr)) as bigint;
  console.log(`Current allowance to pool: ${fmt(currentAllowance, decimals)} USDC`);

  if (currentAllowance < wallet) {
    console.log("Approving Aave pool...");
    const nonce = await signer.getNonce("latest");
    const txApprove = await usdcToken.approve(poolAddr, wallet, { nonce });
    console.log("Approve tx:", txApprove.hash);
    const receipt = await txApprove.wait();
    console.log("Approve confirmed in block", receipt!.blockNumber);
  } else {
    console.log("Allowance sufficient, skipping approve.");
  }

  // Wait a moment for state to settle
  await new Promise(r => setTimeout(r, 2000));

  // Get fresh nonce for repay
  const repayNonce = await signer.getNonce("latest");
  const repayAmt = debt + debt / 100n; // debt + 1% buffer for accrued interest
  console.log(`\nRepaying ${fmt(repayAmt, decimals)} USDC (debt + 1%) with nonce ${repayNonce}...`);

  try {
    const txRepay = await pool.repay(usdc, repayAmt, VARIABLE_RATE_MODE, vaultAddress, {
      gasLimit: 500_000,
      nonce: repayNonce,
    });
    console.log("Repay tx:", txRepay.hash);
    await txRepay.wait();
    console.log("Repay confirmed!");
  } catch (e: any) {
    const msg = e?.shortMessage || e?.reason || e?.message || "unknown";
    console.log(`Repay with debt+1% failed: ${msg}`);

    // Try exact debt
    const repayNonce2 = await signer.getNonce("latest");
    console.log(`Trying exact debt amount with nonce ${repayNonce2}...`);
    try {
      const txRepay2 = await pool.repay(usdc, debt, VARIABLE_RATE_MODE, vaultAddress, {
        gasLimit: 500_000,
        nonce: repayNonce2,
      });
      console.log("Repay tx:", txRepay2.hash);
      await txRepay2.wait();
      console.log("Repay confirmed!");
    } catch (e2: any) {
      console.log(`Exact debt failed: ${e2?.shortMessage || e2?.reason || e2?.message}`);

      // Try full wallet
      const repayNonce3 = await signer.getNonce("latest");
      console.log(`Trying full wallet with nonce ${repayNonce3}...`);
      const txRepay3 = await pool.repay(usdc, wallet, VARIABLE_RATE_MODE, vaultAddress, {
        gasLimit: 500_000,
        nonce: repayNonce3,
      });
      console.log("Repay tx:", txRepay3.hash);
      await txRepay3.wait();
      console.log("Repay confirmed!");
    }
  }

  const debtAfter = (await debtToken.balanceOf(vaultAddress)) as bigint;
  const walletAfter = (await usdcToken.balanceOf(signer.address)) as bigint;
  console.log(`\nDebt after:   ${fmt(debtAfter, decimals)} USDC`);
  console.log(`Wallet after: ${fmt(walletAfter, decimals)} USDC`);
  if (debtAfter === 0n) console.log("Debt fully cleared!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
