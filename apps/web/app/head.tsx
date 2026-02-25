const CRITICAL_CSS = `
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

/* ---- /flow fallback (CSS Modules classnames are hashed; match by prefix substring) ---- */
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

[class*="Flow_mono__"] {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
`;

export default function Head() {
  // Hackathon hardening: if /_next/static/css requests are blocked/404 due to proxy/extensions,
  // this critical CSS keeps the demo UI presentable.
  return (
    <>
      <style id="ctb-critical-css" dangerouslySetInnerHTML={{ __html: CRITICAL_CSS }} />
    </>
  );
}

