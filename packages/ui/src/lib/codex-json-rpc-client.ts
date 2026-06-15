import type {
  InitializeResponse,
  JsonRpcError,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  RequestId,
} from "@forge/codex-protocol";
import {
  getHostStatus,
  hostCommandErrorCode,
  listenEvents,
  sendRaw,
  startAppServer,
  stopAppServer,
  type HostEvent,
  type HostStatus,
} from "./tauri-host";
import { formatError, stripAnsiEscapes } from "./format";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: number | null;
};

const INITIALIZE_TIMEOUT_MS = 60_000;

export type RpcDebugEventKind =
  | "client-request"
  | "client-notification"
  | "client-response"
  | "client-error"
  | "client-cancel"
  | "server-response"
  | "server-error"
  | "server-request"
  | "server-notification"
  | "host-event"
  | "host-error";

export interface RpcDebugEvent {
  id: string;
  at: number;
  kind: RpcDebugEventKind;
  method?: string;
  requestId?: RequestId;
  level?: "info" | "warn" | "error";
  payload?: unknown;
  message?: string;
}

export interface CodexRpcClientHandlers {
  onHostStatus?: (status: HostStatus) => void;
  onNotification?: (message: JsonRpcNotification) => void;
  onServerRequest?: (message: JsonRpcRequest) => void;
  onLog?: (line: string, level?: "info" | "warn" | "error") => void;
  onDebugEvent?: (event: RpcDebugEvent) => void;
  /*
   * Fired on UNEXPECTED transport closure only (fatal lifecycle event, host
   * error, send failure) — deliberate teardown via disconnect()/dispose()
   * bypasses it. Without this signal the app's reducer keeps `connected:
   * true`, its backoff reconnect loop never arms, and every RPC fails with
   * "not connected" until a full page reload.
   */
  onConnectionClosed?: (reason: string) => void;
}

export class CodexJsonRpcClient {
  private nextId = 1;
  private nextDebugId = 1;
  private readonly idPrefix = `hicodex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  private eventUnlisten: (() => void) | null = null;
  private eventListenPromise: Promise<void> | null = null;
  private connected = false;
  private disposed = false;
  private connectPromise: Promise<InitializeResponse> | null = null;
  private pending = new Map<RequestId, PendingRequest>();

  constructor(private readonly handlers: CodexRpcClientHandlers = {}) {}

  async connect(): Promise<InitializeResponse> {
    this.assertActive();
    if (this.connected) {
      const status = await this.refreshStatus();
      if (status.running) return {};
      this.connected = false;
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.connectFresh();
    try {
      const initialized = await this.connectPromise;
      this.assertActive();
      this.connected = true;
      return initialized;
    } finally {
      this.connectPromise = null;
    }
  }

  private async connectFresh(): Promise<InitializeResponse> {
    await this.startEvents();
    let attachedToExisting = false;
    let status: HostStatus;
    try {
      status = await startAppServer({});
    } catch (error) {
      /*
       * Startup-conflict classification, structured-first: hosts with the
       * { code, message } error contract are matched on the stable code. The
       * text probe stays as a fallback for old hosts whose rejection is the
       * bare message string (兼容旧 host).
       */
      const alreadyRunning =
        hostCommandErrorCode(error) === "already_running" ||
        formatError(error).includes("already running");
      if (!alreadyRunning) throw error;
      this.handlers.onLog?.("attaching to existing Codex app-server", "warn");
      status = await getHostStatus();
      attachedToExisting = true;
      if (!status.running) {
        status = await startAppServer({});
        attachedToExisting = false;
      }
    }

    this.assertActive();
    this.handlers.onHostStatus?.(status);
    const initialized = await this.initializeServer(attachedToExisting);
    await this.notify("initialized");
    this.handlers.onLog?.(
      attachedToExisting
        ? "attached to initialized Codex app-server"
        : "initialized Codex app-server",
    );
    this.assertActive();
    return initialized;
  }

  private async initializeServer(attachedToExisting: boolean): Promise<InitializeResponse> {
    try {
      return await this.request<InitializeResponse>(
        "initialize",
        {
          clientInfo: {
            name: "forge_desktop",
            title: "Forge Desktop",
            version: "0.1.0",
          },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
            optOutNotificationMethods: [],
          },
        },
        INITIALIZE_TIMEOUT_MS,
      );
    } catch (error) {
      if (attachedToExisting && formatError(error).includes("Already initialized")) {
        return {};
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stopEvents();
    this.connected = false;
    this.connectPromise = null;
    this.rejectPending("Disconnected from Codex app-server");
    const status = await stopAppServer();
    this.handlers.onHostStatus?.(status);
  }

  dispose(): void {
    this.disposed = true;
    this.stopEvents();
    this.connected = false;
    this.connectPromise = null;
    this.rejectPending("Codex JSON-RPC client was disposed");
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs: number | null = 60_000): Promise<T> {
    /*
     * Never throw synchronously: callers universally write
     * `void client.request(...).catch(...)` inside effects, and a sync throw
     * (e.g. "not connected" during a reconnect race or an HMR remount where
     * reducer state still says connected) escapes the .catch and crashes the
     * whole renderer. A rejected promise keeps every caller's error path.
     */
    try {
      this.assertCanSend();
    } catch (error) {
      return Promise.reject(error);
    }
    const id = `${this.idPrefix}-${this.nextId++}`;
    const message = params === undefined ? { id, method } : { id, method, params };
    this.emitDebugEvent({
      kind: "client-request",
      method,
      requestId: id,
      payload: params,
    });
    return new Promise<T>((resolve, reject) => {
      const timeout = timeoutMs === null
        ? null
        : window.setTimeout(() => {
            this.pending.delete(id);
            this.emitDebugEvent({
              kind: "client-cancel",
              method,
              requestId: id,
              level: "warn",
              message: `${method} timed out after ${timeoutMs}ms`,
            });
            reject(new Error(`${method} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      void sendRaw(message)
        .then(() => {
          try {
            this.assertActive();
          } catch (error) {
            this.rejectPendingRequest(id, error);
          }
        })
        .catch((error) => {
          this.handleTransportFailure(error);
        });
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    this.assertCanSend();
    this.emitDebugEvent({
      kind: "client-notification",
      method,
      payload: params,
    });
    await sendRaw(params === undefined ? { method } : { method, params });
  }

  async respond(id: RequestId, result: unknown): Promise<void> {
    this.assertCanSend();
    this.emitDebugEvent({
      kind: "client-response",
      requestId: id,
      payload: result,
    });
    await sendRaw({ id, result });
  }

  async reject(id: RequestId, message: string, code = -32000): Promise<void> {
    this.assertCanSend();
    this.emitDebugEvent({
      kind: "client-error",
      requestId: id,
      level: "warn",
      payload: { code, message },
      message,
    });
    await sendRaw({ id, error: { code, message } });
  }

  async refreshStatus(): Promise<HostStatus> {
    this.assertActive();
    const status = await getHostStatus();
    this.handlers.onHostStatus?.(status);
    return status;
  }

  private async startEvents(): Promise<void> {
    if (this.disposed) return;
    if (this.eventUnlisten) return;
    if (!this.eventListenPromise) {
      this.eventListenPromise = listenEvents((event) => this.handleHostEvent(event))
        .then((unlisten) => {
          if (this.disposed) {
            unlisten();
            return;
          }
          this.eventUnlisten = unlisten;
        })
        .finally(() => {
          this.eventListenPromise = null;
        });
    }
    await this.eventListenPromise;
    this.assertActive();
  }

  private stopEvents(): void {
    if (!this.eventUnlisten) return;
    this.eventUnlisten();
    this.eventUnlisten = null;
  }

  private handleHostEvent(event: HostEvent): void {
    if (this.disposed) return;
    switch (event.type) {
      case "json":
        this.handleMessage(event.value);
        break;
      case "stderr": {
        /*
         * Codex Desktop (`remote-conversation-page-*.js`) never routes
         * raw app-server streams to UI toasts; only structured `error`
         * JSON-RPC notifications and explicit product toast signals reach the
         * renderer. Keep host stream lines in the RPC debug pane only, or
         * app-server diagnostics such as `training_api ready` and transport
         * fallback messages leak into the bottom-right toast viewport.
         */
        const sanitized = stripAnsiEscapes(event.line);
        this.emitDebugEvent({ kind: "host-event", level: "warn", message: sanitized });
        break;
      }
      case "stdout": {
        this.emitDebugEvent({
          kind: "host-event",
          level: "info",
          message: event.line,
          payload: event,
        });
        break;
      }
      case "lifecycle":
        this.emitDebugEvent({
          kind: "host-event",
          level: "info",
          message: event.message,
          payload: event,
        });
        if (isFatalLifecycleEvent(event)) {
          this.markTransportClosed(`Codex app-server connection closed: ${event.message}`);
        }
        void this.refreshStatus().catch((error) => {
          this.emitDebugEvent({
            kind: "host-error",
            level: "warn",
            message: formatError(error),
            payload: { source: "host-status-refresh" },
          });
        });
        break;
      case "error":
        this.emitDebugEvent({ kind: "host-error", level: "error", message: event.message, payload: event });
        this.handlers.onLog?.(event.message, "error");
        this.markTransportClosed(`Codex app-server connection failed: ${event.message}`);
        void this.refreshStatus().catch((error) => this.handlers.onLog?.(formatError(error), "warn"));
        break;
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (this.disposed) return;
    if (isResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearPendingTimeout(pending);
      this.emitDebugEvent({
        kind: "server-response",
        requestId: message.id,
        payload: message.result,
      });
      pending.resolve(message.result);
      return;
    }

    if (isError(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearPendingTimeout(pending);
      this.emitDebugEvent({
        kind: "server-error",
        requestId: message.id,
        level: "error",
        payload: message.error,
        message: message.error.message,
      });
      pending.reject(new Error(message.error.message));
      return;
    }

    if (isRequest(message)) {
      this.emitDebugEvent({
        kind: "server-request",
        method: message.method,
        requestId: message.id,
        payload: message.params,
      });
      this.handlers.onServerRequest?.(message);
      return;
    }

    if (isNotification(message)) {
      this.emitDebugEvent({
        kind: "server-notification",
        method: message.method,
        payload: message.params,
      });
      this.handlers.onNotification?.(message);
    }
  }

  private rejectPending(message: string): void {
    for (const [id, pending] of this.pending.entries()) {
      clearPendingTimeout(pending);
      this.emitDebugEvent({
        kind: "client-cancel",
        requestId: id,
        level: "warn",
        message,
      });
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  private rejectPendingRequest(id: RequestId, error: unknown): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearPendingTimeout(pending);
    this.emitDebugEvent({
      kind: "client-error",
      requestId: id,
      level: "error",
      message: formatError(error),
    });
    pending.reject(error instanceof Error ? error : new Error(formatError(error)));
  }

  private handleTransportFailure(error: unknown): void {
    this.emitDebugEvent({
      kind: "client-error",
      level: "error",
      message: formatError(error),
    });
    this.markTransportClosed(formatError(error));
  }

  private markTransportClosed(message: string): void {
    this.connected = false;
    this.connectPromise = null;
    // Drop the host event subscription too: after a dev HMR swap the old
    // listener can be a dead callback while its handle survives, and
    // startEvents() short-circuits on a surviving handle — the next connect()
    // must subscribe fresh or initialize responses never arrive.
    this.stopEvents();
    this.rejectPending(message);
    this.handlers.onConnectionClosed?.(message);
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("Codex JSON-RPC client was disposed");
    }
  }

  private assertCanSend(): void {
    this.assertActive();
    if (!this.connected && !this.connectPromise) {
      throw new Error("Codex app-server is not connected");
    }
  }

  private emitDebugEvent(event: Omit<RpcDebugEvent, "id" | "at">): void {
    this.handlers.onDebugEvent?.({
      id: `${this.idPrefix}-debug-${this.nextDebugId++}`,
      at: Date.now(),
      level: "info",
      ...event,
    });
  }
}

function clearPendingTimeout(pending: PendingRequest): void {
  if (pending.timeout !== null) window.clearTimeout(pending.timeout);
}

/*
 * Fatal-lifecycle classification, dual-track. Fatal means the stdio transport
 * is gone and the client must mark itself closed so the reconnect loop arms.
 *
 * 1. Structured path — the Rust host stamps every lifecycle event with a
 *    machine-readable `kind` (serde snake_case of forge_host::LifecycleKind).
 *    Known kinds classify without touching the message text, so message
 *    rewording can never silently break connection-state truthfulness.
 * 2. Text fallback — events without a `kind` (兼容旧 host) keep the original
 *    message regex. Unknown future kinds also fall through here so they
 *    degrade to the legacy behavior instead of being dropped on the floor.
 */
const FATAL_LIFECYCLE_KINDS: ReadonlySet<string> = new Set(["stopped", "exited", "stdout_closed"]);
const BENIGN_LIFECYCLE_KINDS: ReadonlySet<string> = new Set(["started", "config_missing"]);

export function isFatalLifecycleEvent(event: { kind?: string; message: string }): boolean {
  if (event.kind !== undefined) {
    if (FATAL_LIFECYCLE_KINDS.has(event.kind)) return true;
    if (BENIGN_LIFECYCLE_KINDS.has(event.kind)) return false;
  }
  return isFatalLifecycleMessage(event.message);
}

// 兼容旧 host：kind 出现之前的纯文本分类，仅作 isFatalLifecycleEvent 的兜底。
function isFatalLifecycleMessage(message: string): boolean {
  return /\b(?:stopped|exited|stdout closed|not running)\b/i.test(message);
}

function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return "id" in message && "result" in message;
}

function isError(message: JsonRpcMessage): message is JsonRpcError {
  return "id" in message && "error" in message;
}

function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return "id" in message && "method" in message;
}

function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return !("id" in message) && "method" in message;
}
