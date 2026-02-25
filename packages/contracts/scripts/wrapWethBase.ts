import { ethers } from "hardhat";
import { parseEther } from "ethers";

// Base WETH (canonical OP-stack WETH).
const WETH_BASE = "0x4200000000000000000000000000000000000006";

function optionalEnv(name: string, fallback: string) {
  return (process.env[name]?.trim() || fallback).trim();
}

async function main() {
  const amountHuman = optionalEnv("WRAP_AMOUNT_HUMAN", "0.005");
  const amount = parseEther(amountHuman);

  const [signer] = await ethers.getSigners();
  const managedSigner = new ethers.NonceManager(signer);

  console.log("Signer:", signer.address);
  console.log("WETH:", WETH_BASE);
  console.log("Wrap amount (ETH):", amountHuman);

  const weth = await ethers.getContractAt(
    [
      "function deposit() external payable",
      "function balanceOf(address account) external view returns (uint256)"
    ],
    WETH_BASE,
    managedSigner
  );

  const tx = await weth.deposit({ value: amount });
  console.log("deposit tx:", tx.hash);
  await tx.wait();

  const bal = await weth.balanceOf(signer.address);
  console.log("WETH balance (raw):", bal.toString());
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

