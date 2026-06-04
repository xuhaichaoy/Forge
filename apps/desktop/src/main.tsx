import React from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  HiCodexApp,
  loadNotificationPreferences,
  shouldNotifyTurnCompletion,
} from "@hicodex/ui";
import "@hicodex/ui/styles.css";
import "./styles.css";

const APP_SERVER_EVENT_NAME = "hicodex://app-server-event";
const NATIVE_SHELL_EVENT_NAME = "hicodex://native-shell-event";

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

installNativeShellBridge();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HiCodexApp />
  </React.StrictMode>,
);

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
        new CustomEvent("hicodex:native-shell-action", { detail: event }),
      );
      return;
    case "openDeepLink":
      window.dispatchEvent(
        new CustomEvent("hicodex:native-deep-link", { detail: event }),
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
        new CustomEvent("hicodex:native-shell-action", { detail: event }),
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
  }).catch((error) => {
    window.dispatchEvent(
      new CustomEvent("hicodex:native-turn-completed", {
        detail: { title, body, threadId, turnId, status, error },
      }),
    );
    console.warn("failed to show native turn completion notification", error);
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
