export interface OpenThreadOptions {
  displayName?: string | null;
  panelKind?: "backgroundAgent" | "sideChat";
  model?: string | null;
  role?: string | null;
}

export type OpenThreadHandler = (threadId: string, options?: OpenThreadOptions) => void;

export type OpenRemoteTaskHandler = (taskId: string) => void;
