import { codexUiReducer, initialCodexUiState } from "../src/state/codex-reducer";
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

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
