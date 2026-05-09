export interface OpenThreadOptions {
  displayName?: string | null;
  model?: string | null;
  role?: string | null;
}

export type OpenThreadHandler = (threadId: string, options?: OpenThreadOptions) => void;
