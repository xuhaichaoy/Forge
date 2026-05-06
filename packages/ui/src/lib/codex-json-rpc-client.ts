import type {
  InitializeResponse,
  JsonRpcError,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  RequestId,
} from "@hicodex/codex-protocol";
import {
  getHostStatus,
  pollEvents,
  sendRaw,
  startAppServer,
  stopAppServer,
  type HostEvent,
  type HostStatus,
} from "./tauri-host";
import { formatError } from "./format";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: number;
};

export interface CodexRpcClientHandlers {
  onHostStatus?: (status: HostStatus) => void;
  onNotification?: (message: JsonRpcNotification) => void;
  onServerRequest?: (message: JsonRpcRequest) => void;
  onLog?: (line: string, level?: "info" | "warn" | "error") => void;
}

export class CodexJsonRpcClient {
  private nextId = 1;
  private readonly idPrefix = `hicodex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  private pollTimer: number | null = null;
  private connected = false;
  private connectPromise: Promise<InitializeResponse> | null = null;
  private pending = new Map<RequestId, PendingRequest>();

  constructor(private readonly handlers: CodexRpcClientHandlers = {}) {}

  async connect(): Promise<InitializeResponse> {
    if (this.connected) {
      const status = await this.refreshStatus();
      if (status.running) return {};
      this.connected = false;
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.connectFresh();
    try {
      const initialized = await this.connectPromise;
      this.connected = true;
      return initialized;
    } finally {
      this.connectPromise = null;
    }
  }

  private async connectFresh(): Promise<InitializeResponse> {
    let attachedToExisting = false;
    let status: HostStatus;
    try {
      status = await startAppServer({});
    } catch (error) {
      if (!formatError(error).includes("already running")) throw error;
      this.handlers.onLog?.("restarting existing Codex app-server", "warn");
      try {
        await stopAppServer();
        status = await startAppServer({});
      } catch (restartError) {
        this.handlers.onLog?.(`restart failed, attaching instead: ${formatError(restartError)}`, "warn");
        status = await getHostStatus();
        attachedToExisting = true;
      }
    }

    this.handlers.onHostStatus?.(status);
    this.startPolling();
    if (attachedToExisting) {
      this.handlers.onLog?.("attached to running Codex app-server");
      return {};
    }

    const initialized = await this.request<InitializeResponse>(
      "initialize",
      {
        clientInfo: {
          name: "hicodex_desktop",
          title: "HiCodex Desktop",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [],
        },
      },
      15_000,
    );
    await this.notify("initialized");
    this.handlers.onLog?.("initialized Codex app-server");
    return initialized;
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.connected = false;
    this.connectPromise = null;
    this.rejectPending("Disconnected from Codex app-server");
    const status = await stopAppServer();
    this.handlers.onHostStatus?.(status);
  }

  async request<T = unknown>(method: string, params?: unknown, timeoutMs = 60_000): Promise<T> {
    const id = `${this.idPrefix}-${this.nextId++}`;
    const message = params === undefined ? { id, method } : { id, method, params };
    await sendRaw(message);
    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await sendRaw(params === undefined ? { method } : { method, params });
  }

  async respond(id: RequestId, result: unknown): Promise<void> {
    await sendRaw({ id, result });
  }

  async reject(id: RequestId, message: string, code = -32000): Promise<void> {
    await sendRaw({ id, error: { code, message } });
  }

  async refreshStatus(): Promise<HostStatus> {
    const status = await getHostStatus();
    this.handlers.onHostStatus?.(status);
    return status;
  }

  private startPolling(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = window.setInterval(() => {
      void this.flushEvents();
    }, 120);
    void this.flushEvents();
  }

  private async flushEvents(): Promise<void> {
    let events: HostEvent[] = [];
    try {
      events = await pollEvents();
    } catch (error) {
      this.handlers.onLog?.(`failed to poll app-server events: ${formatError(error)}`, "error");
      return;
    }

    for (const event of events) {
      switch (event.type) {
        case "json":
          this.handleMessage(event.value);
          break;
        case "stderr":
          this.handlers.onLog?.(event.line, "warn");
          break;
        case "stdout":
        case "lifecycle":
          this.handlers.onLog?.("line" in event ? event.line : event.message);
          break;
        case "error":
          this.handlers.onLog?.(event.message, "error");
          break;
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (isResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      window.clearTimeout(pending.timeout);
      pending.resolve(message.result);
      return;
    }

    if (isError(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(message.error.message));
      return;
    }

    if (isRequest(message)) {
      this.handlers.onServerRequest?.(message);
      return;
    }

    if (isNotification(message)) {
      this.handlers.onNotification?.(message);
    }
  }

  private rejectPending(message: string): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
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
