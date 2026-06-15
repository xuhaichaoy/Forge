/*
 * Pure type leaf for the MCP tool-approval detail shapes shared between
 * state/approval-requests and state/approval-request-mcp-tool-approval.
 * Extracted from ./approval-requests so the helper module's type-only back
 * edge no longer closes a cycle with approval-requests' value imports of the
 * helper. approval-requests re-exports these names in place, so existing
 * import paths keep working unchanged. Type declarations only — no values.
 */
export interface PendingRequestMcpToolApproval {
  connectorName: string;
  riskLevel: string | null;
  toolParamEntries: PendingRequestMcpToolParamEntry[];
}

export interface PendingRequestMcpToolParamEntry {
  name: string;
  label: string;
  displayKind: "text" | "json";
  previewText: string;
  expandedText: string;
  isExpandable: boolean;
}
