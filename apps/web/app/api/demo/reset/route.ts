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
  // Never auto-retry after any value-moving tx was broadcast: re-running could duplicate mainnet actions.
  // (Approvals are intentionally excluded because they're idempotent and retry-safe.)
  return (
    s.includes("[swap] tx:") ||
    s.includes("[repay] approve tx:") ||
    s.includes("[repay] repaydebt tx:") ||
    /\[withdraw\].* tx:/i.test(out) ||
    /\[transfer\].*:/i.test(out) ||
    s.includes("reset complete")
  );
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
    [/signer is not vault owner/i, "The DEPLOYER_PRIVATE_KEY must be the vault owner."],
    [/vault is paused/i, "Unpause the vault before resetting."],
    [/insufficient .* to repay|insufficient funds/i, "You need enough USDC to repay debt and enough ETH for gas."],
    [/nonce too low|replacement transaction underpriced/i, "Nonce/fee issue. Wait and retry; if it persists, bump fees."],
    [/temporary internal error|headers timeouterror|bad_data|timeout/i, "RPC instability. Try again or set BASE_RPC_URL_OVERRIDE."]
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

function isAddress(addr: unknown): addr is string {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
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

async function runReset({
  repoRoot,
  confirmMainnet,
  withdrawTo,
  rpcUrl
}: {
  repoRoot: string;
  confirmMainnet: boolean;
  withdrawTo?: string;
  rpcUrl?: string;
}) {
  const args = ["contracts:reset-aave:base"];
  const repoEnv = loadDotEnvFile(path.join(repoRoot, ".env"));
  const env: NodeJS.ProcessEnv = { ...process.env, ...repoEnv };

  if (rpcUrl) env.BASE_RPC_URL = rpcUrl;

  if (confirmMainnet) env.CONFIRM_MAINNET = "YES";
  if (withdrawTo) env.WITHDRAW_TO = withdrawTo;

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
        { ok: false, error: "Reset runner disabled (set ENABLE_RESET_RUNNER=true to enable in production)." },
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
    const withdrawTo = typeof body?.withdrawTo === "string" ? body.withdrawTo.trim() : "";
    if (withdrawTo && !isAddress(withdrawTo)) {
      return NextResponse.json({ ok: false, error: "Invalid withdrawTo" }, { status: 400 });
    }

    const repoRoot = findRepoRoot();
    const explicitRpcOverride = (process.env.BASE_RPC_URL_OVERRIDE || "").trim();
    const rpcCandidates = explicitRpcOverride ? [explicitRpcOverride] : BASE_RPC_CANDIDATES;

    const attempts: any[] = [];
    for (let i = 0; i < rpcCandidates.length; i++) {
      const rpcUrl = rpcCandidates[i]!;
      const res = await runReset({ repoRoot, confirmMainnet, withdrawTo: withdrawTo || undefined, rpcUrl });
      attempts.push({ rpcUrl, ...res });
      if (res.exitCode === 0) {
        return NextResponse.json({ ok: true, confirmMainnet, attempts, ...res }, { status: 200 });
      }

      const tail = `${res.stderr}\n${res.stdout}`.slice(-4000);
      const txSent = looksLikeTxSent(`${res.stdout}\n${res.stderr}`);
      // Never auto-retry if we've already broadcast a tx: re-running could duplicate mainnet actions.
      if (txSent) break;
      if (!looksLikeTransientRpcFailure(tail)) break;
      await sleep(700 + i * 500);
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
