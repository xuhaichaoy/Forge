import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppToastViewport, projectToastLogs } from "../src/components/app-toast-viewport";
import { TEAM_MODEL_GATEWAY_LOG_SOURCES } from "../src/model/model-workflow";
import type { LogLine } from "../src/state/codex-reducer";

export default function runAppToastViewportTests(): void {
  projectsRecentUserFacingLogsOnly();
  filtersInternalHostLifecycleAndTransportLogsLikeDesktop();
  filtersDisconnectedStartupEndpointFailures();
  mutesBySourceTagFirstWithTextPatternFallback();
  suppressesBenignModelMetadataFallbackWarning();
  rendersToastViewportForProjectedLogs();
}

/*
 * Muting is keyed on the structured LogLine.source tag first; the text
 * patterns only act as fallback for untagged entries. Sub-claims:
 *   1. the tagged team-gateway success confirmation is muted by its tag even
 *      though its (now localized) text no longer matches the deprecated
 *      /^团队模型连接已更新$/ anchor;
 *   2. the transient reconnect-pending variant is ALSO muted by tag — it
 *      self-heals ("will retry automatically"), so it's first-login noise;
 *   3. a genuinely-actionable variant whose source is NOT in the mute table
 *      (restart-failed) falls through and stays visible;
 *   4. an untagged legacy entry with the old Chinese copy is still muted via
 *      the deprecated text-pattern fallback.
 */
function mutesBySourceTagFirstWithTextPatternFallback(): void {
  const logs: LogLine[] = [
    logFixture("tagged-success", "Team model connection updated", "info", 10_000, TEAM_MODEL_GATEWAY_LOG_SOURCES.providerUpdated),
    logFixture("tagged-reconnect-pending", "团队模型连接已更新，但模型服务暂未重连，将自动重试", "warn", 9_960, TEAM_MODEL_GATEWAY_LOG_SOURCES.reconnectPending),
    logFixture("tagged-restart-failed", "团队模型连接已更新，但服务重启失败: boom", "warn", 9_950, TEAM_MODEL_GATEWAY_LOG_SOURCES.restartFailed),
    logFixture("untagged-legacy", "团队模型连接已更新", "info", 9_900),
    logFixture("visible-error", "Save failed", "error", 9_850),
  ];

  assertDeepEqual(
    projectToastLogs(logs, 10_000, 5_000).map((log) => log.id),
    ["tagged-restart-failed", "visible-error"],
    "tagged success and transient reconnect-pending should be muted by tag, the actionable restart-failed source should stay visible, and untagged legacy copy should stay muted",
  );
}

// codex-rs warns when a model slug (e.g. a subscription model via openai_http)
// is missing from its bundled metadata; the turn still completes, so the toast
// is benign noise and must be suppressed (but kept in the log history).
function suppressesBenignModelMetadataFallbackWarning(): void {
  const logs: LogLine[] = [
    logFixture("metadata", "Model metadata for `gpt-5.5` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.", "warn", 10_000),
    logFixture("visible-error", "Save failed", "error", 9_900),
  ];

  assertDeepEqual(
    projectToastLogs(logs, 10_000, 5_000).map((log) => log.id),
    ["visible-error"],
    "the model-metadata fallback warning should not surface as a toast",
  );
}

function projectsRecentUserFacingLogsOnly(): void {
  const logs: LogLine[] = [
    logFixture("newest-error", "Save failed", "error", 10_000),
    logFixture("internal", "initialized Codex app-server", "info", 9_900),
    logFixture("visible-info", "Archive requested.", "info", 9_800),
    logFixture("stale", "Old warning", "warn", 1_000),
  ];

  assertDeepEqual(
    projectToastLogs(logs, 10_000, 5_000).map((log) => log.id),
    ["newest-error", "visible-info"],
    "toast projection should keep recent user-facing logs and skip internal lifecycle noise",
  );
}

function filtersInternalHostLifecycleAndTransportLogsLikeDesktop(): void {
  const logs: LogLine[] = [
    logFixture("transport-fallback", "Falling back from WebSockets to HTTPS transport.\nstream disconnected before completion: tls handshake eof", "warn", 10_000),
    logFixture("service-ready", "training_api ready", "info", 9_900),
    logFixture("service-starting", "codex_apps starting", "info", 9_800),
    logFixture("attach", "attaching to existing Codex app-server", "warn", 9_700),
    logFixture("transform-callback", "Cannot read properties of undefined (reading 'transformCallback')", "error", 9_600),
    logFixture("visible-error", "Save failed", "error", 9_500),
  ];

  assertDeepEqual(
    projectToastLogs(logs, 10_000, 5_000).map((log) => log.id),
    ["visible-error"],
    "toast projection should hide internal host lifecycle and transport diagnostics like Codex Desktop",
  );
}

function filtersDisconnectedStartupEndpointFailures(): void {
  const logs: LogLine[] = [
    logFixture("raw-not-connected", "Codex app-server is not connected", "error", 10_000),
    logFixture("raw-disconnected", "Disconnected from Codex app-server", "error", 9_950),
    logFixture("closed", "Codex app-server connection closed: app-server stdout closed", "error", 9_925),
    logFixture("model-list", "model/list failed: Codex app-server is not connected", "warn", 10_000),
    logFixture("mcp-status", "mcpServerStatus/list failed: Disconnected from Codex app-server", "warn", 9_900),
    // Disconnect failures from arbitrary RPC methods (not just the two
    // historically whitelisted) must also be muted — they stack a screenful on
    // every reconnect; a sustained outage is shown by dedicated always-on UI.
    logFixture("config-read", "config/read failed: Codex app-server is not connected", "warn", 9_890),
    logFixture("hooks-refresh", "hooks review refresh failed: Codex app-server is not connected", "warn", 9_880),
    logFixture("collab-list", "collaborationMode/list failed: Disconnected from Codex app-server", "warn", 9_870),
    logFixture("team-provider", "team model provider provisioning failed: Codex app-server is not connected", "warn", 9_850),
    logFixture("team-model", "团队模型连接已更新", "info", 9_800),
    logFixture("visible-error", "model/list failed: HTTP 500", "warn", 9_700),
  ];

  assertDeepEqual(
    projectToastLogs(logs, 10_000, 5_000).map((log) => log.id),
    ["visible-error"],
    "transient '<rpc> failed: not connected' from ANY method (not just model/list) should stay out of the toast viewport; real errors (HTTP 500) still surface",
  );
}

function rendersToastViewportForProjectedLogs(): void {
  const html = renderToStaticMarkup(createElement(AppToastViewport, {
    now: 10_000,
    logs: [
      logFixture("warn", "MCP startup status changed.", "warn", 9_500),
    ],
  }));

  assert(html.includes("hc-toast-viewport"), "toast viewport should render for recent logs");
  assert(html.includes("data-level=\"warn\""), "toast should carry the log level");
  assert(html.includes("MCP startup status changed."), "toast should render the log text");
}

function logFixture(
  id: string,
  text: string,
  level: LogLine["level"],
  at: number,
  source?: string,
): LogLine {
  return source !== undefined ? { id, text, level, at, source } : { id, text, level, at };
}

function assert(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
