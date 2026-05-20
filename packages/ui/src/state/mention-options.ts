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
    const description = primaryEntryDescription(entry);
    options.push({
      kind: "skill",
      name: action.name,
      displayName: mentionDisplayName(entry.title, action.name),
      description,
      scopeLabel: entryScopeLabel(entry.meta) || "Skill",
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
      displayName: entry.title || action.name,
      description: primaryEntryDescription(entry),
      scopeLabel: "App",
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
      displayName: entry.title || action.name,
      description: primaryEntryDescription(entry),
      scopeLabel: entry.meta ?? "Plugin",
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

function primaryEntryDescription(entry: CommandPanelEntry): string | undefined {
  return (entry.details ?? []).find((detail) => {
    const normalized = detail.trim();
    return normalized
      && !normalized.startsWith("Default prompt:")
      && !normalized.startsWith("Tools:")
      && !normalized.startsWith("Path:")
      && !normalized.startsWith("CWD:")
      && !normalized.startsWith("Plugin:")
      && !normalized.startsWith("Enabled:")
      && !normalized.startsWith("Accessible:")
      && !normalized.startsWith("Auth:")
      && !normalized.startsWith("Install:");
  });
}

function entryScopeLabel(meta: string | undefined): string {
  return meta?.split(" · ", 1)[0]?.trim() ?? "";
}

function mentionDisplayName(title: string, name: string): string {
  const trimmedTitle = title.trim();
  const trimmedName = name.trim();
  if (trimmedTitle && trimmedTitle !== trimmedName) return trimmedTitle;
  return titleizeMentionName(trimmedName || trimmedTitle);
}

function titleizeMentionName(value: string): string {
  return value
    .split(":")
    .map((segment) => segment
      .replace(/[_-]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(mentionTitleWord)
      .join(" "))
    .join(": ");
}

function mentionTitleWord(word: string, index: number): string {
  const lower = word.toLowerCase();
  const special = MENTION_TITLE_WORDS.get(lower);
  if (special) return special;
  if (index > 0 && MENTION_TITLE_LOWER_WORDS.has(lower)) return lower;
  return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}

const MENTION_TITLE_WORDS = new Map([
  ["openai", "OpenAI"],
  ["openapi", "OpenAPI"],
  ["github", "GitHub"],
  ["pagerduty", "PagerDuty"],
  ["datadog", "DataDog"],
  ["sqlite", "SQLite"],
  ["fastapi", "FastAPI"],
]);

const MENTION_TITLE_LOWER_WORDS = new Set(["and", "or", "to", "up", "with"]);

function stringRecordValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "file";
}
