import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { formatUnits } from "ethers";

// Base mainnet defaults.
const DEFAULT_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_WETH_BASE = "0x4200000000000000000000000000000000000006";
const DEFAULT_CBBTC_BASE = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

// Uniswap Permit2 is deployed at the same address on many chains (including Base).
// SwapRouter02 uses Permit2 to pull ERC20s, so approvals must target Permit2.
const DEFAULT_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Uniswap V3 canonical addresses (used on many chains). If Base differs, set env vars.
// Base mainnet Uniswap V3 addresses:
// - Factory: https://basescan.org/address/0x33128a8fc17869897dce68ed026d694621f6fdfd
// - SwapRouter02: https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481
// - QuoterV2: https://basescan.org/address/0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
const DEFAULT_UNIV3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
const DEFAULT_UNIV3_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"; // SwapRouter02
const DEFAULT_UNIV3_QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"; // QuoterV2

const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT48 = (1n << 48n) - 1n;
const DEFAULT_DUST_WETH_WEI = 1_000_000_000n; // 0.000000001 WETH
const DEFAULT_DUST_CBBTC_UNITS = 10n; // 0.00000010 cbBTC (10 sats)
const DEFAULT_SWEEP_MAX_PASSES = 3;

let LAST_STAGE = "init";

function optionalEnv(name: string, fallback: string) {
  return (process.env[name]?.trim() || fallback).trim();
}

function bigintEnv(name: string, fallback: bigint): bigint {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer`);
  return BigInt(raw);
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
  if (!vault || vault === "0x0000000000000000000000000000000000000000") return null;
  return vault;
}

function formatTokenAmount(raw: bigint, decimals: number) {
  const s = formatUnits(raw, decimals);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, 6).replace(/0+$/, "");
  return frac ? `${i}.${frac}` : i;
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
  // Try Quoter V1 signature first.
  try {
    const out = (await quoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, fee, amountIn, 0)) as bigint;
    return out;
  } catch {
    // Try Quoter V2 signature (struct + multi-return).
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
      // Some RPCs return empty data ("0x") under load, which ethers reports as BAD_DATA.
      // Treat this as a transient RPC issue and continue scanning other tiers.
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
      // Skip broken fee tiers.
    }
  }

  if (bestFee == null) {
    if (hadGetPoolError) {
      throw new Error(
        `Failed to query Uniswap V3 pools (RPC returned invalid data). Try again or set BASE_RPC_URL_OVERRIDE/BASE_RPC_URL to a more reliable endpoint.`
      );
    }
    throw new Error(`No Uniswap V3 pool found for tokenIn=${tokenIn} tokenOut=${tokenOut}`);
  }

  return { fee: bestFee, amountOut: bestOut };
}

async function main() {
  LAST_STAGE = "init";
  // We intentionally do not require the vault; swaps happen in the owner EOA wallet.
  const _vaultAddress = (process.env.VAULT_ADDRESS?.trim() || getVaultAddressFromCreConfig() || "").trim();
  if (_vaultAddress) console.log("Vault (info):", normalizeAddress(_vaultAddress));

  const usdc = normalizeAddress(optionalEnv("USDC_ADDRESS", DEFAULT_USDC_BASE));
  const weth = normalizeAddress(optionalEnv("WETH_ADDRESS", DEFAULT_WETH_BASE));
  const cbbtc = normalizeAddress(optionalEnv("CBBTC_ADDRESS", DEFAULT_CBBTC_BASE));
  const permit2Addr = normalizeAddress(optionalEnv("PERMIT2_ADDRESS", DEFAULT_PERMIT2));

  const factoryAddr = normalizeAddress(optionalEnv("UNIV3_FACTORY_ADDRESS", DEFAULT_UNIV3_FACTORY));
  const routerAddr = normalizeAddress(optionalEnv("UNIV3_ROUTER_ADDRESS", DEFAULT_UNIV3_ROUTER));
  const quoterAddr = normalizeAddress(optionalEnv("UNIV3_QUOTER_ADDRESS", DEFAULT_UNIV3_QUOTER));

  const slippageBps = Number(optionalEnv("SLIPPAGE_BPS", "50"));
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 500) {
    throw new Error("SLIPPAGE_BPS must be between 0 and 500");
  }
  const dustWethWei = bigintEnv("SWAP_DUST_WETH_WEI", DEFAULT_DUST_WETH_WEI);
  const dustCbbtcUnits = bigintEnv("SWAP_DUST_CBBTC_UNITS", DEFAULT_DUST_CBBTC_UNITS);
  const sweepMaxPasses = Number(optionalEnv("SWEEP_MAX_PASSES", String(DEFAULT_SWEEP_MAX_PASSES)));
  if (!Number.isFinite(sweepMaxPasses) || sweepMaxPasses < 1 || sweepMaxPasses > 10) {
    throw new Error("SWEEP_MAX_PASSES must be between 1 and 10");
  }

  const confirm = (process.env.CONFIRM_MAINNET || "").trim().toUpperCase() === "YES";

  const [signer] = await ethers.getSigners();
  const managedSigner = new ethers.NonceManager(signer);

  LAST_STAGE = "preflight";
  console.log("Network: base (8453)");
  console.log("Signer:", signer.address);
  console.log("USDC:", usdc);
  console.log("WETH:", weth);
  console.log("cbBTC:", cbbtc);
  console.log("Permit2:", permit2Addr);
  console.log("Router:", routerAddr);
  console.log("Quoter:", quoterAddr);
  console.log("Slippage:", `${slippageBps} bps`);
  console.log("Sweep dust:", `${dustWethWei.toString()} wei WETH / ${dustCbbtcUnits.toString()} cbBTC-units`);
  console.log("Sweep max passes:", sweepMaxPasses);
  console.log("Confirm:", confirm ? "YES (will send txs)" : "NO (dry run)");
  console.log("");

  // Gas sanity check (helps diagnose "nothing happened" failures).
  try {
    const nativeBal = (await ethers.provider.getBalance(signer.address)) as bigint;
    console.log(`ETH (gas): ${formatUnits(nativeBal, 18)} ETH`);
    console.log("");
  } catch {
    // ignore
  }

  LAST_STAGE = "ensure-code";
  await Promise.all([
    ensureHasCode("UniswapV3Factory", factoryAddr),
    ensureHasCode("Permit2", permit2Addr),
    ensureHasCode("UniswapV3Router", routerAddr),
    ensureHasCode("UniswapV3Quoter", quoterAddr)
  ]);

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

  const [usdcDec, usdcSym] = await Promise.all([tokenUsdc.decimals(), tokenUsdc.symbol()]);
  const [wethDec, wethSym] = await Promise.all([tokenWeth.decimals(), tokenWeth.symbol()]);
  const [btcDec, btcSym] = await Promise.all([tokenCbbtc.decimals(), tokenCbbtc.symbol()]);

  const balWeth = (await tokenWeth.balanceOf(signer.address)) as bigint;
  const balBtc = (await tokenCbbtc.balanceOf(signer.address)) as bigint;
  const balUsdcBefore = (await tokenUsdc.balanceOf(signer.address)) as bigint;

  LAST_STAGE = "balances";
  console.log("Balances (before):");
  console.log(`- ${wethSym}:  ${formatTokenAmount(balWeth, Number(wethDec))}`);
  console.log(`- ${btcSym}:   ${formatTokenAmount(balBtc, Number(btcDec))}`);
  console.log(`- ${usdcSym}:  ${formatTokenAmount(balUsdcBefore, Number(usdcDec))}`);
  console.log("");

  const factory = await ethers.getContractAt(
    ["function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address)"],
    factoryAddr,
    managedSigner
  );

  // Quoter can be V1 or V2; we try both ABIs and call the same name.
  const quoter = await ethers.getContractAt(
    [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
      "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
    ],
    quoterAddr,
    managedSigner
  );

  // Routers in the wild disagree on the ExactInputSingleParams struct shape (with vs without `deadline`).
  // For a hackathon demo we prefer robustness: try the modern selector first, then fall back.
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

  async function exactInputSingleCompat(paramsNoDeadline: {
    tokenIn: string;
    tokenOut: string;
    fee: number;
    recipient: string;
    amountIn: bigint;
    amountOutMinimum: bigint;
    sqrtPriceLimitX96: number;
  }) {
    try {
      return await routerNoDeadline.exactInputSingle(paramsNoDeadline);
    } catch (e1) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60);
      try {
        return await routerWithDeadline.exactInputSingle({ ...paramsNoDeadline, deadline });
      } catch (e2) {
        throw new Error(
          `SwapRouter exactInputSingle failed (noDeadline: ${summarizeError(e1)}; withDeadline: ${summarizeError(e2)})`
        );
      }
    }
  }

  const permit2 = await ethers.getContractAt(
    [
      // Permit2 AllowanceTransfer
      "function allowance(address user,address token,address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)",
      "function approve(address token,address spender,uint160 amount,uint48 expiration) external"
    ],
    permit2Addr,
    managedSigner
  );

  async function ensurePermit2Allowance(token: string, spender: string, needed: bigint, label: string) {
    const [amount, expiration] = (await permit2.allowance(signer.address, token, spender)) as unknown as [bigint, bigint, bigint];
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (amount >= needed && expiration > now) return;
    if (!confirm) return;
    const tx = await permit2.approve(token, spender, MAX_UINT160, MAX_UINT48);
    console.log(`[approve] ${label}:`, tx.hash);
    await tx.wait();
  }

  async function swapAll({
    tokenIn,
    tokenOut,
    tokenInContract,
    tokenInSym,
    tokenOutSym,
    tokenInDec,
    tokenOutDec
  }: {
    tokenIn: string;
    tokenOut: string;
    tokenInContract: any;
    tokenInSym: string;
    tokenOutSym: string;
    tokenInDec: number;
    tokenOutDec: number;
  }) {
    const amountIn = (await tokenInContract.balanceOf(signer.address)) as bigint;
    if (amountIn === 0n) {
      console.log(`[swap] ${tokenInSym}: balance=0, skipping`);
      return;
    }

    console.log(`[swap] ${tokenInSym} -> ${tokenOutSym}`);
    console.log(`- amountIn:  ${formatTokenAmount(amountIn, tokenInDec)} ${tokenInSym}`);
    const { fee, amountOut: quotedOut } = await pickBestFee({ factory, quoter, tokenIn, tokenOut, amountIn });
    console.log(`- best fee:  ${fee}`);
    console.log(`- quote out: ${formatTokenAmount(quotedOut, tokenOutDec)} ${tokenOutSym}`);

    if (!confirm) return;

    // Robustly support both Router02 payment modes:
    // - direct ERC20 allowance to router
    // - Permit2 ERC20 allowance to Permit2 + Permit2 internal allowance to router
    const allowanceRouter = (await tokenInContract.allowance(signer.address, routerAddr)) as bigint;
    if (allowanceRouter < amountIn) {
      const tx1 = await tokenInContract.approve(routerAddr, amountIn);
      console.log(`[approve] ${tokenInSym} (Router):`, tx1.hash);
      await tx1.wait();
    }

    const allowancePermit2 = (await tokenInContract.allowance(signer.address, permit2Addr)) as bigint;
    if (allowancePermit2 < amountIn) {
      const tx2 = await tokenInContract.approve(permit2Addr, MAX_UINT256);
      console.log(`[approve] ${tokenInSym} (Permit2):`, tx2.hash);
      await tx2.wait();
    }

    await ensurePermit2Allowance(tokenIn, routerAddr, amountIn, `${tokenInSym} (Permit2->Router)`);

    // The quoter result can go stale while we wait for approvals (or due to fast markets).
    // Compute `minOut` from a fresh router simulation right before broadcasting.
    const paramsSim = {
      tokenIn,
      tokenOut,
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
        throw new Error(
          `SwapRouter staticCall failed (noDeadline: ${summarizeError(e1)}; withDeadline: ${summarizeError(e2)})`
        );
      }
    }

    const outForMin = simOut != null && simOut > 0n ? simOut : quotedOut;
    const minOut = (outForMin * BigInt(10_000 - slippageBps)) / 10_000n;
    console.log(`- sim out:   ${formatTokenAmount(outForMin, tokenOutDec)} ${tokenOutSym}`);
    console.log(`- min out:   ${formatTokenAmount(minOut, tokenOutDec)} ${tokenOutSym}`);

    LAST_STAGE = `swap:${tokenInSym}->${tokenOutSym}`;
    const tx2 = await exactInputSingleCompat({
      tokenIn,
      tokenOut,
      fee,
      recipient: signer.address,
      amountIn,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0
    });
    console.log(`[swap] tx:`, tx2.hash);
    await tx2.wait();
  }

  async function readOwnerBalances() {
    const [wethBal, btcBal, usdcBal] = await Promise.all([
      tokenWeth.balanceOf(signer.address) as Promise<bigint>,
      tokenCbbtc.balanceOf(signer.address) as Promise<bigint>,
      tokenUsdc.balanceOf(signer.address) as Promise<bigint>
    ]);
    return { wethBal, btcBal, usdcBal };
  }

  // Sweep in multiple passes to handle temporary pool/RPC issues and fallback path outputs.
  for (let pass = 1; pass <= sweepMaxPasses; pass++) {
    const before = await readOwnerBalances();
    const doneWeth = before.wethBal <= dustWethWei;
    const doneBtc = before.btcBal <= dustCbbtcUnits;
    if (doneWeth && doneBtc) break;

    console.log(`[sweep] pass ${pass}/${sweepMaxPasses}`);
    console.log(`- before: ${formatTokenAmount(before.wethBal, Number(wethDec))} ${wethSym}, ${formatTokenAmount(before.btcBal, Number(btcDec))} ${btcSym}`);

    // Swap cbBTC first so any cbBTC->WETH fallback gets included in the later WETH->USDC swap.
    if (!doneBtc) {
      try {
        await swapAll({
          tokenIn: cbbtc,
          tokenOut: usdc,
          tokenInContract: tokenCbbtc,
          tokenInSym: btcSym,
          tokenOutSym: usdcSym,
          tokenInDec: Number(btcDec),
          tokenOutDec: Number(usdcDec)
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`[swap] ${btcSym} -> ${usdcSym} failed (${msg}). Trying ${btcSym} -> ${wethSym}...`);
        await swapAll({
          tokenIn: cbbtc,
          tokenOut: weth,
          tokenInContract: tokenCbbtc,
          tokenInSym: btcSym,
          tokenOutSym: wethSym,
          tokenInDec: Number(btcDec),
          tokenOutDec: Number(wethDec)
        });
      }
    }

    const wethNow = (await tokenWeth.balanceOf(signer.address)) as bigint;
    if (wethNow > dustWethWei) {
      await swapAll({
        tokenIn: weth,
        tokenOut: usdc,
        tokenInContract: tokenWeth,
        tokenInSym: wethSym,
        tokenOutSym: usdcSym,
        tokenInDec: Number(wethDec),
        tokenOutDec: Number(usdcDec)
      });
    }

    const after = await readOwnerBalances();
    console.log(`- after:  ${formatTokenAmount(after.wethBal, Number(wethDec))} ${wethSym}, ${formatTokenAmount(after.btcBal, Number(btcDec))} ${btcSym}`);
    const noProgress = after.wethBal >= before.wethBal && after.btcBal >= before.btcBal;
    if (noProgress) {
      console.log("[sweep] no further progress in this pass.");
      break;
    }
  }

  LAST_STAGE = "balances-after";
  const { wethBal: balWethAfter, btcBal: balBtcAfter, usdcBal: balUsdcAfter } = await readOwnerBalances();
  console.log("");
  console.log(`WETH balance (after): ${formatTokenAmount(balWethAfter, Number(wethDec))} ${wethSym}`);
  console.log(`cbBTC balance (after): ${formatTokenAmount(balBtcAfter, Number(btcDec))} ${btcSym}`);
  console.log(`USDC balance (after): ${formatTokenAmount(balUsdcAfter, Number(usdcDec))} ${usdcSym}`);
  if (confirm && (balWethAfter > dustWethWei || balBtcAfter > dustCbbtcUnits)) {
    throw new Error(
      `Residual non-USDC remains after sweep (WETH=${formatTokenAmount(balWethAfter, Number(wethDec))}, cbBTC=${formatTokenAmount(balBtcAfter, Number(btcDec))}).`
    );
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  console.error(`[error summary] stage=${LAST_STAGE}: ${summarizeError(err)}`);
  process.exitCode = 1;
});
