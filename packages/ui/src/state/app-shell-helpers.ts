import type { Thread } from "@hicodex/codex-protocol";
import type { CommandPanelEntry } from "./command-panel";
import {
  DEFAULT_SLASH_COMMANDS,
  slashCommandsForComposerMode,
  type ComposerMode,
} from "./composer-workflow";
import type { BrowserStorageLike } from "./image-generation-tool";

export function normalizedOption(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

export function normalizedAgentRole(value: string | null | undefined): string | null {
  const role = normalizedOption(value);
  return role && role !== "default" ? role : null;
}

export function shortThreadId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

export function browserStorage(): BrowserStorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function appendSkillPromptText(current: string, promptText: string): string {
  if (!promptText.trim()) return current;
  if (!current.trim()) return promptText;
  return `${current.trimEnd()}\n${promptText}`;
}

export function decodeBase64Utf8(value: string): string {
  if (!value) return "";
  const binary = globalThis.atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function threadGitBranch(thread: Thread | null): string | null {
  const gitInfo = thread?.gitInfo;
  if (!gitInfo || typeof gitInfo !== "object") return null;
  const branch = (gitInfo as Record<string, unknown>).branch;
  return typeof branch === "string" && branch.trim() ? branch.trim() : null;
}

export function slashCommandEntries(mode: ComposerMode): CommandPanelEntry[] {
  return slashCommandsForComposerMode(mode, DEFAULT_SLASH_COMMANDS)
    .filter((command) => !command.hidden)
    .map((command) => {
      const disabled = command.supported === "pending";
      return {
        id: `command:${command.id}`,
        title: `/${command.id}`,
        kind: "status",
        status: disabled ? "not wired" : command.supported,
        meta: command.title,
        disabled,
        details: [
          command.description,
          command.inlineArgs ? `Args: ${command.inlineArgs}` : "",
          command.aliases?.length ? `Aliases: ${command.aliases.join(", ")}` : "",
          disabled ? "Visible for Codex Desktop parity; app-server wiring is not available yet." : "",
        ].filter(Boolean),
      };
    });
}
