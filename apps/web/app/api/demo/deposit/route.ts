import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requireSharedSecret } from "../../_auth";

export const runtime = "nodejs";

const BASE_RPC_CANDIDATES = [
  // Base's official RPC can rate-limit (429) during hackathon traffic. These tend to be more stable for demos.
  "https://base.drpc.org",
  "https://base-rpc.publicnode.com",
  "https://base.publicnode.com",
  "https://mainnet.base.org"
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeTransientRpcFailure(out: string): boolean {
  const s = out.toLowerCase();
  return (
    s.includes("temporary internal error") ||
    s.includes("headers timeouterror") ||
    s.includes("headers_timeout") ||
    s.includes("etimedout") ||
    s.includes("econnreset") ||
    s.includes("socket hang up") ||
    s.includes("429") ||
    s.includes("rate limit") ||
    s.includes("bad_data") ||
    s.includes("timeout") ||
    s.includes("undici") ||
    s.includes("fetch failed")
  );
}

function looksLikeTxSent(out: string): boolean {
  const s = out.toLowerCase();
  // Only treat value-moving txs as "sent". Approvals are idempotent and safe to retry, but swaps/supplies
  // could duplicate value transfers if re-run.
  return s.includes("[swap] tx:") || s.includes("[supply] tx:");
}

function extractErrorSummary(stdout: string, stderr: string): string {
  const combined = `${stderr}\n${stdout}`;
  const lines = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer explicit summaries from our scripts if present.
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (/\[error summary\]/i.test(l)) return l.replace(/^\[error summary\]\s*/i, "");
  }

  // Otherwise find the last useful error-looking line.
  const patterns: Array<[RegExp, string]> = [
    [/insufficient funds/i, "Insufficient ETH for gas. Fund the signer with Base ETH."],
    [/too little received|slippage/i, "Swap slippage too tight. Increase SLIPPAGE_BPS (e.g. 200)."],
    [/no uniswap v3 pool/i, "No Uniswap V3 pool found for this swap pair on Base."],
    [/failed to query uniswap v3 pools/i, "RPC returned invalid data querying pools. Try again or use a different BASE_RPC_URL_OVERRIDE."],
    [/nonce too low|replacement transaction underpriced/i, "Nonce/fee issue. Wait a moment and retry; if it persists, reset nonce or bump fees."],
    [/execution reverted|revert/i, "Transaction would revert. Expand the technical details to see the underlying reason."]
  ];

  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    for (const [re, hint] of patterns) {
      if (re.test(l)) return `${l} (hint: ${hint})`;
    }
  }

  // Fallback: return the last non-stack line if possible.
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (!/^\s*at\s+/.test(l)) return l;
  }
  return "Unknown failure (no error message captured)";
}

function toUIntString(v: unknown): string | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) return null;
    return String(v);
  }
  if (typeof v === "string" && /^[0-9]+$/.test(v.trim())) return v.trim();
  return null;
}

function findRepoRoot(): string {
  // In dev, Next runs with cwd at apps/web. In case it's different, search upwards for `cre/project.yaml`.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "cre", "project.yaml");
    if (fs.existsSync(candidate)) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), "..", "..");
}

function loadDotEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  const raw = fs.readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!key) continue;
    out[key] = val;
  }
  return out;
}

async function runDeposit({
  repoRoot,
  confirmMainnet,
  depositMode,
  depositAmount,
  allocEthBps,
  allocBtcBps,
  rpcUrl
}: {
  repoRoot: string;
  confirmMainnet: boolean;
  depositMode: "usdc" | "eth_btc";
  depositAmount: string;
  allocEthBps?: string | null;
  allocBtcBps?: string | null;
  rpcUrl?: string;
}) {
  const args = [depositMode === "eth_btc" ? "contracts:deposit-swap:base" : "contracts:deposit:base"];
  const repoEnv = loadDotEnvFile(path.join(repoRoot, ".env"));
  const env: NodeJS.ProcessEnv = { ...process.env, ...repoEnv };

  if (rpcUrl) env.BASE_RPC_URL = rpcUrl;
  if (confirmMainnet) env.CONFIRM_MAINNET = "YES";
  // Demo-friendly default: if not set, allow a bit more slippage to reduce flaky revert-on-estimateGas.
  if (!String(env.SLIPPAGE_BPS || "").trim()) env.SLIPPAGE_BPS = "200";
  // The workspace scripts set the safe defaults for DEPOSIT_MODE/ALLOW_SWAP_DEPOSIT.
  // We still pass through mode and allocation so the CLI output is self-describing.
  env.DEPOSIT_MODE = depositMode;
  env.ALLOW_SWAP_DEPOSIT = depositMode === "eth_btc" ? "true" : "false";
  env.DEPOSIT_AMOUNT = depositAmount;
  if (allocEthBps) env.ALLOC_ETH_BPS = allocEthBps;
  if (allocBtcBps) env.ALLOC_BTC_BPS = allocBtcBps;

  const startedAtMs = Date.now();
  const child = spawn("yarn", args, { cwd: repoRoot, env });

  const MAX = 24_000;
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (d) => {
    stdout += String(d);
    if (stdout.length > MAX) stdout = stdout.slice(-MAX);
  });
  child.stderr.on("data", (d) => {
    stderr += String(d);
    if (stderr.length > MAX) stderr = stderr.slice(-MAX);
  });

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  const finishedAtMs = Date.now();
  return { startedAtMs, finishedAtMs, exitCode, stdout, stderr };
}

export async function POST(req: Request) {
  try {
    const enabled = process.env.ENABLE_RESET_RUNNER === "true" || process.env.NODE_ENV !== "production";
    if (!enabled) {
      return NextResponse.json(
        { ok: false, error: "Deposit runner disabled (set ENABLE_RESET_RUNNER=true to enable in production)." },
        { status: 403 }
      );
    }

    const authErr = requireSharedSecret(req, {
      envVar: "DEMO_RUNNER_SECRET",
      headerName: "x-demo-runner-secret",
      allowInDevWithoutSecret: true
    });
    if (authErr) return authErr;

    const body = (await req.json()) as any;
    const confirmMainnet = body?.confirmMainnet === true;
    const depositModeRaw = String(body?.depositMode || "usdc").trim().toLowerCase();
    const depositMode = depositModeRaw === "eth_btc" ? "eth_btc" : depositModeRaw === "usdc" ? "usdc" : null;
    if (!depositMode) {
      return NextResponse.json({ ok: false, error: "Invalid depositMode (expected \"usdc\" or \"eth_btc\")" }, { status: 400 });
    }
    const depositAmount = toUIntString(body?.depositAmount);
    if (!depositAmount || depositAmount === "0") {
      return NextResponse.json({ ok: false, error: "Invalid depositAmount (expected integer string in token units)" }, { status: 400 });
    }

    const allocEthBps = body?.allocEthBps == null ? null : toUIntString(body.allocEthBps);
    const allocBtcBps = body?.allocBtcBps == null ? null : toUIntString(body.allocBtcBps);
    if (body?.allocEthBps != null && !allocEthBps) {
      return NextResponse.json({ ok: false, error: "Invalid allocEthBps" }, { status: 400 });
    }
    if (body?.allocBtcBps != null && !allocBtcBps) {
      return NextResponse.json({ ok: false, error: "Invalid allocBtcBps" }, { status: 400 });
    }

    const repoRoot = findRepoRoot();
    const explicitRpcOverride = (process.env.BASE_RPC_URL_OVERRIDE || "").trim();
    const rpcCandidates = explicitRpcOverride ? [explicitRpcOverride] : BASE_RPC_CANDIDATES;

    const attempts: any[] = [];
    for (let i = 0; i < rpcCandidates.length; i++) {
      const rpcUrl = rpcCandidates[i]!;
      const res = await runDeposit({ repoRoot, confirmMainnet, depositMode, depositAmount, allocEthBps, allocBtcBps, rpcUrl });
      attempts.push({ rpcUrl, ...res });
      if (res.exitCode === 0) {
        return NextResponse.json(
          { ok: true, confirmMainnet, depositMode, depositAmount, allocEthBps, allocBtcBps, attempts, ...res },
          { status: 200 }
        );
      }

      const tail = `${res.stderr}\n${res.stdout}`.slice(-4000);
      const txSent = looksLikeTxSent(`${res.stdout}\n${res.stderr}`);
      const transient = looksLikeTransientRpcFailure(tail);

      // Never auto-retry if we've already broadcast a tx: re-running the script could duplicate
      // swaps/supplies on mainnet. Only retry when nothing was sent (estimateGas/quote failures).
      if (txSent) break;
      await sleep(700 + i * 500);
    }

    const last = attempts[attempts.length - 1] || { exitCode: 1, stdout: "", stderr: "" };
    const summary = extractErrorSummary(String(last.stdout || ""), String(last.stderr || ""));
    const txSent = looksLikeTxSent(`${String(last.stdout || "")}\n${String(last.stderr || "")}`);
    return NextResponse.json(
      { ok: false, confirmMainnet, depositMode, depositAmount, allocEthBps, allocBtcBps, attempts, summary, txSent, ...last },
      { status: 500 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
