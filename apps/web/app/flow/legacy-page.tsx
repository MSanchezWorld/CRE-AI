"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { base } from "viem/chains";
import { createPublicClient, fallback, formatUnits, http, isAddress, parseAbiItem } from "viem";

import styles from "./Flow.module.css";

type FlowStep = {
  id: string;
  title: string;
  domain: "AI" | "CRE" | "Onchain";
  description: string;
};

type Proof = {
  updatedAtMs: number;
  vault: {
    address: string;
    paused: boolean;
    nonce: bigint;
    payeeAllowed: boolean;
    borrowAssetAllowed: boolean;
  };
  receiver: {
    address: string;
  };
  supplies: Array<{
    txHash: string;
    blockNumber: bigint;
    asset: string;
    amount: bigint;
  }>;
  aave: {
    addressesProvider: string;
    pool: string;
    userAccountData: {
      totalCollateralBase: bigint;
      totalDebtBase: bigint;
      availableBorrowsBase: bigint;
      currentLiquidationThreshold: bigint;
      ltv: bigint;
      healthFactor: bigint;
    };
  };
  usdc: {
    address: string;
    symbol: string;
    decimals: number;
    payeeBalance: bigint;
    vaultDebt: bigint;
  };
  collaterals: Array<{
    address: string;
    symbol: string;
    decimals: number;
    aTokenAddress: string;
    aTokenBalance: bigint;
  }>;
  lastBorrowAndPay?: {
    txHash: string;
    blockNumber: bigint;
    nonce: bigint;
    borrowAsset: string;
    borrowAmount: bigint;
    payee: string;
  };
  lastReceiverReport?: {
    txHash: string;
    blockNumber: bigint;
    planNonce: bigint;
    borrowAsset: string;
    borrowAmount: bigint;
    payee: string;
  };
};

const BASE_MAINNET_RPCS = [
  "https://mainnet.base.org",
  "https://base.publicnode.com",
  "https://base-rpc.publicnode.com",
  "https://base.meowrpc.com",
  "https://base.drpc.org"
];
const BASESCAN = "https://basescan.org";

const BorrowVaultAbi = [
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "aaveAddressesProvider", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "approvedPayees",
    stateMutability: "view",
    inputs: [{ name: "payee", type: "address" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "approvedBorrowTokens",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }]
  }
] as const;

const PoolAddressesProviderAbi = [
  { type: "function", name: "getPool", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }
] as const;

const PoolAbi = [
  {
    type: "function",
    name: "getUserAccountData",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "configuration", type: "uint256" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" }
        ]
      }
    ]
  }
] as const;

const Erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }
] as const;

function shortHex(hex?: string, left = 6, right = 4) {
  if (!hex) return "";
  if (hex.length <= left + right) return hex;
  return `${hex.slice(0, left)}...${hex.slice(-right)}`;
}

function toStatus(ok: boolean, waitText = "WAIT", okText = "OK") {
  return ok ? okText : waitText;
}

export default function FlowPage() {
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [cssModulesLoaded, setCssModulesLoaded] = useState(true);

  // Demo defaults (Base mainnet deployments in this repo).
  const [vaultAddress, setVaultAddress] = useState("0xf154BBca60E61B569712959Cc5D5435e27508BE2");
  const [receiverAddress, setReceiverAddress] = useState("0x415090eb9EB50900D61509ddf741bCD8cb2B1353");
  const [usdcAddress, setUsdcAddress] = useState("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  const [cbbtcAddress, setCbbtcAddress] = useState("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf");
  const [wethAddress, setWethAddress] = useState("0x4200000000000000000000000000000000000006");

  const [payee, setPayee] = useState("0x42444551e2b5FEb7A7c2eE4dA38993381B08Bc6d");
  const [spendUsdc, setSpendUsdc] = useState("1.00");
  const [allocEthPct, setAllocEthPct] = useState("100");
  const [allocBtcPct, setAllocBtcPct] = useState("0");

  const [proof, setProof] = useState<Proof | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [watching, setWatching] = useState(false);
  const [baselineNonce, setBaselineNonce] = useState<bigint | null>(null);
  const [baselineProof, setBaselineProof] = useState<Proof | null>(null);
  const [baselinePayee, setBaselinePayee] = useState<string | null>(null);

  const client = useMemo(() => {
    // Reads only. Writes are done via CRE + onchain contracts.
    return createPublicClient({
      chain: base,
      transport: fallback(BASE_MAINNET_RPCS.map((u) => http(u)))
    });
  }, []);

  const steps: FlowStep[] = useMemo(() => {
    const ethPct = Number(allocEthPct || "0") || 0;
    const btcPct = Number(allocBtcPct || "0") || 0;
    const spend = spendUsdc || "0";
    return [
      {
        id: "plan",
        title: "Agent proposes treasury plan",
        domain: "AI",
        description: `Allocate new USDC inflow: buy ETH (${ethPct}%) + BTC (${btcPct}%), keep the rest as stable runway. Then open/maintain a credit line to pay ${spend} USDC to ${payee}.`
      },
      {
        id: "verify",
        title: "CRE validates policy + orchestrates",
        domain: "CRE",
        description:
          "CRE performs deterministic checks (limits, allowlists, staleness) and produces a verifiable report. Consensus across nodes means no single server can silently change the execution."
      },
      {
        id: "swap",
        title: "Convert USDC to ETH + BTC",
        domain: "Onchain",
        description:
          "USDC is converted into ETH (WETH) and wrapped BTC (cbBTC) per the allocation plan. The visual verifies the result by showing BTC/ETH collateral present in the Aave position."
      },
      {
        id: "supply",
        title: "Supply collateral to Aave",
        domain: "Onchain",
        description:
          "Treasury deposits ETH/cbBTC to Aave V3 and enables it as collateral. This builds credit capacity without selling long-term assets."
      },
      {
        id: "borrowpay",
        title: "Borrow USDC and pay",
        domain: "Onchain",
        description:
          "BorrowVault borrows USDC against collateral and transfers it to the payee address, enforcing onchain caps + cooldown + replay protection."
      }
    ];
  }, [allocBtcPct, allocEthPct, payee, spendUsdc]);

  const proofStatus = useMemo(() => {
    if (!proof) return null;

    const wantEth = (Number(allocEthPct) || 0) > 0;
    const wantBtc = (Number(allocBtcPct) || 0) > 0;

    const cbbtc = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === cbbtcAddress.toLowerCase()) ?? null;
    const weth = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === wethAddress.toLowerCase()) ?? null;

    const okVerify = Boolean(proof.lastReceiverReport && proof.lastReceiverReport.payee.toLowerCase() === payee.toLowerCase());
    const okSwap = Boolean(
      (!wantEth || (weth ? weth.aTokenBalance > 0n : false)) &&
        (!wantBtc || (cbbtc ? cbbtc.aTokenBalance > 0n : false))
    );
    const okSupply = Boolean(proof.aave.userAccountData.totalCollateralBase > 0n);
    const okBorrowPay = Boolean(proof.lastBorrowAndPay && proof.lastBorrowAndPay.payee.toLowerCase() === payee.toLowerCase());

    const onchainPhase = okBorrowPay ? 4 : okSupply ? 3 : okSwap ? 2 : okVerify ? 1 : 0;

    return {
      wantEth,
      wantBtc,
      cbbtc,
      weth,
      okVerify,
      okSwap,
      okSupply,
      okBorrowPay,
      onchainPhase
    };
  }, [allocBtcPct, allocEthPct, cbbtcAddress, payee, proof, wethAddress]);

  useEffect(() => {
    if (!running) return;
    if (cursor >= steps.length) {
      setRunning(false);
      return;
    }
    const t = setTimeout(() => setCursor((c) => c + 1), 950);
    return () => clearTimeout(t);
  }, [running, cursor, steps.length]);

  useEffect(() => {
    // When users open the wrong URL (e.g. a file:// build artifact) or an extension blocks /_next assets,
    // the page can render as raw HTML. This is a quick, visible sanity check.
    const el = document.getElementById("css-sentinel");
    if (!el) return;
    const bg = window.getComputedStyle(el).backgroundColor;
    setCssModulesLoaded(bg === "rgb(1, 2, 3)");
  }, []);

  const validVault = isAddress(vaultAddress);
  const validReceiver = isAddress(receiverAddress);
  const validPayee = isAddress(payee);
  const validUsdc = isAddress(usdcAddress);
  const validCbbtc = isAddress(cbbtcAddress);
  const validWeth = isAddress(wethAddress);

  const validAlloc = (() => {
    const e = Number(allocEthPct);
    const b = Number(allocBtcPct);
    return Number.isFinite(e) && Number.isFinite(b) && e >= 0 && b >= 0 && e + b <= 100;
  })();

  async function fetchProof(): Promise<Proof> {
    const vault = vaultAddress.trim() as `0x${string}`;
    const receiver = receiverAddress.trim() as `0x${string}`;
    const payeeAddr = payee.trim() as `0x${string}`;
    const usdc = usdcAddress.trim() as `0x${string}`;

    if (!isAddress(vault)) throw new Error("Invalid vault address");
    if (!isAddress(receiver)) throw new Error("Invalid receiver address");
    if (!isAddress(payeeAddr)) throw new Error("Invalid payee address");
    if (!isAddress(usdc)) throw new Error("Invalid USDC address");

    const [paused, nonce, addressesProvider, payeeAllowed, borrowAllowed] = await Promise.all([
      client.readContract({ address: vault, abi: BorrowVaultAbi, functionName: "paused" }),
      client.readContract({ address: vault, abi: BorrowVaultAbi, functionName: "nonce" }),
      client.readContract({ address: vault, abi: BorrowVaultAbi, functionName: "aaveAddressesProvider" }),
      client.readContract({ address: vault, abi: BorrowVaultAbi, functionName: "approvedPayees", args: [payeeAddr] }),
      client.readContract({ address: vault, abi: BorrowVaultAbi, functionName: "approvedBorrowTokens", args: [usdc] })
    ]);

    const pool = await client.readContract({
      address: addressesProvider,
      abi: PoolAddressesProviderAbi,
      functionName: "getPool"
    });

    const userAccountDataRaw = await client.readContract({
      address: pool,
      abi: PoolAbi,
      functionName: "getUserAccountData",
      args: [vault]
    });

    const userAccountData = {
      totalCollateralBase: userAccountDataRaw[0],
      totalDebtBase: userAccountDataRaw[1],
      availableBorrowsBase: userAccountDataRaw[2],
      currentLiquidationThreshold: userAccountDataRaw[3],
      ltv: userAccountDataRaw[4],
      healthFactor: userAccountDataRaw[5]
    };

    const [usdcDecimals, usdcSymbol, payeeBalance] = await Promise.all([
      client.readContract({ address: usdc, abi: Erc20Abi, functionName: "decimals" }),
      client.readContract({ address: usdc, abi: Erc20Abi, functionName: "symbol" }),
      client.readContract({ address: usdc, abi: Erc20Abi, functionName: "balanceOf", args: [payeeAddr] })
    ]);

    const usdcReserve = await client.readContract({
      address: pool,
      abi: PoolAbi,
      functionName: "getReserveData",
      args: [usdc]
    });
    const usdcVarDebtToken = usdcReserve.variableDebtTokenAddress;
    const vaultDebt = await client.readContract({
      address: usdcVarDebtToken,
      abi: Erc20Abi,
      functionName: "balanceOf",
      args: [vault]
    });

    const collateralAssets: Array<`0x${string}`> = [];
    if (isAddress(cbbtcAddress)) collateralAssets.push(cbbtcAddress.trim() as `0x${string}`);
    if (isAddress(wethAddress)) collateralAssets.push(wethAddress.trim() as `0x${string}`);

    const collaterals: Proof["collaterals"] = [];
    for (const asset of collateralAssets) {
      const reserve = await client.readContract({ address: pool, abi: PoolAbi, functionName: "getReserveData", args: [asset] });
      const aTokenAddress = reserve.aTokenAddress;

      const [symbol, decimals, aBal] = await Promise.all([
        client.readContract({ address: asset, abi: Erc20Abi, functionName: "symbol" }),
        client.readContract({ address: asset, abi: Erc20Abi, functionName: "decimals" }),
        client.readContract({ address: aTokenAddress, abi: Erc20Abi, functionName: "balanceOf", args: [vault] })
      ]);

      collaterals.push({
        address: asset,
        symbol,
        decimals: Number(decimals),
        aTokenAddress,
        aTokenBalance: aBal
      });
    }

    const blockNumber = await client.getBlockNumber();
    // Some public RPC providers rate-limit or reject large log ranges. Keep this below 10k blocks.
    const fromBlock = blockNumber > 9_000n ? blockNumber - 9_000n : 0n;

    const borrowEvent = parseAbiItem(
      "event BorrowAndPayExecuted(uint256 indexed nonce, address indexed borrowAsset, uint256 borrowAmount, address indexed payee, uint256 planExpiresAt)"
    );
    const collateralSuppliedEvent = parseAbiItem("event CollateralSupplied(address indexed asset, uint256 amount)");
    const receiverEvent = parseAbiItem(
      "event ReportProcessed(address indexed borrowAsset, uint256 borrowAmount, address indexed payee, uint256 planExpiresAt, uint256 planNonce)"
    );

    const [borrowLogs, receiverLogs, supplyLogs] = await Promise.all([
      client.getLogs({ address: vault, event: borrowEvent, fromBlock, toBlock: "latest" }),
      client.getLogs({ address: receiver, event: receiverEvent, fromBlock, toBlock: "latest" }),
      client.getLogs({ address: vault, event: collateralSuppliedEvent, fromBlock, toBlock: "latest" })
    ]);

    const lastBorrow = [...borrowLogs]
      .sort((a, b) =>
        a.blockNumber === b.blockNumber ? Number(a.logIndex) - Number(b.logIndex) : Number(a.blockNumber - b.blockNumber)
      )
      .pop();

    const lastReceiver = [...receiverLogs]
      .sort((a, b) =>
        a.blockNumber === b.blockNumber ? Number(a.logIndex) - Number(b.logIndex) : Number(a.blockNumber - b.blockNumber)
      )
      .pop();

    const supplies: Proof["supplies"] = supplyLogs
      .sort((a, b) =>
        a.blockNumber === b.blockNumber ? Number(a.logIndex) - Number(b.logIndex) : Number(a.blockNumber - b.blockNumber)
      )
      .map((l) => {
        const args = l.args as unknown as { asset: `0x${string}`; amount: bigint };
        return {
          txHash: l.transactionHash,
          blockNumber: l.blockNumber,
          asset: args.asset,
          amount: args.amount
        };
      });

    return {
      updatedAtMs: Date.now(),
      vault: {
        address: vault,
        paused,
        nonce,
        payeeAllowed,
        borrowAssetAllowed: borrowAllowed
      },
      receiver: { address: receiver },
      supplies,
      aave: { addressesProvider, pool, userAccountData },
      usdc: {
        address: usdc,
        symbol: usdcSymbol,
        decimals: Number(usdcDecimals),
        payeeBalance,
        vaultDebt
      },
      collaterals,
      lastBorrowAndPay: lastBorrow
        ? (() => {
            // viem's `getLogs` args can be typed as optional; we know this event always has these args.
            const args = lastBorrow.args as unknown as {
              nonce: bigint;
              borrowAsset: `0x${string}`;
              borrowAmount: bigint;
              payee: `0x${string}`;
            };
            return {
              txHash: lastBorrow.transactionHash,
              blockNumber: lastBorrow.blockNumber,
              nonce: args.nonce,
              borrowAsset: args.borrowAsset,
              borrowAmount: args.borrowAmount,
              payee: args.payee
            };
          })()
        : undefined,
      lastReceiverReport: lastReceiver
        ? (() => {
            const args = lastReceiver.args as unknown as {
              planNonce: bigint;
              borrowAsset: `0x${string}`;
              borrowAmount: bigint;
              payee: `0x${string}`;
            };
            return {
              txHash: lastReceiver.transactionHash,
              blockNumber: lastReceiver.blockNumber,
              planNonce: args.planNonce,
              borrowAsset: args.borrowAsset,
              borrowAmount: args.borrowAmount,
              payee: args.payee
            };
          })()
        : undefined
    };
  }

  async function refreshOnchainProof() {
    setProofError(null);
    setRefreshing(true);
    try {
      const p = await fetchProof();
      setProof(p);
      return p;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProofError(msg);
      throw err;
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const p = await fetchProof();
        setProof(p);
        if (baselineNonce != null && p.vault.nonce > baselineNonce) {
          setWatching(false);
          return;
        }
      } catch (err) {
        // Keep polling; transient RPC issues are common on public endpoints.
        console.warn("[flow] poll error", err);
      }
      if (!cancelled) setTimeout(poll, 2000);
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [baselineNonce, client, watching]);

  function renderFlywheel() {
    // If not actively "running" the storyboard, sync the visual to onchain proof so the demo
    // shows real progress when you click "Refresh Onchain" or "Watch Next Execution".
    const phase = running
      ? Math.min(cursor, steps.length - 1)
      : Math.min(proofStatus?.onchainPhase ?? 0, steps.length - 1);

    const wantEth = proofStatus?.wantEth ?? (Number(allocEthPct) || 0) > 0;
    const wantBtc = proofStatus?.wantBtc ?? (Number(allocBtcPct) || 0) > 0;

    const cbbtc = proofStatus?.cbbtc ?? null;
    const weth = proofStatus?.weth ?? null;

    const okVerify = proofStatus?.okVerify ?? false;
    const okSwap = proofStatus?.okSwap ?? false;
    const okSupply = proofStatus?.okSupply ?? false;
    const okBorrowPay = proofStatus?.okBorrowPay ?? false;

    const statusText = (v: boolean, unknownText = "—") => (proof ? (v ? "OK" : "WAIT") : unknownText);

    const formatUsdBase = (v: bigint) => {
      const s = formatUnits(v, 8);
      const [i, f = ""] = s.split(".");
      return `${i}.${(f + "00").slice(0, 2)}`;
    };

    const baselineApplies =
      Boolean(proof && baselineProof && baselinePayee && baselinePayee.toLowerCase() === payee.toLowerCase());
    const deltaPayee = baselineApplies && proof && baselineProof ? proof.usdc.payeeBalance - baselineProof.usdc.payeeBalance : null;
    const fmtSigned = (v: bigint, decimals: number) => {
      const sign = v < 0n ? "-" : "+";
      const abs = v < 0n ? -v : v;
      return `${sign}${formatUnits(abs, decimals)}`;
    };

    // Percent centers across the visual canvas.
    const x = [8, 30, 52, 74, 96];

    const usdcLeftPct = x[Math.min(phase, 2)];
    const usdcOpacity = phase <= 2 ? 1 : 0;

    const ethLeftPct = phase <= 2 ? x[2] : x[3];
    const ethOpacity = wantEth ? (phase >= 2 ? 1 : 0) : 0.18;

    const btcLeftPct = phase <= 2 ? x[2] : x[3];
    const btcOpacity = wantBtc ? (phase >= 2 ? 1 : 0) : 0.18;

    const borrowLeftPct = phase >= 4 ? x[4] : x[3];
    const borrowOpacity = phase >= 3 ? 1 : 0;

    return (
      <div
        className={styles.visual}
        style={{
          margin: "10px 0 14px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          background: "rgba(0, 0, 0, 0.18)",
          overflow: "hidden"
        }}
      >
        <div
          className={styles.visualHeader}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 12px 0 12px"
          }}
        >
          <div>
            <div
              className={styles.visualTitle}
              style={{ fontSize: 12, letterSpacing: "0.2px", color: "rgba(255, 255, 255, 0.92)" }}
            >
              Treasury Flywheel
            </div>
            <div className={styles.visualSub} style={{ marginTop: 3, fontSize: 11, color: "rgba(255, 255, 255, 0.6)" }}>
              Animated storyboard + live onchain proof (Aave + BaseScan)
            </div>
          </div>
          <div
            className={styles.visualLegend}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.62)"
            }}
          >
            <span className={styles.legendItem} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                className={`${styles.legendDot} ${styles.dotUsdc}`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(53, 194, 255, 0.92)",
                  boxShadow: "0 0 0 4px rgba(53, 194, 255, 0.12)"
                }}
              />{" "}
              USDC
            </span>
            <span className={styles.legendItem} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                className={`${styles.legendDot} ${styles.dotEth}`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(124, 255, 171, 0.92)",
                  boxShadow: "0 0 0 4px rgba(124, 255, 171, 0.10)"
                }}
              />{" "}
              ETH
            </span>
            <span className={styles.legendItem} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                className={`${styles.legendDot} ${styles.dotBtc}`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(255, 178, 74, 0.92)",
                  boxShadow: "0 0 0 4px rgba(255, 178, 74, 0.10)"
                }}
              />{" "}
              BTC
            </span>
          </div>
        </div>

        <div
          className={styles.visualCanvas}
          aria-label="Treasury flywheel visual"
          style={{
            position: "relative",
            height: 164,
            margin: 12,
            borderRadius: 14,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            background:
              "radial-gradient(520px 240px at 10% 10%, rgba(53, 194, 255, 0.2), transparent 65%)," +
              "radial-gradient(520px 240px at 90% 10%, rgba(124, 255, 171, 0.1), transparent 65%)," +
              "rgba(0, 0, 0, 0.14)",
            overflow: "hidden"
          }}
        >
          <div
            className={styles.visualRail}
            style={{
              position: "absolute",
              left: 14,
              right: 14,
              top: 116,
              height: 2,
              borderRadius: 999,
              background:
                "linear-gradient(90deg, rgba(53, 194, 255, 0.0), rgba(53, 194, 255, 0.32), rgba(124, 255, 171, 0.18), rgba(255, 255, 255, 0.0))",
              opacity: 0.55
            }}
          />

          <div
            className={styles.visualNodes}
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              top: 14,
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 12
            }}
          >
            <div
              className={[styles.node, phase === 0 ? styles.nodeActive : ""].join(" ")}
              style={{
                border: `1px solid ${phase === 0 ? "rgba(53, 194, 255, 0.35)" : "rgba(255, 255, 255, 0.12)"}`,
                borderRadius: 14,
                background: phase === 0 ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.16)",
                padding: "9px 10px",
                minHeight: 58
              }}
            >
              <div
                className={styles.nodeTop}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <span className={styles.nodeLabel} style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.9)" }}>
                  Agent
                </span>
                <span
                  className={styles.nodeStatus}
                  style={{
                    fontSize: 11,
                    color: "rgba(255, 255, 255, 0.62)",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                  }}
                >
                  OK
                </span>
              </div>
              <div className={styles.nodeSub} style={{ marginTop: 4, fontSize: 11, color: "rgba(255, 255, 255, 0.55)" }}>
                Plan
              </div>
            </div>
            <div
              className={[
                styles.node,
                phase === 1 ? styles.nodeActive : "",
                proof ? (okVerify ? styles.nodeOk : styles.nodeWait) : ""
              ].join(" ")}
              style={{
                border: `1px solid ${
                  phase === 1
                    ? "rgba(53, 194, 255, 0.35)"
                    : proof
                      ? okVerify
                        ? "rgba(124, 255, 171, 0.24)"
                        : "rgba(255, 255, 255, 0.16)"
                      : "rgba(255, 255, 255, 0.12)"
                }`,
                borderRadius: 14,
                background: phase === 1 ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.16)",
                padding: "9px 10px",
                minHeight: 58
              }}
            >
              <div
                className={styles.nodeTop}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <span className={styles.nodeLabel} style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.9)" }}>
                  CRE
                </span>
                <span
                  className={styles.nodeStatus}
                  style={{
                    fontSize: 11,
                    color: "rgba(255, 255, 255, 0.62)",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                  }}
                >
                  {statusText(okVerify)}
                </span>
              </div>
              <div className={styles.nodeSub} style={{ marginTop: 4, fontSize: 11, color: "rgba(255, 255, 255, 0.55)" }}>
                Verify
              </div>
            </div>
            <div
              className={[
                styles.node,
                phase === 2 ? styles.nodeActive : "",
                proof ? (okSwap ? styles.nodeOk : styles.nodeWait) : ""
              ].join(" ")}
              style={{
                border: `1px solid ${
                  phase === 2
                    ? "rgba(53, 194, 255, 0.35)"
                    : proof
                      ? okSwap
                        ? "rgba(124, 255, 171, 0.24)"
                        : "rgba(255, 255, 255, 0.16)"
                      : "rgba(255, 255, 255, 0.12)"
                }`,
                borderRadius: 14,
                background: phase === 2 ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.16)",
                padding: "9px 10px",
                minHeight: 58
              }}
            >
              <div
                className={styles.nodeTop}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <span className={styles.nodeLabel} style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.9)" }}>
                  Swap
                </span>
                <span
                  className={styles.nodeStatus}
                  style={{
                    fontSize: 11,
                    color: "rgba(255, 255, 255, 0.62)",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                  }}
                >
                  {statusText(okSwap)}
                </span>
              </div>
              <div className={styles.nodeSub} style={{ marginTop: 4, fontSize: 11, color: "rgba(255, 255, 255, 0.55)" }}>
                USDC → ETH/BTC
              </div>
            </div>
            <div
              className={[
                styles.node,
                phase === 3 ? styles.nodeActive : "",
                proof ? (okSupply ? styles.nodeOk : styles.nodeWait) : ""
              ].join(" ")}
              style={{
                border: `1px solid ${
                  phase === 3
                    ? "rgba(53, 194, 255, 0.35)"
                    : proof
                      ? okSupply
                        ? "rgba(124, 255, 171, 0.24)"
                        : "rgba(255, 255, 255, 0.16)"
                      : "rgba(255, 255, 255, 0.12)"
                }`,
                borderRadius: 14,
                background: phase === 3 ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.16)",
                padding: "9px 10px",
                minHeight: 58
              }}
            >
              <div
                className={styles.nodeTop}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <span className={styles.nodeLabel} style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.9)" }}>
                  Aave
                </span>
                <span
                  className={styles.nodeStatus}
                  style={{
                    fontSize: 11,
                    color: "rgba(255, 255, 255, 0.62)",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                  }}
                >
                  {statusText(okSupply)}
                </span>
              </div>
              <div className={styles.nodeSub} style={{ marginTop: 4, fontSize: 11, color: "rgba(255, 255, 255, 0.55)" }}>
                {proof ? `Coll $${formatUsdBase(proof.aave.userAccountData.totalCollateralBase)} / Debt $${formatUsdBase(proof.aave.userAccountData.totalDebtBase)}` : "Collateral"}
              </div>
            </div>
            <div
              className={[
                styles.node,
                phase === 4 ? styles.nodeActive : "",
                proof ? (okBorrowPay ? styles.nodeOk : styles.nodeWait) : ""
              ].join(" ")}
              style={{
                border: `1px solid ${
                  phase === 4
                    ? "rgba(53, 194, 255, 0.35)"
                    : proof
                      ? okBorrowPay
                        ? "rgba(124, 255, 171, 0.24)"
                        : "rgba(255, 255, 255, 0.16)"
                      : "rgba(255, 255, 255, 0.12)"
                }`,
                borderRadius: 14,
                background: phase === 4 ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.16)",
                padding: "9px 10px",
                minHeight: 58
              }}
            >
              <div
                className={styles.nodeTop}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <span className={styles.nodeLabel} style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.9)" }}>
                  Payee
                </span>
                <span
                  className={styles.nodeStatus}
                  style={{
                    fontSize: 11,
                    color: "rgba(255, 255, 255, 0.62)",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                  }}
                >
                  {statusText(okBorrowPay)}
                </span>
              </div>
              <div className={styles.nodeSub} style={{ marginTop: 4, fontSize: 11, color: "rgba(255, 255, 255, 0.55)" }}>
                {baselineApplies && deltaPayee != null ? `${fmtSigned(deltaPayee, proof!.usdc.decimals)} USDC` : `Pay ${spendUsdc} USDC`}
                {` · ${shortHex(payee, 8, 6)}`}
              </div>
            </div>
          </div>

          <div
            className={[styles.token, styles.tokenUsdc].join(" ")}
            style={{
              position: "absolute",
              width: 14,
              height: 14,
              borderRadius: 999,
              transition:
                "left 850ms cubic-bezier(0.22, 1, 0.36, 1), top 850ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
              background: "rgba(53, 194, 255, 0.95)",
              boxShadow: "0 0 0 6px rgba(53, 194, 255, 0.1), 0 10px 26px rgba(53, 194, 255, 0.16)",
              left: `calc(${usdcLeftPct}% - 7px)`,
              top: 126,
              opacity: usdcOpacity
            }}
            aria-hidden="true"
          />
          <div
            className={[styles.token, styles.tokenEth].join(" ")}
            style={{
              position: "absolute",
              width: 14,
              height: 14,
              borderRadius: 999,
              transition:
                "left 850ms cubic-bezier(0.22, 1, 0.36, 1), top 850ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
              background: "rgba(124, 255, 171, 0.95)",
              boxShadow: "0 0 0 6px rgba(124, 255, 171, 0.08), 0 10px 26px rgba(124, 255, 171, 0.12)",
              left: `calc(${ethLeftPct}% - 7px)`,
              top: 114,
              opacity: ethOpacity
            }}
            aria-hidden="true"
          />
          <div
            className={[styles.token, styles.tokenBtc].join(" ")}
            style={{
              position: "absolute",
              width: 14,
              height: 14,
              borderRadius: 999,
              transition:
                "left 850ms cubic-bezier(0.22, 1, 0.36, 1), top 850ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
              background: "rgba(255, 178, 74, 0.95)",
              boxShadow: "0 0 0 6px rgba(255, 178, 74, 0.08), 0 10px 26px rgba(255, 178, 74, 0.12)",
              left: `calc(${btcLeftPct}% - 7px)`,
              top: 138,
              opacity: btcOpacity
            }}
            aria-hidden="true"
          />
          <div
            className={[styles.token, styles.tokenBorrow].join(" ")}
            style={{
              position: "absolute",
              width: 14,
              height: 14,
              borderRadius: 999,
              transition:
                "left 850ms cubic-bezier(0.22, 1, 0.36, 1), top 850ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
              background: "rgba(255, 255, 255, 0.88)",
              boxShadow: "0 0 0 6px rgba(255, 255, 255, 0.06), 0 10px 26px rgba(255, 255, 255, 0.08)",
              left: `calc(${borrowLeftPct}% - 7px)`,
              top: 126,
              opacity: borrowOpacity
            }}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }

  function renderStepProof(stepId: string) {
    if (!proof) return null;

    const stepProofStyle = {
      position: "relative" as const,
      zIndex: 1,
      marginTop: 10,
      display: "grid",
      gap: 6
    };
    const proofLineStyle = {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      padding: "7px 9px",
      borderRadius: 12,
      border: "1px solid rgba(255, 255, 255, 0.10)",
      background: "rgba(0, 0, 0, 0.18)"
    };
    const proofLeftStyle = { fontSize: 13, color: "rgba(255, 255, 255, 0.68)" };
    const proofRightStyle = { fontSize: 13, color: "rgba(255, 255, 255, 0.86)", whiteSpace: "nowrap" as const };
    const monoStyle = {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    };
    const okColor = { color: "rgba(124, 255, 171, 0.9)" };
    const waitColor = { color: "rgba(255, 255, 255, 0.62)" };
    const badColor = { color: "rgba(255, 120, 120, 0.9)" };

    if (stepId === "verify") {
      const ok = Boolean(proof.lastReceiverReport && proof.lastReceiverReport.payee.toLowerCase() === payee.toLowerCase());
      const tx = proof.lastReceiverReport?.txHash;
      return (
        <div className={styles.stepProof} style={stepProofStyle}>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Receiver processed report</span>
            <span
              className={`${styles.proofRight} ${ok ? styles.statusOk : styles.statusWait}`}
              style={{ ...proofRightStyle, ...(ok ? okColor : waitColor) }}
            >
              {toStatus(ok)}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Latest receiver tx</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
              {tx ? (
                <a className={styles.link} href={`${BASESCAN}/tx/${tx}`} target="_blank" rel="noreferrer">
                  {shortHex(tx, 10, 8)}
                </a>
              ) : (
                "n/a"
              )}
            </span>
          </div>
        </div>
      );
    }

    if (stepId === "swap") {
      const wantEth = (Number(allocEthPct) || 0) > 0;
      const wantBtc = (Number(allocBtcPct) || 0) > 0;

      const cbbtc = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === cbbtcAddress.toLowerCase());
      const weth = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === wethAddress.toLowerCase());

      const cbbtcOk = !wantBtc || (cbbtc ? cbbtc.aTokenBalance > 0n : false);
      const wethOk = !wantEth || (weth ? weth.aTokenBalance > 0n : false);
      const ok = cbbtcOk && wethOk;

      return (
        <div className={styles.stepProof} style={stepProofStyle}>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Aave collateral present</span>
            <span
              className={`${styles.proofRight} ${ok ? styles.statusOk : styles.statusWait}`}
              style={{ ...proofRightStyle, ...(ok ? okColor : waitColor) }}
            >
              {toStatus(ok)}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>cbBTC (aToken)</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
              {cbbtc ? formatUnits(cbbtc.aTokenBalance, cbbtc.decimals) : "n/a"}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>WETH (aToken)</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
              {weth ? formatUnits(weth.aTokenBalance, weth.decimals) : "n/a"}
            </span>
          </div>
        </div>
      );
    }

    if (stepId === "supply") {
      const totalCollateralOk = proof.aave.userAccountData.totalCollateralBase > 0n;
      const totalCollateralHuman = proof.aave.userAccountData.totalCollateralBase.toString();

      const metaFor = (asset: string) =>
        proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === asset.toLowerCase());

      const lastSupplyFor = (asset: string) => {
        const a = asset.toLowerCase();
        return [...proof.supplies].filter((s) => s.asset.toLowerCase() === a).pop();
      };

      const wethSupply = isAddress(wethAddress) ? lastSupplyFor(wethAddress) : undefined;
      const cbbtcSupply = isAddress(cbbtcAddress) ? lastSupplyFor(cbbtcAddress) : undefined;

      const wethMeta = isAddress(wethAddress) ? metaFor(wethAddress) : undefined;
      const cbbtcMeta = isAddress(cbbtcAddress) ? metaFor(cbbtcAddress) : undefined;

      return (
        <div className={styles.stepProof} style={stepProofStyle}>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Aave position opened (collateral &gt; 0)</span>
            <span
              className={`${styles.proofRight} ${totalCollateralOk ? styles.statusOk : styles.statusWait}`}
              style={{ ...proofRightStyle, ...(totalCollateralOk ? okColor : waitColor) }}
            >
              {toStatus(totalCollateralOk)}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>totalCollateralBase</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>{totalCollateralHuman}</span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Latest WETH supply tx</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
              {wethSupply ? (
                <a className={styles.link} href={`${BASESCAN}/tx/${wethSupply.txHash}`} target="_blank" rel="noreferrer">
                  {shortHex(wethSupply.txHash, 10, 8)}
                </a>
              ) : (
                "n/a"
              )}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>WETH supplied</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
              {wethSupply && wethMeta ? formatUnits(wethSupply.amount, wethMeta.decimals) : "n/a"}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Latest cbBTC supply tx</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
              {cbbtcSupply ? (
                <a className={styles.link} href={`${BASESCAN}/tx/${cbbtcSupply.txHash}`} target="_blank" rel="noreferrer">
                  {shortHex(cbbtcSupply.txHash, 10, 8)}
                </a>
              ) : (
                "n/a"
              )}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>cbBTC supplied</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
              {cbbtcSupply && cbbtcMeta ? formatUnits(cbbtcSupply.amount, cbbtcMeta.decimals) : "n/a"}
            </span>
          </div>
        </div>
      );
    }

    if (stepId === "borrowpay") {
      const last = proof.lastBorrowAndPay;
      const payeeOk = Boolean(last && last.payee.toLowerCase() === payee.toLowerCase());
      const tx = last?.txHash;
      const borrowedHuman = last ? formatUnits(last.borrowAmount, proof.usdc.decimals) : "n/a";
      const payeeBalHuman = formatUnits(proof.usdc.payeeBalance, proof.usdc.decimals);
      const debtHuman = formatUnits(proof.usdc.vaultDebt, proof.usdc.decimals);

      const baselineApplies = Boolean(baselineProof && baselinePayee && baselinePayee.toLowerCase() === payee.toLowerCase());
      const deltaPayee = baselineApplies && baselineProof ? proof.usdc.payeeBalance - baselineProof.usdc.payeeBalance : null;
      const deltaDebt = baselineApplies && baselineProof ? proof.usdc.vaultDebt - baselineProof.usdc.vaultDebt : null;
      const fmtSigned = (v: bigint, decimals: number) => {
        const sign = v < 0n ? "-" : "+";
        const abs = v < 0n ? -v : v;
        return `${sign}${formatUnits(abs, decimals)}`;
      };

      return (
        <div className={styles.stepProof} style={stepProofStyle}>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Payee allowlisted</span>
            <span
              className={`${styles.proofRight} ${proof.vault.payeeAllowed ? styles.statusOk : styles.statusBad}`}
              style={{ ...proofRightStyle, ...(proof.vault.payeeAllowed ? okColor : badColor) }}
            >
              {toStatus(proof.vault.payeeAllowed)}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Borrow token allowlisted</span>
            <span
              className={`${styles.proofRight} ${
                proof.vault.borrowAssetAllowed ? styles.statusOk : styles.statusBad
              }`}
              style={{ ...proofRightStyle, ...(proof.vault.borrowAssetAllowed ? okColor : badColor) }}
            >
              {toStatus(proof.vault.borrowAssetAllowed)}
            </span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Aave USDC debt (variable)</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>{debtHuman}</span>
          </div>
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Borrowed amount (last tx)</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>{borrowedHuman}</span>
          </div>
          {baselineApplies ? (
            <div className={styles.proofLine} style={proofLineStyle}>
              <span className={styles.proofLeft} style={proofLeftStyle}>Δ Vault debt since watch</span>
              <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
                {deltaDebt == null ? "n/a" : fmtSigned(deltaDebt, proof.usdc.decimals)}
              </span>
            </div>
          ) : null}
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Payee USDC balance</span>
            <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>{payeeBalHuman}</span>
          </div>
          {baselineApplies ? (
            <div className={styles.proofLine} style={proofLineStyle}>
              <span className={styles.proofLeft} style={proofLeftStyle}>Δ Payee balance since watch</span>
              <span className={`${styles.proofRight} ${styles.mono}`} style={{ ...proofRightStyle, ...monoStyle }}>
                {deltaPayee == null ? "n/a" : fmtSigned(deltaPayee, proof.usdc.decimals)}
              </span>
            </div>
          ) : null}
          <div className={styles.proofLine} style={proofLineStyle}>
            <span className={styles.proofLeft} style={proofLeftStyle}>Latest BorrowAndPay tx</span>
            <span
              className={`${styles.proofRight} ${payeeOk ? styles.statusOk : styles.statusWait}`}
              style={{ ...proofRightStyle, ...(payeeOk ? okColor : waitColor) }}
            >
              {tx ? (
                <a className={styles.link} href={`${BASESCAN}/tx/${tx}`} target="_blank" rel="noreferrer">
                  {shortHex(tx, 10, 8)}
                </a>
              ) : (
                "n/a"
              )}
            </span>
          </div>
        </div>
      );
    }

    return null;
  }

  const fieldStyle = { display: "grid", gap: 6, marginTop: 10 };
  const labelRowStyle = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 };
  const hintStyle = { fontSize: 11, color: "rgba(255, 255, 255, 0.5)" };
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "rgba(0, 0, 0, 0.2)",
    color: "rgba(255, 255, 255, 0.92)",
    outline: "none"
  };
  const sectionTitleStyle = { marginTop: 14, fontSize: 12, letterSpacing: "0.2px", color: "rgba(255, 255, 255, 0.86)" };
  const logStyle = {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "rgba(0, 0, 0, 0.22)",
    color: "rgba(255, 255, 255, 0.66)",
    fontSize: 13,
    lineHeight: 1.4
  };
  const kvListStyle = { display: "grid", gap: 8, marginTop: 10 };
  const kvRowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "rgba(0, 0, 0, 0.2)"
  };
  const kvKeyStyle = { fontSize: 12, color: "rgba(255, 255, 255, 0.64)" };
  const kvValStyle = { fontSize: 12, color: "rgba(255, 255, 255, 0.88)" };
  const monoFontStyle = {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  };

  return (
    <main
      className="wrap"
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "34px 18px 72px"
      }}
    >
      <div id="css-sentinel" className={styles.cssSentinel} aria-hidden="true" />
      {!cssModulesLoaded ? (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff3cd",
            color: "#111",
            fontSize: 13,
            lineHeight: 1.35
          }}
        >
          Styling is not loading (you are seeing raw HTML). Common fixes:
          <br />
          1) Restart the web dev server: <span style={{ fontFamily: "monospace" }}>yarn web:dev</span>
          <br />
          2) Open <span style={{ fontFamily: "monospace" }}>http://localhost:3000/flow</span> (not a{" "}
          <span style={{ fontFamily: "monospace" }}>file://</span> URL)
          <br />
          3) Disable extensions that block <span style={{ fontFamily: "monospace" }}>/_next/static/*</span>
        </div>
      ) : null}
      <div
        className="top"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 18px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 18,
          background: "rgba(0, 0, 0, 0.2)",
          backdropFilter: "blur(12px)"
        }}
      >
        <div className="brand" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h1>Crypto Treasury Bot</h1>
          <p>Treasury flywheel visual + verifiable onchain proof (Base mainnet, Aave V3)</p>
        </div>
        <div
          className={styles.actions}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap"
          }}
        >
          <Link
            className={styles.link}
            href="/"
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "rgba(255, 255, 255, 0.68)",
              background: "rgba(0, 0, 0, 0.18)"
            }}
          >
            Home
          </Link>
          <Link
            className={styles.link}
            href="/demo"
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "rgba(255, 255, 255, 0.68)",
              background: "rgba(0, 0, 0, 0.18)"
            }}
          >
            One-Button Demo
          </Link>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={running || !validPayee || !validAlloc}
            onClick={() => {
              setCursor(0);
              setRunning(true);
            }}
            style={{
              cursor: "pointer",
              borderRadius: 12,
              padding: "10px 12px",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "linear-gradient(135deg, rgba(53, 194, 255, 0.25), rgba(124, 255, 171, 0.14))",
              color: "rgba(255, 255, 255, 0.95)"
            }}
          >
            Run Visual
          </button>
          <button
            className={styles.btn}
            disabled={
              refreshing ||
              !validVault ||
              !validReceiver ||
              !validPayee ||
              !validUsdc ||
              !validCbbtc ||
              !validWeth
            }
            onClick={() => void refreshOnchainProof()}
            style={{
              cursor: "pointer",
              borderRadius: 12,
              padding: "10px 12px",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "rgba(0, 0, 0, 0.25)",
              color: "rgba(255, 255, 255, 0.9)"
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh Onchain"}
          </button>
          <button
            className={styles.btn}
            disabled={
              watching ||
              refreshing ||
              !validVault ||
              !validReceiver ||
              !validPayee ||
              !validUsdc
            }
            onClick={async () => {
              const p = await refreshOnchainProof();
              setBaselineNonce(p.vault.nonce);
              setBaselineProof(p);
              setBaselinePayee(payee);
              setWatching(true);
            }}
            style={{
              cursor: "pointer",
              borderRadius: 12,
              padding: "10px 12px",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "rgba(0, 0, 0, 0.25)",
              color: "rgba(255, 255, 255, 0.9)"
            }}
          >
            {watching ? "Watching…" : "Watch Next Execution"}
          </button>
          <button
            className={styles.btn}
            disabled={running && cursor === 0}
            onClick={() => {
              setRunning(false);
              setCursor(0);
            }}
            style={{
              cursor: "pointer",
              borderRadius: 12,
              padding: "10px 12px",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "rgba(0, 0, 0, 0.25)",
              color: "rgba(255, 255, 255, 0.9)"
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <section
        className={styles.shell}
        style={{
          marginTop: 16,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          background: "rgba(0, 0, 0, 0.18)",
          backdropFilter: "blur(12px)",
          overflow: "hidden"
        }}
      >
        <div
          className={styles.header}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.12)"
          }}
        >
          <div className={styles.title}>
            <h2>What You’ll Show in the Video</h2>
            <p>
              Use this page as a storyboard and as a proof dashboard. After you run the CRE CLI broadcast, click{" "}
              <span className={styles.mono}>Refresh Onchain</span> to show the Aave position + payee balance changed.
            </p>
          </div>
          <div
            className="pill"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255, 255, 255, 0.12)",
              background: "rgba(0, 0, 0, 0.22)",
              color: "rgba(255, 255, 255, 0.68)",
              fontSize: 12,
              letterSpacing: "0.2px"
            }}
          >
            Domains: <span className="mono">AI</span> + <span className="mono">CRE</span> + <span className="mono">Onchain</span>
          </div>
        </div>

        <div
          className={styles.body}
          style={{
            display: "grid",
            gridTemplateColumns: "1.25fr 0.75fr",
            gap: 16,
            padding: 16
          }}
        >
          <div
            className={styles.flow}
            style={{
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 16,
              background: "rgba(255, 255, 255, 0.04)",
              padding: 14
            }}
          >
            <h3>Flow</h3>
            {renderFlywheel()}
            <div className={styles.stepList} style={{ display: "grid", gap: 10 }}>
              {steps.map((s, idx) => {
                const active = running
                  ? idx === cursor
                  : (() => {
                      if (!proofStatus) return false;
                      const phase = proofStatus.onchainPhase;
                      return idx === Math.min(phase + 1, steps.length - 1) && !proofStatus.okBorrowPay;
                    })();
                const done = running
                  ? idx < cursor
                  : (() => {
                      if (!proofStatus) return false;
                      if (s.id === "plan") return true;
                      if (s.id === "verify") return proofStatus.okVerify;
                      if (s.id === "swap") return proofStatus.okSwap;
                      if (s.id === "supply") return proofStatus.okSupply;
                      if (s.id === "borrowpay") return proofStatus.okBorrowPay;
                      return false;
                    })();
                return (
                  <div
                    key={s.id}
                    className={[
                      styles.step,
                      active ? styles.stepActive : "",
                      done ? styles.stepDone : ""
                    ].join(" ")}
                    style={{
                      position: "relative",
                      border: `1px solid ${
                        active
                          ? "rgba(53, 194, 255, 0.35)"
                          : done
                            ? "rgba(124, 255, 171, 0.24)"
                            : "rgba(255, 255, 255, 0.12)"
                      }`,
                      borderRadius: 14,
                      background: active
                        ? "radial-gradient(700px 220px at 10% 40%, rgba(53, 194, 255, 0.18), transparent 55%), radial-gradient(700px 220px at 75% 40%, rgba(124, 255, 171, 0.10), transparent 55%), rgba(0, 0, 0, 0.18)"
                        : "rgba(0, 0, 0, 0.18)",
                      padding: 12,
                      overflow: "hidden"
                    }}
                  >
                    <div
                      className={styles.stepTop}
                      style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                    >
                      <div className={styles.stepTitle} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255, 255, 255, 0.92)" }}>
                        <span
                          className={styles.badge}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            border: "1px solid rgba(255, 255, 255, 0.14)",
                            color: "rgba(255, 255, 255, 0.75)",
                            fontSize: 11
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span>{s.title}</span>
                      </div>
                      <span className={styles.meta} style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.55)", whiteSpace: "nowrap" }}>
                        {s.domain}
                      </span>
                    </div>
                    <div className={styles.desc} style={{ position: "relative", zIndex: 1, marginTop: 8, fontSize: 13, lineHeight: 1.45, color: "rgba(255, 255, 255, 0.68)" }}>
                      {s.description}
                    </div>
                    {renderStepProof(s.id)}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className={styles.formCard}
            style={{
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 16,
              background: "rgba(255, 255, 255, 0.04)",
              padding: 14
            }}
          >
            <h3>Parameters</h3>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>Payee address</label>
                <span className={styles.hint} style={hintStyle}>{validPayee ? "valid" : "0x…40 hex chars"}</span>
              </div>
              <input className={styles.input} style={inputStyle} value={payee} onChange={(e) => setPayee(e.target.value.trim())} />
            </div>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>Spend (USDC)</label>
                <span className={styles.hint} style={hintStyle}>visual only</span>
              </div>
              <input className={styles.input} style={inputStyle} value={spendUsdc} onChange={(e) => setSpendUsdc(e.target.value)} />
            </div>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>Allocation to ETH (%)</label>
                <span className={styles.hint} style={hintStyle}>0–100</span>
              </div>
              <input className={styles.input} style={inputStyle} value={allocEthPct} onChange={(e) => setAllocEthPct(e.target.value)} />
            </div>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>Allocation to BTC (%)</label>
                <span className={styles.hint} style={hintStyle}>ETH + BTC ≤ 100</span>
              </div>
              <input className={styles.input} style={inputStyle} value={allocBtcPct} onChange={(e) => setAllocBtcPct(e.target.value)} />
            </div>

            <div className={styles.sectionTitle} style={sectionTitleStyle}>Onchain Config (Base mainnet)</div>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>BorrowVault</label>
                <span className={styles.hint} style={hintStyle}>{validVault ? "valid" : "invalid"}</span>
              </div>
              <input className={styles.input} style={inputStyle} value={vaultAddress} onChange={(e) => setVaultAddress(e.target.value.trim())} />
            </div>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>Receiver</label>
                <span className={styles.hint} style={hintStyle}>{validReceiver ? "valid" : "invalid"}</span>
              </div>
              <input
                className={styles.input}
                style={inputStyle}
                value={receiverAddress}
                onChange={(e) => setReceiverAddress(e.target.value.trim())}
              />
            </div>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>USDC</label>
                <span className={styles.hint} style={hintStyle}>{validUsdc ? "valid" : "invalid"}</span>
              </div>
              <input className={styles.input} style={inputStyle} value={usdcAddress} onChange={(e) => setUsdcAddress(e.target.value.trim())} />
            </div>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>cbBTC (collateral)</label>
                <span className={styles.hint} style={hintStyle}>{validCbbtc ? "valid" : "invalid"}</span>
              </div>
              <input
                className={styles.input}
                style={inputStyle}
                value={cbbtcAddress}
                onChange={(e) => setCbbtcAddress(e.target.value.trim())}
              />
            </div>

            <div className={styles.field} style={fieldStyle}>
              <div className={styles.labelRow} style={labelRowStyle}>
                <label>WETH (collateral)</label>
                <span className={styles.hint} style={hintStyle}>{validWeth ? "valid" : "invalid"}</span>
              </div>
              <input className={styles.input} style={inputStyle} value={wethAddress} onChange={(e) => setWethAddress(e.target.value.trim())} />
            </div>

            {proofError ? (
              <div className={styles.log} style={logStyle}>
                <span className={styles.statusBad}>Error:</span> {proofError}
              </div>
            ) : null}

            {proof ? (
              <>
                <div className={styles.sectionTitle} style={sectionTitleStyle}>Latest Proof</div>
                <div className={styles.kvList} style={kvListStyle}>
                  <div className={styles.kvRow} style={kvRowStyle}>
                    <span className={styles.kvKey} style={kvKeyStyle}>Vault nonce</span>
                    <span className={`${styles.kvVal} ${styles.mono}`} style={{ ...kvValStyle, ...monoFontStyle }}>{proof.vault.nonce.toString()}</span>
                  </div>
                  <div className={styles.kvRow} style={kvRowStyle}>
                    <span className={styles.kvKey} style={kvKeyStyle}>Health factor</span>
                    <span className={`${styles.kvVal} ${styles.mono}`} style={{ ...kvValStyle, ...monoFontStyle }}>
                      {formatUnits(proof.aave.userAccountData.healthFactor, 18)}
                    </span>
                  </div>
                  <div className={styles.kvRow} style={kvRowStyle}>
                    <span className={styles.kvKey} style={kvKeyStyle}>Aave debt (USDC variable)</span>
                    <span className={`${styles.kvVal} ${styles.mono}`} style={{ ...kvValStyle, ...monoFontStyle }}>
                      {formatUnits(proof.usdc.vaultDebt, proof.usdc.decimals)} {proof.usdc.symbol}
                    </span>
                  </div>
                  <div className={styles.kvRow} style={kvRowStyle}>
                    <span className={styles.kvKey} style={kvKeyStyle}>Payee balance (USDC)</span>
                    <span className={`${styles.kvVal} ${styles.mono}`} style={{ ...kvValStyle, ...monoFontStyle }}>
                      {formatUnits(proof.usdc.payeeBalance, proof.usdc.decimals)} {proof.usdc.symbol}
                    </span>
                  </div>
                  <div className={styles.kvRow} style={kvRowStyle}>
                    <span className={styles.kvKey} style={kvKeyStyle}>Latest borrow tx</span>
                    <span className={`${styles.kvVal} ${styles.mono}`} style={{ ...kvValStyle, ...monoFontStyle }}>
                      {proof.lastBorrowAndPay ? (
                        <a
                          className={styles.link}
                          href={`${BASESCAN}/tx/${proof.lastBorrowAndPay.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortHex(proof.lastBorrowAndPay.txHash, 10, 8)}
                        </a>
                      ) : (
                        "n/a"
                      )}
                    </span>
                  </div>
                  <div className={styles.kvRow} style={kvRowStyle}>
                    <span className={styles.kvKey} style={kvKeyStyle}>Latest collateral supply tx</span>
                    <span className={`${styles.kvVal} ${styles.mono}`} style={{ ...kvValStyle, ...monoFontStyle }}>
                      {proof.supplies.length ? (
                        <a
                          className={styles.link}
                          href={`${BASESCAN}/tx/${proof.supplies[proof.supplies.length - 1].txHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortHex(proof.supplies[proof.supplies.length - 1].txHash, 10, 8)}
                        </a>
                      ) : (
                        "n/a"
                      )}
                    </span>
                  </div>
                </div>
                <div className={styles.log} style={logStyle}>
                  Tip: if you just ran the CLI, hit <span className={styles.mono}>Refresh Onchain</span> a couple times if
                  the public RPC is slow.
                </div>
              </>
            ) : (
              <div className={styles.log} style={logStyle}>
                Click <span className={styles.mono}>Refresh Onchain</span> to pull live Base mainnet state for this vault.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
