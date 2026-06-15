/*
 * Browser-level smoke test for the Forge UI (browser-preview mode).
 *
 * Drives the real Vite-served app in system Chrome via Playwright
 * (channel: "chrome" — no downloaded browser, keeps the supply-chain
 * surface flat). Tauri APIs are absent in this mode by design; the shell
 * must still paint and must not throw uncaught errors.
 *
 * Two serial scenarios on the same dev server:
 *   1. No backend — the team-auth gate mounts, enforces its disabled-until-
 *      filled contract, and a doomed sign-in fails through the gate's own
 *      error handling (no uncaught errors).
 *   2. Mock team service — an in-process node http mock answers the real
 *      auth wire contract (see scripts/e2e-helpers/team-service-mock.mjs);
 *      the smoke signs in through the form and must reach the conversation
 *      shell (sidebar/nav rail + ProseMirror composer). The codex app-server
 *      is still absent, so the shell's disconnected state is expected — the
 *      assertions don't depend on it.
 *
 * Not part of `npm run test:scripts` (needs Chrome + a dev server):
 * run with `npm run test:e2e`.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startTeamServiceMock, STALE_SESSION_TOKEN } from "./e2e-helpers/team-service-mock.mjs";

const HOST = "127.0.0.1";
const PORT = 5178;
const URL_BASE = `http://${HOST}:${PORT}/`;
const SERVER_BOOT_TIMEOUT_MS = 90_000;
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/*
 * localStorage key for the persisted team-service session. Source of truth:
 * FORGE_DESKTOP_CONFIG_KEYS.teamServiceAuth in
 * packages/ui/src/state/forge-desktop-namespace.ts —
 * desktopForgeKey("teamService", "auth") under the "desktop.hicodex" root.
 * Scenario 2 cross-checks this at runtime: if the booting app never probes
 * the mock's /api/auth/me, the key (or the auth contract) drifted.
 */
const TEAM_SERVICE_AUTH_STORAGE_KEY = "desktop.hicodex.teamService.auth";

function fetchText(target) {
  return new Promise((resolve, reject) => {
    const request = http.get(target, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });
    request.setTimeout(1_000, () => {
      request.destroy(new Error("timeout"));
    });
    request.on("error", reject);
  });
}

async function ensureServer() {
  const existing = await fetchText(URL_BASE).catch(() => null);
  if (existing !== null) {
    if (existing.includes("Forge") || existing.includes("/src/main.tsx")) {
      console.log(`reusing dev server at ${URL_BASE}`);
      return null; // not ours to kill
    }
    throw new Error(`port ${PORT} serves a different app — stop it first`);
  }
  console.log("booting vite dev server…");
  const child = spawn("npm", ["run", "dev:server"], {
    cwd: path.join(repoRoot, "apps/desktop"),
    stdio: "ignore",
    detached: false,
  });
  const deadline = Date.now() + SERVER_BOOT_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error("dev server did not become ready in time");
    }
    const body = await fetchText(URL_BASE).catch(() => null);
    if (body !== null) return child;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Per-page error collectors; console errors stay informational (see below). */
function trackPageErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

// Console errors are informational in browser-preview mode (Tauri APIs are
// intentionally absent); print them so regressions stay visible.
function reportConsoleErrors(label, consoleErrors) {
  if (consoleErrors.length === 0) return;
  console.log(`${label}: console.error lines (informational, ${consoleErrors.length}):`);
  for (const line of consoleErrors.slice(0, 10)) console.log(`  • ${line}`);
}

/** Scenario 1 — no backend: the auth gate itself must be functional. */
async function runGateSmoke(browser, failures) {
  const page = await browser.newPage();
  const { pageErrors, consoleErrors } = trackPageErrors(page);
  try {
    // Aim the gate at a guaranteed-dead port via a stale session, so the doomed
    // sign-in below hits a refused connection (the gate's own error path) and
    // can NEVER reach the real team service (127.0.0.1:5050 in dev) and
    // auto-register a junk account there.
    await page.addInitScript(([key, baseUrl, token]) => {
      localStorage.setItem(key, JSON.stringify({ baseUrl, token }));
    }, [TEAM_SERVICE_AUTH_STORAGE_KEY, "http://127.0.0.1:9", STALE_SESSION_TOKEN]);

    await page.goto(URL_BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // 1) The shell must paint (any hc-prefixed element = the app rendered).
    await page
      .waitForSelector('[class*="hc-"]', { timeout: 30_000 })
      .catch(() => failures.push("scenario 1: shell did not paint any hc-* element within 30s"));

    // 2) Browser preview lands on the team-auth gate (the pre-shell sign-in
    //    screen) — it must mount with its form intact.
    const gateReady = await page
      .waitForSelector(".hc-team-auth-panel", { timeout: 15_000 })
      .then(() => true)
      .catch(() => {
        failures.push("scenario 1: team-auth gate panel did not mount within 15s");
        return false;
      });

    // 3) The first interactive flow must not crash: the submit button is
    //    disabled until both fields are filled (assert that contract), then a
    //    dummy sign-in attempt must surface the gate's own error handling
    //    instead of an uncaught failure (the dead port refuses the connection).
    if (gateReady) {
      const signIn = page.locator(".hc-team-auth-submit");
      if (await signIn.isEnabled().catch(() => true)) {
        failures.push("scenario 1: sign-in button should be disabled while the form is empty");
      }
      // The username input carries no explicit `type` attribute (DOM default
      // "text"), so attribute selectors miss it — address by position.
      await page.locator(".hc-team-auth-form input").first().fill("smoke-user");
      await page.locator('.hc-team-auth-form input[type="password"]').fill("smoke-pass");
      await signIn.click({ timeout: 5_000 }).catch(() => {
        failures.push("scenario 1: sign-in button was not clickable after filling the form");
      });
      await page.waitForTimeout(1_500);

      // Positive contract: a doomed sign-in is handled by the gate — it stays
      // mounted (did NOT unlock to the shell) rather than crashing.
      const stillOnGate = await page.locator(".hc-team-auth-panel").count();
      if (stillOnGate === 0) {
        failures.push("scenario 1: gate unlocked on a doomed sign-in (expected it to stay on the auth screen)");
      }
    }

    // 4) Give late effects a beat, then assert no uncaught errors.
    await page.waitForTimeout(2_000);
    if (pageErrors.length > 0) {
      failures.push(`scenario 1: uncaught page errors:\n  - ${pageErrors.join("\n  - ")}`);
    }
    reportConsoleErrors("scenario 1", consoleErrors);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Scenario 2 — mock team service: sign in through the gate's form and reach
 * the conversation shell.
 *
 * The gate seeds its service URL from the stored session (it only reads
 * `desktop.hicodex.teamService.auth` when a token is present), so the one
 * storage-driven way to aim the sign-in form at the mock is to preseed a
 * session with a stale token: boot probes GET /api/auth/me, the mock 401s it,
 * the gate clears the session and lands on the form with the service URL
 * still pointing at the mock — the real "session expired, sign in again" flow.
 */
async function runAuthedShellSmoke(browser, failures) {
  const mock = await startTeamServiceMock();
  // newPage() creates its own context — storage stays isolated from scenario 1.
  const page = await browser.newPage();
  const { pageErrors, consoleErrors } = trackPageErrors(page);
  try {
    await page.addInitScript(([key, baseUrl, token]) => {
      window.localStorage.setItem(key, JSON.stringify({ baseUrl, token, user: null }));
    }, [TEAM_SERVICE_AUTH_STORAGE_KEY, mock.origin, STALE_SESSION_TOKEN]);

    await page.goto(URL_BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Stale-session probe rejected → the sign-in form appears.
    const gateReady = await page
      .waitForSelector(".hc-team-auth-panel", { timeout: 15_000 })
      .then(() => true)
      .catch(() => {
        failures.push("scenario 2: team-auth gate panel did not mount within 15s");
        return false;
      });
    if (!gateReady) return;

    // Runtime guard against storage-key/contract drift: the boot session
    // check must have reached the mock.
    if (!mock.requests.some((r) => r.method === "GET" && r.path === "/api/auth/me")) {
      failures.push(
        "scenario 2: app never probed the mock /api/auth/me on boot — "
        + "TEAM_SERVICE_AUTH_STORAGE_KEY drifted from forge-desktop-namespace.ts?",
      );
      return;
    }

    // Walk the login form (same selectors as scenario 1).
    await page.locator(".hc-team-auth-form input").first().fill("smoke-user");
    await page.locator('.hc-team-auth-form input[type="password"]').fill("smoke-pass");
    await page.locator(".hc-team-auth-submit").click({ timeout: 5_000 }).catch(() => {
      failures.push("scenario 2: sign-in button was not clickable after filling the form");
    });

    // The gate unlocks once POST /api/auth/token returns the access token.
    const unlocked = await page
      .waitForSelector(".hc-team-auth-panel", { state: "detached", timeout: 20_000 })
      .then(() => true)
      .catch(() => {
        failures.push("scenario 2: auth gate did not unlock within 20s of mock sign-in");
        return false;
      });
    if (!mock.requests.some((r) => r.method === "POST" && r.path === "/api/auth/token")) {
      failures.push("scenario 2: sign-in never hit POST /api/auth/token on the mock");
    }

    if (unlocked) {
      // Conversation shell: sidebar (or the nav rail flanking it) + the
      // ProseMirror composer input (prompt-editor renders contenteditable).
      // codex app-server is absent → disconnected state is expected; neither
      // assertion depends on a live conversation backend.
      await page
        .waitForSelector('[class*="hc-sidebar"], [class*="hc-app-rail"]', { timeout: 30_000 })
        .catch(() => failures.push("scenario 2: sidebar/nav rail did not mount after sign-in"));
      await page
        .waitForSelector('.hc-prompt-editor [contenteditable="true"]', { timeout: 30_000 })
        .catch(() => failures.push("scenario 2: composer contenteditable did not mount after sign-in"));
    }

    // Give late effects a beat (reconnect loop noise is fine), then assert
    // the authed shell threw nothing uncaught.
    await page.waitForTimeout(2_000);
    if (pageErrors.length > 0) {
      failures.push(`scenario 2: uncaught page errors:\n  - ${pageErrors.join("\n  - ")}`);
    }
    reportConsoleErrors("scenario 2", consoleErrors);
  } finally {
    await page.close().catch(() => {});
    await mock.close().catch(() => {});
  }
}

async function main() {
  const server = await ensureServer();
  let browser = null;
  const failures = [];
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    await runGateSmoke(browser, failures);
    await runAuthedShellSmoke(browser, failures);
  } finally {
    await browser?.close().catch(() => {});
    if (server && !server.killed) server.kill("SIGTERM");
  }

  if (failures.length > 0) {
    console.error("\n✗ e2e smoke FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    "✓ e2e smoke passed (scenario 1: gate functional without backend; "
    + "scenario 2: signed in via mock service and reached the conversation shell)",
  );
}

main().catch((error) => {
  console.error(`✗ e2e smoke errored: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
