import type {
  ComposerMentionOption,
  ComposerMentionTrigger,
} from "../state/composer-workflow";
import { removeMentionTriggerText } from "../state/composer-workflow";

export function isSlashInput(value: string): boolean {
  const trimmed = value.trimStart();
  return trimmed.startsWith("/") && !trimmed.includes("\n");
}

export function slashSearchText(value: string): string {
  if (!isSlashInput(value)) return "";
  return value.trimStart().replace(/^\/+/, "");
}

export function mentionPromptReference(option: ComposerMentionOption, fallbackName: string): string {
  const name = option.name || fallbackName;
  // skill/app use $; plugin/agent use @; file mentions are inserted by path.
  const prefix = option.kind === "plugin" || option.kind === "agent" ? "@" : "$";
  return `[${prefix}${name}](${escapePromptPath(option.path)}) `;
}

export function replaceMentionTriggerText(
  input: string,
  trigger: ComposerMentionTrigger,
  promptText: string,
): string {
  if (!promptText.trim()) return removeMentionTriggerText(input, trigger);
  if (trigger.from < 0 || trigger.to < trigger.from || trigger.to > input.length) {
    return appendMentionPromptText(input, promptText);
  }
  const prefix = input.slice(0, trigger.from);
  const suffix = input.slice(trigger.to);
  const separator = suffix && !/^\s/.test(suffix) ? " " : "";
  return `${prefix}${promptText}${separator}${suffix}`;
}

function appendMentionPromptText(current: string, promptText: string): string {
  if (!promptText.trim()) return current;
  if (!current.trim()) return promptText;
  return `${current.trimEnd()}\n${promptText}`;
}

function escapePromptPath(value: string): string {
  if (/[\s()<>]/.test(value)) {
    return `<${value.replace(/\\/g, "\\\\").replace(/>/g, "\\>")}>`;
  }
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}
