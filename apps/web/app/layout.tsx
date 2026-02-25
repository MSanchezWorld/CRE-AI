import "./globals.css";

import type { Metadata } from "next";
import Providers from "./providers";

const INLINE_CRITICAL_CSS = `
:root {
  --bg: #0b0f17;
  --panel: rgba(255, 255, 255, 0.06);
  --text: rgba(255, 255, 255, 0.92);
  --muted: rgba(255, 255, 255, 0.68);
  --border: rgba(255, 255, 255, 0.12);
  --accent: #35c2ff;
  --accent2: #7cffab;
}

html, body { height: 100%; }
body {
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(1200px 600px at 20% 10%, rgba(53, 194, 255, 0.22), transparent 55%),
    radial-gradient(900px 500px at 70% 30%, rgba(124, 255, 171, 0.12), transparent 60%),
    radial-gradient(700px 600px at 40% 80%, rgba(255, 255, 255, 0.06), transparent 65%),
    var(--bg);
  font-family: ui-rounded, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
    "Apple Color Emoji", "Segoe UI Emoji";
  letter-spacing: -0.01em;
}
* { box-sizing: border-box; }
a { color: inherit; text-decoration: none; }

.wrap { max-width: 1120px; margin: 0 auto; padding: 34px 18px 72px; }
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(12px);
}
.brand { display: flex; flex-direction: column; gap: 2px; }
.brand h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
.brand p { margin: 0; font-size: 13px; color: var(--muted); }

.grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; margin-top: 16px; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }

.card {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--panel);
  backdrop-filter: blur(12px);
  padding: 16px;
}
.card h2 { margin: 0 0 8px 0; font-size: 14px; letter-spacing: 0.2px; }
.card p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }

.row { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-top: 12px; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.2px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}

/* /demo helpers */
.copyBtn {
  cursor: pointer;
  border-radius: 999px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.18);
  color: rgba(255, 255, 255, 0.68);
  font-size: 11px;
  line-height: 1;
}
.copyBtn:hover { border-color: rgba(53, 194, 255, 0.35); color: rgba(255, 255, 255, 0.82); }

/* Demo board (sketch-like) */
.demoBoard {
  position: relative;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background:
    radial-gradient(520px 240px at 12% 18%, rgba(53, 194, 255, 0.18), transparent 60%),
    radial-gradient(520px 240px at 88% 10%, rgba(124, 255, 171, 0.10), transparent 62%),
    radial-gradient(700px 520px at 50% 120%, rgba(255, 255, 255, 0.06), transparent 60%),
    radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.10) 1px, transparent 1px),
    rgba(0, 0, 0, 0.16);
  background-size: auto, auto, auto, 18px 18px, auto;
  overflow: hidden;
}

.demoBoardGrid {
  display: grid;
  grid-template-columns: 1fr auto 1.35fr auto 1fr;
  gap: 12px;
  align-items: stretch;
}
@media (max-width: 900px) { .demoBoardGrid { grid-template-columns: 1fr; } }

.demoArrow {
  align-self: center;
  justify-self: center;
  font-size: 26px;
  color: rgba(255, 255, 255, 0.34);
  user-select: none;
}
@media (max-width: 900px) { .demoArrow { display: none; } }

.demoBox {
  position: relative;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.22);
  padding: 12px;
  min-height: 176px;
}

.demoBoxTitle {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.2px;
}

.demoBoxAddr {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.52);
  letter-spacing: 0;
}

.demoSectionTitle {
  margin-top: 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.48);
  letter-spacing: 0.32px;
  text-transform: uppercase;
}

.demoKV {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding: 9px 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(0, 0, 0, 0.16);
}

.demoK { font-size: 11px; color: rgba(255, 255, 255, 0.64); }
.demoV { font-size: 12px; color: rgba(255, 255, 255, 0.92); }
.demoDelta { margin-left: 6px; font-size: 11px; color: rgba(124, 255, 171, 0.86); }

.demoHint { margin-top: 10px; font-size: 11px; color: rgba(255, 255, 255, 0.58); line-height: 1.35; }

.demoInAnchor { position: absolute; left: 10px; top: 68px; width: 2px; height: 2px; opacity: 0; }

.demoToken {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: rgba(0, 0, 0, 0.72);
  transition:
    left 900ms cubic-bezier(0.22, 1, 0.36, 1),
    top 900ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease,
    transform 180ms ease;
  pointer-events: none;
  will-change: left, top, opacity, transform;
}

.demoTokenUsdc { background: rgba(53, 194, 255, 0.95); box-shadow: 0 0 0 6px rgba(53, 194, 255, 0.10), 0 12px 28px rgba(53, 194, 255, 0.18); }
.demoTokenEth { background: rgba(124, 255, 171, 0.95); box-shadow: 0 0 0 6px rgba(124, 255, 171, 0.08), 0 12px 26px rgba(124, 255, 171, 0.14); }
.demoTokenBtc { background: rgba(255, 178, 74, 0.95); box-shadow: 0 0 0 6px rgba(255, 178, 74, 0.08), 0 12px 26px rgba(255, 178, 74, 0.14); }
.demoTokenPay { background: rgba(255, 255, 255, 0.92); box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.06), 0 12px 26px rgba(255, 255, 255, 0.10); }

@keyframes demoTokenPop {
  0% { transform: translate(-50%, -50%) scale(1); }
  60% { transform: translate(-50%, -50%) scale(1.42); }
  100% { transform: translate(-50%, -50%) scale(1); }
}

/* /flow fallback (CSS Modules classnames are hashed; match by substring) */
[class*="Flow_cssSentinel__"] {
  position: fixed;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  background: rgb(1, 2, 3);
}

[class*="Flow_actions__"] { display: flex; gap: 10px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
[class*="Flow_link__"] {
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted);
  background: rgba(0, 0, 0, 0.18);
}
[class*="Flow_btn__"] {
  cursor: pointer;
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.9);
}
[class*="Flow_btnPrimary__"] {
  background: linear-gradient(135deg, rgba(53, 194, 255, 0.25), rgba(124, 255, 171, 0.14));
  color: rgba(255, 255, 255, 0.95);
}
[class*="Flow_btn__"]:disabled { opacity: 0.55; cursor: not-allowed; }
[class*="Flow_shell__"] {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(12px);
  overflow: hidden;
}
[class*="Flow_header__"] {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
[class*="Flow_title__"] { display: flex; flex-direction: column; gap: 4px; }
[class*="Flow_title__"] h2 { margin: 0; font-size: 16px; letter-spacing: 0.2px; }
[class*="Flow_title__"] p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.4; }

[class*="Flow_body__"] { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 16px; padding: 16px; }
@media (max-width: 860px) { [class*="Flow_body__"] { grid-template-columns: 1fr; } }

[class*="Flow_formCard__"], [class*="Flow_flow__"] {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  padding: 14px;
}
[class*="Flow_formCard__"] h3, [class*="Flow_flow__"] h3 { margin: 0 0 10px 0; font-size: 14px; }
[class*="Flow_field__"] { display: grid; gap: 6px; margin-top: 10px; }
[class*="Flow_labelRow__"] { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
[class*="Flow_labelRow__"] label { font-size: 12px; color: var(--muted); }
[class*="Flow_hint__"] { font-size: 11px; color: rgba(255, 255, 255, 0.5); }
[class*="Flow_input__"] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.92);
  outline: none;
}
[class*="Flow_input__"]:focus {
  border-color: rgba(53, 194, 255, 0.45);
  box-shadow: 0 0 0 3px rgba(53, 194, 255, 0.12);
}

[class*="Flow_stepList__"] { display: grid; gap: 10px; }
[class*="Flow_step__"] {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.18);
  padding: 12px;
  overflow: hidden;
}
[class*="Flow_stepTop__"] { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[class*="Flow_stepTitle__"] { display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255, 255, 255, 0.92); }
[class*="Flow_badge__"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
}
[class*="Flow_meta__"] { font-size: 11px; color: rgba(255, 255, 255, 0.55); white-space: nowrap; }
[class*="Flow_desc__"] { position: relative; z-index: 1; margin-top: 8px; font-size: 13px; line-height: 1.45; color: rgba(255, 255, 255, 0.68); }
[class*="Flow_log__"] {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.22);
  color: rgba(255, 255, 255, 0.66);
  font-size: 13px;
  line-height: 1.4;
}

[class*="Flow_sectionTitle__"] { margin-top: 14px; font-size: 12px; letter-spacing: 0.2px; color: rgba(255, 255, 255, 0.86); }

[class*="Flow_kvList__"] { display: grid; gap: 8px; margin-top: 10px; }
[class*="Flow_kvRow__"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.2);
}
[class*="Flow_kvKey__"] { font-size: 12px; color: rgba(255, 255, 255, 0.64); }
[class*="Flow_kvVal__"] { font-size: 12px; color: rgba(255, 255, 255, 0.88); }

[class*="Flow_statusOk__"] { color: rgba(124, 255, 171, 0.9); }
[class*="Flow_statusWait__"] { color: rgba(255, 255, 255, 0.62); }
[class*="Flow_statusBad__"] { color: rgba(255, 120, 120, 0.9); }

[class*="Flow_visual__"] {
  margin: 10px 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
[class*="Flow_visualHeader__"] { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 12px 0 12px; }
[class*="Flow_visualTitle__"] { font-size: 12px; letter-spacing: 0.2px; color: rgba(255, 255, 255, 0.92); }
[class*="Flow_visualSub__"] { margin-top: 3px; font-size: 11px; color: rgba(255, 255, 255, 0.6); }
[class*="Flow_visualLegend__"] { display: flex; gap: 10px; align-items: center; justify-content: flex-end; flex-wrap: wrap; font-size: 11px; color: rgba(255, 255, 255, 0.62); }
[class*="Flow_legendItem__"] { display: inline-flex; align-items: center; gap: 6px; }
[class*="Flow_legendDot__"] { width: 8px; height: 8px; border-radius: 999px; }
[class*="Flow_dotUsdc__"] { background: rgba(53, 194, 255, 0.92); box-shadow: 0 0 0 4px rgba(53, 194, 255, 0.12); }
[class*="Flow_dotEth__"] { background: rgba(124, 255, 171, 0.92); box-shadow: 0 0 0 4px rgba(124, 255, 171, 0.1); }
[class*="Flow_dotBtc__"] { background: rgba(255, 178, 74, 0.92); box-shadow: 0 0 0 4px rgba(255, 178, 74, 0.1); }

[class*="Flow_visualCanvas__"] {
  position: relative;
  height: 164px;
  margin: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background:
    radial-gradient(520px 240px at 10% 10%, rgba(53, 194, 255, 0.2), transparent 65%),
    radial-gradient(520px 240px at 90% 10%, rgba(124, 255, 171, 0.1), transparent 65%),
    rgba(0, 0, 0, 0.14);
  overflow: hidden;
}
[class*="Flow_visualRail__"] {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 116px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(53, 194, 255, 0.0), rgba(53, 194, 255, 0.32), rgba(124, 255, 171, 0.18), rgba(255, 255, 255, 0.0));
  opacity: 0.55;
}
[class*="Flow_visualNodes__"] { position: absolute; left: 12px; right: 12px; top: 14px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
[class*="Flow_node__"] { border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 14px; background: rgba(0, 0, 0, 0.16); padding: 9px 10px; min-height: 58px; }
[class*="Flow_nodeTop__"] { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
[class*="Flow_nodeLabel__"] { font-size: 12px; color: rgba(255, 255, 255, 0.9); }
[class*="Flow_nodeStatus__"] { font-size: 11px; color: rgba(255, 255, 255, 0.62); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
[class*="Flow_nodeSub__"] { margin-top: 4px; font-size: 11px; color: rgba(255, 255, 255, 0.55); }
[class*="Flow_nodeActive__"] { border-color: rgba(53, 194, 255, 0.35); background: rgba(0, 0, 0, 0.22); }
[class*="Flow_nodeOk__"] { border-color: rgba(124, 255, 171, 0.24); }
[class*="Flow_nodeWait__"] { border-color: rgba(255, 255, 255, 0.16); }

[class*="Flow_token__"] {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  transition: left 850ms cubic-bezier(0.22, 1, 0.36, 1), top 850ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 220ms ease;
}
[class*="Flow_tokenUsdc__"] { background: rgba(53, 194, 255, 0.95); box-shadow: 0 0 0 6px rgba(53, 194, 255, 0.1), 0 10px 26px rgba(53, 194, 255, 0.16); }
[class*="Flow_tokenEth__"] { background: rgba(124, 255, 171, 0.95); box-shadow: 0 0 0 6px rgba(124, 255, 171, 0.08), 0 10px 26px rgba(124, 255, 171, 0.12); }
[class*="Flow_tokenBtc__"] { background: rgba(255, 178, 74, 0.95); box-shadow: 0 0 0 6px rgba(255, 178, 74, 0.08), 0 10px 26px rgba(255, 178, 74, 0.12); }
[class*="Flow_tokenBorrow__"] { background: rgba(255, 255, 255, 0.88); box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.06), 0 10px 26px rgba(255, 255, 255, 0.08); }
`;

export const metadata: Metadata = {
  title: "Crypto Treasury Bot",
  description: "Verifiable treasury automation on Base using Aave + Chainlink CRE."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Some browser extensions (e.g. Grammarly) inject attributes into <html>/<body> before React hydrates,
    // which can trigger hydration mismatch warnings in dev. This silences those attribute-only mismatches.
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        // Extra-hardening: even if a browser/extension strips <style> tags, these inline styles
        // keep the demo UI readable (avoids "unstyled HTML" screenshots in hackathon videos).
        style={{
          margin: 0,
          color: "rgba(255, 255, 255, 0.92)",
          background:
            "radial-gradient(1200px 600px at 20% 10%, rgba(53, 194, 255, 0.22), transparent 55%)," +
            "radial-gradient(900px 500px at 70% 30%, rgba(124, 255, 171, 0.12), transparent 60%)," +
            "radial-gradient(700px 600px at 40% 80%, rgba(255, 255, 255, 0.06), transparent 65%)," +
            "#0b0f17",
          fontFamily:
            "ui-rounded, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial," +
            '"Apple Color Emoji", "Segoe UI Emoji"',
          letterSpacing: "-0.01em"
        }}
      >
        {/* Hackathon hardening: if /_next/static/css requests are blocked/404 due to proxy/extensions,
            this critical CSS keeps the demo UI presentable. */}
        <style id="ctb-inline-critical" dangerouslySetInnerHTML={{ __html: INLINE_CRITICAL_CSS }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
