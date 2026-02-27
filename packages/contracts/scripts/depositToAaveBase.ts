import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { formatUnits, parseUnits } from "ethers";

// Base mainnet defaults.
const DEFAULT_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_WETH_BASE = "0x4200000000000000000000000000000000000006";
const DEFAULT_CBBTC_BASE = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

// Uniswap Permit2 is deployed at the same address on many chains (including Base).
// SwapRouter02 uses Permit2 to pull ERC20s, so approvals must be granted to Permit2
// (not just the router) or swaps will revert at estimateGas.
const DEFAULT_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Uniswap V3 (Base mainnet).
// - Factory: https://basescan.org/address/0x33128a8fc17869897dce68ed026d694621f6fdfd
// - SwapRouter02: https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481
// - QuoterV2: https://basescan.org/address/0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
const DEFAULT_UNIV3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
const DEFAULT_UNIV3_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const DEFAULT_UNIV3_QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";

const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT48 = (1n << 48n) - 1n;

let LAST_STAGE = "init";

function optionalEnv(name: string, fallback: string) {
  return (process.env[name]?.trim() || fallback).trim();
}

function optionalEnvNum(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function normalizeAddress(addr: string) {
  const a = addr.trim();
  try {
    return ethers.getAddress(a);
  } catch {
    return ethers.getAddress(a.toLowerCase());
  }
}

function getVaultAddressFromCreConfig(): string | null {
  const creConfigPath = path.join(__dirname, "../../../cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json");
  if (!fs.existsSync(creConfigPath)) return null;
  const cfg = JSON.parse(fs.readFileSync(creConfigPath, "utf-8")) as Record<string, unknown>;
  const vault = String(cfg.vaultAddress || "").trim();
  if (!vault || vault === ethers.ZeroAddress) return null;
  return vault;
}

function formatTokenAmount(raw: bigint, decimals: number) {
  const s = formatUnits(raw, decimals);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, 6).replace(/0+$/, "");
  return frac ? `${i}.${frac}` : i;
}

function summarizeError(err: any): string {
  // Ethers v6 errors can have: shortMessage, reason, code, info.error.message, data, etc.
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
  push(err?.info?.error?.data?.message);

  const code = err?.code;
  if (typeof code === "string" || typeof code === "number") parts.push(`code=${String(code)}`);
  const action = err?.action;
  if (typeof action === "string") parts.push(`action=${action}`);

  return parts.filter(Boolean).join(" | ") || "Unknown error (no message fields found)";
}

async function ensureHasCode(label: string, address: string) {
  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${label} not deployed at ${address}. Set env to override.`);
  }
}

async function quoteExactInputSingle({
  quoter,
  tokenIn,
  tokenOut,
  fee,
  amountIn
}: {
  quoter: any;
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountIn: bigint;
}): Promise<bigint> {
  // Quoter V1 signature
  try {
    const out = (await quoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, fee, amountIn, 0)) as bigint;
    return out;
  } catch {
    // Quoter V2 signature (struct + multi-return)
  }
  const res = (await quoter.quoteExactInputSingle.staticCall({
    tokenIn,
    tokenOut,
    amountIn,
    fee,
    sqrtPriceLimitX96: 0
  })) as unknown as [bigint, bigint, number, bigint];
  return res[0];
}

async function pickBestFee({
  factory,
  quoter,
  tokenIn,
  tokenOut,
  amountIn
}: {
  factory: any;
  quoter: any;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
}): Promise<{ fee: number; amountOut: bigint }> {
  const feeTiers = [100, 500, 3000, 10000];

  let bestFee: number | null = null;
  let bestOut = 0n;
  let hadGetPoolError = false;

  for (const fee of feeTiers) {
    let pool: string;
    try {
      pool = (await factory.getPool(tokenIn, tokenOut, fee)) as string;
    } catch {
      hadGetPoolError = true;
      continue;
    }
    if (!pool || pool === ethers.ZeroAddress) continue;

    try {
      const out = await quoteExactInputSingle({ quoter, tokenIn, tokenOut, fee, amountIn });
      if (out > bestOut) {
        bestOut = out;
        bestFee = fee;
      }
    } catch {
      // Skip broken tiers.
    }
  }

  if (bestFee == null) {
    if (hadGetPoolError) {
      throw new Error(
        `Failed to query Uniswap V3 pools (RPC returned invalid data). Try again or set BASE_RPC_URL to a more reliable endpoint.`
      );
    }
    throw new Error(`No Uniswap V3 pool found for tokenIn=${tokenIn} tokenOut=${tokenOut}`);
  }

  return { fee: bestFee, amountOut: bestOut };
}

async function main() {
  LAST_STAGE = "init";
  const vaultAddress = (process.env.VAULT_ADDRESS?.trim() || getVaultAddressFromCreConfig() || "").trim();
  if (!vaultAddress) throw new Error("Missing VAULT_ADDRESS and no vaultAddress found in CRE config");

  // Reliability-first for the hackathon demo:
  // - USDC collateral deposit proves "Aave position + borrow-to-pay" end-to-end.
  // - Swaps introduce multiple failure modes (routing, Permit2, slippage, RPC flake) and cost extra gas.
  // If someone explicitly wants swap mode, they must opt in.
  let depositMode = optionalEnv("DEPOSIT_MODE", "usdc").toLowerCase();
  const allowSwapDeposit = (process.env.ALLOW_SWAP_DEPOSIT || "false").trim().toLowerCase() === "true";

  if (depositMode !== "usdc" && depositMode !== "eth_btc") {
    throw new Error(`Invalid DEPOSIT_MODE=${depositMode}. Use \"usdc\" or \"eth_btc\".`);
  }
  if (depositMode === "eth_btc" && !allowSwapDeposit) {
    console.log("Deposit mode: eth_btc requested but ALLOW_SWAP_DEPOSIT is not true. Falling back to usdc mode.");
    depositMode = "usdc";
  }

  const usdc = normalizeAddress(optionalEnv("USDC_ADDRESS", DEFAULT_USDC_BASE));
  const weth = normalizeAddress(optionalEnv("WETH_ADDRESS", DEFAULT_WETH_BASE));
  const cbbtc = normalizeAddress(optionalEnv("CBBTC_ADDRESS", DEFAULT_CBBTC_BASE));
  const permit2Addr = normalizeAddress(optionalEnv("PERMIT2_ADDRESS", DEFAULT_PERMIT2));

  const factoryAddr = normalizeAddress(optionalEnv("UNIV3_FACTORY_ADDRESS", DEFAULT_UNIV3_FACTORY));
  const routerAddr = normalizeAddress(optionalEnv("UNIV3_ROUTER_ADDRESS", DEFAULT_UNIV3_ROUTER));
  const quoterAddr = normalizeAddress(optionalEnv("UNIV3_QUOTER_ADDRESS", DEFAULT_UNIV3_QUOTER));

  const confirm = (process.env.CONFIRM_MAINNET || "").trim().toUpperCase() === "YES";
  const slippageBps = optionalEnvNum("SLIPPAGE_BPS", 50);
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 500) {
    throw new Error("SLIPPAGE_BPS must be between 0 and 500");
  }

  const allocEthBps = Math.trunc(optionalEnvNum("ALLOC_ETH_BPS", 5000));
  const allocBtcBps = Math.trunc(optionalEnvNum("ALLOC_BTC_BPS", 5000));
  if (allocEthBps < 0 || allocBtcBps < 0 || allocEthBps + allocBtcBps === 0) {
    throw new Error("ALLOC_ETH_BPS/ALLOC_BTC_BPS must be non-negative and not both zero");
  }

  const amountRaw = (process.env.DEPOSIT_AMOUNT || "").trim();
  const amountHuman = (process.env.DEPOSIT_AMOUNT_HUMAN || "").trim();
  if (!amountRaw && !amountHuman) {
    throw new Error("Missing DEPOSIT_AMOUNT (raw USDC units) or DEPOSIT_AMOUNT_HUMAN (decimal)");
  }

  const [signer] = await ethers.getSigners();
  const managedSigner = new ethers.NonceManager(signer);

  LAST_STAGE = "preflight";
  console.log("Network: base (8453)");
  console.log("Signer:", signer.address);
  console.log("Vault:", normalizeAddress(vaultAddress));
  console.log("USDC:", usdc);
  console.log("WETH:", weth);
  console.log("cbBTC:", cbbtc);
  console.log("Permit2:", permit2Addr);
  if (depositMode === "eth_btc") {
    console.log("Router:", routerAddr);
    console.log("Quoter:", quoterAddr);
  }
  console.log("Slippage:", `${slippageBps} bps`);
  console.log("Deposit mode:", depositMode === "usdc" ? "USDC collateral (no swaps)" : "USDC -> WETH/cbBTC (swap)");
  if (depositMode === "eth_btc") console.log("Allocation:", `ETH ${allocEthBps} bps, BTC ${allocBtcBps} bps`);
  console.log("Confirm:", confirm ? "YES (will send txs)" : "NO (dry run)");
  console.log("");

  // Gas sanity check (most "nothing happened" failures are simply no ETH for gas).
  try {
    const nativeBal = (await ethers.provider.getBalance(signer.address)) as bigint;
    console.log(`ETH (gas): ${formatUnits(nativeBal, 18)} ETH`);
    if (confirm && nativeBal < (parseUnits("0.00005", 18) as unknown as bigint)) {
      throw new Error("Insufficient ETH for gas. Fund the signer with a small amount of Base ETH and retry.");
    }
    console.log("");
  } catch {
    // Ignore balance fetch flakiness here; the tx will still fail with a clearer error if ETH is missing.
  }

  LAST_STAGE = "ensure-code";
  if (depositMode === "eth_btc") {
    await Promise.all([
      ensureHasCode("UniswapV3Factory", factoryAddr),
      ensureHasCode("Permit2", permit2Addr),
      ensureHasCode("UniswapV3Router", routerAddr),
      ensureHasCode("UniswapV3Quoter", quoterAddr)
    ]);
  } else {
    await ensureHasCode("Permit2", permit2Addr);
  }

  const erc20Abi = [
    "function balanceOf(address a) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)"
  ];

  const tokenUsdc = await ethers.getContractAt(erc20Abi, usdc, managedSigner);
  const tokenWeth = await ethers.getContractAt(erc20Abi, weth, managedSigner);
  const tokenCbbtc = await ethers.getContractAt(erc20Abi, cbbtc, managedSigner);

  const [usdcDec, usdcSym, wethDec, wethSym, btcDec, btcSym] = await Promise.all([
    tokenUsdc.decimals(), tokenUsdc.symbol(),
    tokenWeth.decimals(), tokenWeth.symbol(),
    tokenCbbtc.decimals(), tokenCbbtc.symbol()
  ]);

  const depositAmount: bigint = amountRaw
    ? BigInt(amountRaw)
    : (parseUnits(amountHuman, usdcDec) as unknown as bigint);

  LAST_STAGE = "balances";
  const [balUsdc, balWethBefore, balBtcBefore] = await Promise.all([
    tokenUsdc.balanceOf(signer.address) as Promise<bigint>,
    tokenWeth.balanceOf(signer.address) as Promise<bigint>,
    tokenCbbtc.balanceOf(signer.address) as Promise<bigint>
  ]);
  console.log("Balances (before):");
  console.log(`- ${usdcSym}:  ${formatTokenAmount(balUsdc, Number(usdcDec))}`);
  console.log(`- ${wethSym}:  ${formatTokenAmount(balWethBefore, Number(wethDec))}`);
  console.log(`- ${btcSym}:   ${formatTokenAmount(balBtcBefore, Number(btcDec))}`);
  console.log("");

  if (depositAmount <= 0n) throw new Error("Deposit amount must be > 0");
  if (balUsdc < depositAmount) {
    throw new Error(
      `Insufficient ${usdcSym}. Have ${formatTokenAmount(balUsdc, Number(usdcDec))} ${usdcSym}, need ${formatTokenAmount(
        depositAmount,
        Number(usdcDec)
      )} ${usdcSym}`
    );
  }

  const vault = await ethers.getContractAt(
    ["function supplyCollateral(address asset, uint256 amount) external"],
    normalizeAddress(vaultAddress),
    managedSigner
  );

  const factory = await ethers.getContractAt(
    ["function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address)"],
    factoryAddr,
    managedSigner
  );

  const quoter = await ethers.getContractAt(
    [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
      "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
    ],
    quoterAddr,
    managedSigner
  );

  // Routers in the wild disagree on the ExactInputSingleParams struct shape (with vs without `deadline`).
  // For a hackathon demo we prefer robustness over purity: try the modern selector first, then fall back.
  const routerNoDeadline = await ethers.getContractAt(
    [
      "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
    ],
    routerAddr,
    managedSigner
  );
  const routerWithDeadline = await ethers.getContractAt(
    [
      "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
    ],
    routerAddr,
    managedSigner
  );

  const permit2 = await ethers.getContractAt(
    [
      // Permit2 AllowanceTransfer
      "function allowance(address user,address token,address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)",
      "function approve(address token,address spender,uint160 amount,uint48 expiration) external"
    ],
    permit2Addr,
    managedSigner
  );

  async function ensureAllowance(
    token: any,
    spender: string,
    needed: bigint,
    label: string,
    approveMax = false
  ) {
    const allowance = (await token.allowance(signer.address, spender)) as bigint;
    if (allowance >= needed) return;
    if (!confirm) return;
    const tx = await token.approve(spender, approveMax ? MAX_UINT256 : needed);
    console.log(`[approve] ${label}:`, tx.hash);
    await tx.wait();
  }

  async function ensurePermit2Allowance({
    token,
    spender,
    needed,
    label,
    approveMax = true
  }: {
    token: string;
    spender: string;
    needed: bigint;
    label: string;
    approveMax?: boolean;
  }) {
    // Permit2 has its own internal allowance table. ERC20 approval to Permit2 is necessary
    // but not sufficient: we must also approve the router as a spender in Permit2.
    const [amount, expiration] = (await permit2.allowance(signer.address, token, spender)) as unknown as [
      bigint,
      bigint,
      bigint
    ];
    const now = BigInt(Math.floor(Date.now() / 1000));
    const ok = amount >= needed && expiration > now;
    if (ok) return;
    if (!confirm) return;
    const tx = await permit2.approve(token, spender, approveMax ? MAX_UINT160 : needed, MAX_UINT48);
    console.log(`[approve] ${label}:`, tx.hash);
    await tx.wait();
  }

  async function swapUsdcTo(tokenOutAddr: string, tokenOut: any, tokenOutSym: string, tokenOutDec: number, amountIn: bigint): Promise<bigint> {
    if (amountIn === 0n) return 0n;

    const { fee, amountOut: quotedOut } = await pickBestFee({ factory, quoter, tokenIn: usdc, tokenOut: tokenOutAddr, amountIn });

    console.log(`[swap] ${usdcSym} -> ${tokenOutSym}`);
    console.log(`- amountIn:  ${formatTokenAmount(amountIn, Number(usdcDec))} ${usdcSym}`);
    console.log(`- best fee:  ${fee}`);
    console.log(`- quote out: ${formatTokenAmount(quotedOut, tokenOutDec)} ${tokenOutSym}`);

    if (!confirm) return 0n;

    // Some SwapRouter02 deployments pull tokens directly (ERC20 allowance to router), while others
    // pull via Permit2 (ERC20 allowance to Permit2 + Permit2 internal allowance to router). To
    // be robust on Base, we set both. Amounts are small for demo; keep router approval scoped.
    await ensureAllowance(tokenUsdc, routerAddr, amountIn, `${usdcSym} (Router)`, false);
    await ensureAllowance(tokenUsdc, permit2Addr, amountIn, `${usdcSym} (Permit2)`, true);
    await ensurePermit2Allowance({
      token: usdc,
      spender: routerAddr,
      needed: amountIn,
      label: `${usdcSym} (Permit2->Router)`,
      approveMax: true
    });

    // The quote above can go stale while we wait for approvals (or just due to fast markets).
    // For demo reliability, compute `minOut` from a fresh router simulation right before broadcasting.
    const paramsSim = {
      tokenIn: usdc,
      tokenOut: tokenOutAddr,
      fee,
      recipient: signer.address,
      amountIn,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0
    };

    let simOut: bigint | null = null;
    try {
      simOut = (await routerNoDeadline.exactInputSingle.staticCall(paramsSim)) as bigint;
    } catch (e1) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60);
      try {
        simOut = (await routerWithDeadline.exactInputSingle.staticCall({ ...paramsSim, deadline })) as bigint;
      } catch (e2) {
        // Keep error text compact but actionable.
        throw new Error(
          `SwapRouter staticCall failed (noDeadline: ${summarizeError(e1)}; withDeadline: ${summarizeError(e2)})`
        );
      }
    }

    const outForMin = simOut != null && simOut > 0n ? simOut : quotedOut;
    const minOut = (outForMin * BigInt(10_000 - slippageBps)) / 10_000n;
    console.log(`- sim out:   ${formatTokenAmount(outForMin, tokenOutDec)} ${tokenOutSym}`);
    console.log(`- min out:   ${formatTokenAmount(minOut, tokenOutDec)} ${tokenOutSym}`);

    const balBefore = (await tokenOut.balanceOf(signer.address)) as bigint;
    LAST_STAGE = `swap:${usdcSym}->${tokenOutSym}`;
    const paramsNoDeadline = {
      tokenIn: usdc,
      tokenOut: tokenOutAddr,
      fee,
      recipient: signer.address,
      amountIn,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0
    };
    let tx: any;
    try {
      tx = await routerNoDeadline.exactInputSingle(paramsNoDeadline);
    } catch (e1) {
      // Legacy periphery routers include `deadline` in the params struct.
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60);
      try {
        tx = await routerWithDeadline.exactInputSingle({ ...paramsNoDeadline, deadline });
      } catch (e2) {
        throw new Error(
          `SwapRouter exactInputSingle failed (noDeadline: ${summarizeError(e1)}; withDeadline: ${summarizeError(e2)})`
        );
      }
    }
    console.log(`[swap] tx:`, tx.hash);
    await tx.wait();
    const balAfter = (await tokenOut.balanceOf(signer.address)) as bigint;
    const got = balAfter - balBefore;
    console.log(`- received:  ${formatTokenAmount(got, tokenOutDec)} ${tokenOutSym}`);
    return got;
  }

  async function supply(assetAddr: string, assetToken: any, assetSym: string, assetDec: number, amount: bigint) {
    if (amount === 0n) return;

    console.log(`[supply] ${assetSym} -> vault`);
    console.log(`- amount: ${formatTokenAmount(amount, assetDec)} ${assetSym}`);

    // Approve vault for the exact amount (not MAX) to reduce blast radius.
    await ensureAllowance(assetToken, normalizeAddress(vaultAddress), amount, assetSym, false);

    if (!confirm) return;

    const gasLimit = BigInt(optionalEnv("SUPPLY_GAS_LIMIT", "900000"));
    LAST_STAGE = `supply:${assetSym}`;
    const tx = await vault.supplyCollateral(assetAddr, amount, { gasLimit });
    console.log(`[supply] tx:`, tx.hash);
    await tx.wait();
  }

  if (depositMode === "usdc") {
    console.log(`Deposit: ${formatTokenAmount(depositAmount, Number(usdcDec))} ${usdcSym}`);
    console.log(`- supply to Aave as collateral: ${formatTokenAmount(depositAmount, Number(usdcDec))} ${usdcSym}`);
    console.log("");

    await supply(usdc, tokenUsdc, usdcSym, Number(usdcDec), depositAmount);

    LAST_STAGE = "balances-after";
    const [balUsdcAfter, balWethAfter, balBtcAfter] = await Promise.all([
      tokenUsdc.balanceOf(signer.address) as Promise<bigint>,
      tokenWeth.balanceOf(signer.address) as Promise<bigint>,
      tokenCbbtc.balanceOf(signer.address) as Promise<bigint>
    ]);
    console.log("");
    console.log("Balances (after):");
    console.log(`- ${usdcSym}:  ${formatTokenAmount(balUsdcAfter, Number(usdcDec))}`);
    console.log(`- ${wethSym}:  ${formatTokenAmount(balWethAfter, Number(wethDec))}`);
    console.log(`- ${btcSym}:   ${formatTokenAmount(balBtcAfter, Number(btcDec))}`);
    console.log("Done.");
    return;
  }

  const totalAlloc = allocEthBps + allocBtcBps;
  const ethIn = (depositAmount * BigInt(allocEthBps)) / BigInt(totalAlloc);
  const btcIn = depositAmount - ethIn;

  console.log(`Deposit: ${formatTokenAmount(depositAmount, Number(usdcDec))} ${usdcSym}`);
  console.log(`- swap to ETH: ${formatTokenAmount(ethIn, Number(usdcDec))} ${usdcSym}`);
  console.log(`- swap to BTC: ${formatTokenAmount(btcIn, Number(usdcDec))} ${usdcSym}`);
  console.log("");

  // Swaps must stay sequential: both spend from the same USDC balance and each uses
  // balanceOf before/after to measure received tokens — concurrent execution breaks that.
  const gotWeth = await swapUsdcTo(weth, tokenWeth, wethSym, Number(wethDec), ethIn);
  const gotBtc = await swapUsdcTo(cbbtc, tokenCbbtc, btcSym, Number(btcDec), btcIn);

  console.log("");
  // Supplies are independent (different tokens) — safe to parallelize.
  await Promise.all([
    supply(weth, tokenWeth, wethSym, Number(wethDec), gotWeth),
    supply(cbbtc, tokenCbbtc, btcSym, Number(btcDec), gotBtc)
  ]);

  LAST_STAGE = "balances-after";
  const [balUsdcAfter2, balWethAfter2, balBtcAfter2] = await Promise.all([
    tokenUsdc.balanceOf(signer.address) as Promise<bigint>,
    tokenWeth.balanceOf(signer.address) as Promise<bigint>,
    tokenCbbtc.balanceOf(signer.address) as Promise<bigint>
  ]);
  console.log("");
  console.log("Balances (after):");
  console.log(`- ${usdcSym}:  ${formatTokenAmount(balUsdcAfter2, Number(usdcDec))}`);
  console.log(`- ${wethSym}:  ${formatTokenAmount(balWethAfter2, Number(wethDec))}`);
  console.log(`- ${btcSym}:   ${formatTokenAmount(balBtcAfter2, Number(btcDec))}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  console.error(`[error summary] stage=${LAST_STAGE}: ${summarizeError(err)}`);
  process.exitCode = 1;
});
