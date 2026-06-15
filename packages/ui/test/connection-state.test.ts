import { codexUiReducer, initialCodexUiState } from "../src/state/codex-reducer";
import { isFatalLifecycleEvent } from "../src/lib/codex-json-rpc-client";
import { HostCommandError, hostCommandErrorCode, toHostCommandError } from "../src/lib/tauri-host";
import type { HostStatus } from "../src/lib/tauri-host";

/*
 * Connection-state truthfulness. The client marks its transport closed on
 * unexpected failures (sidecar exit, dev HMR killing the event channel) and
 * reports it via onConnectionClosed → `{type:"connected", value:false}`. The
 * 5s host-status poll then sees the sidecar PROCESS still running; if that
 * were allowed to flip `connected` back to true, the backoff reconnect loop
 * would starve and the app would stay wedged until a full page reload.
 */
export default function runConnectionStateTests(): void {
  hostStatusPollDoesNotResurrectConnected();
  hostStatusDowngradesConnectedWhenProcessGone();
  explicitConnectedActionRestoresConnected();
}

function hostStatusFixture(running: boolean): HostStatus {
  return { running, codexHome: "/tmp/codex-home" };
}

function hostStatusPollDoesNotResurrectConnected(): void {
  const disconnected = codexUiReducer(
    { ...initialCodexUiState, connected: true },
    { type: "connected", value: false },
  );
  assertEqual(disconnected.connected, false, "transport closure should mark the app disconnected");

  const polled = codexUiReducer(disconnected, { type: "hostStatus", status: hostStatusFixture(true) });
  assertEqual(
    polled.connected,
    false,
    "a running sidecar process must not resurrect `connected` — only a successful attach may",
  );
}

function hostStatusDowngradesConnectedWhenProcessGone(): void {
  const state = codexUiReducer(
    { ...initialCodexUiState, connected: true },
    { type: "hostStatus", status: hostStatusFixture(false) },
  );
  assertEqual(state.connected, false, "a dead sidecar process should downgrade `connected`");
}

function explicitConnectedActionRestoresConnected(): void {
  const state = codexUiReducer(
    { ...initialCodexUiState, connected: false, connecting: true },
    { type: "connected", value: true },
  );
  assertEqual(state.connected, true, "a successful connect() should restore `connected`");
  assertEqual(state.connecting, false, "a successful connect() should clear `connecting`");
}

/*
 * Dual-track host-contract classification. New hosts stamp lifecycle events
 * with a machine-readable `kind` and reject the lifecycle commands with
 * `{ code, message }`; hosts predating the contract only carry the
 * human-readable text. Both tracks must classify identically — a renderer/host
 * version skew must never wedge the reconnect loop.
 */
export function runHostContractClassificationTests(): void {
  structuredLifecycleKindDrivesClassification();
  legacyTextOnlyLifecyclePayloadStillClassifies();
  hostCommandErrorNormalizationAcceptsBothShapes();
}

function structuredLifecycleKindDrivesClassification(): void {
  assertEqual(
    isFatalLifecycleEvent({ kind: "stopped", message: "codex app-server stopped" }),
    true,
    "kind=stopped should classify as fatal",
  );
  assertEqual(
    isFatalLifecycleEvent({ kind: "exited", message: "codex app-server exited with exit status: 0" }),
    true,
    "kind=exited should classify as fatal",
  );
  assertEqual(
    isFatalLifecycleEvent({ kind: "stdout_closed", message: "codex app-server stdout closed" }),
    true,
    "kind=stdout_closed should classify as fatal",
  );
  assertEqual(
    isFatalLifecycleEvent({ kind: "started", message: "codex app-server started with pid 42" }),
    false,
    "kind=started should classify as benign",
  );
  // The structured kind must win over the text fallback: a benign kind whose
  // message happens to contain a regex keyword must not be misread as fatal.
  assertEqual(
    isFatalLifecycleEvent({
      kind: "started",
      message: "codex app-server started with pid 42 after the previous instance stopped",
    }),
    false,
    "a benign kind should win over fatal-looking message text",
  );
  assertEqual(
    isFatalLifecycleEvent({
      kind: "config_missing",
      message: "no Codex config found in /tmp/x; add config.toml/auth.json before sending turns",
    }),
    false,
    "kind=config_missing should classify as benign",
  );
  // Unknown future kinds degrade to the legacy text track instead of being
  // silently swallowed (fail-open towards the old behavior).
  assertEqual(
    isFatalLifecycleEvent({ kind: "some_future_kind", message: "codex app-server stopped" }),
    true,
    "an unknown kind should fall back to text classification",
  );
}

function legacyTextOnlyLifecyclePayloadStillClassifies(): void {
  assertEqual(
    isFatalLifecycleEvent({ message: "codex app-server stopped" }),
    true,
    "legacy payload: 'stopped' text should classify as fatal",
  );
  assertEqual(
    isFatalLifecycleEvent({ message: "codex app-server exited with exit status: 1" }),
    true,
    "legacy payload: 'exited' text should classify as fatal",
  );
  assertEqual(
    isFatalLifecycleEvent({ message: "codex app-server stdout closed" }),
    true,
    "legacy payload: 'stdout closed' text should classify as fatal",
  );
  assertEqual(
    isFatalLifecycleEvent({ message: "codex app-server started with pid 7" }),
    false,
    "legacy payload: 'started' text should classify as benign",
  );
}

function hostCommandErrorNormalizationAcceptsBothShapes(): void {
  // Structured shape: `{ code, message }` from the Rust HostCommandError.
  const structured = toHostCommandError({
    code: "already_running",
    message: "codex app-server is already running",
  });
  assertEqual(structured instanceof HostCommandError, true, "object payload should normalize to HostCommandError");
  assertEqual(
    structured.message,
    "codex app-server is already running",
    "object payload message must be preserved byte-for-byte",
  );
  assertEqual(hostCommandErrorCode(structured), "already_running", "object payload should surface the stable code");

  // Legacy shape: bare message string from hosts predating the contract.
  const legacy = toHostCommandError("codex app-server is already running");
  assertEqual(
    legacy.message,
    "codex app-server is already running",
    "legacy string payload must be preserved verbatim as the message",
  );
  assertEqual(hostCommandErrorCode(legacy), null, "legacy string payload carries no structured code");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
