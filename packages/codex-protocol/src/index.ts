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

export type { TextElement } from "./generated/v2/TextElement";
export type { UserInput } from "./generated/v2/UserInput";
export type { Thread } from "./generated/v2/Thread";
export type { Turn } from "./generated/v2/Turn";
export type { ThreadItem } from "./generated/v2/ThreadItem";
export type { ThreadStartParams } from "./generated/v2/ThreadStartParams";
export type { TurnStartParams } from "./generated/v2/TurnStartParams";
export type { CollaborationModeListParams } from "./generated/v2/CollaborationModeListParams";
export type { CollaborationModeListResponse } from "./generated/v2/CollaborationModeListResponse";
export type { CollaborationModeMask } from "./generated/v2/CollaborationModeMask";
export type { CollaborationMode } from "./generated/CollaborationMode";
export type { ModeKind } from "./generated/ModeKind";
export type { ReasoningEffort } from "./generated/ReasoningEffort";
export type { Settings } from "./generated/Settings";
export type { InputModality } from "./generated/InputModality";
export type { ImageDetail } from "./generated/ImageDetail";
export type { ThreadBackgroundTerminalsCleanResponse } from "./generated/v2/ThreadBackgroundTerminalsCleanResponse";
export type { ThreadGoal } from "./generated/v2/ThreadGoal";
export type { ThreadGoalClearResponse } from "./generated/v2/ThreadGoalClearResponse";
export type { ThreadGoalGetResponse } from "./generated/v2/ThreadGoalGetResponse";
export type { ThreadGoalSetResponse } from "./generated/v2/ThreadGoalSetResponse";

export type { ThreadStatus } from "./generated/v2/ThreadStatus";
export type { ThreadActiveFlag } from "./generated/v2/ThreadActiveFlag";

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
  models?: string[];
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
