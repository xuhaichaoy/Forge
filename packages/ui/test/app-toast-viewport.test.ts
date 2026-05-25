import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppToastViewport, projectToastLogs } from "../src/components/app-toast-viewport";
import type { LogLine } from "../src/state/codex-reducer";

export default function runAppToastViewportTests(): void {
  projectsRecentUserFacingLogsOnly();
  filtersInternalHostLifecycleAndTransportLogsLikeDesktop();
  rendersToastViewportForProjectedLogs();
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
    logFixture("visible-error", "Save failed", "error", 9_600),
  ];

  assertDeepEqual(
    projectToastLogs(logs, 10_000, 5_000).map((log) => log.id),
    ["visible-error"],
    "toast projection should hide internal host lifecycle and transport diagnostics like Codex Desktop",
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
): LogLine {
  return { id, text, level, at };
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
