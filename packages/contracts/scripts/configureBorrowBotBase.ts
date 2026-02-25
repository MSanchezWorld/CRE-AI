import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_CBBTC_BASE = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const DEFAULT_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_USDBC_BASE = "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA";

function normalizeAddress(addr: string) {
  const a = addr.trim();
  try {
    return ethers.getAddress(a);
  } catch {
    return ethers.getAddress(a.toLowerCase());
  }
}

function optionalEnv(name: string, fallback?: string) {
  const v = process.env[name]?.trim();
  return (v || fallback || "").trim();
}

function getCreConfig(): Record<string, unknown> | null {
  const p = path.join(__dirname, "../../../cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
}

function getAddrFromCreConfig(key: string): string | null {
  const cfg = getCreConfig();
  if (!cfg) return null;
  const v = String(cfg[key] || "").trim();
  if (!v || v === "0x0000000000000000000000000000000000000000") return null;
  return v;
}

async function main() {
  const [signer] = await ethers.getSigners();
  // Base public RPC is load-balanced and can cause nonce collisions when sending multiple txs quickly.
  // NonceManager keeps a local nonce and avoids "replacement transaction underpriced".
  const managedSigner = new ethers.NonceManager(signer);

  const vaultAddress = optionalEnv("VAULT_ADDRESS", getAddrFromCreConfig("vaultAddress") || "");
  const receiverAddress = optionalEnv("RECEIVER_ADDRESS", getAddrFromCreConfig("receiverAddress") || "");
  if (!vaultAddress) throw new Error("Missing VAULT_ADDRESS and no vaultAddress found in CRE config");
  if (!receiverAddress) throw new Error("Missing RECEIVER_ADDRESS and no receiverAddress found in CRE config");

  const collateralToken = normalizeAddress(optionalEnv("COLLATERAL_TOKEN_ADDRESS", DEFAULT_CBBTC_BASE));
  const borrowToken = normalizeAddress(optionalEnv("BORROW_TOKEN_ADDRESS", DEFAULT_USDC_BASE));
  const payee = normalizeAddress(optionalEnv("PAYEE_ADDRESS", signer.address));

  const allowUSDbC = (process.env.ALLOW_USDBC || "false").toLowerCase() === "true";

  console.log("Signer:", signer.address);
  console.log("Vault:", vaultAddress);
  console.log("Receiver:", receiverAddress);
  console.log("Collateral token:", collateralToken);
  console.log("Borrow token:", borrowToken);
  console.log("Payee:", payee);
  console.log("Allow USDbC:", allowUSDbC);

  const vault = await ethers.getContractAt(
    [
      "function setExecutor(address executor) external",
      "function executor() external view returns (address)",
      "function setApprovedCollateralToken(address token, bool allowed) external",
      "function approvedCollateralTokens(address token) external view returns (bool)",
      "function setApprovedBorrowToken(address token, bool allowed) external",
      "function approvedBorrowTokens(address token) external view returns (bool)",
      "function setApprovedPayee(address payee, bool allowed) external"
      ,
      "function approvedPayees(address payee) external view returns (bool)"
    ],
    normalizeAddress(vaultAddress),
    managedSigner
  );

  const desiredReceiver = normalizeAddress(receiverAddress);
  const currentExecutor = normalizeAddress(await vault.executor());
  if (currentExecutor !== desiredReceiver) {
    const tx1 = await vault.setExecutor(desiredReceiver);
    console.log("setExecutor tx:", tx1.hash);
    await tx1.wait();
  } else {
    console.log("setExecutor: already set");
  }

  // For the demo we support depositing USDC directly (no swaps) as the most reliable
  // mainnet path. Keep the existing collateral token allowlist too.
  const collateralTokensToAllowlist = Array.from(
    new Set([collateralToken, normalizeAddress(DEFAULT_USDC_BASE)].map((a) => a.toLowerCase()))
  ).map((a) => ethers.getAddress(a));

  for (const token of collateralTokensToAllowlist) {
    const allowed = await vault.approvedCollateralTokens(token);
    if (!allowed) {
      const tx2 = await vault.setApprovedCollateralToken(token, true);
      console.log("allowlist collateral tx:", tx2.hash, "token:", token);
      await tx2.wait();
    } else {
      console.log("allowlist collateral: already set for", token);
    }
  }

  const borrowAllowed = await vault.approvedBorrowTokens(borrowToken);
  if (!borrowAllowed) {
    const tx3 = await vault.setApprovedBorrowToken(borrowToken, true);
    console.log("allowlist borrow tx:", tx3.hash);
    await tx3.wait();
  } else {
    console.log("allowlist borrow: already set");
  }

  if (allowUSDbC) {
    const usdbc = normalizeAddress(DEFAULT_USDBC_BASE);
    const usdbcAllowed = await vault.approvedBorrowTokens(usdbc);
    if (!usdbcAllowed) {
      const tx4 = await vault.setApprovedBorrowToken(usdbc, true);
      console.log("allowlist USDbC tx:", tx4.hash);
      await tx4.wait();
    } else {
      console.log("allowlist USDbC: already set");
    }
  }

  const payeeAllowed = await vault.approvedPayees(payee);
  if (!payeeAllowed) {
    const tx5 = await vault.setApprovedPayee(payee, true);
    console.log("allowlist payee tx:", tx5.hash);
    await tx5.wait();
  } else {
    console.log("allowlist payee: already set");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
