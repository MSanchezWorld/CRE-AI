import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || "8787");
const PLAN_SECRET = (process.env.AGENT_PLAN_SECRET || "").trim();

function isAddress(addr) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isUIntString(v) {
  return typeof v === "string" && /^[0-9]+$/.test(v);
}

async function readJson(req, { maxBytes = 1024 * 1024 } = {}) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) throw new Error("Missing JSON body");
  return JSON.parse(raw);
}

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function badRequest(res, message) {
  json(res, 400, { error: message });
}

function unauthorized(res, message) {
  json(res, 401, { error: message });
}

function safeEqual(left, right) {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

function getHeader(req, headerName) {
  const raw = req.headers[headerName];
  if (Array.isArray(raw)) return (raw[0] || "").trim();
  return String(raw || "").trim();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      return json(res, 200, { ok: true, name: "borrowbot-agent" });
    }

    if (req.method === "POST" && req.url === "/plan") {
      if (PLAN_SECRET) {
        const provided = getHeader(req, "x-agent-secret");
        if (!provided) return unauthorized(res, "Missing x-agent-secret");
        if (!safeEqual(provided, PLAN_SECRET)) return unauthorized(res, "Invalid x-agent-secret");
      }

      const input = await readJson(req);

      const spendRequest = input?.spendRequest;
      const vault = input?.vault;

      const borrowAsset = spendRequest?.borrowAsset;
      const borrowAmount = String(spendRequest?.borrowAmount ?? "");
      const payee = spendRequest?.payee;

      if (!isAddress(borrowAsset)) return badRequest(res, "Invalid spendRequest.borrowAsset");
      if (!isAddress(payee)) return badRequest(res, "Invalid spendRequest.payee");
      if (!isUIntString(borrowAmount) || borrowAmount === "0") return badRequest(res, "Invalid spendRequest.borrowAmount");

      const currentNonce = String(vault?.currentNonce ?? "");
      if (currentNonce && !isUIntString(currentNonce)) return badRequest(res, "Invalid vault.currentNonce");

      // Minimal MVP agent:
      // - Echoes the spend request as an Action Plan proposal.
      // - CRE workflow + onchain vault enforce all hard safety constraints.
      const plan = {
        borrowAsset,
        borrowAmount,
        payee,
        rationale: currentNonce
          ? `Echo plan (vault currentNonce=${currentNonce}); safety enforced by CRE + onchain vault`
          : "Echo plan; safety enforced by CRE + onchain vault",
        confidence: 0.9
      };

      console.log("[agent] plan", plan);
      return json(res, 200, plan);
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[agent] error", err);
    json(res, 500, { error: "Internal error" });
  }
});

server.listen(PORT, HOST, () => {
  if (!PLAN_SECRET) {
    console.warn("[agent] AGENT_PLAN_SECRET is not set; /plan is unauthenticated");
  }
  console.log(`[agent] listening on http://${HOST}:${PORT}`);
});
