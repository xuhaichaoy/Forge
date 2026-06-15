/*
 * Pure type leaf for the MCP-app detail view-model shapes shared between
 * mcp-app-sandbox.tsx, mcp-app-bridge.ts and mcp-app-sandbox-srcdoc.ts.
 * Extracted from ./mcp-app-sandbox so the bridge/srcdoc type-only back edges
 * no longer close cycles with the sandbox's value imports of them.
 * mcp-app-sandbox re-exports these names in place, so existing import paths
 * keep working unchanged. ./mcp-app-frame only imports lib/format and
 * state/thread-item-fields, so depending on it here cannot re-close the cycle.
 */
import type { McpAppFrameViewModel } from "./mcp-app-frame";

/*
 * The `mcpApp` variant of `ToolActivityDetailViewModel`. It lives here (rather
 * than inline in the detail-file union) so the protocol helpers in
 * mcp-app-sandbox.tsx can reference it without importing back from
 * tool-activity-detail.tsx. The detail file's `ToolActivityDetailViewModel`
 * union references this exported shape.
 */
export interface McpAppDetailViewModel {
  kind: "mcpApp";
  id: string;
  running: boolean;
  name: string;
  server: string;
  tool: string;
  resourceUri: string;
  inlineFrame: McpAppFrameViewModel | null;
  toolArguments: unknown;
  toolOutput: unknown;
  toolResult: unknown;
  toolResponseMetadata: unknown;
  argumentsText: string;
  resultText: string;
  errorText: string;
  status: string;
}

export type McpAppDisplayMode = "inline" | "fullscreen";
