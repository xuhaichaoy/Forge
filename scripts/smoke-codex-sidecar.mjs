import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sidecarBin =
  process.env.HICODEX_CODEX_BIN ||
  resolve(
    root,
    "apps/desktop/src-tauri/binaries",
    process.platform === "win32" ? "codex.exe" : "codex",
  );
const smokeTimeoutMs = positiveInt(process.env.HICODEX_SIDECAR_SMOKE_TIMEOUT_MS, 1500);
const versionTimeoutMs = positiveInt(process.env.HICODEX_SIDECAR_VERSION_TIMEOUT_MS, 5000);
const protocolTimeoutMs = positiveInt(process.env.HICODEX_SIDECAR_PROTOCOL_TIMEOUT_MS, 5000);

function positiveInt(raw, fallback) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function snippet(value, limit = 2000) {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function requireSidecar() {
  if (!existsSync(sidecarBin)) {
    throw new Error(`Codex sidecar binary not found: ${sidecarBin}`);
  }
}

function smokeEnv(tempRoot) {
  const home = join(tempRoot, "home");
  const codexHome = join(tempRoot, "codex-home");
  mkdirSync(home, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  const env = {
    CODEX_HOME: codexHome,
    HOME: home,
    NO_COLOR: "1",
  };
  for (const name of ["PATH", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

function checkVersion(env) {
  const result = spawnSync(sidecarBin, ["--version"], {
    encoding: "utf8",
    env,
    timeout: versionTimeoutMs,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Codex sidecar --version failed with status ${result.status}.\n` +
        `stdout:\n${snippet(result.stdout)}\n` +
        `stderr:\n${snippet(result.stderr)}`,
    );
  }
  return `${result.stdout}${result.stderr}`.trim();
}

function initializeRequest() {
  return {
    id: "hicodex-smoke-initialize",
    method: "initialize",
    params: {
      clientInfo: {
        name: "hicodex_smoke",
        title: "HiCodex Smoke",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    },
  };
}

function initializedNotification() {
  return { method: "initialized" };
}

function writeJsonLine(child, payload) {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

function expectedCodexHome(env) {
  return canonicalPath(env.CODEX_HOME);
}

function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function validateInitializeResult(message, env) {
  if (!message || typeof message !== "object") {
    throw new Error("initialize returned a non-object response");
  }
  if (message.error) {
    throw new Error(`initialize failed: ${JSON.stringify(message.error)}`);
  }
  const result = message.result;
  if (!result || typeof result !== "object") {
    throw new Error(`initialize response is missing result: ${JSON.stringify(message)}`);
  }
  for (const field of ["userAgent", "codexHome", "platformFamily", "platformOs"]) {
    if (typeof result[field] !== "string" || result[field].length === 0) {
      throw new Error(`initialize response is missing string field ${field}: ${JSON.stringify(result)}`);
    }
  }
  const expectedHome = expectedCodexHome(env);
  const actualHome = canonicalPath(result.codexHome);
  if (actualHome !== expectedHome) {
    throw new Error(`initialize codexHome mismatch: expected ${expectedHome}, got ${result.codexHome}`);
  }
  return result;
}

async function waitForChildResult(child) {
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const result = await Promise.race([
    waitForChildResult(child),
    new Promise((resolve) => setTimeout(() => resolve(null), 500)),
  ]);
  if (!result && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForChildResult(child);
  }
}

async function smokeAppServer(env) {
  const child = spawn(sidecarBin, ["app-server", "--listen", "stdio://"], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let stdoutBuffer = "";
  const pendingLines = [];
  const waiters = [];
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stdout += text;
    stdoutBuffer += text;
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      pendingLines.push(line);
      for (const waiter of waiters.splice(0)) waiter();
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const earlyExit = waitForChildResult(child);
  const nextLine = async () => {
    if (pendingLines.length > 0) return pendingLines.shift();
    return new Promise((resolve) => {
      waiters.push(() => resolve(pendingLines.shift()));
    });
  };
  const waitForInitializeResponse = async () => {
    const deadline = Date.now() + protocolTimeoutMs;
    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      const outcome = await Promise.race([
        nextLine().then((line) => ({ type: "line", line })),
        earlyExit.then((childResult) => ({ type: "childResult", childResult })),
        new Promise((resolve) => setTimeout(() => resolve({ type: "timeout" }), remaining)),
      ]);
      if (outcome.type === "childResult") {
        if (outcome.childResult.error) throw outcome.childResult.error;
        throw new Error(
          `Codex app-server exited before initialize response: ` +
            `code=${outcome.childResult.code ?? "null"} signal=${outcome.childResult.signal ?? "null"}.\n` +
            `stdout:\n${snippet(stdout)}\n` +
            `stderr:\n${snippet(stderr)}`,
        );
      }
      if (outcome.type === "timeout") break;
      if (!outcome.line) continue;
      let message;
      try {
        message = JSON.parse(outcome.line);
      } catch {
        continue;
      }
      if (message?.id === "hicodex-smoke-initialize") {
        return validateInitializeResult(message, env);
      }
    }
    throw new Error(
      `Timed out waiting for initialize response after ${protocolTimeoutMs}ms.\n` +
        `stdout:\n${snippet(stdout)}\n` +
        `stderr:\n${snippet(stderr)}`,
    );
  };

  try {
    writeJsonLine(child, initializeRequest());
    const initializeResult = await waitForInitializeResponse();
    writeJsonLine(child, initializedNotification());

    const result = await Promise.race([
      earlyExit.then((childResult) => ({ type: "childResult", childResult })),
      new Promise((resolve) => setTimeout(() => resolve({ type: "alive" }), smokeTimeoutMs)),
    ]);

    if (result.type === "alive") {
      return initializeResult;
    }

    if (result.childResult.error) {
      throw result.childResult.error;
    }

    throw new Error(
      `Codex app-server exited before smoke timeout (${smokeTimeoutMs}ms): ` +
        `code=${result.childResult.code ?? "null"} signal=${result.childResult.signal ?? "null"}.\n` +
        `stdout:\n${snippet(stdout)}\n` +
        `stderr:\n${snippet(stderr)}`,
    );
  } finally {
    await stopChild(child);
  }
}

async function main() {
  requireSidecar();
  const tempRoot = mkdtempSync(join(tmpdir(), "hicodex-sidecar-smoke-"));
  try {
    const env = smokeEnv(tempRoot);
    const version = checkVersion(env);
    const initialize = await smokeAppServer(env);
    console.log(
      JSON.stringify({
        ok: true,
        sidecarBin,
        version,
        userAgent: initialize.userAgent,
        codexHome: initialize.codexHome,
        platformFamily: initialize.platformFamily,
        platformOs: initialize.platformOs,
        aliveAfterMs: smokeTimeoutMs,
      }),
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
