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
  listenEvents,
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
  timeout: number | null;
};

const INITIALIZE_TIMEOUT_MS = 60_000;

export interface CodexRpcClientHandlers {
  onHostStatus?: (status: HostStatus) => void;
  onNotification?: (message: JsonRpcNotification) => void;
  onServerRequest?: (message: JsonRpcRequest) => void;
  onLog?: (line: string, level?: "info" | "warn" | "error") => void;
}

export class CodexJsonRpcClient {
  private nextId = 1;
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
      if (!formatError(error).includes("already running")) throw error;
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
            name: "hicodex_desktop",
            title: "HiCodex Desktop",
            version: "0.1.0",
          },
          capabilities: {
            experimentalApi: true,
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
    this.assertActive();
    const id = `${this.idPrefix}-${this.nextId++}`;
    const message = params === undefined ? { id, method } : { id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timeout = timeoutMs === null
        ? null
        : window.setTimeout(() => {
            this.pending.delete(id);
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
          this.rejectPendingRequest(id, error);
        });
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    this.assertActive();
    await sendRaw(params === undefined ? { method } : { method, params });
  }

  async respond(id: RequestId, result: unknown): Promise<void> {
    this.assertActive();
    await sendRaw({ id, result });
  }

  async reject(id: RequestId, message: string, code = -32000): Promise<void> {
    this.assertActive();
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

  private handleMessage(message: JsonRpcMessage): void {
    if (this.disposed) return;
    if (isResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearPendingTimeout(pending);
      pending.resolve(message.result);
      return;
    }

    if (isError(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearPendingTimeout(pending);
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
      clearPendingTimeout(pending);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  private rejectPendingRequest(id: RequestId, error: unknown): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearPendingTimeout(pending);
    pending.reject(error instanceof Error ? error : new Error(formatError(error)));
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("Codex JSON-RPC client was disposed");
    }
  }
}

function clearPendingTimeout(pending: PendingRequest): void {
  if (pending.timeout !== null) window.clearTimeout(pending.timeout);
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
