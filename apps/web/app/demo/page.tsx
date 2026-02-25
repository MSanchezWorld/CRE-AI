"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, isAddress, parseUnits } from "viem";
const BASESCAN = "https://basescan.org";

// Demo defaults (Base mainnet deployments in this repo).
const DEFAULT_VAULT = "0xf154BBca60E61B569712959Cc5D5435e27508BE2";
const DEFAULT_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_AGENT_WALLET = "0x7C00B7060Fe24F6A4E32F56ade0b91675B9D81C9";
const DEFAULT_PAYEE = "0x42444551e2b5FEb7A7c2eE4dA38993381B08Bc6d";
const DEFAULT_WETH = "0x4200000000000000000000000000000000000006";
const DEFAULT_CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const NON_ALLOWLISTED_PAYEE_PRESET = "0x000000000000000000000000000000000000dEaD";
const PROOF_CACHE_KEY_VERSION = "v2";
const CRE_GAS_LIMIT = "1400000";
const PROOF_FETCH_TIMEOUT_MS = 20_000;

type Proof = {
  updatedAtMs: number;
  vault: {
    address: string;
    owner: string;
    executor?: string;
    paused: boolean;
    nonce: bigint;
    payeeAllowed: boolean;
    borrowTokenAllowed: boolean;
  };
  vaultPolicy?: {
    minHealthFactor: bigint;
    cooldownSeconds: bigint;
    maxBorrowPerTx: bigint;
    maxBorrowPerDay: bigint;
    dailyBorrowed: bigint;
    lastExecutionAt: bigint;
  };
  receiver: { address: string; forwarder?: string };
  oracle: {
    address: string;
    baseCurrencyUnit: bigint;
    baseDecimals: number;
  };
  aave: {
    pool: string;
    userAccountData: {
      totalCollateralBase: bigint;
      totalDebtBase: bigint;
      healthFactor: bigint;
    };
  };
  usdc: {
    address: string;
    symbol: string;
    decimals: number;
    payeeBalance: bigint;
    vaultDebt: bigint;
    priceBase: bigint;
    payeeValueBase: bigint;
    vaultDebtValueBase: bigint;
    vaultWalletValueBase: bigint;
    ownerWalletValueBase: bigint;
  };
  collaterals: Array<{
    address: string;
    symbol: string;
    decimals: number;
    aTokenAddress: string;
    aTokenBalance: bigint;
    priceBase: bigint;
    valueBase: bigint;
  }>;
  wallet: {
    vault: {
      usdc: bigint;
      weth: bigint;
      cbbtc: bigint;
    };
    owner: {
      usdc: bigint;
      weth: bigint;
      cbbtc: bigint;
    };
    payee: {
      usdc: bigint;
      weth: bigint;
      cbbtc: bigint;
    };
  };
  walletValues?: {
    owner: { usdcValueBase: bigint; wethValueBase: bigint; cbbtcValueBase: bigint; totalValueBase: bigint };
    vault: { usdcValueBase: bigint; wethValueBase: bigint; cbbtcValueBase: bigint; totalValueBase: bigint };
    payee: { usdcValueBase: bigint; wethValueBase: bigint; cbbtcValueBase: bigint; totalValueBase: bigint };
  };
  lastBorrowAndPay?: {
    txHash: string;
    blockNumber: bigint;
    nonce: bigint;
    borrowAmount: bigint;
    payee: string;
  };
  lastReceiverReport?: {
    txHash: string;
    blockNumber: bigint;
    planNonce: bigint;
    borrowAmount: bigint;
    payee: string;
  };
};

// Prevent runtime crashes when something (our code or a library) calls JSON.stringify on
// objects containing BigInt values. This is safe in a demo app and keeps Next dev overlay
// from blowing up mid-run.
if (typeof BigInt !== "undefined" && typeof (BigInt.prototype as any).toJSON !== "function") {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

function shortHex(hex?: string, left = 6, right = 4) {
  if (!hex) return "";
  if (hex.length <= left + right) return hex;
  return `${hex.slice(0, left)}...${hex.slice(-right)}`;
}

function parseUsdcHumanToUnits(v: string): string | null {
  // Accept both "." and "," decimals (locale-friendly).
  const s = v.trim().replaceAll(",", ".");
  // Keep it strict to avoid accidental "1e6" style inputs.
  if (!/^[0-9]+(\.[0-9]{0,6})?$/.test(s)) return null;
  try {
    const units = parseUnits(s as `${number}`, 6);
    if (units <= 0n) return "0";
    return units.toString();
  } catch {
    return null;
  }
}

function formatUsdBase(v: bigint, baseDecimals = 8) {
  const s = formatUnits(v, Number(baseDecimals));
  const [i, f = ""] = s.split(".");
  return `${i}.${(f + "00").slice(0, 2)}`;
}

function baseDecimalsFromUnit(unit: bigint): number {
  const s = unit.toString();
  return Math.max(0, s.length - 1);
}

function formatToken(v: bigint, decimals: number, maxFrac = 6) {
  const s = formatUnits(v, Number(decimals));
  const [i, fRaw = ""] = s.split(".");
  const f = fRaw.slice(0, maxFrac).replace(/0+$/, "");
  return f.length ? `${i}.${f}` : i;
}

function toBigIntOrZero(v: any): bigint {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return 0n;
      return BigInt(Math.trunc(v));
    }
    if (typeof v === "string") {
      const s = v.trim();
      if (/^-?\d+$/.test(s)) return BigInt(s);
    }
  } catch {
    // ignore
  }
  return 0n;
}

function valueBaseFromRaw(rawAmount: any, priceBase: any, tokenDecimals: any): bigint {
  const amount = toBigIntOrZero(rawAmount);
  const price = toBigIntOrZero(priceBase);
  const dec = toBigIntOrZero(tokenDecimals);
  if (dec < 0n) return 0n;
  const scale = 10n ** dec;
  if (scale === 0n) return 0n;
  return (amount * price) / scale;
}

function formatUsdOrDash(valueBase: bigint, baseDecimals: number, amountRaw?: bigint) {
  // If we have a non-zero token balance but cannot compute a USD value (usually a price/oracle issue),
  // show a dash instead of misleading "$0.00".
  if (amountRaw != null && amountRaw > 0n && valueBase === 0n) return "—";
  return formatUsdBase(valueBase, baseDecimals);
}

function reviveBigInts(v: any): any {
  if (Array.isArray(v)) return v.map(reviveBigInts);
  if (v && typeof v === "object") {
    const out: any = {};
    for (const [k, val] of Object.entries(v)) out[k] = reviveBigInts(val);
    return out;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (/^-?\d+$/.test(s)) return BigInt(s);
  }
  return v;
}

function stringifyBigInts(v: any): string {
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
}

function extractRunnerTxHash(run: any, label: string): string | null {
  if (!run) return null;
  const out = `${String(run.stdout || "")}\n${String(run.stderr || "")}`;
  const re = new RegExp(`\\\\[${label}\\\\]\\\\s*tx:\\\\s*(0x[0-9a-fA-F]{64})`);
  const m = out.match(re);
  return m?.[1] ?? null;
}

function getATokenBalanceFromProof(p: any, assetAddr: string): bigint | null {
  const cols = p?.collaterals;
  if (!Array.isArray(cols)) return null;
  const needle = assetAddr.toLowerCase();
  for (const c of cols) {
    if (String((c as any)?.address || "").toLowerCase() === needle) {
      return toBigIntOrZero((c as any)?.aTokenBalance);
    }
  }
  // If the token isn't present in the collaterals list, treat as 0 rather than "unknown".
  return 0n;
}

export default function DemoPage() {
  const [payee, setPayee] = useState(DEFAULT_PAYEE);
  const [amountUsdc, setAmountUsdc] = useState("1.00");
  const [depositUsdc, setDepositUsdc] = useState("10.00");
  const [depositMode, setDepositMode] = useState<"eth_btc" | "usdc">("eth_btc");
  const [presetId, setPresetId] = useState<"happy" | "non_allowlisted" | "borrow_too_much" | "simulate_only">("happy");
  const [broadcast, setBroadcast] = useState(true);
  const [copied, setCopied] = useState<null | "agent" | "debug" | "error">(null);
  const [confirmRunOpen, setConfirmRunOpen] = useState(false);

  const [running, setRunning] = useState(false);
  const [runStartedAtMs, setRunStartedAtMs] = useState<number | null>(null);
  const [runNowMs, setRunNowMs] = useState<number>(Date.now());
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(0); // 0 Agent, 1 Deposit, 2 CRE, 3 Onchain, 4 Payee
  const [error, setError] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [splitDone, setSplitDone] = useState(false);
  const [payLanded, setPayLanded] = useState(false);

  const [plan, setPlan] = useState<any | null>(null);
  const [agentReqBody, setAgentReqBody] = useState<any | null>(null);
  const [creTriggerBody, setCreTriggerBody] = useState<any | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [baseline, setBaseline] = useState<Proof | null>(null);
  const [creRun, setCreRun] = useState<any | null>(null);
  const [depositRun, setDepositRun] = useState<any | null>(null);
  const [resetRun, setResetRun] = useState<any | null>(null);
  const [swapRun, setSwapRun] = useState<any | null>(null);
  const [finished, setFinished] = useState(false);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const agentAnchorRef = useRef<HTMLDivElement | null>(null);
  const treasuryInAnchorRef = useRef<HTMLDivElement | null>(null);
  const treasuryCollateralAnchorRef = useRef<HTMLDivElement | null>(null);
  const treasuryDebtAnchorRef = useRef<HTMLDivElement | null>(null);
  const payeeAnchorRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const [anchors, setAnchors] = useState<{
    agent: { x: number; y: number };
    treasuryIn: { x: number; y: number };
    collateral: { x: number; y: number };
    debt: { x: number; y: number };
    payee: { x: number; y: number };
  } | null>(null);

  const amountUnits = useMemo(() => parseUsdcHumanToUnits(amountUsdc), [amountUsdc]);
  const depositUnits = useMemo(() => parseUsdcHumanToUnits(depositUsdc), [depositUsdc]);
  const validPayee = isAddress(payee);
  const isSwapDeposit = depositMode === "eth_btc";
  const canRun =
    validPayee && amountUnits != null && amountUnits !== "0" && depositUnits != null && depositUnits !== "0";
  const runDisabledReason = !validPayee
    ? "Enter a valid payee address"
    : amountUnits == null
      ? "Enter a valid borrow amount (USDC)"
      : amountUnits === "0"
        ? "Borrow amount must be > 0"
        : depositUnits == null
          ? "Enter a valid deposit amount (USDC)"
          : depositUnits === "0"
            ? "Deposit amount must be > 0"
            : "";
  // Keep the Run button clickable even when inputs are invalid so the user gets
  // immediate feedback instead of a "dead" UI.
  const runDisabled = running;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setRunNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!error) return;
    // Make failures obvious: scroll the error box into view when a run stops.
    const t = setTimeout(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [error]);

  async function refreshProof() {
    const payeeAddr = payee.trim();
    if (!isAddress(payeeAddr)) throw new Error("Invalid payee address");

    setProofLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROOF_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/proof?payee=${encodeURIComponent(payeeAddr)}`, {
        cache: "no-store",
        signal: controller.signal
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load proof");
      const p = reviveBigInts(json.proof) as Proof;
      setProof(p);
      // Don't clear a run error just because the proof refreshed (the refresh is often triggered
      // by `running` flipping false). Only clear proof-loading errors.
      setError((prev) => {
        if (!prev) return prev;
        if (prev.startsWith("Failed to load onchain proof:")) return null;
        if (prev.startsWith("Failed to load proof:")) return null;
        return prev;
      });

      try {
        localStorage.setItem(`ctb.demo.proof.${PROOF_CACHE_KEY_VERSION}.${payeeAddr.toLowerCase()}`, stringifyBigInts(p));
      } catch {
        // Ignore localStorage failures (private mode, quota, etc).
      }
      return p;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Onchain proof request timed out after ${Math.round(PROOF_FETCH_TIMEOUT_MS / 1000)}s`);
      }
      throw e;
    } finally {
      clearTimeout(timeout);
      setProofLoading(false);
    }
  }

  useEffect(() => {
    // Best-effort cached payee+proof for demo stability (so a refresh doesn't blank the screen).
    let initialPayee = DEFAULT_PAYEE;
    try {
      const savedPayee = (localStorage.getItem("ctb.demo.payee") || "").trim();
      if (savedPayee && isAddress(savedPayee)) {
        initialPayee = savedPayee;
        setPayee(savedPayee);
      }
    } catch {
      // Ignore localStorage failures.
    }

    try {
      const savedDeposit = (localStorage.getItem("ctb.demo.depositUsdc") || "").trim();
      if (savedDeposit && parseUsdcHumanToUnits(savedDeposit) != null) setDepositUsdc(savedDeposit);
    } catch {
      // Ignore localStorage failures.
    }

    try {
      const savedBorrow = (localStorage.getItem("ctb.demo.borrowUsdc") || "").trim();
      if (savedBorrow && parseUsdcHumanToUnits(savedBorrow) != null) setAmountUsdc(savedBorrow);
    } catch {
      // Ignore localStorage failures.
    }

    try {
      const savedMode = (localStorage.getItem("ctb.demo.depositMode") || "").trim().toLowerCase();
      if (savedMode === "usdc" || savedMode === "eth_btc") setDepositMode(savedMode);
    } catch {
      // Ignore localStorage failures.
    }

    try {
      const cached = localStorage.getItem(`ctb.demo.proof.${PROOF_CACHE_KEY_VERSION}.${initialPayee.toLowerCase()}`);
      if (cached) setProof(reviveBigInts(JSON.parse(cached)) as Proof);
    } catch {
      // Ignore cache parse issues.
    }
  }, []);

  useEffect(() => {
    const payeeAddr = payee.trim();
    if (!isAddress(payeeAddr)) return;

    try {
      localStorage.setItem("ctb.demo.payee", payeeAddr);
    } catch {
      // Ignore localStorage failures.
    }

    // Debounced refresh so typing doesn't spam.
    if (running) return;
    const t = setTimeout(() => {
      void refreshProof().catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed to load onchain proof: ${msg}`);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [payee, running]);

  useEffect(() => {
    try {
      localStorage.setItem("ctb.demo.depositUsdc", depositUsdc.trim());
    } catch {
      // Ignore localStorage failures.
    }
  }, [depositUsdc]);

  useEffect(() => {
    try {
      localStorage.setItem("ctb.demo.borrowUsdc", amountUsdc.trim());
    } catch {
      // Ignore localStorage failures.
    }
  }, [amountUsdc]);

  useEffect(() => {
    try {
      localStorage.setItem("ctb.demo.depositMode", depositMode);
    } catch {
      // Ignore localStorage failures.
    }
  }, [depositMode]);

  useEffect(() => {
    try {
      localStorage.setItem("ctb.demo.broadcast", broadcast ? "true" : "false");
    } catch {
      // Ignore localStorage failures.
    }
  }, [broadcast]);

  useEffect(() => {
    try {
      const saved = (localStorage.getItem("ctb.demo.broadcast") || "").trim().toLowerCase();
      if (saved === "true") setBroadcast(true);
      if (saved === "false") setBroadcast(false);
    } catch {
      // Ignore localStorage failures.
    }
  }, []);

  function applyPreset(id: "happy" | "non_allowlisted" | "borrow_too_much" | "simulate_only") {
    setPresetId(id);
    if (id === "happy") {
      setPayee(DEFAULT_PAYEE);
      setDepositUsdc("10.00");
      setDepositMode("eth_btc");
      setAmountUsdc("1.00");
      setBroadcast(true);
      return;
    }
    if (id === "non_allowlisted") {
      setPayee(NON_ALLOWLISTED_PAYEE_PRESET);
      setDepositUsdc("10.00");
      // Avoid swaps in failure presets; fewer moving parts.
      setDepositMode("usdc");
      setAmountUsdc("1.00");
      setBroadcast(true);
      return;
    }
    if (id === "borrow_too_much") {
      setPayee(DEFAULT_PAYEE);
      setDepositUsdc("10.00");
      setDepositMode("usdc");
      // Default vault limit is 100 USDC/tx; 150 should fail the onchain guard.
      setAmountUsdc("150.00");
      setBroadcast(true);
      return;
    }
    // simulate_only
    setPayee(DEFAULT_PAYEE);
    setDepositUsdc("10.00");
    setDepositMode("usdc");
    setAmountUsdc("1.00");
    setBroadcast(false);
  }

  useEffect(() => {
    if (!running) return;
    // Phase 1: show USDC moving in, then land as Aave collateral.
    if (phase === 1) {
      setSplitDone(false);
      const t = setTimeout(() => setSplitDone(true), 900);
      return () => clearTimeout(t);
    }
    // Phase 3: borrowed USDC lands in payee.
    if (phase === 3) {
      const t = setTimeout(() => setPayLanded(true), 850);
      return () => clearTimeout(t);
    }
  }, [running, phase]);

  useEffect(() => {
    // Compute absolute anchor positions for smooth token movement.
    const compute = () => {
      const board = boardRef.current;
      if (!board) return;
      const boardRect = board.getBoundingClientRect();

      const get = (el: HTMLElement | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - boardRect.left, y: r.top + r.height / 2 - boardRect.top };
      };

      const agent = get(agentAnchorRef.current);
      const treasuryIn = get(treasuryInAnchorRef.current);
      const collateral = get(treasuryCollateralAnchorRef.current);
      const debt = get(treasuryDebtAnchorRef.current);
      const payee = get(payeeAnchorRef.current);
      if (!agent || !treasuryIn || !collateral || !debt || !payee) return;
      setAnchors({ agent, treasuryIn, collateral, debt, payee });
    };

    const t = setTimeout(compute, 0);
    window.addEventListener("resize", compute);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", compute);
    };
  }, [payee, proof, baseline, running, splitDone, finished]);

  async function runDemo() {
    if (running) return;
    const payeeAddr = payee.trim();
    if (!isAddress(payeeAddr)) {
      setError("Enter a valid payee address");
      return;
    }
    if (!amountUnits || amountUnits === "0") {
      setError("Enter a valid borrow amount (USDC)");
      return;
    }
    if (!depositUnits || depositUnits === "0") {
      setError("Enter a valid deposit amount (USDC)");
      return;
    }
    const runDepositMode: "eth_btc" | "usdc" = depositMode;

    setConfirmRunOpen(false);

    setRunStartedAtMs(Date.now());
    setRunning(true);
    setError(null);
    setPlan(null);
    setAgentReqBody(null);
    setCreTriggerBody(null);
    setCreRun(null);
    setDepositRun(null);
    setResetRun(null);
    setSwapRun(null);
    setFinished(false);
    setPhase(0);
    setSplitDone(false);
    setPayLanded(false);
    try {
      const baselineProof = await refreshProof();
      setBaseline(baselineProof);

      // 1) Agent plan (HTTP integration used by the CRE workflow)
      const reqBody = {
        spendRequest: {
          borrowAsset: DEFAULT_USDC,
          borrowAmount: amountUnits!,
          payee: payeeAddr
        },
        treasuryPlan: {
          depositUsdc: depositUnits,
          depositHuman: depositUsdc,
          depositMode
        },
        vault: {
          address: DEFAULT_VAULT,
          currentNonce: baselineProof.vault.nonce.toString()
        }
      };
      setAgentReqBody(reqBody);

      const agentRes = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reqBody)
      });
      const agentJson = await agentRes.json();
      if (!agentRes.ok) throw new Error(agentJson?.error || "Agent request failed");
      setPlan(agentJson);
      setPhase(1);

      // 2) Deposit + supply. Optionally swap USDC -> WETH/cbBTC 50/50 before supplying.
      const depRes = await fetch("/api/demo/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmMainnet: true,
          depositMode: runDepositMode,
          depositAmount: depositUnits!,
          ...(runDepositMode === "eth_btc" ? { allocEthBps: 5000, allocBtcBps: 5000 } : {})
        })
      });
      const depJson = await depRes.json();
      // Always keep the runner output for debugging (even on failure).
      setDepositRun(depJson);
      if (!depRes.ok || !depJson?.ok) {
        const summary = depJson?.summary || depJson?.error || "Deposit failed";
        throw new Error(`Deposit failed: ${summary}`);
      }

      // Poll proof until we observe the expected Aave collateral changed for this deposit mode.
      {
        const start = Date.now();
        const timeoutMs = 90_000;
        for (;;) {
          const p = await refreshProof();
          const depositObserved =
            runDepositMode === "usdc"
              ? (() => {
                  const beforeAUsdc = getATokenBalanceFromProof(baselineProof, DEFAULT_USDC);
                  const afterAUsdc = getATokenBalanceFromProof(p, DEFAULT_USDC);
                  if (beforeAUsdc != null && afterAUsdc != null) return afterAUsdc > beforeAUsdc;
                  const before = toBigIntOrZero(baselineProof?.aave?.userAccountData?.totalCollateralBase);
                  const after = toBigIntOrZero(p?.aave?.userAccountData?.totalCollateralBase);
                  return after > before;
                })()
              : (() => {
                  // eth_btc mode must show BOTH aWETH and acbBTC increasing (50/50 collateral proof).
                  const beforeAWeth = getATokenBalanceFromProof(baselineProof, DEFAULT_WETH);
                  const afterAWeth = getATokenBalanceFromProof(p, DEFAULT_WETH);
                  const beforeABtc = getATokenBalanceFromProof(baselineProof, DEFAULT_CBBTC);
                  const afterABtc = getATokenBalanceFromProof(p, DEFAULT_CBBTC);
                  if (beforeAWeth == null || afterAWeth == null || beforeABtc == null || afterABtc == null) return false;
                  return afterAWeth > beforeAWeth && afterABtc > beforeABtc;
                })();
          if (depositObserved) break;
          if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for Aave collateral to update after deposit");
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      setPhase(2);

      // 3) CRE broadcast (runs the same `cre workflow simulate --broadcast` you would run in a terminal)
      const triggerBody = { payee: payeeAddr, borrowAmount: amountUnits, depositAmount: depositUnits, broadcast };
      setCreTriggerBody(triggerBody);
      const creRes = await fetch("/api/demo/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(triggerBody)
      });
      const creJson = await creRes.json();
      // Always keep the CRE output for debugging (even on failure).
      setCreRun(creJson);
      if (!creRes.ok) {
        const tail = (creJson?.stderr || creJson?.stdout || "").toString().slice(-800);
        const summary = creJson?.error || "CRE run failed";
        throw new Error(`${summary}${tail ? ` (output tail: ${tail.split("\n")[0]})` : ""}`);
      }
      setPhase(3);

      // 4) Onchain confirmation (poll until vault nonce increments)
      const start = Date.now();
      const timeoutMs = 120_000;
      for (;;) {
        const p = await refreshProof();
        if (p.vault.nonce > baselineProof.vault.nonce) break;
        if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for onchain confirmation");
        await new Promise((r) => setTimeout(r, 2000));
      }

      setPhase(4);

      // 5) Payee confirmation (poll until destination balance increases)
      {
        const start2 = Date.now();
        const timeoutMs2 = 60_000;
        for (;;) {
          const p = await refreshProof();
          if (p.usdc.payeeBalance > baselineProof.usdc.payeeBalance) break;
          if (Date.now() - start2 > timeoutMs2) throw new Error("Timed out waiting for payee balance to update");
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      setFinished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function toggleRunConfirm() {
    if (running) return;
    if (!canRun) {
      setConfirmRunOpen(false);
      setError(runDisabledReason || "Enter valid inputs");
      return;
    }
    setError(null);
    setConfirmRunOpen((v) => !v);
  }

  const [resetting, setResetting] = useState(false);
  const [swapping, setSwapping] = useState(false);

  async function swapCollateralToUsdc() {
    if (swapping || resetting || running) return;

    const ok = window.confirm(
      "Swap any WETH/cbBTC in the agent wallet back to USDC on Base mainnet?\n\nThis will send real swap transactions using your local private key + spend gas."
    );
    if (!ok) return;

    setSwapping(true);
    setError(null);
    setSwapRun(null);
    try {
      const swapRes = await fetch("/api/demo/swap-to-usdc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmMainnet: true })
      });
      const swapJson = await swapRes.json();
      // Always keep runner output for debugging (even on failure).
      setSwapRun(swapJson);
      if (!swapRes.ok || !swapJson?.ok) {
        const summary = swapJson?.summary || swapJson?.error || "Swap failed";
        throw new Error(`Swap failed: ${summary}`);
      }
      await refreshProof();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwapping(false);
    }
  }

  async function resetToUsdc() {
    // Local/dev helper: unwinds Aave position and converts collateral back to USDC so the demo can be re-run.
    if (resetting || running) return;

    const ok = window.confirm(
      "Repay + Export USDC on Base mainnet?\n\nThis will send real transactions to:\n1) repay USDC debt\n2) withdraw all Aave collateral to the agent wallet\n3) swap withdrawn WETH/cbBTC back to USDC\n4) leave USDC in the agent wallet\n\nOnly do this if you understand it uses your local private key + spends gas."
    );
    if (!ok) return;

    setResetting(true);
    setError(null);
    setResetRun(null);
    setSwapRun(null);
    try {
      const withdrawTo = (proof as any)?.vault?.owner ?? DEFAULT_AGENT_WALLET;
      const res = await fetch("/api/demo/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmMainnet: true, withdrawTo })
      });
      const json = await res.json();
      // Always keep runner output for debugging (even on failure).
      setResetRun(json);
      if (!res.ok || !json?.ok) {
        const summary = json?.summary || json?.error || "Reset failed";
        throw new Error(`Reset failed: ${summary}`);
      }

      // Run an immediate wallet-level unwind step so any non-USDC collateral
      // already in the agent wallet gets swapped back to USDC too.
      const sweepRes = await fetch("/api/demo/swap-to-usdc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmMainnet: true })
      });
      const sweepJson = await sweepRes.json();
      setSwapRun(sweepJson);
      if (!sweepRes.ok || !sweepJson?.ok) {
        const summary = sweepJson?.summary || sweepJson?.error || "Wallet sweep failed";
        throw new Error(`Reset succeeded, but final wallet sweep failed: ${summary}`);
      }

      await refreshProof();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }

  const deltaPayee = baseline && proof ? proof.usdc.payeeBalance - baseline.usdc.payeeBalance : null;
  const deltaDebt = baseline && proof ? proof.usdc.vaultDebt - baseline.usdc.vaultDebt : null;
  const fmtSigned = (v: bigint, decimals: number) => {
    const sign = v < 0n ? "-" : "+";
    const abs = v < 0n ? -v : v;
    return `${sign}${formatUnits(abs, decimals)}`;
  };

  async function copy(text: string, which: "agent" | "debug" | "error") {
    const value = text.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for older browsers / stricter permissions.
      // Some modern browsers disable `document.execCommand`, so guard it to avoid runtime crashes.
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        if (typeof document.execCommand === "function") document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        // No-op: worst case we just don't copy.
      }
    }
    setCopied(which);
    window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1100);
  }

  function buildDebugClipboardText() {
    const payload = {
      ts: new Date().toISOString(),
      page: "/demo",
      inputs: {
        payee,
        depositUsdc,
        depositMode,
        borrowUsdc: amountUsdc,
        broadcast,
        presetId,
        depositUnits,
        borrowUnits: amountUnits
      },
      state: {
        running,
        phase,
        finished,
        error
      },
      contracts: {
        vault: DEFAULT_VAULT,
        usdc: DEFAULT_USDC,
        weth: DEFAULT_WETH,
        cbbtc: DEFAULT_CBBTC,
        agentWalletDefault: DEFAULT_AGENT_WALLET
      },
      proof: proof
        ? {
            updatedAtMs: proof.updatedAtMs,
            vault: {
              address: proof.vault.address,
              owner: proof.vault.owner,
              executor: (proof as any)?.vault?.executor ?? null,
              nonce: proof.vault.nonce.toString(),
              paused: proof.vault.paused
            },
            vaultPolicy: (proof as any)?.vaultPolicy ?? null,
            receiver: (proof as any)?.receiver ?? null,
            aave: {
              pool: proof.aave.pool,
              userAccountData: {
                totalCollateralBase: proof.aave.userAccountData.totalCollateralBase.toString(),
                totalDebtBase: proof.aave.userAccountData.totalDebtBase.toString(),
                healthFactor: proof.aave.userAccountData.healthFactor.toString()
              }
            },
            wallet: {
              owner: {
                usdc: proof.wallet.owner.usdc.toString(),
                weth: proof.wallet.owner.weth.toString(),
                cbbtc: proof.wallet.owner.cbbtc.toString()
              },
              vault: {
                usdc: proof.wallet.vault.usdc.toString(),
                weth: proof.wallet.vault.weth.toString(),
                cbbtc: proof.wallet.vault.cbbtc.toString()
              },
              payee: {
                usdc: proof.wallet.payee.usdc.toString(),
                weth: proof.wallet.payee.weth.toString(),
                cbbtc: proof.wallet.payee.cbbtc.toString()
              }
            },
            lastBorrowAndPay: proof.lastBorrowAndPay
              ? {
                  txHash: proof.lastBorrowAndPay.txHash,
                  blockNumber: proof.lastBorrowAndPay.blockNumber.toString(),
                  nonce: proof.lastBorrowAndPay.nonce.toString(),
                  borrowAmount: proof.lastBorrowAndPay.borrowAmount.toString(),
                  payee: proof.lastBorrowAndPay.payee
                }
              : null
          }
        : null,
      runs: {
        agentReqBody,
        creTriggerBody,
        depositRun,
        creRun,
        resetRun,
        swapRun
      }
    };

    // Use our BigInt-safe stringify to avoid clipboard copy crashes during demo debugging.
    return stringifyBigInts(payload);
  }

  async function copyDebug() {
    await copy(buildDebugClipboardText(), "debug");
  }

  async function copyError() {
    if (!error) return;
    await copy(error, "error");
  }

  const stepLabel = (() => {
    if (!running && !finished) return "Ready";
    if (error) return "Error";
    if (phase === 0) return "AI agent is proposing a plan";
    if (phase === 1) return isSwapDeposit ? "Onchain: swapping USDC → WETH/cbBTC and supplying to Aave" : "Onchain: supplying USDC collateral to Aave";
    if (phase === 2) return "CRE is verifying + orchestrating borrow-to-pay";
    if (phase === 3) return "Onchain: waiting for transaction confirmation";
    return "Done: payee received USDC";
  })();

  const elapsedLabel = (() => {
    if (!running || runStartedAtMs == null) return "";
    const s = Math.max(0, Math.floor((runNowMs - runStartedAtMs) / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  })();

  const agentOk = !!plan;
  const observedDepositMode = (() => {
    const m = String((depositRun as any)?.depositMode || "").trim().toLowerCase();
    if (m === "usdc" || m === "eth_btc") return m as "usdc" | "eth_btc";
    return depositMode;
  })();
  const depositOk = (() => {
    if (!baseline || !proof) return false;
    if (observedDepositMode === "usdc") {
      const beforeAUsdc = getATokenBalanceFromProof(baseline, DEFAULT_USDC);
      const afterAUsdc = getATokenBalanceFromProof(proof, DEFAULT_USDC);
      if (beforeAUsdc != null && afterAUsdc != null) return afterAUsdc > beforeAUsdc;
      return (
        toBigIntOrZero((proof as any)?.aave?.userAccountData?.totalCollateralBase) >
        toBigIntOrZero((baseline as any)?.aave?.userAccountData?.totalCollateralBase)
      );
    }
    // eth_btc mode must show BOTH aWETH and acbBTC increasing.
    const beforeAWeth = getATokenBalanceFromProof(baseline, DEFAULT_WETH);
    const afterAWeth = getATokenBalanceFromProof(proof, DEFAULT_WETH);
    const beforeABtc = getATokenBalanceFromProof(baseline, DEFAULT_CBBTC);
    const afterABtc = getATokenBalanceFromProof(proof, DEFAULT_CBBTC);
    if (beforeAWeth == null || afterAWeth == null || beforeABtc == null || afterABtc == null) return false;
    return afterAWeth > beforeAWeth && afterABtc > beforeABtc;
  })();
  const creOk = !!creRun?.ok;
  const onchainOk = !!(baseline && proof && proof.vault.nonce > baseline.vault.nonce);
  const payeeOk = !!(baseline && proof && proof.usdc.payeeBalance > baseline.usdc.payeeBalance);

  const depositSupplyTx = useMemo(() => extractRunnerTxHash(depositRun, "supply"), [depositRun]);

  const posNow = useMemo(() => {
    if (!proof || !Array.isArray((proof as any).collaterals)) return null;
    const aUsdc = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === DEFAULT_USDC.toLowerCase());
    const aWeth = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === DEFAULT_WETH.toLowerCase());
    const aCbbtc = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === DEFAULT_CBBTC.toLowerCase());
    return { aUsdc, aWeth, aCbbtc };
  }, [proof]);

  const ownerAssetsNow = useMemo(() => {
    if (!proof) return null;
    const weth = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === DEFAULT_WETH.toLowerCase());
    const cbbtc = proof.collaterals.find((c) => String((c as any)?.address || "").toLowerCase() === DEFAULT_CBBTC.toLowerCase());
    return { weth, cbbtc };
  }, [proof]);

  const wethPriceBase = useMemo(() => toBigIntOrZero((ownerAssetsNow as any)?.weth?.priceBase), [ownerAssetsNow]);
  const cbbtcPriceBase = useMemo(() => toBigIntOrZero((ownerAssetsNow as any)?.cbbtc?.priceBase), [ownerAssetsNow]);

  // Dev/hot-reload hardening: in Next dev, state can survive HMR even when we change shapes.
  // These derived values prevent render-time crashes and keep the demo screen visible.
  const proofBaseCurrencyUnit = toBigIntOrZero((proof as any)?.oracle?.baseCurrencyUnit);
  const proofBaseDecimals = (() => {
    // Most reliable: derive from BASE_CURRENCY_UNIT.
    if (proofBaseCurrencyUnit > 0n) return baseDecimalsFromUnit(proofBaseCurrencyUnit);
    const raw = (proof as any)?.oracle?.baseDecimals;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 36) return Math.trunc(raw);
    if (typeof raw === "string" && /^\d+$/.test(raw)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n <= 36) return Math.trunc(n);
    }
    return 8;
  })();
  const proofUsdcDecimals = (proof as any)?.usdc?.decimals ?? 6;
  const proofUsdcSymbol = (proof as any)?.usdc?.symbol ?? "USDC";
  const proofPayeeUsdc = (proof as any)?.wallet?.payee?.usdc ?? (proof as any)?.usdc?.payeeBalance ?? 0n;
  const proofAgentWalletAddr = String((proof as any)?.vault?.owner ?? DEFAULT_AGENT_WALLET);
  const proofAgentWalletUsdc = (proof as any)?.wallet?.owner?.usdc ?? 0n;
  const proofAgentWalletWeth = (proof as any)?.wallet?.owner?.weth ?? 0n;
  const proofAgentWalletCbbtc = (proof as any)?.wallet?.owner?.cbbtc ?? 0n;
  const proofCollBase = toBigIntOrZero((proof as any)?.aave?.userAccountData?.totalCollateralBase);
  const proofDebtBase = toBigIntOrZero((proof as any)?.aave?.userAccountData?.totalDebtBase);
  const proofHf = toBigIntOrZero((proof as any)?.aave?.userAccountData?.healthFactor);
  const proofDebtValueBase = toBigIntOrZero((proof as any)?.usdc?.vaultDebtValueBase);
  const proofPayeeValueBase = toBigIntOrZero((proof as any)?.usdc?.payeeValueBase);
  const proofUsdcPriceBase = toBigIntOrZero((proof as any)?.usdc?.priceBase);
  const proofVaultWalletUsdc = toBigIntOrZero((proof as any)?.wallet?.vault?.usdc);
  const proofVaultWalletWeth = toBigIntOrZero((proof as any)?.wallet?.vault?.weth);
  const proofVaultWalletCbbtc = toBigIntOrZero((proof as any)?.wallet?.vault?.cbbtc);
  const proofVaultWalletValueBase = toBigIntOrZero((proof as any)?.usdc?.vaultWalletValueBase);
  const proofOwnerUsdcValueBase = toBigIntOrZero((proof as any)?.walletValues?.owner?.usdcValueBase);
  const proofOwnerTotalValueBase = toBigIntOrZero((proof as any)?.walletValues?.owner?.totalValueBase);
  const proofOwnerWethValueBase = toBigIntOrZero((proof as any)?.walletValues?.owner?.wethValueBase);
  const proofOwnerCbbtcValueBase = toBigIntOrZero((proof as any)?.walletValues?.owner?.cbbtcValueBase);
  const proofPayeeTotalValueBase = toBigIntOrZero((proof as any)?.walletValues?.payee?.totalValueBase);

  // If the oracle price is missing in the proof payload (RPC flake / old cached proof),
  // still show a sensible USD estimate for USDC (treat as $1.00 in oracle base units).
  const safeUsdcPriceBase = proofUsdcPriceBase > 0n ? proofUsdcPriceBase : proofBaseCurrencyUnit;

  const computedOwnerUsdcValueBase = proof ? valueBaseFromRaw(proofAgentWalletUsdc, safeUsdcPriceBase, proofUsdcDecimals) : 0n;
  const computedOwnerWethValueBase =
    proof && ownerAssetsNow?.weth ? valueBaseFromRaw(proofAgentWalletWeth, wethPriceBase, ownerAssetsNow.weth.decimals) : 0n;
  const computedOwnerCbbtcValueBase =
    proof && ownerAssetsNow?.cbbtc ? valueBaseFromRaw(proofAgentWalletCbbtc, cbbtcPriceBase, ownerAssetsNow.cbbtc.decimals) : 0n;
  const computedOwnerTotalValueBase = computedOwnerUsdcValueBase + computedOwnerWethValueBase + computedOwnerCbbtcValueBase;
  const computedPayeeUsdcValueBase = proof ? valueBaseFromRaw(proofPayeeUsdc, safeUsdcPriceBase, proofUsdcDecimals) : 0n;
  const computedDebtValueBase = proof ? valueBaseFromRaw((proof as any)?.usdc?.vaultDebt ?? 0n, safeUsdcPriceBase, proofUsdcDecimals) : 0n;

  // Prefer server-computed values when present and non-zero, but fall back to
  // client-side compute if cached/proof values are missing or parsed incorrectly.
  const displayOwnerUsdcValueBase = proofOwnerUsdcValueBase > 0n ? proofOwnerUsdcValueBase : computedOwnerUsdcValueBase;
  const displayOwnerWethValueBase = proofOwnerWethValueBase > 0n ? proofOwnerWethValueBase : computedOwnerWethValueBase;
  const displayOwnerCbbtcValueBase = proofOwnerCbbtcValueBase > 0n ? proofOwnerCbbtcValueBase : computedOwnerCbbtcValueBase;
  const displayOwnerTotalValueBase = proofOwnerTotalValueBase > 0n ? proofOwnerTotalValueBase : computedOwnerTotalValueBase;
  const displayPayeeUsdcValueBase = proofPayeeValueBase > 0n ? proofPayeeValueBase : computedPayeeUsdcValueBase;
  const displayDebtValueBase = proofDebtValueBase > 0n ? proofDebtValueBase : computedDebtValueBase;
  const displayPayeeTotalValueBase = proofPayeeTotalValueBase > 0n ? proofPayeeTotalValueBase : displayPayeeUsdcValueBase;

  const baselineBaseDecimals = (baseline as any)?.oracle?.baseDecimals ?? proofBaseDecimals;
  const baselineUsdcDecimals = (baseline as any)?.usdc?.decimals ?? proofUsdcDecimals;

  const visualActive = running || finished;
  const missing = proofLoading ? "Loading…" : "—";
  const ownerHasAnyAsset =
    proofAgentWalletUsdc > 0n || proofAgentWalletWeth > 0n || proofAgentWalletCbbtc > 0n;

  const traceExpectedNonce = baseline ? baseline.vault.nonce + 1n : null;
  const traceRequestedBorrow = amountUnits && /^[0-9]+$/.test(amountUnits) ? BigInt(amountUnits) : null;
  const tracePlanBorrow = plan?.borrowAmount && /^[0-9]+$/.test(String(plan.borrowAmount)) ? BigInt(String(plan.borrowAmount)) : null;
  const tracePlanPayee = typeof plan?.payee === "string" ? plan.payee : null;
  const tracePlanBorrowAsset = typeof plan?.borrowAsset === "string" ? plan.borrowAsset : null;
  const tracePlanMatchesPayee = tracePlanPayee ? tracePlanPayee.toLowerCase() === payee.trim().toLowerCase() : null;
  const tracePlanMatchesBorrowAsset = tracePlanBorrowAsset ? tracePlanBorrowAsset.toLowerCase() === DEFAULT_USDC.toLowerCase() : null;
  const tracePlanNotEscalated =
    tracePlanBorrow != null && traceRequestedBorrow != null ? tracePlanBorrow <= traceRequestedBorrow : null;
  const traceVaultPausedOk = baseline ? !baseline.vault.paused : null;
  const traceCreChecksOk =
    traceVaultPausedOk != null &&
    tracePlanMatchesPayee != null &&
    tracePlanMatchesBorrowAsset != null &&
    tracePlanNotEscalated != null
      ? traceVaultPausedOk && tracePlanMatchesPayee && tracePlanMatchesBorrowAsset && tracePlanNotEscalated
      : null;
  const failedPhase = !running && !!error ? phase : null;
  const stepTriggerDone = !!creTriggerBody;
  const stepAgentDone = !!plan;
  const stepVerificationDone = traceCreChecksOk === true;
  const stepWriteDone = !!creRun && (creRun?.ok || (!broadcast && !creRun?.error));
  const stepOnchainDone = !broadcast ? true : onchainOk;
  const stepTriggerFail = failedPhase != null && failedPhase >= 2 && !stepTriggerDone;
  const stepAgentFail = failedPhase === 0 && !stepAgentDone;
  const stepVerificationFail = traceCreChecksOk === false || (failedPhase === 2 && !stepVerificationDone);
  const stepWriteFail = !!creRun && !creRun?.ok;
  const stepOnchainFail = broadcast && failedPhase != null && failedPhase >= 3 && !stepOnchainDone;

  const vaultPolicy = (proof as any)?.vaultPolicy as
    | {
        minHealthFactor: bigint;
        cooldownSeconds: bigint;
        maxBorrowPerTx: bigint;
        maxBorrowPerDay: bigint;
        dailyBorrowed: bigint;
        lastExecutionAt: bigint;
      }
    | null
    | undefined;

  const receiverForwarder = String((proof as any)?.receiver?.forwarder || "");

  const creDurationMs =
    creRun && typeof creRun.startedAtMs === "number" && typeof creRun.finishedAtMs === "number"
      ? Math.max(0, creRun.finishedAtMs - creRun.startedAtMs)
      : null;

  const creDidBroadcast = broadcast;
  const receiverTxHash = (proof as any)?.lastReceiverReport?.txHash || null;
  const receiverReportPlanNonce = (proof as any)?.lastReceiverReport?.planNonce as bigint | null | undefined;
  const receiverReportBorrowAmount = (proof as any)?.lastReceiverReport?.borrowAmount as bigint | null | undefined;
  const receiverReportPayee = (proof as any)?.lastReceiverReport?.payee as string | null | undefined;
  const receiverReportNonceOk =
    traceExpectedNonce != null && receiverReportPlanNonce != null ? receiverReportPlanNonce === traceExpectedNonce : null;
  const receiverReportPayeeOk = receiverReportPayee ? receiverReportPayee.toLowerCase() === payee.trim().toLowerCase() : null;
  const receiverReportBorrowOk =
    traceRequestedBorrow != null && receiverReportBorrowAmount != null ? receiverReportBorrowAmount === traceRequestedBorrow : null;

  return (
    <main className="wrap">
      <div className="top demoTop">
        <div className="brand">
          <h1>Crypto Treasury Bot</h1>
          <p>Grow treasury collateral while the AI agent borrows USDC to spend.</p>
          <p className="brandSub">CRE verifies the agent plan before onchain execution.</p>
        </div>
        <div className="topRight">
          <div className="topControls" aria-label="Demo plan controls">
            <div className={`miniField ${!validPayee ? "invalid" : ""}`}>
              <div className="miniLabel">Payee</div>
              <div className="miniRow">
                <input
                  className="miniInput mono"
                  inputMode="text"
                  placeholder={DEFAULT_PAYEE}
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  disabled={running || confirmRunOpen}
                  aria-label="Payee address"
                />
              </div>
            </div>
            <div className={`miniField ${depositUnits == null || depositUnits === "0" ? "invalid" : ""}`}>
              <div className="miniLabel">Deposit</div>
              <div className="miniRow">
                <input
                  className="miniInput"
                  inputMode="decimal"
                  placeholder="20.00"
                  value={depositUsdc}
                  onChange={(e) => setDepositUsdc(e.target.value)}
                  disabled={running || confirmRunOpen}
                  aria-label="Deposit amount (USDC)"
                />
                <span className="miniUnit">USDC</span>
              </div>
            </div>
            <div className="miniField">
              <div className="miniLabel">Deposit As</div>
              <div className="miniRow">
                <select
                  className="miniInput"
                  value={depositMode}
                  onChange={(e) => setDepositMode(e.target.value === "usdc" ? "usdc" : "eth_btc")}
                  disabled={running || confirmRunOpen}
                  aria-label="Deposit mode"
                >
                  <option value="eth_btc">50/50 ETH + BTC</option>
                  <option value="usdc">USDC only</option>
                </select>
              </div>
            </div>
            <div className={`miniField ${amountUnits == null || amountUnits === "0" ? "invalid" : ""}`}>
              <div className="miniLabel">Borrow</div>
              <div className="miniRow">
                <input
                  className="miniInput"
                  inputMode="decimal"
                  placeholder="1.00"
                  value={amountUsdc}
                  onChange={(e) => setAmountUsdc(e.target.value)}
                  disabled={running || confirmRunOpen}
                  aria-label="Borrow and pay amount (USDC)"
                />
                <span className="miniUnit">USDC</span>
              </div>
            </div>
          </div>
          <div className="runStack">
            <div className="presetRow" aria-label="Presets">
              <div className="miniField">
                <div className="miniLabel">Presets</div>
                <div className="miniRow">
                <select
                  className="miniInput"
                  value={presetId}
                  onChange={(e) => applyPreset((e.target.value as any) || "happy")}
                  disabled={running || confirmRunOpen}
                    aria-label="Demo presets"
                  >
                    <option value="happy">Happy path (default)</option>
                    <option value="non_allowlisted">Non-allowlisted payee (should fail)</option>
                    <option value="borrow_too_much">Borrow too much (should fail)</option>
                    <option value="simulate_only">Simulate only (no broadcast)</option>
                  </select>
                </div>
              </div>
              <div className="miniField">
                <div className="miniLabel">CRE</div>
                <div className="miniRow">
                  <label className="toggleRow" title="If off, CRE runs simulation only (no report tx)">
                    <input
                      type="checkbox"
                      checked={broadcast}
                      onChange={(e) => setBroadcast(e.target.checked)}
                      disabled={running || confirmRunOpen}
                    />
                    <span className="toggleText">{broadcast ? "Broadcast" : "Simulate"}</span>
                  </label>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleRunConfirm}
              disabled={runDisabled}
              aria-disabled={running || !canRun}
              className={`primaryBtn ${confirmRunOpen && !running ? "primaryBtnArmed" : ""} ${!canRun && !running ? "primaryBtnPseudoDisabled" : ""}`}
              title={!canRun ? runDisabledReason : "Run borrow-to-spend workflow"}
            >
              {running ? "Running…" : confirmRunOpen ? "Confirm…" : "Run Demo"}
            </button>
            {!running ? (
              <div className="runMeta">
                {canRun ? (
                  <>
                    Deposit <span className="mono">{depositUsdc}</span> USDC{" "}
                    <span className="mono">({depositMode === "eth_btc" ? "50/50 ETH+BTC" : "USDC-only"})</span> · Borrow{" "}
                    <span className="mono">{amountUsdc}</span> USDC · Pay{" "}
                    <span className="mono">{shortHex(payee, 8, 6) || "payee"}</span>
                    {" · "}
                    CRE <span className="mono">{broadcast ? "broadcast" : "simulate"}</span>
                  </>
                ) : (
                  runDisabledReason
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {confirmRunOpen && !running ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmRunOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              padding: "14px 14px",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(10,12,18,0.92)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.55)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>Run real Base mainnet transactions?</div>
              <button type="button" className="copyBtn" onClick={() => setConfirmRunOpen(false)} style={{ padding: "6px 10px" }}>
                Close
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.66)", lineHeight: 1.4 }}>
              Plan: deposit <span className="mono">{depositUsdc}</span> USDC, borrow <span className="mono">{amountUsdc}</span> USDC, pay{" "}
              <span className="mono">{payee}</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.64)", lineHeight: 1.35 }}>
              This demo uses your local private key and will:
              <br />
              1) {depositMode === "eth_btc" ? "swap USDC → WETH/cbBTC (50/50) and supply to Aave via the vault" : "supply USDC collateral to Aave via the vault"}
              <br />
              2) run a CRE workflow simulation {broadcast ? <>with <span className="mono">--broadcast</span></> : "(no broadcast)"} (borrows USDC and pays the destination)
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="copyBtn" onClick={() => setConfirmRunOpen(false)} style={{ padding: "8px 10px" }}>
                Cancel
              </button>
              <button
                type="button"
                className="primaryBtn"
                onClick={() => void runDemo()}
                disabled={!canRun}
                style={{ padding: "8px 10px" }}
                title={!canRun ? runDisabledReason : "Run the demo workflow"}
              >
                I understand, run demo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Live Visual</h2>
        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.64)" }}>{stepLabel}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.56)" }}>
          Plan: deposit <span className="mono">{depositUsdc}</span> USDC{" "}
          <span className="mono">({depositMode === "eth_btc" ? "50/50 ETH+BTC" : "USDC-only"})</span> · borrow{" "}
          <span className="mono">{amountUsdc}</span> USDC · pay{" "}
          <span className="mono">{shortHex(payee, 8, 6) || "payee"}</span>
        </div>
        {running && phase === 1 ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
            Aave supply is a real onchain tx. Even on Base this can take 10-40s depending on RPC latency and confirmation speed.
          </div>
        ) : null}
        {running && phase === 2 ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
            CRE simulation compiles the workflow to WASM and runs consensus. This step can take 30-90s even on Base.
          </div>
        ) : null}
        {elapsedLabel ? (
          <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
            Elapsed: <span className="mono">{elapsedLabel}</span>
          </div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,180,180,0.95)" }}>
            Run stopped: {error.split("\n")[0]}
          </div>
        ) : null}

        <div ref={boardRef} className="demoBoard" style={{ marginTop: 12 }}>
          <div className="demoBoardGrid">
            <div className="demoBox">
              <div className="demoBoxTitle">
                <span>Agent Wallet</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="demoBoxAddr mono">{shortHex(proofAgentWalletAddr || DEFAULT_AGENT_WALLET, 8, 6)}</span>
                  <button
                    type="button"
                    className="copyBtn"
                    onClick={() => void copy(proofAgentWalletAddr || DEFAULT_AGENT_WALLET, "agent")}
                    title="Copy agent wallet address"
                  >
                    {copied === "agent" ? "Copied" : "Copy"}
                  </button>
                </span>
              </div>
              <div className="demoKV" ref={agentAnchorRef}>
                <span className="demoK">USDC</span>
                <span className="demoV mono">
                  {proof ? `${formatToken(proofAgentWalletUsdc, proofUsdcDecimals, 6)} ${proofUsdcSymbol}` : missing}
                  {proof ? ` ($${formatUsdOrDash(displayOwnerUsdcValueBase, proofBaseDecimals, proofAgentWalletUsdc)})` : ""}
                </span>
              </div>
              <div className="demoKV">
                <span className="demoK">WETH</span>
                <span className="demoV mono">
                  {proof && ownerAssetsNow?.weth
                    ? `${formatToken(proofAgentWalletWeth, ownerAssetsNow.weth.decimals, 6)} WETH ($${formatUsdOrDash(
                        displayOwnerWethValueBase,
                        proofBaseDecimals,
                        proofAgentWalletWeth
                      )}) @ $${formatUsdOrDash(wethPriceBase, proofBaseDecimals, 1n)}/WETH`
                    : proof
                      ? missing
                      : missing}
                </span>
              </div>
              <div className="demoKV">
                <span className="demoK">cbBTC</span>
                <span className="demoV mono">
                  {proof && ownerAssetsNow?.cbbtc
                    ? `${formatToken(proofAgentWalletCbbtc, ownerAssetsNow.cbbtc.decimals, 6)} cbBTC ($${formatUsdOrDash(
                        displayOwnerCbbtcValueBase,
                        proofBaseDecimals,
                        proofAgentWalletCbbtc
                      )}) @ $${formatUsdOrDash(cbbtcPriceBase, proofBaseDecimals, 1n)}/cbBTC`
                    : proof
                      ? missing
                      : missing}
                </span>
              </div>
              <div className="demoKV">
                <span className="demoK">Total</span>
                <span className="demoV mono">
                  {proof
                    ? ownerHasAnyAsset && displayOwnerTotalValueBase === 0n
                      ? "$—"
                      : `$${formatUsdBase(displayOwnerTotalValueBase, proofBaseDecimals)}`
                    : missing}
                </span>
              </div>
              <div className="demoHint">This wallet funds the vault. The vault contract holds the Aave position.</div>
            </div>

            <div className="demoArrow" aria-hidden="true">
              →
            </div>

            <div className="demoBox">
              <div className="demoBoxTitle">
                <span>Treasury</span>
                <span className="demoBoxAddr">Aave V3 position</span>
              </div>

              <div className="demoInAnchor" ref={treasuryInAnchorRef} aria-hidden="true" />

              <div className="demoSectionTitle">Collateral</div>
              <div className="demoKV" ref={treasuryCollateralAnchorRef}>
                <span className="demoK">USDC</span>
                <span className="demoV mono">
                  {proof && posNow?.aUsdc
                    ? `${formatToken(posNow.aUsdc.aTokenBalance, posNow.aUsdc.decimals, 6)} ${proofUsdcSymbol} ($${formatUsdOrDash(
                        (posNow.aUsdc as any).valueBase ?? 0n,
                        proofBaseDecimals,
                        posNow.aUsdc.aTokenBalance
                      )})`
                    : missing}
                </span>
              </div>
              <div className="demoKV">
                <span className="demoK">ETH</span>
                <span className="demoV mono">
                  {proof && posNow?.aWeth
                    ? `${formatToken(posNow.aWeth.aTokenBalance, posNow.aWeth.decimals, 6)} WETH ($${formatUsdOrDash(
                        (posNow.aWeth as any).valueBase ?? 0n,
                        proofBaseDecimals,
                        posNow.aWeth.aTokenBalance
                      )})`
                    : missing}
                </span>
              </div>
              <div className="demoKV">
                <span className="demoK">BTC</span>
                <span className="demoV mono">
                  {proof && posNow?.aCbbtc
                    ? `${formatToken(posNow.aCbbtc.aTokenBalance, posNow.aCbbtc.decimals, 6)} cbBTC ($${formatUsdOrDash(
                        (posNow.aCbbtc as any).valueBase ?? 0n,
                        proofBaseDecimals,
                        posNow.aCbbtc.aTokenBalance
                      )})`
                    : missing}
                </span>
              </div>

              <div className="demoSectionTitle" style={{ marginTop: 10 }}>
                Loan
              </div>
              <div className="demoKV" ref={treasuryDebtAnchorRef}>
                <span className="demoK">USDC debt</span>
                <span className="demoV mono">
                  {proof ? `${formatToken((proof as any)?.usdc?.vaultDebt ?? 0n, proofUsdcDecimals, 6)} ${proofUsdcSymbol}` : missing}{" "}
                  {proof ? `($${formatUsdBase(displayDebtValueBase, proofBaseDecimals)})` : ""}
                  {baseline && proof && deltaDebt != null ? <span className="demoDelta"> {fmtSigned(deltaDebt, proofUsdcDecimals)}</span> : null}
                </span>
              </div>

              <div className="demoHint">
                {proof ? (
                  <>
                    Aave totals: Coll ${formatUsdBase(proofCollBase, proofBaseDecimals)} / Debt ${formatUsdBase(proofDebtBase, proofBaseDecimals)} / HF{" "}
                    {proofDebtBase === 0n ? "∞" : formatToken(proofHf, 18, 3)}
                    <br />
                    Vault wallet: {formatToken(proofVaultWalletUsdc, proofUsdcDecimals, 6)} {proofUsdcSymbol} ($
                    {formatUsdBase(proofVaultWalletValueBase, proofBaseDecimals)}) · {formatToken(proofVaultWalletWeth, 18, 6)} WETH ·{" "}
                    {formatToken(proofVaultWalletCbbtc, ownerAssetsNow?.cbbtc?.decimals ?? 8, 6)} cbBTC
                  </>
                ) : (
                  <>Aave totals: {missing}</>
                )}
              </div>
            </div>

            <div className="demoArrow" aria-hidden="true">
              →
            </div>

            <div className="demoBox">
              <div className="demoBoxTitle">
                <span>Payment destination</span>
                <span className="demoBoxAddr mono">{shortHex(payee, 8, 6)}</span>
              </div>
              <div className="demoKV" ref={payeeAnchorRef}>
                <span className="demoK">USDC</span>
                <span className="demoV mono">
                  {proof ? `${formatToken(proofPayeeUsdc, proofUsdcDecimals, 6)} ${proofUsdcSymbol}` : missing}
                  {proof ? ` ($${formatUsdBase(displayPayeeUsdcValueBase, proofBaseDecimals)})` : ""}
                  {baseline && proof && deltaPayee != null ? (
                    <span className="demoDelta"> {fmtSigned(deltaPayee, proofUsdcDecimals)}</span>
                  ) : null}
                </span>
              </div>
              <div className="demoKV">
                <span className="demoK">Total</span>
                <span className="demoV mono">
                  {proof ? `$${formatUsdBase(displayPayeeTotalValueBase, proofBaseDecimals)}` : missing}
                </span>
              </div>
              <div className="demoHint">This address should end up with more USDC after the run.</div>
            </div>
          </div>

          {/* Token animation overlay */}
          {anchors ? (
            <>
              {/* Deposit storyboard */}
              {isSwapDeposit ? (
                <>
                  {/* USDC enters treasury, then splits into ETH + BTC */}
                  <div
                    aria-hidden="true"
                    className="demoToken demoTokenUsdc"
                    style={{
                      left: (phase >= 1 ? anchors.treasuryIn : anchors.agent).x,
                      top: (phase >= 1 ? anchors.treasuryIn : anchors.agent).y,
                      opacity: visualActive && (phase === 0 || (phase >= 1 && !splitDone)) ? 1 : 0,
                      transform: `translate(-50%, -50%) scale(${splitDone ? 0.98 : 1})`,
                      animation: splitDone ? "demoTokenPop 420ms ease-out both" : undefined
                    }}
                  >
                    U
                  </div>
                  <div
                    aria-hidden="true"
                    className="demoToken demoTokenEth"
                    style={{
                      left: (splitDone ? anchors.collateral.x - 14 : anchors.treasuryIn.x),
                      top: (splitDone ? anchors.collateral.y : anchors.treasuryIn.y),
                      opacity: visualActive && phase >= 1 && splitDone ? 1 : 0,
                      animation: splitDone ? "demoTokenPop 420ms ease-out both" : undefined
                    }}
                  >
                    E
                  </div>
                  <div
                    aria-hidden="true"
                    className="demoToken demoTokenBtc"
                    style={{
                      left: (splitDone ? anchors.collateral.x + 14 : anchors.treasuryIn.x),
                      top: (splitDone ? anchors.collateral.y : anchors.treasuryIn.y),
                      opacity: visualActive && phase >= 1 && splitDone ? 1 : 0,
                      animation: splitDone ? "demoTokenPop 420ms ease-out both" : undefined
                    }}
                  >
                    B
                  </div>
                </>
              ) : (
                <>
                  {/* USDC deposit → Aave collateral */}
                  <div
                    aria-hidden="true"
                    className="demoToken demoTokenUsdc"
                    style={{
                      left: (phase >= 1 ? (splitDone ? anchors.collateral : anchors.treasuryIn) : anchors.agent).x,
                      top: (phase >= 1 ? (splitDone ? anchors.collateral : anchors.treasuryIn) : anchors.agent).y,
                      opacity: visualActive ? 1 : 0,
                      transform: `translate(-50%, -50%) scale(${splitDone ? 1.05 : 1})`,
                      animation: splitDone ? "demoTokenPop 420ms ease-out both" : undefined
                    }}
                  >
                    U
                  </div>
                </>
              )}

              {/* Borrowed USDC → payee */}
              <div
                aria-hidden="true"
                className={`demoToken demoTokenPay ${payLanded ? "demoTokenPop" : ""}`}
                style={{
                  left: (phase >= 3 ? anchors.payee : anchors.debt).x,
                  top: (phase >= 3 ? anchors.payee : anchors.debt).y,
                  opacity: visualActive && phase >= 2 ? 1 : 0,
                  animation: payLanded ? "demoTokenPop 420ms ease-out both" : undefined
                }}
              >
                $
              </div>
            </>
          ) : null}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`pill ${agentOk ? "pillOk" : ""} ${running && phase === 0 ? "pillActive" : ""} ${failedPhase === 0 && !agentOk ? "pillFail" : ""}`}>
            Agent <span className="mono">{agentOk ? "OK" : running ? "WAIT" : "—"}</span>
          </span>
          <span className={`pill ${depositOk ? "pillOk" : ""} ${running && phase === 1 ? "pillActive" : ""} ${failedPhase === 1 && !depositOk ? "pillFail" : ""}`}>
            Deposit <span className="mono">{depositOk ? "OK" : running && phase >= 1 ? "WAIT" : "—"}</span>
          </span>
          <span
            className={`pill ${creOk ? "pillOk" : ""} ${running && phase === 2 ? "pillActive" : ""} ${failedPhase === 2 && !creOk ? "pillFail" : ""}`}
          >
            CRE <span className="mono">{creOk ? "OK" : running && phase >= 2 ? "WAIT" : "—"}</span>
          </span>
          <span
            className={`pill ${onchainOk ? "pillOk" : ""} ${running && phase === 3 ? "pillActive" : ""} ${failedPhase === 3 && !onchainOk ? "pillFail" : ""}`}
          >
            Onchain <span className="mono">{onchainOk ? "OK" : running && phase >= 3 ? "WAIT" : "—"}</span>
          </span>
          <span className={`pill ${payeeOk ? "pillOk" : ""} ${running && phase === 4 ? "pillActive" : ""} ${failedPhase === 4 && !payeeOk ? "pillFail" : ""}`}>
            Payee <span className="mono">{payeeOk ? "OK" : running && phase >= 4 ? "WAIT" : "—"}</span>
          </span>
          {proof ? (
            <span className="pill">
              Allowlist{" "}
              <span className="mono">
                payee={(proof as any)?.vault?.payeeAllowed ? "yes" : "no"} borrow={(proof as any)?.vault?.borrowTokenAllowed ? "yes" : "no"}
              </span>
            </span>
          ) : null}
          {proof?.lastReceiverReport ? (
            <span className="pill">
              Receiver tx{" "}
              <span className="mono">
                <a href={`${BASESCAN}/tx/${proof.lastReceiverReport.txHash}`} target="_blank" rel="noreferrer">
                  {shortHex(proof.lastReceiverReport.txHash, 10, 8)}
                </a>
              </span>
            </span>
          ) : null}
          {depositSupplyTx ? (
            <span className="pill">
              Deposit tx{" "}
              <span className="mono">
                <a href={`${BASESCAN}/tx/${depositSupplyTx}`} target="_blank" rel="noreferrer">
                  {shortHex(depositSupplyTx, 10, 8)}
                </a>
              </span>
            </span>
          ) : null}
          {proof?.lastBorrowAndPay ? (
            <span className="pill">
              Borrow tx{" "}
              <span className="mono">
                <a href={`${BASESCAN}/tx/${proof.lastBorrowAndPay.txHash}`} target="_blank" rel="noreferrer">
                  {shortHex(proof.lastBorrowAndPay.txHash, 10, 8)}
                </a>
              </span>
            </span>
          ) : null}
          <button
            onClick={() => void refreshProof().catch((e) => setError(e instanceof Error ? e.message : String(e)))}
            disabled={running || proofLoading}
            style={{
              cursor: "pointer",
              borderRadius: 999,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(0,0,0,0.18)",
              color: "rgba(255,255,255,0.78)",
              fontSize: 12
            }}
          >
            {proofLoading ? "Refreshing…" : "Refresh onchain"}
          </button>
          <button
            onClick={() => void resetToUsdc()}
            disabled={running || proofLoading || resetting}
            style={{
              cursor: "pointer",
              borderRadius: 999,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(0,0,0,0.18)",
              color: "rgba(255,255,255,0.78)",
              fontSize: 12
            }}
            title="Repay debt + withdraw collateral + swap to USDC + return to agent wallet"
          >
            {resetting ? "Resetting…" : "Repay + Export USDC"}
          </button>
        </div>

        {error ? (
          <div
            ref={errorRef}
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,120,120,0.35)",
              background: "rgba(255,120,120,0.08)",
              color: "rgba(255,255,255,0.9)",
              fontSize: 13,
              lineHeight: 1.4
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "rgba(255,220,220,0.92)" }}>Last error (sticky)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className="copyBtn" onClick={() => void copyError()} title="Copy error text">
                  {copied === "error" ? "Copied" : "Copy error"}
                </button>
                <button type="button" className="copyBtn" onClick={() => void copyDebug()} title="Copy debug JSON (inputs + runner output)">
                  {copied === "debug" ? "Copied" : "Copy debug"}
                </button>
              </div>
            </div>
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{error}</pre>
          </div>
        ) : null}

        {finished && proof && baseline ? (
          <>
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(124,255,171,0.30)",
                background: "rgba(124,255,171,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap"
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>Onchain proof updated</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className="pill">
                  Payee <span className="mono">{deltaPayee != null ? fmtSigned(deltaPayee, proofUsdcDecimals) : "n/a"}</span>
                </span>
                <span className="pill">
                  Debt <span className="mono">{deltaDebt != null ? fmtSigned(deltaDebt, proofUsdcDecimals) : "n/a"}</span>
                </span>
                <span className="pill">
                  Tx{" "}
                  <span className="mono">
                    {proof.lastBorrowAndPay ? (
                      <a href={`${BASESCAN}/tx/${proof.lastBorrowAndPay.txHash}`} target="_blank" rel="noreferrer">
                        {shortHex(proof.lastBorrowAndPay.txHash, 10, 8)}
                      </a>
                    ) : (
                      "n/a"
                    )}
                  </span>
                </span>
              </div>
            </div>

            <details className="card" style={{ marginTop: 12, borderColor: "rgba(124,255,171,0.24)" }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.86)" }}>Receipt (expanded)</summary>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>Vault</span>
                <span className="mono" style={{ fontSize: 12 }}>{baseline.vault.address}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>Payee</span>
                <span className="mono" style={{ fontSize: 12 }}>{payee}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>Payee (before → after)</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {formatToken((baseline as any)?.wallet?.payee?.usdc ?? (baseline as any)?.usdc?.payeeBalance ?? 0n, baselineUsdcDecimals, 6)} →{" "}
                  {formatToken(proofPayeeUsdc, proofUsdcDecimals, 6)} {proofUsdcSymbol} {deltaPayee != null ? `(${fmtSigned(deltaPayee, proofUsdcDecimals)})` : ""}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>Agent wallet (before → after)</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {formatToken((baseline as any)?.wallet?.owner?.usdc ?? 0n, baselineUsdcDecimals, 6)} → {formatToken(proofAgentWalletUsdc, proofUsdcDecimals, 6)} {proofUsdcSymbol}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>Vault debt (before → after)</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {formatToken((baseline as any)?.usdc?.vaultDebt ?? 0n, baselineUsdcDecimals, 6)} → {formatToken((proof as any)?.usdc?.vaultDebt ?? 0n, proofUsdcDecimals, 6)} {proofUsdcSymbol}{" "}
                  {deltaDebt != null ? `(${fmtSigned(deltaDebt, proofUsdcDecimals)})` : ""}{" "}
                  {`[$${formatUsdBase((baseline as any)?.usdc?.vaultDebtValueBase ?? 0n, baselineBaseDecimals)} → $${formatUsdBase(proofDebtValueBase, proofBaseDecimals)}]`}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>Aave collateral ($)</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {formatUsdBase((baseline as any)?.aave?.userAccountData?.totalCollateralBase ?? 0n, baselineBaseDecimals)} → {formatUsdBase(proofCollBase, proofBaseDecimals)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>aWETH (before → after)</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {(() => {
                    const before = (baseline as any)?.collaterals?.find?.((c: any) => String(c.address).toLowerCase() === DEFAULT_WETH.toLowerCase());
                    const after = (proof as any)?.collaterals?.find?.((c: any) => String(c.address).toLowerCase() === DEFAULT_WETH.toLowerCase());
                    if (!before || !after) return "n/a";
                    return `${formatToken(before.aTokenBalance, before.decimals, 6)} → ${formatToken(after.aTokenBalance, after.decimals, 6)} ${after.symbol} ` +
                      `($${formatUsdBase(before.valueBase ?? 0n, baselineBaseDecimals)} → $${formatUsdBase(after.valueBase ?? 0n, proofBaseDecimals)})`;
                  })()}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>aCBTC (before → after)</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {(() => {
                    const before = (baseline as any)?.collaterals?.find?.((c: any) => String(c.address).toLowerCase() === DEFAULT_CBBTC.toLowerCase());
                    const after = (proof as any)?.collaterals?.find?.((c: any) => String(c.address).toLowerCase() === DEFAULT_CBBTC.toLowerCase());
                    if (!before || !after) return "n/a";
                    return `${formatToken(before.aTokenBalance, before.decimals, 6)} → ${formatToken(after.aTokenBalance, after.decimals, 6)} ${after.symbol} ` +
                      `($${formatUsdBase(before.valueBase ?? 0n, baselineBaseDecimals)} → $${formatUsdBase(after.valueBase ?? 0n, proofBaseDecimals)})`;
                  })()}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.64)" }}>Borrow tx</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {proof.lastBorrowAndPay ? (
                    <a href={`${BASESCAN}/tx/${proof.lastBorrowAndPay.txHash}`} target="_blank" rel="noreferrer">
                      {shortHex(proof.lastBorrowAndPay.txHash, 10, 8)}
                    </a>
                  ) : (
                    "n/a"
                  )}
                </span>
              </div>
              </div>
            </details>
          </>
        ) : null}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Execution Trace</h2>
        <p style={{ marginTop: 2 }}>
          The AI agent is allowed to propose actions, but it is treated as <span className="mono">untrusted input</span>. Chainlink CRE runs a deterministic
          workflow in multi-node consensus, then (optionally) writes a report onchain. The vault contract is the final enforcement layer: allowlists, nonces,
          and borrow limits cannot be bypassed by the agent or by CRE.
        </p>

        <div className="trace">
          <div className={`traceStep ${running && phase === 2 ? "traceStepActive" : ""} ${stepTriggerDone ? "traceStepDone" : ""} ${stepTriggerFail ? "traceStepFail" : ""}`}>
            <div className="traceHead">
              <div className="traceTitle">
                <span className="traceNum">1</span> Trigger (UI → CRE)
              </div>
              <span className={`pill ${creTriggerBody ? "pillOk" : ""}`}>{creTriggerBody ? "Captured" : "—"}</span>
            </div>
            <div className="traceBody">
              <div className="traceHint">
                Trigger inputs (HTTP payload + whether we broadcast). Broadcast is a CLI flag, not part of the HTTP payload.
              </div>
              <pre className="tracePre mono">{creTriggerBody ? JSON.stringify(creTriggerBody, null, 2) : "n/a"}</pre>
            </div>
          </div>

          <div className={`traceStep ${running && phase === 0 ? "traceStepActive" : ""} ${stepAgentDone ? "traceStepDone" : ""} ${stepAgentFail ? "traceStepFail" : ""}`}>
            <div className="traceHead">
              <div className="traceTitle">
                <span className="traceNum">2</span> Agent Proposal (untrusted)
              </div>
              <span className={`pill ${plan ? "pillOk" : ""}`}>{plan ? "OK" : "—"}</span>
            </div>
            <div className="traceBody">
              <div className="traceHint">
                The CRE workflow will reject any agent output that changes payee/asset, escalates the amount, or uses the wrong nonce.
              </div>
              <div className="traceTwoCol">
                <div>
                  <div className="traceSubhead">Agent request</div>
                  <pre className="tracePre mono">{agentReqBody ? JSON.stringify(agentReqBody, null, 2) : "n/a"}</pre>
                </div>
                <div>
                  <div className="traceSubhead">
                    Agent response <span className="traceBadge">Untrusted input</span>
                  </div>
                  <pre className="tracePre mono">{plan ? JSON.stringify(plan, null, 2) : "n/a"}</pre>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`traceStep ${running && phase === 2 ? "traceStepActive" : ""} ${stepVerificationDone ? "traceStepDone" : ""} ${stepVerificationFail ? "traceStepFail" : ""}`}
          >
            <div className="traceHead">
              <div className="traceTitle">
                <span className="traceNum">3</span> CRE Verification (deterministic + consensus)
              </div>
              <span className={`pill ${traceCreChecksOk ? "pillOk" : ""}`}>
                {traceCreChecksOk == null ? "—" : traceCreChecksOk ? "PASS" : "FAIL"}
              </span>
            </div>
            <div className="traceBody">
              <div className="traceHint">
                These checks are computed inside the CRE workflow before it writes an onchain report.
              </div>
              <div className="traceChecks">
                <div className={`traceCheck ${traceVaultPausedOk === false ? "traceCheckBad" : ""}`}>
                  <span>vault.paused == false</span>
                  <span className="mono">{traceVaultPausedOk == null ? "n/a" : String(traceVaultPausedOk)}</span>
                </div>
                <div className="traceCheck">
                  <span>expectedPlanNonce = baselineNonce + 1</span>
                  <span className="mono">
                    {baseline ? `${baseline.vault.nonce.toString()} + 1 = ${traceExpectedNonce?.toString()}` : "n/a"}
                  </span>
                </div>
                <div className={`traceCheck ${tracePlanMatchesPayee === false ? "traceCheckBad" : ""}`}>
                  <span>agent cannot change payee</span>
                  <span className="mono">{tracePlanPayee ? `${shortHex(tracePlanPayee, 8, 6)} == ${shortHex(payee, 8, 6)}` : "n/a"}</span>
                </div>
                <div className={`traceCheck ${tracePlanMatchesBorrowAsset === false ? "traceCheckBad" : ""}`}>
                  <span>agent cannot change borrowAsset</span>
                  <span className="mono">{tracePlanBorrowAsset ? `${shortHex(tracePlanBorrowAsset, 8, 6)} == USDC` : "n/a"}</span>
                </div>
                <div className={`traceCheck ${tracePlanNotEscalated === false ? "traceCheckBad" : ""}`}>
                  <span>agent cannot increase borrowAmount</span>
                  <span className="mono">
                    {tracePlanBorrow != null && traceRequestedBorrow != null
                      ? `${tracePlanBorrow.toString()} <= ${traceRequestedBorrow.toString()}`
                      : "n/a"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={`traceStep ${running && (phase === 2 || phase === 3) ? "traceStepActive" : ""} ${stepWriteDone ? "traceStepDone" : ""} ${stepWriteFail ? "traceStepFail" : ""}`}>
            <div className="traceHead">
              <div className="traceTitle">
                <span className="traceNum">4</span> CRE Onchain Write (writeReport)
              </div>
              <span className={`pill ${creRun?.ok ? "pillOk" : ""}`}>{creRun?.ok ? "OK" : creRun ? "FAIL" : "—"}</span>
            </div>
            <div className="traceBody">
              <div className="traceChecks">
                <div className="traceCheck">
                  <span>receiver</span>
                  <span className="mono">{proof ? shortHex((proof as any)?.receiver?.address, 10, 8) : "n/a"}</span>
                </div>
                <div className="traceCheck">
                  <span>forwarder gate</span>
                  <span className="mono">{receiverForwarder ? shortHex(receiverForwarder, 10, 8) : "n/a"}</span>
                </div>
                <div className={`traceCheck ${receiverReportNonceOk === false ? "traceCheckBad" : ""}`}>
                  <span>report planNonce</span>
                  <span className="mono">
                    {receiverReportPlanNonce != null && traceExpectedNonce != null
                      ? `${receiverReportPlanNonce.toString()} (expected ${traceExpectedNonce.toString()})`
                      : "n/a"}
                  </span>
                </div>
                <div className={`traceCheck ${receiverReportPayeeOk === false ? "traceCheckBad" : ""}`}>
                  <span>report payee</span>
                  <span className="mono">
                    {receiverReportPayee ? `${shortHex(receiverReportPayee, 8, 6)} == ${shortHex(payee, 8, 6)}` : "n/a"}
                  </span>
                </div>
                <div className={`traceCheck ${receiverReportBorrowOk === false ? "traceCheckBad" : ""}`}>
                  <span>report borrowAmount</span>
                  <span className="mono">
                    {receiverReportBorrowAmount != null && traceRequestedBorrow != null
                      ? `${formatUnits(receiverReportBorrowAmount, 6)} == ${formatUnits(traceRequestedBorrow, 6)} USDC`
                      : "n/a"}
                  </span>
                </div>
                <div className="traceCheck">
                  <span>gasLimit</span>
                  <span className="mono">{CRE_GAS_LIMIT}</span>
                </div>
                <div className="traceCheck">
                  <span>duration</span>
                  <span className="mono">{creDurationMs != null ? `${Math.round(creDurationMs / 1000)}s` : "n/a"}</span>
                </div>
                <div className="traceCheck">
                  <span>report tx</span>
                  <span className="mono">
                    {creDidBroadcast ? (
                      receiverTxHash ? (
                        <a href={`${BASESCAN}/tx/${receiverTxHash}`} target="_blank" rel="noreferrer">
                          {shortHex(receiverTxHash, 10, 8)}
                        </a>
                      ) : (
                        "pending/unknown"
                      )
                    ) : (
                      "simulation only"
                    )}
                  </span>
                </div>
              </div>
              <div className="traceHint" style={{ marginTop: 8 }}>
                Why CRE: multi-node consensus produces a verifiable report. No single server can silently change the plan or the onchain instruction.
              </div>
            </div>
          </div>

          <div className={`traceStep ${running && (phase === 3 || phase === 4) ? "traceStepActive" : ""} ${stepOnchainDone ? "traceStepDone" : ""} ${stepOnchainFail ? "traceStepFail" : ""}`}>
            <div className="traceHead">
              <div className="traceTitle">
                <span className="traceNum">5</span> Onchain Execution (vault enforced)
              </div>
              <span className={`pill ${onchainOk ? "pillOk" : ""}`}>
                {creDidBroadcast ? (onchainOk ? "OK" : creRun ? "WAIT/FAIL" : "—") : "skipped"}
              </span>
            </div>
            <div className="traceBody">
              <div className="traceChecks">
                <div className="traceCheck">
                  <span>vault nonce</span>
                  <span className="mono">{baseline && proof ? `${baseline.vault.nonce.toString()} → ${proof.vault.nonce.toString()}` : "n/a"}</span>
                </div>
                <div className="traceCheck">
                  <span>payee USDC delta</span>
                  <span className="mono">
                    {deltaPayee != null ? fmtSigned(deltaPayee, proofUsdcDecimals) : "n/a"}
                  </span>
                </div>
                <div className="traceCheck">
                  <span>vault USDC debt delta</span>
                  <span className="mono">{deltaDebt != null ? fmtSigned(deltaDebt, proofUsdcDecimals) : "n/a"}</span>
                </div>
                <div className="traceCheck">
                  <span>payee allowlisted</span>
                  <span className="mono">{proof ? String((proof as any)?.vault?.payeeAllowed) : "n/a"}</span>
                </div>
                <div className="traceCheck">
                  <span>borrow asset allowlisted</span>
                  <span className="mono">{proof ? String((proof as any)?.vault?.borrowTokenAllowed) : "n/a"}</span>
                </div>
                {vaultPolicy ? (
                  <>
                    <div className="traceCheck">
                      <span>maxBorrowPerTx</span>
                      <span className="mono">{formatUnits(vaultPolicy.maxBorrowPerTx, 6)} USDC</span>
                    </div>
                    <div className="traceCheck">
                      <span>maxBorrowPerDay</span>
                      <span className="mono">{formatUnits(vaultPolicy.maxBorrowPerDay, 6)} USDC</span>
                    </div>
                    <div className="traceCheck">
                      <span>dailyBorrowed</span>
                      <span className="mono">{formatUnits(vaultPolicy.dailyBorrowed, 6)} USDC</span>
                    </div>
                    <div className="traceCheck">
                      <span>cooldownSeconds</span>
                      <span className="mono">{vaultPolicy.cooldownSeconds.toString()}s</span>
                    </div>
                  </>
                ) : null}
                <div className="traceCheck">
                  <span>borrow tx</span>
                  <span className="mono">
                    {proof?.lastBorrowAndPay?.txHash ? (
                      <a href={`${BASESCAN}/tx/${proof.lastBorrowAndPay.txHash}`} target="_blank" rel="noreferrer">
                        {shortHex(proof.lastBorrowAndPay.txHash, 10, 8)}
                      </a>
                    ) : (
                      "n/a"
                    )}
                  </span>
                </div>
              </div>
              <div className="traceHint" style={{ marginTop: 8 }}>
                Even if CRE is compromised, it cannot bypass onchain rules. If a preset fails, the trace above shows the guard that blocked it.
              </div>
            </div>
          </div>
        </div>
      </section>

      <details className="card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.86)" }}>Raw logs (agent + runners)</summary>
        <div suppressHydrationWarning style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, letterSpacing: "0.2px", color: "rgba(255,255,255,0.86)" }}>Proof debug</div>
              <a
                className="pill"
                href={`/api/proof?payee=${encodeURIComponent(payee.trim() || DEFAULT_PAYEE)}`}
                target="_blank"
                rel="noreferrer"
                title="Open the raw proof JSON returned by the server"
              >
                Open raw proof
              </a>
            </div>
	            <pre style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.22)", color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.35, overflowX: "auto" }}>
	              {proof
	                ? JSON.stringify(
	                    {
	                      baseDecimals: proofBaseDecimals,
	                      baseCurrencyUnit: proofBaseCurrencyUnit.toString(),
	                      prices: {
	                        usdcPriceBase: proofUsdcPriceBase.toString(),
	                        wethPriceBase: wethPriceBase.toString(),
	                        cbbtcPriceBase: cbbtcPriceBase.toString()
	                      },
	                      computed: {
	                        ownerUsdcValueBase: computedOwnerUsdcValueBase.toString(),
	                        ownerWethValueBase: computedOwnerWethValueBase.toString(),
	                        ownerCbbtcValueBase: computedOwnerCbbtcValueBase.toString(),
	                        ownerTotalValueBase: computedOwnerTotalValueBase.toString()
	                      },
	                      display: {
	                        ownerUsdcValueBase: displayOwnerUsdcValueBase.toString(),
	                        ownerWethValueBase: displayOwnerWethValueBase.toString(),
	                        ownerCbbtcValueBase: displayOwnerCbbtcValueBase.toString(),
	                        ownerTotalValueBase: displayOwnerTotalValueBase.toString()
	                      },
	                      walletValues: (proof as any)?.walletValues ?? null
	                    },
	                    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
	                    2
	                  )
	                : "n/a"}
	            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.2px", color: "rgba(255,255,255,0.86)" }}>Agent output</div>
            <pre style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.22)", color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.35, overflowX: "auto" }}>
              {plan ? JSON.stringify(plan, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) : "n/a"}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.2px", color: "rgba(255,255,255,0.86)" }}>Deposit output</div>
            <pre style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.22)", color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.35, overflowX: "auto" }}>
              {depositRun
                ? [
                    depositRun?.summary ? `Summary: ${depositRun.summary}` : null,
                    depositRun?.txSent != null ? `txSent: ${String(depositRun.txSent)}` : null,
                    Array.isArray(depositRun?.attempts) ? `attempts: ${depositRun.attempts.length}` : null,
                    "",
                    String(depositRun?.stderr || depositRun?.stdout || "").slice(-2400)
                  ]
                    .filter((l) => l != null)
                    .join("\n")
                : "n/a"}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.2px", color: "rgba(255,255,255,0.86)" }}>CRE run output</div>
            <pre style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.22)", color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.35, overflowX: "auto" }}>
              {creRun ? String(creRun?.stderr || creRun?.stdout || "").slice(-2400) : "n/a"}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.2px", color: "rgba(255,255,255,0.86)" }}>Reset output</div>
            <pre style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.22)", color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.35, overflowX: "auto" }}>
              {resetRun ? String(resetRun?.stderr || resetRun?.stdout || "").slice(-2400) : "n/a"}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.2px", color: "rgba(255,255,255,0.86)" }}>Swap output</div>
            <pre style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.22)", color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.35, overflowX: "auto" }}>
              {swapRun ? String(swapRun?.stderr || swapRun?.stdout || "").slice(-2400) : "n/a"}
            </pre>
          </div>
        </div>
      </details>
    </main>
  );
}
