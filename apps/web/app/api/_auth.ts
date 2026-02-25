import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function safeEqual(left: string, right: string) {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

type SecretGuardOpts = {
  envVar: string;
  headerName: string;
  allowInDevWithoutSecret: boolean;
};

// Enforces a shared secret when configured, and always requires one in production.
export function requireSharedSecret(req: Request, opts: SecretGuardOpts): NextResponse | null {
  const expected = (process.env[opts.envVar] || "").trim();
  const isProd = process.env.NODE_ENV === "production";

  if (!expected) {
    if (isProd || !opts.allowInDevWithoutSecret) {
      return NextResponse.json(
        { ok: false, error: `Server misconfigured: missing ${opts.envVar}` },
        { status: 500 }
      );
    }
    return null;
  }

  const provided = (req.headers.get(opts.headerName) || "").trim();
  if (!provided) {
    return NextResponse.json({ ok: false, error: `Missing ${opts.headerName}` }, { status: 401 });
  }
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: `Invalid ${opts.headerName}` }, { status: 401 });
  }
  return null;
}
