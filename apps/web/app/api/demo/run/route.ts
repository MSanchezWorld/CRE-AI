import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireSharedSecret } from "../../_auth";

export const runtime = "nodejs";

function isAddress(addr: unknown): addr is string {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function toUIntString(v: unknown): string | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) return null;
    return String(v);
  }
  if (typeof v === "string" && /^[0-9]+$/.test(v)) return v;
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
  // Fallback: two levels up from apps/web.
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

async function runCreWorkflow({
  repoRoot,
  payee,
  borrowAmount,
  depositAmount,
  broadcast
}: {
  repoRoot: string;
  payee: string;
  borrowAmount: string;
  depositAmount: string | null;
  broadcast: boolean;
}) {
  const creBin = process.env.CRE_BIN?.trim() || path.join(os.homedir(), ".cre", "bin", "cre");
  if (!fs.existsSync(creBin)) {
    throw new Error(`CRE binary not found at ${creBin}`);
  }

  // This payload becomes the CRE workflow's HTTP trigger input. Keep it strictly JSON-serializable.
  const httpPayload = JSON.stringify({ payee, borrowAmount, depositAmount });

  const args = [
    "workflow",
    "simulate",
    "./workflows/borrowbot-borrow-and-pay",
    "-R",
    "./cre",
    "-T",
    "mainnet-settings",
    ...(broadcast ? ["--broadcast"] : []),
    "--non-interactive",
    "--trigger-index",
    "0",
    "--http-payload",
    httpPayload
  ];

  const repoEnv = loadDotEnvFile(path.join(repoRoot, ".env"));
  const env = { ...process.env, ...repoEnv };

  const startedAtMs = Date.now();
  const child = spawn(creBin, args, { cwd: repoRoot, env });

  // Keep the response small to avoid blowing up the API response.
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
    const enabled = process.env.ENABLE_DEMO_RUNNER === "true" || process.env.NODE_ENV !== "production";
    if (!enabled) {
      return NextResponse.json(
        { ok: false, error: "Demo runner disabled (set ENABLE_DEMO_RUNNER=true to enable in production)." },
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
    const payee = body?.payee;
    const borrowAmount = toUIntString(body?.borrowAmount);
    const depositAmount = body?.depositAmount == null ? null : toUIntString(body?.depositAmount);
    const broadcast = body?.broadcast !== false;

    if (!isAddress(payee)) {
      return NextResponse.json({ error: "Invalid payee" }, { status: 400 });
    }
    if (!borrowAmount || borrowAmount === "0") {
      return NextResponse.json({ error: "Invalid borrowAmount (expected integer string in token units)" }, { status: 400 });
    }
    if (body?.depositAmount != null && !depositAmount) {
      return NextResponse.json({ error: "Invalid depositAmount (expected integer string in token units)" }, { status: 400 });
    }

    const repoRoot = findRepoRoot();
    const res = await runCreWorkflow({ repoRoot, payee, borrowAmount, depositAmount, broadcast });

    const ok = res.exitCode === 0;
    return NextResponse.json({ ok, ...res }, { status: ok ? 200 : 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
