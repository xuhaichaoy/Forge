/*
 * Headless rendering verification for the HiCodex theme/CSS.
 *
 * WHY: container-background dark-mode gaps (a card hardcodes a light bg with no
 * `[data-theme="dark"]` override → white card + invisible text on dark) are
 * invisible to grep/text audits but obvious in a screenshot. Run this after any
 * theme/CSS change to catch them.
 *
 * SETUP (one-time, not committed — playwright is installed --no-save):
 *   npm i playwright --no-save && npx playwright install chromium
 *
 * RUN (after `npm run build` so the built CSS is current):
 *   node packages/ui/scripts/visual-verify.mjs
 *   → writes /tmp/hc-light.png + /tmp/hc-dark.png ; open / Read them.
 *
 * NOTE: this renders representative markup with the real `hc-` classes + the
 * BUILT css to verify HiCodex's own rendering (readability, no white cards,
 * token colors). It is NOT a pixel diff against Codex.app (no access to that).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const require = createRequire(path.join(repoRoot, "/"));
const { chromium } = require("playwright");

const assetsDir = path.join(repoRoot, "apps/desktop/dist/assets");
const cssFile = fs.readdirSync(assetsDir).find((f) => f.endsWith(".css"));
if (!cssFile) throw new Error("No built CSS found — run `npm run build` first.");
const css = fs.readFileSync(path.join(assetsDir, cssFile), "utf8");
console.log("using CSS:", cssFile);

// Representative transcript / right-rail / popup markup (real hc- classes). Add
// more surfaces here as needed; the color/border rules are class-based so they
// apply faithfully even without the exact live DOM nesting.
const body = `
<div class="hc-conversation-scroll" style="padding:24px;max-width:760px;margin:0 auto;">
  <article class="hc-message-unit hc-assistant-message">
    <div class="hc-markdown">
      <h2>Assistant heading (primary text)</h2>
      <p>Body paragraph at primary text color — main answer prose.</p>
      <p>Inline <code>code span</code> and a <a href="#">link</a> inside prose.</p>
    </div>
    <div class="hc-message-actions"><span class="hc-message-time">just now · secondary</span></div>
  </article>
  <article class="hc-tool-block activity" style="margin-top:16px;"><button class="hc-tool-summary"><span class="hc-tool-summary-icon">▸</span><span class="hc-tool-summary-label">Ran command</span> <small>3 files · secondary</small></button></article>
  <div class="hc-exec-shell" style="margin-top:12px;">
    <div class="hc-exec-shell-header"><span>Shell</span></div>
    <div class="hc-exec-shell-command-row"><div class="hc-exec-shell-command">$ npm run build</div><button class="hc-exec-shell-copy-button hc-exec-shell-command-copy">⧉</button></div>
    <div class="hc-exec-shell-output-wrap"><pre class="hc-exec-shell-output">✓ built in 5.2s
output — muted/secondary on a muted surface</pre><button class="hc-exec-shell-copy-button hc-exec-shell-output-copy">⧉</button></div>
    <div class="hc-exec-shell-footer" data-exec-status="success">Exit 0</div>
  </div>
  <div class="hc-tool-detail-stack tool" style="margin-top:12px;">
    <div class="hc-tool-detail-line"><span class="hc-tool-detail-title">github:create_issue</span></div>
    <div class="hc-tool-error-callout" role="alert"><div class="hc-tool-error-callout-body">MCP tool error: connection refused — danger callout (red-tinted box; body text must stay readable in BOTH themes).</div></div>
  </div>
  <article class="hc-tool-block hc-turn-diff" style="margin-top:12px;">
    <div class="hc-turn-diff-header hc-turn-diff-header--with-hover"><span class="hc-turn-diff-header-icon">▤</span><div class="hc-turn-diff-header-text"><span class="hc-turn-diff-title">Edited 2 files</span><span class="hc-turn-diff-subtitle"><span class="hc-turn-diff-added">+12</span> <span class="hc-turn-diff-removed">-3</span></span></div></div>
    <div class="hc-turn-diff-files"><button class="hc-turn-diff-file-row"><span>app.tsx</span></button><button class="hc-turn-diff-file-row"><span>base.css</span></button></div>
    <button class="hc-turn-diff-expand-files"><span>Show 1 more file</span></button>
  </article>
  <div class="hc-inline-plan-card" style="margin-top:12px;"><button class="hc-inline-plan-header"><span class="hc-inline-plan-header-icon">▾</span> Plan</button><div class="hc-inline-plan-row"><span class="hc-inline-plan-index">1.</span><span class="hc-inline-plan-step">First step</span></div><div class="hc-inline-plan-row"><span class="hc-inline-plan-index">2.</span><span class="hc-inline-plan-step" data-status="completed">Completed step</span></div></div>
  <div class="hc-rail-card" style="margin-top:12px;border:1px solid var(--hc-border-default);border-radius:10px;padding:10px;"><div class="hc-rail-card-title">Rail card title (primary)</div><div class="hc-rail-card-meta">meta · secondary</div><div class="hc-rail-card-status">status · accent</div></div>
  <div class="hc-side-panel-tab-bar" style="margin-top:12px;"><div class="hc-side-panel-tab-bar__strip"><div class="hc-side-panel-tab-pill" data-active="true"><button class="hc-side-panel-tab-pill__button"><span class="hc-side-panel-tab-pill__icon">◆</span><span class="hc-side-panel-tab-pill__title-wrap"><span class="hc-side-panel-tab-pill__title">A very long active tab title that overflows</span><span class="hc-side-panel-tab-pill__title-fade"></span></span></button><button class="hc-side-panel-tab-pill__close" style="display:inline-flex;">✕</button></div><div class="hc-side-panel-tab-pill"><button class="hc-side-panel-tab-pill__button"><span class="hc-side-panel-tab-pill__title-wrap"><span class="hc-side-panel-tab-pill__title">Another tab</span><span class="hc-side-panel-tab-pill__title-fade"></span></span></button></div></div><div class="hc-side-panel-tab-bar__after-sticky"><button class="hc-side-panel-tab-bar-button">+</button></div></div>
  <div class="hc-onboarding-empty" data-onboarding-empty="true" style="min-height:auto;padding:24px;"><div class="hc-onboarding-empty-content"><div class="hc-onboarding-empty-copy"><h2 class="hc-onboarding-empty-headline">What should we work on in <button type="button" class="hc-onboarding-empty-project-trigger">haichao?</button></h2></div></div></div>
  <div style="margin-top:8px;max-width:240px;">
    <button class="hc-sidebar-nav-item"><span class="hc-sidebar-nav-icon">▸</span><span class="hc-sidebar-nav-label">New chat</span><span class="hc-sidebar-nav-accelerator">⌘N</span></button>
    <button class="hc-project-row"><span class="hc-sidebar-group-chevron">▾</span><span style="margin:0 6px;">▦</span><span class="hc-project-name">src-tauri</span></button>
    <div class="hc-sidebar-footer" style="margin-top:8px;"><div class="hc-sidebar-account"><button class="hc-sidebar-account-trigger"><span class="hc-sidebar-account-avatar">H</span><span class="hc-sidebar-account-label">Settings</span></button></div></div>
  </div>
  <div class="hc-composer-field" style="margin-top:12px;padding:8px;display:flex;gap:6px;align-items:center;"><button class="hc-composer-footer-chip hc-composer-footer-project-chip">▦ haichao ▾</button><button class="hc-composer-footer-chip">Auto</button><button class="hc-composer-footer-chip">Medium</button></div>
  <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;"><button class="hc-request-action ghost">Cancel <kbd>Esc</kbd></button><button class="hc-request-action primary">Allow <kbd>⏎</kbd></button></div>
  <div style="margin-top:12px;font-size:14px;font-weight:430;">Sources (icon-only row):</div>
  <div class="hc-rail-sources-icons"><span class="hc-rail-source-icon" title="example.com">◐</span><span class="hc-rail-source-icon" title="docs.site">◑</span><span class="hc-rail-source-icon" title="web">◒</span></div>
  <div class="hc-tool-block" style="margin-top:12px;padding:10px;">Non-activity tool block</div>
  <div class="hc-tool-raw-output-dialog" style="margin-top:12px;padding:12px;"><header><h2>Raw output dialog</h2></header><pre>dialog body</pre></div>
  <label style="display:block;margin-top:12px;">Feedback:<textarea class="hc-turn-feedback-textarea" style="width:100%;min-height:48px;">feedback text</textarea></label>
  <div style="margin-top:12px;display:flex;gap:8px;">
    <button class="hc-button">Secondary button</button>
    <button class="hc-button hc-button-primary">Primary button</button>
    <button class="hc-mini-button">Mini / Close</button>
  </div>
  <div class="hc-thread-menu" style="position:static;margin-top:12px;padding:6px;width:200px;">
    <div style="padding:6px 8px;color:var(--hc-text-primary)">Thread menu item</div>
    <div style="padding:6px 8px;color:var(--hc-text-secondary)">menu secondary</div>
  </div>

  <p style="margin-top:12px;color:var(--hc-text-secondary)">Secondary token sample</p>
  <p style="color:var(--hc-text-tertiary)">Tertiary token sample</p>
  <p style="border-top:1px solid var(--hc-border-default);padding-top:8px;color:var(--hc-text-primary)">Primary after a default border ↑</p>
</div>`;

const page = (theme) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{margin:0}</style></head><body data-hc-theme="${theme}"><div class="hc-app" data-theme="${theme}" style="display:block;min-height:100vh;background:var(--hc-surface-app)">${body}</div></body></html>`;

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const p = await browser.newPage({ viewport: { width: 840, height: 1200 }, deviceScaleFactor: 2 });
  await p.setContent(page(theme), { waitUntil: "networkidle" });
  await p.screenshot({ path: `/tmp/hc-${theme}.png`, fullPage: true });
  console.log(`shot /tmp/hc-${theme}.png`);
  await p.close();
}
await browser.close();
