import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { parseUnits } from "ethers";

const DEFAULT_CBBTC_BASE = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

function requiredEnv(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

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
  const collateralToken = normalizeAddress(optionalEnv("COLLATERAL_TOKEN_ADDRESS", DEFAULT_CBBTC_BASE));
  const amountRaw = (process.env.COLLATERAL_AMOUNT || "").trim();
  const amountHuman = (process.env.COLLATERAL_AMOUNT_HUMAN || "").trim();
  if (!amountRaw && !amountHuman) {
    throw new Error("Missing COLLATERAL_AMOUNT (raw) or COLLATERAL_AMOUNT_HUMAN (decimal)");
  }

  const [signer] = await ethers.getSigners();
  const managedSigner = new ethers.NonceManager(signer);
  console.log("Signer:", signer.address);
  console.log("Vault:", vaultAddress);
  console.log("Collateral token:", collateralToken);

  const erc20 = await ethers.getContractAt(
    [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) external view returns (uint256)",
      "function decimals() external view returns (uint8)",
      "function symbol() external view returns (string)"
    ],
    collateralToken,
    managedSigner
  );

  const vault = await ethers.getContractAt(
    ["function supplyCollateral(address asset, uint256 amount) external"],
    normalizeAddress(vaultAddress),
    managedSigner
  );

  const [decimals, symbol] = await Promise.all([erc20.decimals(), erc20.symbol()]);
  const amount = amountRaw ? BigInt(amountRaw) : (parseUnits(amountHuman, decimals) as unknown as bigint);
  console.log(`Amount: ${amount.toString()} (raw)`);
  console.log(`Token: ${symbol} decimals=${decimals}`);

  // Avoid redundant approvals (saves gas + reduces chances of RPC timeouts on hackathon demo flows).
  const allowance = await erc20.allowance(signer.address, vaultAddress);
  if (allowance < amount) {
    const tx1 = await erc20.approve(vaultAddress, amount);
    console.log("approve tx:", tx1.hash);
    await tx1.wait();
  } else {
    console.log("approve: already sufficient");
  }

  // Base RPCs can sometimes under-estimate gas for Aave interactions. A conservative manual limit
  // makes hackathon demos more reliable.
  const gasLimit = BigInt(optionalEnv("SUPPLY_GAS_LIMIT", "800000"));
  console.log("supply gasLimit:", gasLimit.toString());

  const tx2 = await vault.supplyCollateral(collateralToken, amount, { gasLimit });
  console.log("supplyCollateral tx:", tx2.hash);
  await tx2.wait();

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
