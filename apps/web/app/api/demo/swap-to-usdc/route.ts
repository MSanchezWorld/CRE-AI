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
  // Approvals are safe/idempotent; only consider a swap tx as "sent" for retry safety.
  return s.includes("[swap] tx:");
}

function extractErrorSummary(stdout: string, stderr: string): string {
  const combined = `${stderr}\n${stdout}`;
  const lines = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (/\[error summary\]/i.test(l)) return l.replace(/^\[error summary\]\s*/i, "");
  }

  const patterns: Array<[RegExp, string]> = [
    [/insufficient funds/i, "Insufficient ETH for gas. Fund the signer with Base ETH."],
    [/failed to query uniswap v3 pools|bad_data/i, "RPC returned invalid data querying pools. Try again or set BASE_RPC_URL_OVERRIDE to a more reliable endpoint."],
    [/no uniswap v3 pool/i, "No Uniswap V3 pool found for this swap pair on Base."],
    [/too little received|slippage/i, "Swap slippage too tight. Increase SLIPPAGE_BPS (e.g. 200)."],
    [/nonce too low|replacement transaction underpriced/i, "Nonce/fee issue. Wait and retry; if it persists, bump fees."],
    [/execution reverted|revert/i, "Transaction would revert. See the output tail for the reason."]
  ];

  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    for (const [re, hint] of patterns) {
      if (re.test(l)) return `${l} (hint: ${hint})`;
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (!/^\s*at\s+/.test(l)) return l;
  }
  return "Unknown failure (no error message captured)";
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

async function runSwap({
  repoRoot,
  confirmMainnet,
  rpcUrl
}: {
  repoRoot: string;
  confirmMainnet: boolean;
  rpcUrl?: string;
}) {
  const args = ["contracts:swap-to-usdc:base"];
  const repoEnv = loadDotEnvFile(path.join(repoRoot, ".env"));
  const env: NodeJS.ProcessEnv = { ...process.env, ...repoEnv };

  // Reliability: allow the route to supply a chosen RPC per attempt.
  if (rpcUrl) env.BASE_RPC_URL = rpcUrl;

  if (confirmMainnet) env.CONFIRM_MAINNET = "YES";
  // Demo-friendly default: if not set, allow a bit more slippage for small swaps.
  if (!String(env.SLIPPAGE_BPS || "").trim()) env.SLIPPAGE_BPS = "200";

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
    // Safety: default to dev-only. In production, require an explicit env flag.
    const enabled = process.env.ENABLE_RESET_RUNNER === "true" || process.env.NODE_ENV !== "production";
    if (!enabled) {
      return NextResponse.json(
        { ok: false, error: "Swap runner disabled (set ENABLE_RESET_RUNNER=true to enable in production)." },
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

    const explicitRpcOverride = (process.env.BASE_RPC_URL_OVERRIDE || "").trim();
    const rpcCandidates = explicitRpcOverride ? [explicitRpcOverride] : BASE_RPC_CANDIDATES;

    const repoRoot = findRepoRoot();
    const attempts: any[] = [];
    for (let i = 0; i < rpcCandidates.length; i++) {
      const rpcUrl = rpcCandidates[i]!;
      const res = await runSwap({ repoRoot, confirmMainnet, rpcUrl });
      attempts.push({ rpcUrl, ...res });
      if (res.exitCode === 0) {
        return NextResponse.json({ ok: true, confirmMainnet, attempts, ...res }, { status: 200 });
      }

      const tail = `${res.stderr}\n${res.stdout}`.slice(-4000);
      const txSent = looksLikeTxSent(`${res.stdout}\n${res.stderr}`);
      if (txSent) break;
      if (!looksLikeTransientRpcFailure(tail) && i === rpcCandidates.length - 1) break;
      await sleep(600 + i * 450);
    }

    const last = attempts[attempts.length - 1] || { exitCode: 1, stdout: "", stderr: "" };
    const summary = extractErrorSummary(String(last.stdout || ""), String(last.stderr || ""));
    const txSent = looksLikeTxSent(`${String(last.stdout || "")}\n${String(last.stderr || "")}`);
    return NextResponse.json({ ok: false, confirmMainnet, attempts, summary, txSent, ...last }, { status: 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
