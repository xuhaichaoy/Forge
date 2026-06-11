import type { I18nMessageDescriptor, I18nValues } from "./i18n";
import type { CommandPanelEntry, CommandPanelSecondaryAction } from "./command-panel";
import type { ThreadContextDefaults } from "./codex-reducer";
import { effectiveThreadMemoryPreferences } from "./thread-workflow";

type FormatMessage = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;

export function projectMemoryCommandEntries(
  activeThreadId: string | null,
  context: ThreadContextDefaults | null,
  formatMessage?: FormatMessage,
): CommandPanelEntry[] {
  const fm = (id: string, defaultMessage: string): string =>
    formatMessage ? formatMessage({ id, defaultMessage }) : defaultMessage;
  // Composite bullet "<label>: <description>" — both halves have Codex ids, so
  // they localize together (the "Use memories"/"Generate memories" prefix is
  // composer.memoriesSlashCommand.{use,generate}MemoriesLabel).
  const bullet = (labelId: string, labelEn: string, descId: string, descEn: string): string =>
    `${fm(`composer.memoriesSlashCommand.${labelId}`, labelEn)}: ${fm(`composer.memoriesSlashCommand.${descId}`, descEn)}`;
  const preferences = effectiveThreadMemoryPreferences(context);
  const entries: CommandPanelEntry[] = [{
    id: "memories:defaults",
    title: "New chats",
    kind: "status",
    status: memorySummary(preferences.useMemories, preferences.generateMemories),
    // codex: subtitle aligned to upstream
    //   composer.memoriesSlashCommand.newThreadDialogSubtitle =
    //     "These switches apply to the chat started from this composer"
    meta: fm("composer.memoriesSlashCommand.newThreadDialogSubtitle", "These switches apply to the chat started from this composer"),
    // codex: detail bullets align to upstream ICU defaults —
    //   composer.memoriesSlashCommand.useMemoriesDescription      = "Let Codex bring existing memories into this chat’s context"
    //   composer.memoriesSlashCommand.generateMemoriesDescription = "Allow Codex to use this chat when creating new memories later"
    details: [
      bullet("useMemoriesLabel", "Use memories", "useMemoriesDescription", "Let Codex bring existing memories into this chat’s context"),
      bullet("generateMemoriesLabel", "Generate memories", "generateMemoriesDescription", "Allow Codex to use this chat when creating new memories later"),
    ],
    secondaryActions: [
      memoryConfigAction("use", !preferences.useMemories),
      memoryConfigAction("generate", !preferences.generateMemories),
    ],
  }];

  if (activeThreadId) {
    entries.push({
      id: `memories:thread:${activeThreadId}`,
      // codex: panel title aligned to upstream
      //   composer.memoriesSlashCommand.dialogTitle = "Chat memories"
      title: fm("composer.memoriesSlashCommand.dialogTitle", "Chat memories"),
      kind: "status",
      // codex: subtitle aligned to upstream
      //   composer.memoriesSlashCommand.existingThreadDialogSubtitle = "These switches apply to the current chat"
      status: fm("composer.memoriesSlashCommand.existingThreadDialogSubtitle", "These switches apply to the current chat"),
      meta: `thread ${activeThreadId}`,
      // codex: first bullet aligns to upstream
      //   composer.memoriesSlashCommand.useMemoriesStartedDescription = "Cannot be changed after conversation has started"
      details: [
        bullet("useMemoriesLabel", "Use memories", "useMemoriesStartedDescription", "Cannot be changed after conversation has started"),
        "Generate memories controls whether this chat remains eligible for future memory generation.",
      ],
      secondaryActions: [
        {
          id: `memories:thread:${activeThreadId}:enable`,
          label: "Enable",
          title: "Enable memory generation for this chat",
          tone: "success",
          action: {
            type: "setThreadMemoryMode",
            title: "Memories",
            threadId: activeThreadId,
            mode: "enabled",
          },
        },
        {
          id: `memories:thread:${activeThreadId}:disable`,
          label: "Disable",
          title: "Disable memory generation for this chat",
          tone: "danger",
          action: {
            type: "setThreadMemoryMode",
            title: "Memories",
            threadId: activeThreadId,
            mode: "disabled",
          },
        },
      ],
    });
  }

  return entries;
}

function memoryConfigAction(kind: "use" | "generate", enabled: boolean): CommandPanelSecondaryAction {
  const title = kind === "use" ? "Use memories" : "Generate memories";
  const keyPath = kind === "use" ? "memories.use_memories" : "memories.generate_memories";
  return {
    id: `memories:defaults:${kind}:${enabled ? "on" : "off"}`,
    label: enabled ? "Turn on" : "Turn off",
    title: `${enabled ? "Enable" : "Disable"} ${title.toLowerCase()}`,
    tone: enabled ? "success" : "danger",
    action: {
      type: "writeConfig",
      title: "Memories",
      message: `${title} ${enabled ? "enabled" : "disabled"} for new chats.`,
      edits: [{ keyPath, value: enabled, mergeStrategy: "upsert" }],
      reloadUserConfig: true,
    },
  };
}

function memorySummary(useMemories: boolean, generateMemories: boolean): string {
  return `use ${useMemories ? "on" : "off"} · generate ${generateMemories ? "on" : "off"}`;
}
