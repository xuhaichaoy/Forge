import { projectCommandPanelEntries, projectPluginEntries } from "./command-panel";
import type { CommandPanelEntry } from "./command-panel";
import type { ComposerMentionOption } from "./composer-workflow";

export function mentionOptionsFromFuzzyFiles(files: Array<Record<string, unknown>>): ComposerMentionOption[] {
  const options: ComposerMentionOption[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const path = stringRecordValue(file, "path")
      || stringRecordValue(file, "fsPath")
      || stringRecordValue(file, "file_path");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = stringRecordValue(file, "file_name")
      || stringRecordValue(file, "label")
      || basename(path);
    const detail = stringRecordValue(file, "relativePathWithoutFileName")
      || stringRecordValue(file, "relative_path_without_file_name")
      || path;
    const scoreValue = file.score;
    options.push({
      kind: "file",
      name,
      path,
      detail,
      ...(typeof scoreValue === "number" ? { score: scoreValue } : {}),
    });
  }
  return options.slice(0, 25);
}

export function mentionOptionsFromSkillsResponse(value: unknown, query: string): ComposerMentionOption[] {
  const entries = projectCommandPanelEntries({ skills: value });
  const normalizedQuery = query.trim().toLowerCase();
  const options: ComposerMentionOption[] = [];
  for (const entry of entries) {
    const action = entry.action;
    if (entry.disabled || action?.type !== "attachSkill") continue;
    if (normalizedQuery && !skillEntryMatchesQuery(entry, normalizedQuery)) continue;
    options.push({
      kind: "skill",
      name: action.name,
      path: action.path,
      detail: entry.meta ?? "Skill",
      promptText: action.promptText,
    });
  }
  return options.slice(0, 25);
}

export function mentionOptionsFromAppsResponse(value: unknown, query: string): ComposerMentionOption[] {
  const entries = projectCommandPanelEntries({ apps: value });
  const normalizedQuery = query.trim().toLowerCase();
  const options: ComposerMentionOption[] = [];
  for (const entry of entries) {
    const action = entry.action;
    if (entry.disabled || action?.type !== "attachApp") continue;
    if (normalizedQuery && !appEntryMatchesQuery(entry, normalizedQuery)) continue;
    options.push({
      kind: "app",
      name: action.name,
      path: action.path,
      detail: entry.meta ?? "App",
      promptText: action.promptText,
    });
  }
  return options.slice(0, 25);
}

export function mentionOptionsFromPluginsResponse(
  value: unknown,
  query: string,
  apps?: unknown,
): ComposerMentionOption[] {
  const entries = projectPluginEntries(value, { apps });
  const normalizedQuery = query.trim().toLowerCase();
  const options: ComposerMentionOption[] = [];
  for (const entry of entries) {
    const action = entry.action;
    if (entry.disabled || action?.type !== "attachPlugin") continue;
    if (normalizedQuery && !pluginEntryMatchesQuery(entry, normalizedQuery)) continue;
    options.push({
      kind: "plugin",
      name: action.name,
      path: action.path,
      detail: entry.meta ?? "Plugin",
      promptText: action.promptText,
    });
  }
  return options.slice(0, 25);
}

export function dedupeComposerMentionOptions(options: ComposerMentionOption[]): ComposerMentionOption[] {
  const seen = new Set<string>();
  const deduped: ComposerMentionOption[] = [];
  for (const option of options) {
    const key = `${option.kind ?? "file"}:${option.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(option);
  }
  return deduped;
}

function skillEntryMatchesQuery(entry: CommandPanelEntry, normalizedQuery: string): boolean {
  const action = entry.action;
  const values = [
    entry.title,
    entry.meta,
    ...(entry.details ?? []),
    action?.type === "attachSkill" ? action.name : "",
    action?.type === "attachSkill" ? action.path : "",
  ];
  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function appEntryMatchesQuery(entry: CommandPanelEntry, normalizedQuery: string): boolean {
  const action = entry.action;
  const values = [
    entry.title,
    entry.meta,
    ...(entry.details ?? []),
    action?.type === "attachApp" ? action.name : "",
    action?.type === "attachApp" ? action.path : "",
  ];
  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function pluginEntryMatchesQuery(entry: CommandPanelEntry, normalizedQuery: string): boolean {
  const action = entry.action;
  const values = [
    entry.title,
    entry.meta,
    ...(entry.details ?? []),
    action?.type === "attachPlugin" ? action.name : "",
    action?.type === "attachPlugin" ? action.path : "",
  ];
  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function stringRecordValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "file";
}
