"use client";

import { useEffect } from "react";

export default function FlowError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface errors in the browser console for quick debugging during hackathon demos.
    // eslint-disable-next-line no-console
    console.error("[/flow] error", error);
  }, [error]);

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "28px 18px 60px",
        color: "rgba(255,255,255,0.92)",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji"
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.02em" }}>Crypto Treasury Bot</h1>
      <p style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
        The <span style={{ fontFamily: "monospace" }}>/flow</span> page crashed.
      </p>

      <div
        style={{
          marginTop: 14,
          borderRadius: 14,
          padding: 14,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.25)"
        }}
      >
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>Error</div>
        <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 12 }}>{error.message}</div>
        {error.digest ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            digest: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={reset}
          style={{
            cursor: "pointer",
            borderRadius: 12,
            padding: "10px 12px",
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(0,0,0,0.25)",
            color: "rgba(255,255,255,0.9)"
          }}
        >
          Retry
        </button>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", alignSelf: "center" }}>
          Check the terminal running <span style={{ fontFamily: "monospace" }}>yarn web:dev</span> for a stack trace.
        </div>
      </div>
    </main>
  );
}

