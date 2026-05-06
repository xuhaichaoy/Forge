export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type RequestId = string | number;

export interface JsonRpcRequest<Params = unknown> {
  id: RequestId;
  method: string;
  params?: Params;
}

export interface JsonRpcNotification<Params = unknown> {
  method: string;
  params?: Params;
}

export interface JsonRpcResponse<Result = unknown> {
  id: RequestId;
  result: Result;
}

export interface JsonRpcError {
  id: RequestId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse
  | JsonRpcError;

export type TextElement = {
  byteRange: unknown;
  placeholder: string | null;
  [key: string]: unknown;
};

export type UserInput =
  | { type: "text"; text: string; text_elements: TextElement[] }
  | { type: "image"; url: string }
  | { type: "localImage"; path: string }
  | { type: "skill"; path: string; name?: string }
  | { type: "mention"; path: string; name?: string };

export interface Thread {
  id: string;
  name?: string | null;
  status?: unknown;
  path?: string | null;
  cwd?: string | null;
  turns?: Turn[];
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
}

export interface Turn {
  id: string;
  status?: unknown;
  items?: ThreadItem[];
  [key: string]: unknown;
}

export type ThreadItem =
  | { type: "userMessage"; id: string; content: UserInput[] }
  | { type: "agentMessage"; id: string; text: string; phase?: string | null; memoryCitation?: unknown }
  | { type: "plan"; id: string; text: string }
  | { type: "reasoning"; id: string; summary?: string[]; content?: string[] }
  | {
      type: "commandExecution";
      id: string;
      command: string;
      cwd?: string;
      status?: string;
      aggregatedOutput?: string | null;
      exitCode?: number | null;
      durationMs?: number | null;
    }
  | {
      type: "fileChange";
      id: string;
      status?: string;
      changes?: Array<Record<string, unknown>>;
    }
  | {
      type: "mcpToolCall";
      id: string;
      server?: string;
      tool: string;
      status?: string;
      arguments?: JsonValue;
      result?: unknown;
      error?: unknown;
      durationMs?: number | null;
    }
  | {
      type: "dynamicToolCall";
      id: string;
      namespace?: string | null;
      tool: string;
      status?: string;
      arguments?: JsonValue;
      contentItems?: unknown[] | null;
      success?: boolean | null;
      durationMs?: number | null;
    }
  | { type: "webSearch"; id: string; query: string; action?: unknown }
  | { type: "imageView"; id: string; path: string }
  | { type: "contextCompaction"; id: string }
  | { type: string; id: string; [key: string]: unknown };

export interface ThreadStartParams {
  cwd?: string | null;
  model?: string | null;
  modelProvider?: string | null;
  approvalPolicy?: string | null;
  sandbox?: string | null;
  ephemeral?: boolean | null;
}

export interface TurnStartParams {
  threadId: string;
  input: UserInput[];
  cwd?: string | null;
  model?: string | null;
  effort?: string | null;
  approvalPolicy?: string | null;
  sandboxPolicy?: unknown;
}

export interface InitializeResponse {
  userAgent?: string;
  codexHome?: string;
  platformFamily?: string;
  platformOs?: string;
  [key: string]: unknown;
}

export interface ModelConfig {
  id: string;
  name: string;
  protocol: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  supportsImageInput?: boolean;
}

export interface TeamSummary {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  plan: "trial" | "pro" | "enterprise";
  active: boolean;
}
