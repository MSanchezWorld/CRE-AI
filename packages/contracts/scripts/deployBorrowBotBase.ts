import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const AAVE_V3_POOL_ADDRESSES_PROVIDER_BASE = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";

// CRE forwarders (Base). Use MOCK for `cre workflow simulate --broadcast`.
const CRE_MOCK_FORWARDER_BASE = "0x5e342a8438b4f5D39E72875FcEE6F76B39CCe548";
const CRE_FORWARDER_BASE = "0xF8344CFd5c43616a4366C34E3EEE75af79a74482";

const DEFAULT_CBBTC_BASE = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const DEFAULT_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_USDBC_BASE = "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA";

function getEnvAddr(name: string, fallback?: string) {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  return v;
}

function normalizeAddress(addr: string) {
  // ethers v6 rejects mixed-case addresses with a bad checksum. We accept any case and re-checksum.
  const a = addr.trim();
  try {
    return ethers.getAddress(a);
  } catch {
    return ethers.getAddress(a.toLowerCase());
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const managedDeployer = new ethers.NonceManager(deployer);

  const owner = normalizeAddress(getEnvAddr("OWNER_ADDRESS", deployer.address)!);

  const forwarder = (() => {
    const explicit = getEnvAddr("CRE_FORWARDER_ADDRESS");
    if (explicit) return explicit;
    const useMock = (process.env.USE_MOCK_FORWARDER || "true").toLowerCase() === "true";
    return useMock ? CRE_MOCK_FORWARDER_BASE : CRE_FORWARDER_BASE;
  })();

  const collateralToken = normalizeAddress(getEnvAddr("COLLATERAL_TOKEN_ADDRESS", DEFAULT_CBBTC_BASE)!);
  const borrowToken = normalizeAddress(getEnvAddr("BORROW_TOKEN_ADDRESS", DEFAULT_USDC_BASE)!);
  const payee = getEnvAddr("PAYEE_ADDRESS");

  console.log("Deployer:", deployer.address);
  console.log("Owner:", owner);
  console.log("Forwarder:", forwarder);
  console.log("Collateral token:", collateralToken);
  console.log("Borrow token:", borrowToken);
  if (payee) console.log("Payee:", payee);

  const forwarderAddr = normalizeAddress(forwarder);

  const BorrowVault = await ethers.getContractFactory("BorrowVault", managedDeployer);
  const vault = await BorrowVault.deploy(owner, deployer.address, AAVE_V3_POOL_ADDRESSES_PROVIDER_BASE);
  await vault.waitForDeployment();

  const BorrowBotReceiver = await ethers.getContractFactory("BorrowBotReceiver", managedDeployer);
  const receiver = await BorrowBotReceiver.deploy(owner, forwarderAddr, await vault.getAddress());
  await receiver.waitForDeployment();

  console.log("BorrowVault:", await vault.getAddress());
  console.log("BorrowBotReceiver:", await receiver.getAddress());

  // Connect the vault to the receiver.
  const tx1 = await vault.connect(managedDeployer).setExecutor(await receiver.getAddress());
  await tx1.wait();

  // Allowlist tokens + optional payee.
  const tx2 = await vault.connect(managedDeployer).setApprovedCollateralToken(collateralToken, true);
  await tx2.wait();
  const tx3 = await vault.connect(managedDeployer).setApprovedBorrowToken(borrowToken, true);
  await tx3.wait();

  // Optional: allow USDbC too (if you want to borrow it instead of USDC).
  if ((process.env.ALLOW_USDBC || "false").toLowerCase() === "true") {
    const tx4 = await vault.connect(managedDeployer).setApprovedBorrowToken(normalizeAddress(DEFAULT_USDBC_BASE), true);
    await tx4.wait();
    console.log("Allowlisted USDbC:", DEFAULT_USDBC_BASE);
  }

  if (payee) {
    const tx5 = await vault.connect(managedDeployer).setApprovedPayee(normalizeAddress(payee), true);
    await tx5.wait();
  }

  // Convenience: update CRE workflow config with deployed addresses.
  const updateCreConfig = (process.env.UPDATE_CRE_CONFIG || "true").toLowerCase() === "true";
  if (updateCreConfig) {
    const creConfigPath = path.join(
      __dirname,
      "../../../cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json"
    );
    if (fs.existsSync(creConfigPath)) {
      const current = JSON.parse(fs.readFileSync(creConfigPath, "utf-8")) as Record<string, unknown>;
      current.receiverAddress = await receiver.getAddress();
      current.vaultAddress = await vault.getAddress();
      fs.writeFileSync(creConfigPath, JSON.stringify(current, null, 2) + "\n");
      console.log("Updated CRE config:", creConfigPath);
    } else {
      console.log("CRE config not found (skipping):", creConfigPath);
    }
  }

  console.log("Done.");
  console.log("Next:");
  console.log("- Approve + supply collateral into Aave via BorrowVault.supplyCollateral()");
  console.log("- Run CRE workflow simulation to call BorrowBotReceiver.onReport()");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
