import { NextResponse } from "next/server";
import { requireSharedSecret } from "../../_auth";

export const runtime = "nodejs";

function isAddress(addr: unknown): addr is string {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isUIntString(v: unknown): v is string {
  return typeof v === "string" && /^[0-9]+$/.test(v);
}

function isUsdcHuman(v: unknown): v is string {
  return typeof v === "string" && /^[0-9]+(\.[0-9]{0,6})?$/.test(v.trim());
}

// Minimal deterministic "agent" endpoint.
// CRE workflow calls this over HTTP; the vault + workflow enforce safety constraints.
export async function POST(req: Request) {
  try {
    const authErr = requireSharedSecret(req, {
      envVar: "AGENT_PLAN_SECRET",
      headerName: "x-agent-secret",
      allowInDevWithoutSecret: true
    });
    if (authErr) return authErr;

    const input = (await req.json()) as any;
    const spendRequest = input?.spendRequest;
    const treasuryPlan = input?.treasuryPlan;
    const vault = input?.vault;

    const borrowAsset = spendRequest?.borrowAsset;
    const borrowAmount = String(spendRequest?.borrowAmount ?? "");
    const payee = spendRequest?.payee;

    if (!isAddress(borrowAsset)) {
      return NextResponse.json({ error: "Invalid spendRequest.borrowAsset" }, { status: 400 });
    }
    if (!isAddress(payee)) {
      return NextResponse.json({ error: "Invalid spendRequest.payee" }, { status: 400 });
    }
    if (!isUIntString(borrowAmount) || borrowAmount === "0") {
      return NextResponse.json({ error: "Invalid spendRequest.borrowAmount" }, { status: 400 });
    }

    const currentNonce = String(vault?.currentNonce ?? "");
    if (currentNonce && !isUIntString(currentNonce)) {
      return NextResponse.json({ error: "Invalid vault.currentNonce" }, { status: 400 });
    }

    const depositRaw = String(treasuryPlan?.depositUsdc ?? "");
    const depositHuman = String(treasuryPlan?.depositHuman ?? "");
    const depositNote = isUsdcHuman(depositHuman)
      ? `deposit=${depositHuman} USDC`
      : isUIntString(depositRaw)
        ? `depositRaw=${depositRaw}`
        : "";

    // Deterministic MVP agent:
    // - Echoes the spend request as an action plan proposal.
    // - Adds a short rationale string for UX.
    const plan = {
      borrowAsset,
      borrowAmount,
      payee,
      rationale: currentNonce
        ? `Echo plan (vault currentNonce=${currentNonce}${depositNote ? `; ${depositNote}` : ""}); safety enforced by CRE + onchain vault`
        : `Echo plan${depositNote ? ` (${depositNote})` : ""}; safety enforced by CRE + onchain vault`,
      confidence: 0.9
    };

    return NextResponse.json(plan);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", message: msg }, { status: 500 });
  }
}
