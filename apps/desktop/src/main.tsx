import React from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ForgeApp,
  hydrateAppSettingsFromDisk,
  installAppSettingsAutoPersist,
  loadNotificationPreferences,
  shouldNotifyTurnCompletion,
} from "@forge/ui";
import "@forge/ui/styles.css";
import "./styles.css";

const APP_SERVER_EVENT_NAME = "forge://app-server-event";
const NATIVE_SHELL_EVENT_NAME = "forge://native-shell-event";
// Deliberate legacy value: the old-brand "hicodex." localStorage key stays so
// previously stored crash flags survive the Forge rebrand (identifier-only rename).
const RENDERER_FATAL_ERROR_STORAGE_KEY = "hicodex.rendererFatalError.v1";

type NativeShellEvent = {
  action?: string;
  supported?: boolean;
  message?: string | null;
  url?: string | null;
};

type HostEvent = {
  type?: string;
  value?: {
    method?: string;
    params?: unknown;
  };
};

class RendererErrorBoundary extends React.Component<
  { children: ReactNode },
  { error: Error | null; errorInfo: ErrorInfo | null }
> {
  state: { error: Error | null; errorInfo: ErrorInfo | null } = {
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    reportRendererFatalError("react-render", error, errorInfo.componentStack ?? undefined);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <RendererFatalErrorView
        title="Renderer crashed"
        detail={formatRendererError(this.state.error, this.state.errorInfo?.componentStack ?? undefined)}
      />
    );
  }
}

installNativeShellBridge();
installRendererFatalErrorReporter();

void bootstrapRenderer();

async function bootstrapRenderer(): Promise<void> {
  // Settings hydration must complete BEFORE the first render: the team
  // service address, auth session, and model selection are synchronous
  // localStorage reads at render time, and after a reinstall/rebrand the
  // webview's localStorage starts empty while codex-home still has the
  // durable copy.
  try {
    await hydrateAppSettingsFromDisk();
  } catch (error) {
    console.warn("app settings hydration failed; using webview storage only", error);
  }
  installAppSettingsAutoPersist();
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RendererErrorBoundary>
        <ForgeApp />
      </RendererErrorBoundary>
    </React.StrictMode>,
  );
}

function RendererFatalErrorView({ title, detail }: { title: string; detail: string }) {
  return (
    <main style={{
      minHeight: "100vh",
      boxSizing: "border-box",
      padding: 24,
      background: "#181818",
      color: "#f4f4f5",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    }}>
      <section style={{ maxWidth: 920 }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 650 }}>{title}</h1>
        <p style={{ margin: "0 0 16px", color: "#d4d4d8", lineHeight: 1.5 }}>
          Forge caught a renderer error instead of leaving the window blank.
        </p>
        <pre style={{
          margin: 0,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          border: "1px solid rgba(255,255,255,.16)",
          borderRadius: 8,
          padding: 16,
          background: "rgba(0,0,0,.28)",
          color: "#fafafa",
          fontSize: 12,
          lineHeight: 1.5,
        }}>{detail}</pre>
      </section>
    </main>
  );
}

function installRendererFatalErrorReporter(): void {
  window.addEventListener("error", (event) => {
    const reason = event.error ?? event.message;
    const isKnownNonFatal = isKnownResizeObserverLoopError(reason);
    reportRendererFatalError("window-error", reason, undefined, isKnownNonFatal ? "nonfatal" : "fatal");
    if (isKnownNonFatal) {
      event.preventDefault();
      return;
    }
    showImperativeFatalError("Renderer crashed", formatRendererError(event.error ?? event.message));
  });
  window.addEventListener("unhandledrejection", (event) => {
    const isKnownNonFatal = isKnownTauriListenerUnregisterRejection(event.reason);
    reportRendererFatalError("unhandled-rejection", event.reason, undefined, isKnownNonFatal ? "nonfatal" : "fatal");
    if (isKnownNonFatal) {
      event.preventDefault();
      return;
    }
    window.setTimeout(() => {
      if (rootLooksBlank()) {
        showImperativeFatalError("Renderer promise failed", formatRendererError(event.reason));
      }
    }, 0);
  });
}

function reportRendererFatalError(
  kind: string,
  error: unknown,
  componentStack?: string,
  severity: "fatal" | "nonfatal" = "fatal",
): void {
  const detail = {
    at: new Date().toISOString(),
    kind,
    severity,
    message: errorMessage(error),
    stack: errorStack(error),
    componentStack: componentStack ?? "",
    userAgent: navigator.userAgent,
  };
  try {
    window.localStorage.setItem(RENDERER_FATAL_ERROR_STORAGE_KEY, JSON.stringify(detail, null, 2));
  } catch {
    // Best effort only; the visible fatal screen is the primary diagnostic.
  }
  if (severity === "fatal") {
    console.error("[Forge renderer fatal]", detail);
  } else {
    console.warn("[Forge renderer nonfatal]", detail);
  }
}

function showImperativeFatalError(title: string, detail: string): void {
  const root = document.getElementById("root");
  if (!root) return;
  root.replaceChildren();
  const wrapper = document.createElement("main");
  wrapper.style.minHeight = "100vh";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.padding = "24px";
  wrapper.style.background = "#181818";
  wrapper.style.color = "#f4f4f5";
  wrapper.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

  const heading = document.createElement("h1");
  heading.textContent = title;
  heading.style.margin = "0 0 12px";
  heading.style.fontSize = "20px";

  const body = document.createElement("pre");
  body.textContent = detail;
  body.style.margin = "0";
  body.style.overflow = "auto";
  body.style.whiteSpace = "pre-wrap";
  body.style.border = "1px solid rgba(255,255,255,.16)";
  body.style.borderRadius = "8px";
  body.style.padding = "16px";
  body.style.background = "rgba(0,0,0,.28)";
  body.style.fontSize = "12px";
  body.style.lineHeight = "1.5";

  wrapper.append(heading, body);
  root.append(wrapper);
}

function formatRendererError(error: unknown, componentStack?: string): string {
  return [
    errorMessage(error),
    errorStack(error),
    componentStack ? `Component stack:\n${componentStack}` : "",
  ].filter(Boolean).join("\n\n");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorStack(error: unknown): string {
  return error instanceof Error && typeof error.stack === "string" ? error.stack : "";
}

function isKnownTauriListenerUnregisterRejection(error: unknown): boolean {
  const message = errorMessage(error);
  const stack = errorStack(error);
  return message.includes("listeners[eventId].handlerId")
    && stack.includes("unregisterListener")
    && stack.includes("@user-script");
}

function isKnownResizeObserverLoopError(error: unknown): boolean {
  const message = errorMessage(error);
  return message === "ResizeObserver loop completed with undelivered notifications."
    || message === "ResizeObserver loop limit exceeded";
}

function rootLooksBlank(): boolean {
  const root = document.getElementById("root");
  if (!root) return true;
  return root.childElementCount === 0 && (root.textContent?.trim() ?? "") === "";
}

function installNativeShellBridge(): void {
  if (!isTauriRuntime()) return;
  void listen<NativeShellEvent>(NATIVE_SHELL_EVENT_NAME, (event) => {
    handleNativeShellEvent(event.payload);
  }).catch((error) => {
    console.warn("failed to install native shell listener", error);
  });
  void listen<HostEvent>(APP_SERVER_EVENT_NAME, (event) => {
    handleTurnCompletionNotification(event.payload);
  }).catch((error) => {
    console.warn("failed to install turn completion notification listener", error);
  });
}

function handleNativeShellEvent(event: NativeShellEvent): void {
  switch (event.action) {
    case "newChat":
    case "search":
    case "settings":
      window.dispatchEvent(
        new CustomEvent("forge:native-shell-action", { detail: event }),
      );
      return;
    case "openDeepLink":
      window.dispatchEvent(
        new CustomEvent("forge:native-deep-link", { detail: event }),
      );
      if (event.supported === false) {
        console.warn(
          event.message ?? "native shell link is not fully supported yet",
          event.url,
        );
      }
      return;
    default:
      window.dispatchEvent(
        new CustomEvent("forge:native-shell-action", { detail: event }),
      );
  }
}

let lastNotifiedTurnKey: string | null = null;

function handleTurnCompletionNotification(event: HostEvent): void {
  if (event?.type !== "json") return;
  const message = event.value;
  if (
    !message ||
    (message.method !== "turn/completed" && message.method !== "turn/failed")
  ) {
    return;
  }
  const notificationPreferences = loadNotificationPreferences(browserStorage());
  if (!shouldNotifyTurnCompletion({
    preferences: notificationPreferences,
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
  })) {
    return;
  }

  const params = recordValue(message.params);
  const turn = recordValue(params?.turn);
  const threadId = stringValue(params?.threadId);
  const turnId = stringValue(turn?.id);
  const status =
    stringValue(turn?.status) ??
    (message.method === "turn/failed" ? "failed" : "completed");
  const key = `${message.method}:${threadId ?? "thread"}:${turnId ?? "turn"}`;
  if (key === lastNotifiedTurnKey) return;
  lastNotifiedTurnKey = key;

  const failed = status === "failed" || message.method === "turn/failed";
  const title = failed ? "Forge turn failed" : "Forge turn completed";
  const body = threadId
    ? `Thread ${shortId(threadId)} ${failed ? "failed" : "finished"}.`
    : `Background turn ${failed ? "failed" : "finished"}.`;
  void invoke("host_notify_turn_completed", {
    request: {
      title,
      body,
      sound: notificationPreferences.sound,
      threadId,
      turnId,
      status,
    },
  }).catch((error: unknown) => {
    // host commands reject with structured {code, message} payloads now —
    // surface a stable string shape regardless of payload form.
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
    window.dispatchEvent(
      new CustomEvent("forge:native-turn-completed", {
        detail: { title, body, threadId, turnId, status, error: message },
      }),
    );
    console.warn("failed to show native turn completion notification", message);
  });
}

function isTauriRuntime(): boolean {
  const runtimeWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(runtimeWindow.__TAURI_INTERNALS__ || runtimeWindow.__TAURI__);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
