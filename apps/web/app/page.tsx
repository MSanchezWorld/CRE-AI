"use client";

import Link from "next/link";
import { motion } from "motion/react";

/* ──────────────────────── Data ──────────────────────── */

const FLOW_STEPS = [
  {
    num: "01",
    title: "Fund the Agent Treasury",
    subtitle: "On-chain (Base)",
    color: "accent" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
    details: [
      "Agent deposits USDC into its BorrowVault, swapped 50/50 into WETH + cbBTC.",
      "Vault supplies assets to Aave V3 — collateral earns yield automatically.",
      "The treasury grows while the agent operates. No action needed.",
    ],
    labels: ["BorrowVault", "Aave V3 Pool", "Yield-Earning"],
  },
  {
    num: "02",
    title: "Agent Proposes a Spend Plan",
    subtitle: "You approve",
    color: "accent2" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
      </svg>
    ),
    details: [
      "The agent needs to pay for a service — compute, APIs, infrastructure, another agent.",
      "It submits a spend plan: how much USDC to borrow, and who to pay.",
      "You review the plan and approve it. The agent cannot move funds without your approval.",
    ],
    labels: ["Spend Plan", "Owner Approval", "Human-in-the-Loop"],
  },
  {
    num: "03",
    title: "CRE Verifies the Plan",
    subtitle: "Chainlink DON",
    color: "purple" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
    details: [
      "After your approval, CRE's decentralized network independently verifies the plan.",
      "DON nodes check: allowlisted payee, amount within limits, correct nonce, safe health factor.",
      "All nodes must reach consensus. No single point of trust.",
      "DON signs the verified report and delivers it on-chain via the Keystone Forwarder.",
    ],
    labels: ["Decentralized Verification", "Consensus", "DON Signature"],
  },
  {
    num: "04",
    title: "Vault Executes Borrow + Pay",
    subtitle: "On-chain (Base)",
    color: "amber" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
    details: [
      "BorrowBotReceiver verifies the DON signature and decodes the verified plan.",
      "BorrowVault enforces 12+ on-chain safety checks: allowlists, nonce, expiry, cooldown, limits.",
      "Health factor checked before and after borrow — the treasury stays safe.",
      "Aave V3 issues variable-rate USDC debt. USDC goes directly to the payee.",
    ],
    labels: ["12 Safety Checks", "Aave Borrow", "Health Factor Guard", "Pay Payee"],
  },
  {
    num: "05",
    title: "Service Provider Gets Paid",
    subtitle: "Confirmed on-chain",
    color: "accent2" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    details: [
      "USDC arrives at the payee wallet — verifiable on Basescan.",
      "Vault nonce increments, proving execution completed.",
      "Collateral stays in Aave earning yield — the agent never sold its assets.",
    ],
    labels: ["USDC Received", "Nonce Updated", "Treasury Intact"],
  },
];

const SAFETY_LAYERS = [
  {
    layer: "CRE Workflow",
    color: "purple" as const,
    checks: [
      "Vault not paused (on-chain read)",
      "Valid addresses for asset + payee",
      "Agent cannot escalate borrow amount",
      "Asset and payee must match request",
      "DON consensus on agent response",
    ],
  },
  {
    layer: "BorrowVault",
    color: "amber" as const,
    checks: [
      "Only executor (Receiver) can call",
      "Borrow token + payee allowlisted",
      "Nonce replay protection",
      "Plan not expired (< 5 min)",
      "Cooldown between executions (10 min)",
      "Per-tx cap ($100) + daily cap ($200)",
      "Health factor ≥ 1.6 pre + post borrow",
    ],
  },
  {
    layer: "Aave V3",
    color: "accent" as const,
    checks: [
      "LTV + liquidation threshold enforced",
      "Collateral must support borrow",
      "Variable-rate debt tracked on-chain",
    ],
  },
];

const CONTRACTS = [
  { name: "BorrowVault", addr: "0xf154BB…08BE2", role: "Holds collateral, borrows, pays" },
  { name: "BorrowBotReceiver", addr: "0x4150…B1353", role: "CRE entry point on-chain" },
  { name: "Aave V3 Pool", addr: "Base mainnet", role: "Lending + borrowing" },
  { name: "USDC", addr: "0x8335…02913", role: "Borrow token" },
  { name: "WETH / cbBTC", addr: "Base mainnet", role: "Collateral assets" },
];

/* ──────────────────────── Color helpers ──────────────────────── */

const colorMap = {
  accent: {
    text: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/20",
    glow: "shadow-accent/20",
    dot: "bg-accent",
    line: "from-accent/40",
  },
  accent2: {
    text: "text-accent2",
    bg: "bg-accent2/10",
    border: "border-accent2/20",
    glow: "shadow-accent2/20",
    dot: "bg-accent2",
    line: "from-accent2/40",
  },
  purple: {
    text: "text-purple",
    bg: "bg-purple/10",
    border: "border-purple/20",
    glow: "shadow-purple/20",
    dot: "bg-purple",
    line: "from-purple/40",
  },
  amber: {
    text: "text-amber",
    bg: "bg-amber/10",
    border: "border-amber/20",
    glow: "shadow-amber/20",
    dot: "bg-amber",
    line: "from-amber/40",
  },
};

/* ──────────────────────── Animations ──────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

/* ──────────────────────── Components ──────────────────────── */

function StepCard({
  step,
  index,
}: {
  step: (typeof FLOW_STEPS)[number];
  index: number;
}) {
  const c = colorMap[step.color];
  const isLast = index === FLOW_STEPS.length - 1;

  return (
    <div className="relative flex gap-6 md:gap-8">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <motion.div
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
          className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-xl border ${c.border} ${c.bg} ${c.text} shadow-lg ${c.glow}`}
        >
          {step.icon}
        </motion.div>
        {!isLast && (
          <div className={`w-px flex-1 bg-gradient-to-b ${c.line} to-transparent min-h-8`} />
        )}
      </div>

      {/* Content */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.05 * index }}
        className="flex-1 pb-12"
      >
        <div className="flex items-baseline gap-3 mb-1">
          <span className={`font-mono text-xs ${c.text} opacity-60`}>{step.num}</span>
          <h3 className="text-lg font-semibold text-text-primary">{step.title}</h3>
        </div>
        <p className={`text-xs font-medium uppercase tracking-widest ${c.text} opacity-70 mb-4`}>
          {step.subtitle}
        </p>

        <div className="rounded-xl border border-border bg-surface/60 backdrop-blur-sm p-5">
          <ul className="space-y-2 mb-4">
            {step.details.map((d, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-text-secondary leading-relaxed">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${c.dot} shrink-0 opacity-60`} />
                {d}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {step.labels.map((l) => (
              <span
                key={l}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${c.bg} ${c.text} border ${c.border}`}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SafetySection() {
  return (
    <motion.section
      variants={stagger}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      className="mt-32"
    >
      <motion.div variants={fadeUp} className="text-center mb-12">
        <p className="text-amber text-xs font-medium tracking-widest uppercase mb-2">Layered Security</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Three Layers of Safety Checks
        </h2>
        <p className="text-text-secondary text-sm mt-3 max-w-lg mx-auto">
          Every borrow passes through CRE validation, vault enforcement, and Aave protocol checks — no single point of trust.
        </p>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", alignItems: "stretch" }}>
        {SAFETY_LAYERS.map((layer) => {
          const c = colorMap[layer.color];
          return (
            <motion.div
              key={layer.layer}
              variants={fadeUp}
              className="rounded-xl border border-border bg-surface/60 backdrop-blur-sm p-6 flex flex-col items-center text-center"
            >
              <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${c.bg} ${c.text} border ${c.border} mb-5`}>
                {layer.layer}
              </div>
              <ul className="space-y-2.5 w-full">
                {layer.checks.map((check) => (
                  <li key={check} className="flex items-start gap-2.5 text-[13px] text-text-secondary text-left">
                    <svg viewBox="0 0 16 16" fill="none" className={`w-4 h-4 ${c.text} shrink-0 mt-0.5`}>
                      <path d="M6 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {check}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}

function ArchitectureDiagram() {
  return (
    <motion.section
      variants={stagger}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      className="mt-32"
    >
      <motion.div variants={fadeUp} className="text-center mb-12">
        <p className="text-accent text-xs font-medium tracking-widest uppercase mb-2">Architecture</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How the Pieces Connect</h2>
      </motion.div>

      {/* Flow diagram */}
      <motion.div
        variants={fadeUp}
        className="max-w-4xl mx-auto rounded-2xl border border-border bg-surface/40 backdrop-blur-sm p-6 sm:p-10"
      >
        {/* Horizontal flow for md+, vertical for mobile */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2">
          {[
            { label: "AI Agent", sub: "Spend request", color: "accent" as const },
            { label: "Agent Plan", sub: "Propose spend", color: "accent" as const },
            { label: "CRE DON", sub: "Validate + sign", color: "purple" as const },
            { label: "Receiver", sub: "Decode report", color: "amber" as const },
            { label: "Treasury", sub: "12 checks + borrow", color: "amber" as const },
            { label: "Service", sub: "USDC received", color: "accent2" as const },
          ].map((node, i, arr) => {
            const c = colorMap[node.color];
            return (
              <div key={node.label} className="flex items-center gap-2 md:gap-2">
                <div className={`flex flex-col items-center text-center`}>
                  <div
                    className={`h-14 w-14 rounded-xl border ${c.border} ${c.bg} flex items-center justify-center ${c.text}`}
                  >
                    <span className="text-[11px] font-bold">{node.label.slice(0, 3).toUpperCase()}</span>
                  </div>
                  <span className="text-xs font-medium text-text-primary mt-1.5">{node.label}</span>
                  <span className="text-[10px] text-text-tertiary">{node.sub}</span>
                </div>
                {i < arr.length - 1 && (
                  <svg viewBox="0 0 24 12" className="w-6 h-3 text-text-tertiary hidden md:block shrink-0">
                    <path d="M0 6h20m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-[11px] text-text-tertiary uppercase tracking-widest mb-3">Key Contracts</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CONTRACTS.map((c) => (
              <div key={c.name} className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-text-tertiary shrink-0" />
                <div>
                  <span className="text-xs font-medium text-text-primary">{c.name}</span>
                  <span className="text-[10px] text-text-tertiary ml-1.5 font-mono">{c.addr}</span>
                  <p className="text-[11px] text-text-tertiary">{c.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.section>
  );
}

/* ──────────────────────── Page ──────────────────────── */

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* ─── Hero ─── */}
      <header className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-accent/[0.04] blur-3xl" />
        <div className="pointer-events-none absolute -top-20 left-1/3 h-[300px] w-[400px] rounded-full bg-purple/[0.06] blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-6 pt-24 pb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 backdrop-blur-sm px-4 py-1.5 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-accent2 animate-pulse" />
              <span className="text-xs font-medium text-text-secondary">Chainlink CRE Hackathon 2026</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
              Hold Assets. Earn Yield.
              <br />
              <span className="bg-gradient-to-r from-accent via-purple to-accent2 bg-clip-text text-transparent">
                Borrow to Spend.
              </span>
            </h1>

            <p className="text-text-secondary text-base sm:text-lg max-w-xl mx-auto leading-relaxed mb-8">
              The wealthy never sell — they borrow against what they own. Now AI agents do the same.
              Hold BTC &amp; ETH, earn yield on Aave V3, borrow USDC to pay for services.
              You approve every spend. Chainlink CRE verifies it.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-background transition-all hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20"
              >
                Try the Demo
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                  <path d="M3 8h10m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a
                href="#process"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("process")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-medium text-text-secondary transition-all hover:border-border-strong hover:text-text-primary"
              >
                View Process
              </a>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ─── Demo Video ─── */}
      <section className="mx-auto max-w-4xl px-6 pb-14" style={{ paddingTop: 0, marginTop: "-10px" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl border border-border bg-surface/40 backdrop-blur-sm overflow-hidden"
        >
          {/* Replace this placeholder with: <video src="/demo.mp4" ... /> or an iframe */}
          <div className="aspect-video flex flex-col items-center justify-center gap-3 bg-black/20">
            <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 text-text-tertiary/40">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" />
              <path d="M20 16l12 8-12 8V16z" fill="currentColor" />
            </svg>
            <p className="text-sm text-text-tertiary/60">Demo video coming soon</p>
          </div>
        </motion.div>
      </section>

      {/* ─── Process Timeline ─── */}
      <main className="mx-auto max-w-5xl px-6" id="process" style={{ scrollMarginTop: "3rem" }}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <p className="text-accent text-xs font-medium tracking-widest uppercase mb-2">The Process</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            How It Works
          </h2>
          <p className="text-text-secondary text-sm mt-3 max-w-lg mx-auto">
            You approve every spend. CRE verifies it. The agent never sells its assets — it borrows against its own treasury.
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="ml-0 sm:ml-4">
          {FLOW_STEPS.map((step, i) => (
            <StepCard key={step.num} step={step} index={i} />
          ))}
        </div>

        {/* Safety Checks */}
        <SafetySection />

        {/* Architecture */}
        <ArchitectureDiagram />

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-32 mb-24 text-center"
        >
          <div className="rounded-2xl border border-border bg-surface/40 backdrop-blur-sm p-10 sm:p-14">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              See it in Action
            </h2>
            <p className="text-text-secondary text-sm mb-8 max-w-md mx-auto">
              Approve a spend plan, watch CRE verify it, and see the payment execute on Base mainnet.
            </p>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-sm font-semibold text-background transition-all hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20"
            >
              Open Interactive Demo
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                <path d="M3 8h10m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </motion.div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border py-8 text-center">
        <p className="text-xs text-text-tertiary">
          BorrowBot — Chainlink CRE Hackathon 2026 · Agents with Treasuries · Built on Base · Aave V3
        </p>
      </footer>
    </div>
  );
}
