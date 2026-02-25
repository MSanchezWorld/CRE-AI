"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useChainId } from "wagmi";

function shortAddr(addr?: string | null) {
  if (!addr) return "not connected";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function MissingPrivy() {
  return (
    <main
      className="wrap"
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "34px 18px 72px"
      }}
    >
      <div
        className="top"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 18px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 18,
          background: "rgba(0, 0, 0, 0.2)",
          backdropFilter: "blur(12px)"
        }}
      >
        <div className="brand" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h1>Crypto Treasury Bot</h1>
          <p>Missing env: NEXT_PUBLIC_PRIVY_APP_ID</p>
        </div>
      </div>
      <div
        className="grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 16,
          marginTop: 16
        }}
      >
        <section
          className="card"
          style={{
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.06)",
            backdropFilter: "blur(12px)",
            padding: 16
          }}
        >
          <h2>Setup</h2>
          <p>
            Add <span className="mono">NEXT_PUBLIC_PRIVY_APP_ID</span> to your environment to enable wallet connect.
          </p>
        </section>
        <aside
          className="card"
          style={{
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.06)",
            backdropFilter: "blur(12px)",
            padding: 16
          }}
        >
          <h2>Demo Visual</h2>
          <p>
            Use the storyboard-style flow page to explain the end-to-end treasury loop in your hackathon video.
          </p>
          <div style={{ marginTop: 12 }}>
            <Link
              className="pill"
              href="/demo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                background: "rgba(0, 0, 0, 0.22)",
                color: "rgba(255, 255, 255, 0.68)",
                fontSize: 12,
                letterSpacing: "0.2px"
              }}
            >
              Open One-Button Demo
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

function AuthedPage() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const chainId = useChainId();

  const walletAddress = user?.wallet?.address ?? null;

  return (
    <main
      className="wrap"
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "34px 18px 72px"
      }}
    >
      <div
        className="top"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 18px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 18,
          background: "rgba(0, 0, 0, 0.2)",
          backdropFilter: "blur(12px)"
        }}
      >
        <div className="brand" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h1>Crypto Treasury Bot</h1>
          <p>Verifiable treasury automation: borrow USDC on Base against BTC collateral using Aave V3.</p>
        </div>
        <div>
          {!ready ? (
            <span className="pill">Loading…</span>
          ) : authenticated ? (
            <button
              onClick={logout}
              style={{
                cursor: "pointer",
                borderRadius: 12,
                padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.25)",
                color: "rgba(255,255,255,0.9)"
              }}
            >
              Logout
            </button>
          ) : (
            <button
              onClick={login}
              style={{
                cursor: "pointer",
                borderRadius: 12,
                padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.16)",
                background:
                  "linear-gradient(135deg, rgba(53,194,255,0.25), rgba(124,255,171,0.14))",
                color: "rgba(255,255,255,0.95)"
              }}
            >
              Connect Wallet (Privy)
            </button>
          )}
        </div>
      </div>

      <div
        className="grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 16,
          marginTop: 16
        }}
      >
        <section
          className="card"
          style={{
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.06)",
            backdropFilter: "blur(12px)",
            padding: 16
          }}
        >
          <h2>Session</h2>
          <div className="row" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <span
              className="pill"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                background: "rgba(0, 0, 0, 0.22)",
                color: "rgba(255, 255, 255, 0.68)",
                fontSize: 12,
                letterSpacing: "0.2px"
              }}
            >
              Address: <span className="mono">{shortAddr(walletAddress)}</span>
            </span>
            <span
              className="pill"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                background: "rgba(0, 0, 0, 0.22)",
                color: "rgba(255, 255, 255, 0.68)",
                fontSize: 12,
                letterSpacing: "0.2px"
              }}
            >
              Chain ID: <span className="mono">{chainId}</span>
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <p>
              Next steps: deploy a per-user <span className="mono">BorrowVault</span> on Base,
              supply BTC collateral (WBTC/cbBTC), set policy, then trigger a spend request that a Chainlink
              CRE workflow executes verifiably.
            </p>
          </div>
          <div style={{ marginTop: 12 }}>
            <Link
              className="pill"
              href="/demo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                background: "rgba(0, 0, 0, 0.22)",
                color: "rgba(255, 255, 255, 0.68)",
                fontSize: 12,
                letterSpacing: "0.2px"
              }}
            >
              Open One-Button Demo
            </Link>
          </div>
        </section>

        <aside
          className="card"
          style={{
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.06)",
            backdropFilter: "blur(12px)",
            padding: 16
          }}
        >
          <h2>Configured Defaults</h2>
          <p>
            Default chain is <span className="mono">Base (8453)</span>. Supported chains include
            <span className="mono"> Base Sepolia (84532)</span> for test/demo.
          </p>
          <div style={{ marginTop: 12 }}>
            <p>
              Lender: <span className="mono">Aave V3</span> (Base mainnet). If you want the MVP strictly testnet,
              we can keep the same vault API and swap in a mock lender on Base Sepolia.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function Page() {
  // Avoid calling Privy hooks when not configured (keeps builds happy).
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <MissingPrivy />;
  return <AuthedPage />;
}
