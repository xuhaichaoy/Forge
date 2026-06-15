import type { I18nMessageDescriptor, I18nValues } from "./i18n";
import type {
  CommandPanelEntry,
  CommandPanelEntryKind,
  CommandPanelRenderedItem,
} from "./command-panel-types";

type FormatMessage = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;

export function groupCommandPanelEntriesForRendering(entries: CommandPanelEntry[]): CommandPanelRenderedItem[] {
  const renderedItems: CommandPanelRenderedItem[] = [];
  let currentGroupKey: string | null = null;
  for (const entry of entries) {
    const groupLabel = entry.groupLabel?.trim();
    const groupKey = entry.groupKey?.trim() || groupLabel;
    if (groupLabel && groupKey && groupKey !== currentGroupKey) {
      renderedItems.push({ type: "group", key: `group:${groupKey}`, label: groupLabel });
      currentGroupKey = groupKey;
    }
    if (!groupKey) {
      currentGroupKey = null;
    }
    renderedItems.push({ type: "entry", key: entry.id, entry });
  }
  return renderedItems;
}

// codex: app-main-*.js - command menu group taxonomy. The Codex dialog
// renders top-level sections in this fixed order, mirroring the
// `commandMenuGroupKey` taxonomy declared by the command catalog (see
// state/commands.ts COMMAND_DESCRIPTORS / state/command-registry.ts
// CommandGroup). Sections without entries are skipped at render time.
// titleId mirrors Codex's `codex.commandGroup.<key>` section labels (localized
// in the command menu); `title` is the English defaultMessage fallback.
const GROUP_TITLE_ORDER: ReadonlyArray<{ key: string; titleId: string; title: string }> = [
  { key: "thread",     titleId: "codex.commandGroup.thread",     title: "Chat" },
  { key: "navigation", titleId: "codex.commandGroup.navigation", title: "Navigation" },
  { key: "panels",     titleId: "codex.commandGroup.panels",     title: "Panels" },
  { key: "workspace",  titleId: "codex.commandGroup.workspace",  title: "Project" },
  { key: "skills",     titleId: "codex.commandGroup.skills",     title: "Skills" },
  { key: "configure",  titleId: "codex.commandGroup.configure",  title: "Configure" },
  { key: "app",        titleId: "codex.commandGroup.app",        title: "App" },
];

// codex: app-main-*.js - bucket the command menu's kind-typed
// entries under the taxonomy when an entry doesn't already declare a
// `commandMenuGroupKey`. Anything we can't classify is forwarded to the
// catch-all "Other" section so chat-specific groups (pinned-chats /
// recent-chats) keep their existing rendering.
function defaultGroupKeyForKind(kind: CommandPanelEntryKind): string {
  switch (kind) {
    case "thread":
    case "diff":
      return "thread";
    case "file":
      return "workspace";
    case "skill":
      return "skills";
    case "mcpServer":
    case "mcpTool":
    case "mcpResource":
    case "mcpResourceTemplate":
    case "hook":
    case "experimentalFeature":
    case "collaborationMode":
    case "theme":
    case "status":
      return "configure";
    case "app":
    case "plugin":
      return "app";
    default:
      return "other";
  }
}

export interface CommandGroupSection {
  groupKey: string;
  title: string;
  entries: CommandPanelEntry[];
}

// codex: app-main-*.js - split flat command menu entries into the
// Codex command menu's top-level sections. Pinned / Recent chats (which
// already carry a per-entry groupLabel) are emitted in a leading "Other"
// section preserving their original order so the existing
// groupCommandPanelEntriesForRendering pass still produces sub-headers.
export function groupCommandPanelEntries(
  entries: CommandPanelEntry[],
  formatMessage?: FormatMessage,
): CommandGroupSection[] {
  const bucketed = new Map<string, CommandPanelEntry[]>();
  const otherKey = "other";
  const knownKeys = new Set<string>(GROUP_TITLE_ORDER.map((item) => item.key));

  for (const entry of entries) {
    const declared = entry.groupKey?.trim();
    // Per-entry groupLabel (pinned-chats / recent-chats) signals an
    // existing sub-group that the renderer already handles. These keys are
    // not part of the taxonomy, so we surface them in the leading "Other"
    // bucket without dropping their per-entry headers.
    const taxonomyKey = declared && knownKeys.has(declared)
      ? declared
      : entry.groupLabel
        ? otherKey
        : declared || defaultGroupKeyForKind(entry.kind);
    const finalKey = knownKeys.has(taxonomyKey) ? taxonomyKey : otherKey;
    const bucket = bucketed.get(finalKey);
    if (bucket) {
      bucket.push(entry);
    } else {
      bucketed.set(finalKey, [entry]);
    }
  }

  const sections: CommandGroupSection[] = [];
  // Emit the "Other" bucket first so pinned / recent chats stay at the
  // top of the panel (matching Codex's chat-first ordering).
  const otherEntries = bucketed.get(otherKey);
  if (otherEntries && otherEntries.length > 0) {
    sections.push({ groupKey: otherKey, title: "Other", entries: otherEntries });
  }
  for (const { key, titleId, title } of GROUP_TITLE_ORDER) {
    const groupEntries = bucketed.get(key);
    if (groupEntries && groupEntries.length > 0) {
      const sectionTitle = formatMessage ? formatMessage({ id: titleId, defaultMessage: title }) : title;
      sections.push({ groupKey: key, title: sectionTitle, entries: groupEntries });
    }
  }
  return sections;
}
