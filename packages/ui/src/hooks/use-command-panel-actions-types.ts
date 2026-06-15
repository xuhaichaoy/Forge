/*
 * Shared type aliases for the useCommandPanelActions hook and its flow
 * modules; the hook re-exports them so consumer import paths are unchanged.
 */
import type {
  CommandPanelEntry,
  CommandPanelKind,
  CommandPanelOptions,
} from "../state/command-panel";

export type CommandPanelSink = (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
export type McpToolFormAction = Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openMcpToolForm" }>;
export type McpServerFormAction = Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openMcpServerForm" }>;
