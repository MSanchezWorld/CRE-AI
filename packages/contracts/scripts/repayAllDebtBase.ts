import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { formatUnits } from "ethers";

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

function summarizeError(err: any): string {
  const parts: string[] = [];
  const push = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s && !parts.includes(s)) parts.push(s);
  };
  push(err?.shortMessage);
  push(err?.reason);
  push(err?.message);
  push(err?.error?.message);
  push(err?.info?.error?.message);
  const code = err?.code;
  if (typeof code === "string" || typeof code === "number") parts.push(`code=${String(code)}`);
  return parts.filter(Boolean).join(" | ") || "unknown error";
}

function fmt(raw: bigint, decimals: number) {
  const s = formatUnits(raw, decimals);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, 6).replace(/0+$/, "");
  return frac ? `${i}.${frac}` : i;
}

async function main() {
  const vaultAddress = (process.env.VAULT_ADDRESS?.trim() || getVaultAddressFromCreConfig() || "").trim();
  if (!vaultAddress) throw new Error("Missing VAULT_ADDRESS and no vaultAddress found in CRE config");

  const usdc = normalizeAddress(optionalEnv("BORROW_TOKEN_ADDRESS", DEFAULT_USDC_BASE));
  const maxIterations = Number(optionalEnv("REPAY_MAX_ITERS", "80"));
  if (!Number.isFinite(maxIterations) || maxIterations <= 0) throw new Error("REPAY_MAX_ITERS must be > 0");
  const repayChunkRaw = BigInt(optionalEnv("REPAY_CHUNK_RAW", "100000")); // 0.1 USDC default
  if (repayChunkRaw <= 0n) throw new Error("REPAY_CHUNK_RAW must be > 0");
  const attemptsPerChunk = Number(optionalEnv("REPAY_ATTEMPTS_PER_CHUNK", "4"));
  if (!Number.isFinite(attemptsPerChunk) || attemptsPerChunk <= 0) throw new Error("REPAY_ATTEMPTS_PER_CHUNK must be > 0");

  const [signer] = await ethers.getSigners();
  const managedSigner = new ethers.NonceManager(signer);

  const vault = await ethers.getContractAt(
    [
      "function owner() external view returns (address)",
      "function repayDebt(address asset, uint256 amount) external"
    ],
    normalizeAddress(vaultAddress),
    managedSigner
  );

  const owner = normalizeAddress(await vault.owner());
  if (owner !== normalizeAddress(signer.address)) {
    throw new Error(`Signer is not vault owner. signer=${signer.address} owner=${owner}`);
  }

  const usdcToken = await ethers.getContractAt(
    [
      "function balanceOf(address a) external view returns (uint256)",
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function decimals() external view returns (uint8)",
      "function symbol() external view returns (string)"
    ],
    usdc,
    managedSigner
  );
  const [usdcDecimals, usdcSymbol] = await Promise.all([usdcToken.decimals(), usdcToken.symbol()]);

  const apAddr = await (await ethers.getContractAt(["function aaveAddressesProvider() external view returns (address)"], vaultAddress)).aaveAddressesProvider();
  const poolAddr = await (await ethers.getContractAt(["function getPool() external view returns (address)"], apAddr)).getPool();
  const pool = await ethers.getContractAt(
    [
      "function getReserveData(address asset) external view returns (tuple(uint256,uint128,uint128,uint128,uint128,uint128,uint40,uint16,address,address,address,address,uint128,uint128,uint128))"
    ],
    poolAddr,
    managedSigner
  );
  const rd = await pool.getReserveData(usdc);
  const variableDebtTokenAddress = rd[10] as string;
  const debtToken = await ethers.getContractAt(
    ["function balanceOf(address a) external view returns (uint256)"],
    variableDebtTokenAddress,
    managedSigner
  );

  console.log("Signer:", signer.address);
  console.log("Vault:", normalizeAddress(vaultAddress));
  console.log("Token:", `${usdcSymbol} (${usdc})`);

  for (let i = 0; i < maxIterations; i++) {
    const [debt, wallet] = (await Promise.all([
      debtToken.balanceOf(normalizeAddress(vaultAddress)),
      usdcToken.balanceOf(signer.address)
    ])) as [bigint, bigint];

    if (debt === 0n) {
      console.log("Debt cleared.");
      return;
    }
    if (wallet === 0n) {
      throw new Error(`Wallet has 0 ${usdcSymbol} but debt remains ${fmt(debt, Number(usdcDecimals))} ${usdcSymbol}`);
    }

    let maxAttempt = wallet < debt ? wallet : debt;
    if (maxAttempt > repayChunkRaw) maxAttempt = repayChunkRaw;
    const txApprove = await usdcToken.approve(normalizeAddress(vaultAddress), maxAttempt);
    console.log(
      `[iter ${i + 1}] approve ${fmt(maxAttempt, Number(usdcDecimals))} ${usdcSymbol} ` +
        `(chunkRaw=${repayChunkRaw.toString()}): ${txApprove.hash}`
    );
    await txApprove.wait();

    let candidate = maxAttempt;
    let success = false;
    while (candidate > 0n) {
      let chunkRepaid = false;
      for (let attempt = 1; attempt <= attemptsPerChunk; attempt++) {
        try {
          const txRepay = await vault.repayDebt(usdc, candidate);
          console.log(
            `[iter ${i + 1}] repay ${fmt(candidate, Number(usdcDecimals))} ${usdcSymbol} ` +
              `(attempt ${attempt}/${attemptsPerChunk}): ${txRepay.hash}`
          );
          await txRepay.wait();
          success = true;
          chunkRepaid = true;
          break;
        } catch (e) {
          console.log(
            `[iter ${i + 1}] repay ${fmt(candidate, Number(usdcDecimals))} failed ` +
              `(attempt ${attempt}/${attemptsPerChunk}): ${summarizeError(e)}`
          );
          if (attempt < attemptsPerChunk) await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (chunkRepaid) break;

      const next = candidate / 2n;
      console.log(
        `[iter ${i + 1}] reducing chunk after repeated failures: ${fmt(candidate, Number(usdcDecimals))} -> ${
          next > 0n ? fmt(next, Number(usdcDecimals)) : "0"
        } ${usdcSymbol}`
      );
      if (next === candidate) candidate = candidate - 1n;
      else candidate = next;
      if (candidate > 0n) {
        const txReapprove = await usdcToken.approve(normalizeAddress(vaultAddress), candidate);
        console.log(`[iter ${i + 1}] re-approve ${fmt(candidate, Number(usdcDecimals))} ${usdcSymbol}: ${txReapprove.hash}`);
        await txReapprove.wait();
      }
    }

    if (!success) {
      throw new Error(
        `Unable to find a repay chunk that succeeds. debt=${fmt(debt, Number(usdcDecimals))} ${usdcSymbol}, wallet=${fmt(wallet, Number(usdcDecimals))} ${usdcSymbol}`
      );
    }
  }

  const debtFinal = (await debtToken.balanceOf(normalizeAddress(vaultAddress))) as bigint;
  if (debtFinal === 0n) {
    console.log("Debt cleared.");
    return;
  }

  throw new Error(`Debt remains after max iterations: ${fmt(debtFinal, Number(usdcDecimals))} ${usdcSymbol}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
