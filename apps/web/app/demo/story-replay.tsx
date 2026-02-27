"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

const DEFAULT_PAYEE = "0x42444551e2b5FEb7A7c2eE4dA38993381B08Bc6d";
const DEFAULT_VAULT = "0xf154BBca60E61B569712959Cc5D5435e27508BE2";
const BASESCAN = "https://basescan.org";

// Hardcoded story data — no real transactions.
const STORY = {
  deposit: 10_000_000, // 10 USDC (6 decimals) — using number for display only
  borrow: 3_000_000,
  payee: "0x4244...c6d",
  collateralUsd: 9.87,
  debtUsd: 3.0,
  healthFactor: "1.61",
  yieldBps: 3,
};

type Phase = 0 | 1 | 2 | 3 | 4 | 5;

const PHASE_DURATION: Record<Phase, number> = {
  0: 0, // manual start
  1: 3000,
  2: 3000,
  3: 3000,
  4: 3000,
  5: 0, // stays
};

const NARRATION: Record<Phase, string> = {
  0: "See how an AI agent builds a self-sustaining treasury.",
  1: "Agent deposits $10 USDC. Swapped 50/50 into WETH + cbBTC and supplied to Aave V3.",
  2: "Collateral earns yield automatically. The treasury grows while the agent operates.",
  3: "CRE DON verifies the spend is safe — payee, amount, nonce, health factor. No single point of trust.",
  4: "Vault borrows 3 USDC from Aave and pays the service provider. Collateral keeps earning.",
  5: "Treasury is live on Base. Agents that earn, borrow, and pay — without selling their assets.",
};

const PHASE_LABELS: Record<Phase, string> = {
  0: "Ready",
  1: "Deposit",
  2: "Yield",
  3: "Verify",
  4: "Borrow",
  5: "Result",
};

function shortHex(hex: string, left = 6, right = 4) {
  if (hex.length <= left + right) return hex;
  return `${hex.slice(0, left)}...${hex.slice(-right)}`;
}

type ProofData = {
  collateralUsd: string;
  debtUsd: string;
  healthFactor: string;
  borrowTxHash: string | null;
  creTxHash: string | null;
  vaultAddress: string;
  nonce: string;
  payeeBalance: string;
  collaterals: { symbol: string; valueUsd: string }[];
};

export default function StoryReplay() {
  const [phase, setPhase] = useState<Phase>(0);
  const [playing, setPlaying] = useState(false);
  const [proof, setProof] = useState<ProofData | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  // Animated counters
  const [collateralDisplay, setCollateralDisplay] = useState(0);
  const [debtDisplay, setDebtDisplay] = useState(0);
  const [yieldTick, setYieldTick] = useState(0);
  const [checkMarks, setCheckMarks] = useState(0);

  const boardRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yieldRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance phases
  useEffect(() => {
    if (!playing) return;
    if (phase === 0 || phase === 5) return;

    const dur = PHASE_DURATION[phase];
    if (dur <= 0) return;

    timerRef.current = setTimeout(() => {
      setPhase((p) => (p < 5 ? ((p + 1) as Phase) : p));
    }, dur);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, playing]);

  // Phase 1: animate collateral counter from 0 to 9.87
  useEffect(() => {
    if (phase < 1) {
      setCollateralDisplay(0);
      return;
    }
    if (phase > 1) return; // already set

    let frame: number;
    const start = performance.now();
    const duration = 2200;
    const target = STORY.collateralUsd;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCollateralDisplay(parseFloat((target * eased).toFixed(2)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // Phase 2: yield ticking
  useEffect(() => {
    if (phase !== 2) {
      if (yieldRef.current) clearInterval(yieldRef.current);
      return;
    }
    setYieldTick(0);
    let count = 0;
    yieldRef.current = setInterval(() => {
      count++;
      setYieldTick(count);
      setCollateralDisplay((prev) => parseFloat((prev + 0.01).toFixed(2)));
    }, 400);
    return () => {
      if (yieldRef.current) clearInterval(yieldRef.current);
    };
  }, [phase]);

  // Phase 3: staggered check marks
  useEffect(() => {
    if (phase !== 3) {
      if (phase < 3) setCheckMarks(0);
      return;
    }
    setCheckMarks(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 4; i++) {
      timers.push(setTimeout(() => setCheckMarks(i), i * 600));
    }
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Phase 4: animate debt counter
  useEffect(() => {
    if (phase < 4) {
      setDebtDisplay(0);
      return;
    }
    if (phase > 4) return;

    let frame: number;
    const start = performance.now();
    const duration = 1500;
    const target = STORY.debtUsd;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDebtDisplay(parseFloat((target * eased).toFixed(2)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // Phase 5: fetch real proof data
  useEffect(() => {
    if (phase !== 5) return;
    let cancelled = false;
    setProofLoading(true);

    fetch(`/api/proof?payee=${encodeURIComponent(DEFAULT_PAYEE)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok && json?.proof) {
          const p = json.proof;
          const baseDec = p?.oracle?.baseDecimals ?? 8;
          const collBase = BigInt(p?.aave?.userAccountData?.totalCollateralBase ?? "0");
          const debtBase = BigInt(p?.aave?.userAccountData?.totalDebtBase ?? "0");
          const hf = BigInt(p?.aave?.userAccountData?.healthFactor ?? "0");

          const fmt = (v: bigint, dec: number) => {
            const s = (Number(v) / 10 ** dec).toFixed(2);
            return s;
          };

          const collaterals: { symbol: string; valueUsd: string }[] = [];
          if (Array.isArray(p?.collaterals)) {
            for (const c of p.collaterals) {
              const val = BigInt(c?.valueBase ?? "0");
              if (val > 0n) {
                collaterals.push({ symbol: c?.symbol ?? "?", valueUsd: fmt(val, baseDec) });
              }
            }
          }

          setProof({
            collateralUsd: fmt(collBase, baseDec),
            debtUsd: fmt(debtBase, baseDec),
            healthFactor: debtBase === 0n ? "∞" : (Number(hf) / 1e18).toFixed(2),
            borrowTxHash: p?.lastBorrowAndPay?.txHash ?? null,
            creTxHash: p?.lastReceiverReport?.txHash ?? null,
            vaultAddress: p?.vault?.address ?? DEFAULT_VAULT,
            nonce: String(p?.vault?.nonce ?? "—"),
            payeeBalance: fmt(
              BigInt(p?.usdc?.payeeValueBase ?? p?.usdc?.payeeBalance ?? "0"),
              p?.usdc?.payeeValueBase ? baseDec : (p?.usdc?.decimals ?? 6),
            ),
            collaterals,
          });
        }
      })
      .catch(() => {
        // Non-critical — proof display is a nice-to-have
      })
      .finally(() => {
        if (!cancelled) setProofLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [phase]);

  const startReplay = useCallback(() => {
    setPhase(1);
    setPlaying(true);
    setProof(null);
    setCollateralDisplay(0);
    setDebtDisplay(0);
    setYieldTick(0);
    setCheckMarks(0);
  }, []);

  const resetReplay = useCallback(() => {
    setPhase(0);
    setPlaying(false);
    setProof(null);
    setCollateralDisplay(0);
    setDebtDisplay(0);
    setYieldTick(0);
    setCheckMarks(0);
  }, []);

  const jumpToPhase = useCallback(
    (p: Phase) => {
      if (p === 0) {
        resetReplay();
        return;
      }
      setPhase(p);
      setPlaying(p < 5);
      // Set appropriate display states for the jumped-to phase
      if (p >= 1) setCollateralDisplay(STORY.collateralUsd);
      if (p >= 4) setDebtDisplay(STORY.debtUsd);
      if (p >= 3) setCheckMarks(4);
    },
    [resetReplay],
  );

  // Display values
  const collateral = phase >= 1 ? `$${collateralDisplay.toFixed(2)}` : "—";
  const debt = phase >= 4 ? `$${debtDisplay.toFixed(2)}` : "$0.00";
  const hf = phase >= 4 ? STORY.healthFactor : phase >= 1 ? "∞" : "—";
  const agentUsdc = phase >= 1 ? "$0.00" : "$10.00";

  // Use real proof data when available in phase 5
  const finalCollateral = proof ? `$${proof.collateralUsd}` : collateral;
  const finalDebt = proof ? `$${proof.debtUsd}` : debt;
  const finalHf = proof ? proof.healthFactor : hf;

  const showCollateral = phase === 5 ? finalCollateral : collateral;
  const showDebt = phase === 5 ? finalDebt : debt;
  const showHf = phase === 5 ? finalHf : hf;

  const CHECK_ITEMS = [
    "Payee is allowlisted",
    "Amount within daily limit",
    "Nonce matches vault state",
    "Health factor stays safe",
  ];

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl px-5 pt-5 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`h-2 w-2 rounded-full ${playing ? "bg-accent animate-pulse" : "bg-accent2"}`} />
            <h1 className="text-lg font-semibold text-text-primary tracking-tight">Agent Treasury Demo</h1>
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
              Story Mode
            </span>
          </div>
          <a
            href="/demo?live"
            className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Switch to Live →
          </a>
        </div>

        {/* Narration bar */}
        <div className="rounded-xl border-l-2 border-accent/60 bg-surface/60 backdrop-blur-sm px-4 py-3 mb-4">
          <AnimatePresence mode="wait">
            <motion.p
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="text-sm text-text-secondary leading-relaxed"
            >
              {NARRATION[phase]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Visual board — reuses existing CSS classes */}
        <div ref={boardRef} className="demoBoard">
          <div className="demoBoardGrid">
            {/* Agent Wallet */}
            <div className="demoBox">
              <div className="demoBoxTitle">
                <span>Agent Wallet</span>
                <span className="demoBoxAddr mono">0x7C00...81C9</span>
              </div>
              <div className="demoKV">
                <span className="demoK">USDC</span>
                <motion.span
                  className="demoV mono"
                  key={`agent-${phase >= 1 ? "sent" : "full"}`}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  {agentUsdc}
                </motion.span>
              </div>
            </div>

            <div className="demoArrow" aria-hidden="true">
              {phase >= 1 && phase <= 2 ? (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  →
                </motion.span>
              ) : (
                "→"
              )}
            </div>

            {/* Treasury (Aave V3) */}
            <div className="demoBox" style={{ position: "relative" }}>
              <div className="demoBoxTitle">
                <span>Treasury</span>
                <span className="demoBoxAddr">Aave V3</span>
              </div>

              {/* Collateral */}
              <div className="demoKV">
                <span className="demoK">Collateral</span>
                <span className="demoV mono">
                  {showCollateral}
                  {phase === 2 && (
                    <motion.span
                      className="demoDelta"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      {" "}
                      +yield
                    </motion.span>
                  )}
                </span>
              </div>

              {/* Debt */}
              <div className="demoKV">
                <span className="demoK">Debt</span>
                <span className="demoV mono">{showDebt}</span>
              </div>

              {/* Health Factor */}
              <div className="demoKV">
                <span className="demoK">Health</span>
                <span className="demoV mono">{showHf}</span>
              </div>

              {/* CRE Verification overlay — phase 3 */}
              <AnimatePresence>
                {phase === 3 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 rounded-2xl bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-4"
                  >
                    {/* Shield icon */}
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-accent text-2xl mb-1"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
                        <path
                          d="M12 2L4 6v5c0 5.25 3.4 10.15 8 11.25C16.6 21.15 20 16.25 20 11V6l-8-4z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="currentColor"
                          fillOpacity="0.1"
                        />
                        <text x="12" y="15" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="bold">
                          CRE
                        </text>
                      </svg>
                    </motion.div>
                    <div className="w-full space-y-1.5">
                      {CHECK_ITEMS.map((item, i) => (
                        <motion.div
                          key={item}
                          initial={{ opacity: 0, x: -10 }}
                          animate={
                            i < checkMarks ? { opacity: 1, x: 0 } : { opacity: 0.3, x: -10 }
                          }
                          transition={{ duration: 0.3 }}
                          className="flex items-center gap-2 text-[11px]"
                        >
                          <span
                            className={`flex items-center justify-center w-4 h-4 rounded-full border ${
                              i < checkMarks
                                ? "border-accent2 bg-accent2/20 text-accent2"
                                : "border-border text-text-tertiary"
                            }`}
                          >
                            {i < checkMarks ? (
                              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                                <path
                                  d="M3 6l2 2 4-4"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </span>
                          <span className={i < checkMarks ? "text-text-primary" : "text-text-tertiary"}>
                            {item}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="demoArrow" aria-hidden="true">
              {phase >= 4 ? (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  →
                </motion.span>
              ) : (
                "→"
              )}
            </div>

            {/* Service Provider */}
            <div className="demoBox">
              <div className="demoBoxTitle">
                <span>Service Provider</span>
                <span className="demoBoxAddr mono">{STORY.payee}</span>
              </div>
              <div className="demoKV">
                <span className="demoK">USDC</span>
                <motion.span
                  className="demoV mono"
                  animate={{
                    color: phase >= 4 ? "rgba(124, 255, 171, 0.86)" : "inherit",
                  }}
                  transition={{ duration: 0.6 }}
                >
                  {phase >= 4 ? (
                    <>
                      +$3.00
                      {phase === 5 && proof && (
                        <span className="text-text-secondary ml-1 text-[11px]">
                          (live: ${proof.payeeBalance})
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </motion.span>
              </div>
            </div>
          </div>

          {/* Token animation overlay */}
          {/* Deposit token: USDC moving Agent → Treasury in phase 1 */}
          <AnimatePresence>
            {phase === 1 && (
              <motion.div
                className="demoToken demoTokenUsdc"
                initial={{ left: "12%", top: "50%", opacity: 1 }}
                animate={{ left: "50%", top: "50%", opacity: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden="true"
              >
                U
              </motion.div>
            )}
          </AnimatePresence>

          {/* Split tokens: E and B appear in phase 1 after deposit lands */}
          <AnimatePresence>
            {(phase === 1 || phase === 2) && (
              <>
                <motion.div
                  className="demoToken demoTokenEth"
                  initial={{ left: "50%", top: "50%", opacity: 0, scale: 0 }}
                  animate={{ left: "44%", top: "45%", opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, delay: 1.4 }}
                  aria-hidden="true"
                >
                  E
                </motion.div>
                <motion.div
                  className="demoToken demoTokenBtc"
                  initial={{ left: "50%", top: "50%", opacity: 0, scale: 0 }}
                  animate={{ left: "56%", top: "45%", opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, delay: 1.6 }}
                  aria-hidden="true"
                >
                  B
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Pay token: $ moving Treasury → Payee in phase 4 */}
          <AnimatePresence>
            {phase >= 4 && (
              <motion.div
                className="demoToken demoTokenPay"
                initial={{ left: "50%", top: "60%", opacity: 1 }}
                animate={{ left: "88%", top: "50%", opacity: 1 }}
                transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden="true"
              >
                $
              </motion.div>
            )}
          </AnimatePresence>

          {/* Yield glow pulse in phase 2 */}
          <AnimatePresence>
            {phase === 2 && (
              <motion.div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.15, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{
                  background: "radial-gradient(circle at 50% 50%, rgba(124, 255, 171, 0.15), transparent 70%)",
                }}
                aria-hidden="true"
              />
            )}
          </AnimatePresence>
        </div>

        {/* Phase 5: real proof data */}
        <AnimatePresence>
          {phase === 5 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="rounded-xl border border-accent2/30 bg-accent2/[0.06] px-4 py-3 mt-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary mb-2">
                    Treasury is live on Base mainnet
                  </p>
                  {proofLoading ? (
                    <p className="text-[11px] text-text-tertiary">Loading on-chain proof...</p>
                  ) : proof ? (
                    <div className="space-y-2">
                      {/* Vault link + state */}
                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={`${BASESCAN}/address/${proof.vaultAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="pill"
                        >
                          Vault <span className="mono">{shortHex(proof.vaultAddress, 6, 4)}</span>
                        </a>
                        <span className="pill">
                          Nonce <span className="mono">{proof.nonce}</span>
                        </span>
                      </div>

                      {/* Collateral breakdown */}
                      <div className="flex gap-2 flex-wrap">
                        <span className="pill">
                          Collateral <span className="mono">${proof.collateralUsd}</span>
                        </span>
                        {proof.collaterals.map((c) => (
                          <span key={c.symbol} className="pill">
                            {c.symbol} <span className="mono">${c.valueUsd}</span>
                          </span>
                        ))}
                      </div>

                      {/* Debt + HF */}
                      <div className="flex gap-2 flex-wrap">
                        <span className="pill">
                          Debt <span className="mono">${proof.debtUsd}</span>
                        </span>
                        <span className="pill">
                          HF <span className="mono">{proof.healthFactor}</span>
                        </span>
                      </div>

                      {/* Transaction links */}
                      <div className="flex gap-2 flex-wrap">
                        {proof.creTxHash && (
                          <a
                            href={`${BASESCAN}/tx/${proof.creTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="pill"
                          >
                            CRE tx <span className="mono">{shortHex(proof.creTxHash, 8, 6)}</span>
                          </a>
                        )}
                        {proof.borrowTxHash && (
                          <a
                            href={`${BASESCAN}/tx/${proof.borrowTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="pill"
                          >
                            Borrow tx <span className="mono">{shortHex(proof.borrowTxHash, 8, 6)}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-text-tertiary">
                      Proof unavailable — the vault data could not be fetched.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <a
                    href="/demo?live"
                    className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-background hover:bg-accent-hover transition-colors"
                  >
                    Run it live
                    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                      <path
                        d="M3 8h10m-4-4l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="flex items-center justify-between mt-4">
          {/* Phase dots */}
          <div className="flex items-center gap-1.5">
            {([0, 1, 2, 3, 4, 5] as Phase[]).map((p) => (
              <button
                key={p}
                onClick={() => jumpToPhase(p)}
                className={`group flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border transition-all cursor-pointer ${
                  p === phase
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : p < phase
                      ? "border-accent2/30 bg-accent2/10 text-accent2"
                      : "border-border bg-surface text-text-tertiary hover:border-border-strong"
                }`}
                title={NARRATION[p]}
              >
                {p < phase ? (
                  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                    <path
                      d="M3 6l2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : p === phase && playing ? (
                  <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                ) : null}
                {PHASE_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Action button */}
          <div className="flex items-center gap-3">
            {phase === 0 && (
              <button
                onClick={startReplay}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2 text-xs font-semibold text-background hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20 transition-all"
              >
                Watch the Story
                <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                  <path d="M5 3l8 5-8 5V3z" fill="currentColor" />
                </svg>
              </button>
            )}
            {phase === 5 && (
              <button
                onClick={resetReplay}
                className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Replay
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="py-3 text-center">
        <p className="text-[10px] text-text-tertiary/50">
          BorrowBot — CRE Hackathon 2026 · Base · Aave V3
        </p>
      </footer>
    </div>
  );
}
