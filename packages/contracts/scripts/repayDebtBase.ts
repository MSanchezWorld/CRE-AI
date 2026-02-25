import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { parseUnits } from "ethers";

const DEFAULT_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function optionalEnv(name: string, fallback: string) {
  return (process.env[name]?.trim() || fallback).trim();
}

function getVaultAddressFromCreConfig(): string | null {
  const creConfigPath = path.join(__dirname, "../../../cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json");
  if (!fs.existsSync(creConfigPath)) return null;

  const cfg = JSON.parse(fs.readFileSync(creConfigPath, "utf-8")) as Record<string, unknown>;
  const vault = String(cfg.vaultAddress || "").trim();
  if (!vault || vault === "0x0000000000000000000000000000000000000000") return null;
  return vault;
}

function normalizeAddress(addr: string) {
  const a = addr.trim();
  try {
    return ethers.getAddress(a);
  } catch {
    return ethers.getAddress(a.toLowerCase());
  }
}

async function main() {
  const vaultAddress = (process.env.VAULT_ADDRESS?.trim() || getVaultAddressFromCreConfig() || "").trim();
  if (!vaultAddress) throw new Error("Missing VAULT_ADDRESS and no vaultAddress found in CRE config");

  const borrowToken = normalizeAddress(optionalEnv("BORROW_TOKEN_ADDRESS", DEFAULT_USDC_BASE));
  const amountRaw = (process.env.BORROW_AMOUNT || "").trim();
  const amountHuman = (process.env.BORROW_AMOUNT_HUMAN || "").trim();
  if (!amountRaw && !amountHuman) {
    throw new Error("Missing BORROW_AMOUNT (raw) or BORROW_AMOUNT_HUMAN (decimal)");
  }

  const [signer] = await ethers.getSigners();
  const managedSigner = new ethers.NonceManager(signer);
  console.log("Signer:", signer.address);
  console.log("Vault:", vaultAddress);
  console.log("Borrow token:", borrowToken);

  const erc20 = await ethers.getContractAt(
    [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function decimals() external view returns (uint8)",
      "function symbol() external view returns (string)"
    ],
    borrowToken,
    managedSigner
  );

  const vault = await ethers.getContractAt(
    ["function repayDebt(address asset, uint256 amount) external"],
    normalizeAddress(vaultAddress),
    managedSigner
  );

  const [decimals, symbol] = await Promise.all([erc20.decimals(), erc20.symbol()]);
  const amount = amountRaw ? BigInt(amountRaw) : (parseUnits(amountHuman, decimals) as unknown as bigint);
  console.log(`Amount: ${amount.toString()} (raw)`);
  console.log(`Token: ${symbol} decimals=${decimals}`);

  const tx1 = await erc20.approve(vaultAddress, amount);
  console.log("approve tx:", tx1.hash);
  await tx1.wait();

  const tx2 = await vault.repayDebt(borrowToken, amount);
  console.log("repayDebt tx:", tx2.hash);
  await tx2.wait();

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
