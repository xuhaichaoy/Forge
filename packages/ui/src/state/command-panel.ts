import { booleanField } from "./command-panel-value-utils";
import {
  arrayField,
  cleanList,
  fieldText,
  responseItems,
} from "./command-panel-entry-fields";
import { projectAppEntries } from "./command-panel-app-entries";
import { projectMcpServerEntries } from "./command-panel-mcp-entries";
import { projectPluginEntries } from "./command-panel-plugin-entries";
import { projectSkillEntries } from "./command-panel-skill-entries";
import type { CommandPanelEntry } from "./command-panel-types";

export {
  groupCommandPanelEntries,
  groupCommandPanelEntriesForRendering,
} from "./command-panel-groups";
export {
  commandPanelChatCreateEntry,
  commandPanelHandleEscape,
  commandPanelHasSearchInput,
  commandPanelShouldShowChatCreateEmptyState,
  commandPanelSubModeFromKind,
  commandPanelSubModeFromPanel,
  commandPanelSubModePlaceholder,
  createCommandPanelState,
} from "./command-panel-state";
export type {
  CommandPanelEscapeInput,
  CommandPanelEscapeResult,
  CommandPanelOptions,
} from "./command-panel-state";
export {
  commandPanelThreadGroup,
  isAppBackedPanel,
  isAppBackedPanelState,
  isCommandMenuPanel,
  orderCommandPanelThreadsByPinned,
} from "./command-panel-selectors";
export {
  joinRootRelativePath,
  projectFileSearchEntries,
} from "./command-panel-file-search";
export type { CommandGroupSection } from "./command-panel-groups";

// Pure type layer extracted to command-panel-types.ts — breaks the six
// type-only satellite cycles (file-search/groups/selectors/skill-helpers/
// state/value-utils used to import these types back from this module).
// Re-exported here so the public API of this module is unchanged.
export type {
  CommandPanelEntry,
  CommandPanelEntryAction,
  CommandPanelEntryKind,
  CommandPanelKind,
  CommandPanelRenderedItem,
  CommandPanelSecondaryAction,
  CommandPanelState,
  CommandPanelStatus,
  CommandPanelSubMode,
  ConfigWriteActionEdit,
  ConfigWriteTarget,
  FileSearchResult,
} from "./command-panel-types";
// Entry projection split into per-domain modules; every previously public
// symbol is re-exported here so the 41 importers of this module keep their
// original paths.
export {
  projectMcpResourceReadResultEntries,
  projectMcpServerEntries,
  projectMcpToolCallResultEntries,
} from "./command-panel-mcp-entries";
export {
  projectPluginSkillReadResultEntries,
  projectRecommendedSkillEntries,
  projectSkillFileReadResultEntries,
  projectSkillManagementEntries,
  starterSkillTarget,
} from "./command-panel-skill-entries";
export type { StarterSkillTarget } from "./command-panel-skill-entries";
export { projectPluginEntries } from "./command-panel-plugin-entries";
export { projectRequiredAppEntries } from "./command-panel-app-entries";
export function projectCommandPanelEntries(value: {
  mcp?: unknown;
  skills?: unknown;
  hooks?: unknown;
  apps?: unknown;
  plugins?: unknown;
  experimental?: unknown;
  collaboration?: unknown;
}): CommandPanelEntry[] {
  return [
    ...projectMcpServerEntries(value.mcp),
    ...projectSkillEntries(value.skills),
    ...projectHookEntries(value.hooks),
    ...projectAppEntries(value.apps),
    ...projectPluginEntries(value.plugins, { apps: value.apps }),
    ...projectExperimentalFeatureEntries(value.experimental),
    ...projectCollaborationModeEntries(value.collaboration),
  ];
}
function projectHookEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).flatMap((item) => {
    if (Array.isArray(item.hooks)) {
      const cwd = fieldText(item, "cwd");
      return arrayField(item, "hooks").map((hook) => hookEntry(hook, cwd));
    }
    return [hookEntry(item)];
  });
}
function hookEntry(hook: Record<string, unknown>, cwd = ""): CommandPanelEntry {
  const key = fieldText(hook, "key") || "hook";
  return {
    id: `hook:${key}`,
    title: key,
    kind: "hook",
    status: booleanField(hook, "enabled") ? "enabled" : undefined,
    meta: fieldText(hook, "eventName") || undefined,
    details: cleanList([
      fieldText(hook, "matcher") && `Matcher: ${fieldText(hook, "matcher")}`,
      fieldText(hook, "command") && `Command: ${fieldText(hook, "command")}`,
      cwd && `CWD: ${cwd}`,
    ]),
  };
}
function projectExperimentalFeatureEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).map((feature, index) => {
    const name = fieldText(feature, "name") || `feature-${index + 1}`;
    return {
      id: `experimental:${name}`,
      title: fieldText(feature, "displayName") || name,
      kind: "experimentalFeature",
      status: booleanField(feature, "enabled") ? "enabled" : "disabled",
      meta: fieldText(feature, "stage") || undefined,
      details: cleanList([fieldText(feature, "description"), fieldText(feature, "announcement")]),
    };
  });
}
function projectCollaborationModeEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).map((mode, index) => {
    const name = fieldText(mode, "name") || `mode-${index + 1}`;
    return {
      id: `collaboration:${name}`,
      title: name,
      kind: "collaborationMode",
      meta: fieldText(mode, "mode") || undefined,
      details: cleanList([
        fieldText(mode, "model") && `Model: ${fieldText(mode, "model")}`,
        fieldText(mode, "reasoning_effort") && `Reasoning: ${fieldText(mode, "reasoning_effort")}`,
      ]),
    };
  });
}
