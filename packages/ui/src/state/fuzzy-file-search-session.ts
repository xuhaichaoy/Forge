import type { JsonRpcNotification } from "@hicodex/codex-protocol";
import type { FuzzyFileSearchResponse } from "@hicodex/codex-protocol/generated/FuzzyFileSearchResponse";
import type { FuzzyFileSearchResult } from "@hicodex/codex-protocol/generated/FuzzyFileSearchResult";

export interface FuzzyFileSearchRequestClient {
  request<T = unknown>(method: string, params?: unknown, timeoutMs?: number | null): Promise<T>;
}

export interface WorkspaceFuzzyFileSearchSessionUpdated {
  sessionId: string;
  query: string;
  files: FuzzyFileSearchResult[];
}

export interface WorkspaceFuzzyFileSearchSessionCompleted {
  sessionId: string;
}

export interface WorkspaceFuzzyFileSearchSession {
  id: string;
  update(query: string): Promise<void>;
  stop(): Promise<void>;
}

type SessionSupport = "unknown" | "supported" | "unsupported";
type UpdatedCallback = (payload: WorkspaceFuzzyFileSearchSessionUpdated) => void;
type CompletedCallback = (payload: WorkspaceFuzzyFileSearchSessionCompleted) => void;

const LEGACY_CANCELLATION_TOKEN = "vscode-fuzzy-file-search";

/*
 * Codex Desktop's workspace file search controller streams preferred session
 * updates and falls back to legacy fuzzyFileSearch only when the session API
 * is unavailable.
 */
export class WorkspaceFuzzyFileSearchController {
  private sessionSupport: SessionSupport = "unknown";
  private updatedCallbacks: UpdatedCallback[] = [];
  private completedCallbacks: CompletedCallback[] = [];

  constructor(private readonly client: FuzzyFileSearchRequestClient) {}

  async createSession(options: {
    roots: string[];
    onUpdated?: UpdatedCallback;
    onCompleted?: CompletedCallback;
  }): Promise<WorkspaceFuzzyFileSearchSession> {
    const sessionId = createSessionId();
    if (this.sessionSupport !== "unsupported") {
      try {
        await this.client.request("fuzzyFileSearch/sessionStart", {
          sessionId,
          roots: options.roots,
        });
        this.sessionSupport = "supported";
      } catch (error) {
        if (isMethodNotFoundError(error)) {
          this.sessionSupport = "unsupported";
        } else {
          throw error;
        }
      }
    }

    let stopped = false;
    const removeUpdated = options.onUpdated
      ? this.addUpdatedCallback((payload) => {
          if (payload.sessionId === sessionId) options.onUpdated?.(payload);
        })
      : () => {};
    const removeCompleted = options.onCompleted
      ? this.addCompletedCallback((payload) => {
          if (payload.sessionId === sessionId) options.onCompleted?.(payload);
        })
      : () => {};

    return {
      id: sessionId,
      update: async (query: string) => {
        if (stopped) return;
        await this.updateQuery({ sessionId, query, roots: options.roots });
      },
      stop: async () => {
        if (stopped) return;
        stopped = true;
        removeUpdated();
        removeCompleted();
        await this.stopSession(sessionId);
      },
    };
  }

  async searchOnce(options: {
    roots: string[];
    query: string;
    timeoutMs?: number;
  }): Promise<FuzzyFileSearchResponse> {
    let session: WorkspaceFuzzyFileSearchSession | null = null;
    let latestFiles: FuzzyFileSearchResult[] = [];
    const timeoutMs = options.timeoutMs ?? 120_000;
    return new Promise<FuzzyFileSearchResponse>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        const activeSession = session;
        session = null;
        void (async () => {
          try {
            await activeSession?.stop();
          } catch {
            // A failed cleanup should not hide the completed search result.
          }
          callback();
        })();
      };
      timeout = setTimeout(() => {
        finish(() => reject(new Error("Fuzzy file search timed out.")));
      }, timeoutMs);

      void (async () => {
        try {
          const createdSession = await this.createSession({
            roots: options.roots,
            onUpdated: (payload) => {
              if (payload.query === options.query) latestFiles = payload.files;
            },
            onCompleted: () => finish(() => resolve({ files: latestFiles })),
          });
          if (settled) {
            await createdSession.stop().catch(() => {});
            return;
          }
          session = createdSession;
          await session.update(options.query);
        } catch (error) {
          finish(() => reject(error));
        }
      })();
    });
  }

  handleNotification(message: JsonRpcNotification): boolean {
    if (message.method === "fuzzyFileSearch/sessionUpdated") {
      const payload = message.params as WorkspaceFuzzyFileSearchSessionUpdated | undefined;
      if (!payload?.sessionId) return true;
      for (const callback of Array.from(this.updatedCallbacks)) callback(payload);
      return true;
    }
    if (message.method === "fuzzyFileSearch/sessionCompleted") {
      const payload = message.params as WorkspaceFuzzyFileSearchSessionCompleted | undefined;
      if (!payload?.sessionId) return true;
      for (const callback of Array.from(this.completedCallbacks)) callback(payload);
      return true;
    }
    return false;
  }

  private async updateQuery(input: { sessionId: string; query: string; roots: string[] }): Promise<void> {
    if (this.sessionSupport === "supported") {
      try {
        await this.client.request("fuzzyFileSearch/sessionUpdate", {
          sessionId: input.sessionId,
          query: input.query,
        });
        return;
      } catch (error) {
        if (!isSessionNotFoundError(error)) throw error;
        await this.client.request("fuzzyFileSearch/sessionStart", {
          sessionId: input.sessionId,
          roots: input.roots,
        });
        await this.client.request("fuzzyFileSearch/sessionUpdate", {
          sessionId: input.sessionId,
          query: input.query,
        });
        return;
      }
    }

    const result = await this.client.request<FuzzyFileSearchResponse>(
      "fuzzyFileSearch",
      {
        query: input.query,
        roots: input.roots,
        cancellationToken: LEGACY_CANCELLATION_TOKEN,
      },
      120_000,
    );
    this.onSessionUpdated({
      sessionId: input.sessionId,
      query: input.query,
      files: result.files,
    });
    this.onSessionCompleted({ sessionId: input.sessionId });
  }

  private addUpdatedCallback(callback: UpdatedCallback): () => void {
    this.updatedCallbacks.push(callback);
    return () => {
      this.updatedCallbacks = this.updatedCallbacks.filter((item) => item !== callback);
    };
  }

  private addCompletedCallback(callback: CompletedCallback): () => void {
    this.completedCallbacks.push(callback);
    return () => {
      this.completedCallbacks = this.completedCallbacks.filter((item) => item !== callback);
    };
  }

  private onSessionUpdated(payload: WorkspaceFuzzyFileSearchSessionUpdated): void {
    for (const callback of Array.from(this.updatedCallbacks)) callback(payload);
  }

  private onSessionCompleted(payload: WorkspaceFuzzyFileSearchSessionCompleted): void {
    for (const callback of Array.from(this.completedCallbacks)) callback(payload);
  }

  private async stopSession(sessionId: string): Promise<void> {
    if (this.sessionSupport === "unsupported") return;
    try {
      await this.client.request("fuzzyFileSearch/sessionStop", { sessionId });
    } catch (error) {
      if (isMethodNotFoundError(error)) {
        this.sessionSupport = "unsupported";
      }
    }
  }
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fuzzy-file-search-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isMethodNotFoundError(error: unknown): boolean {
  return errorMessage(error).toLowerCase().includes("method not found");
}

function isSessionNotFoundError(error: unknown): boolean {
  return errorMessage(error).toLowerCase().includes("fuzzy file search session not found");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
