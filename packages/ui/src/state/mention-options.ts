import { joinRootRelativePath, projectCommandPanelEntries, projectPluginEntries } from "./command-panel";
import type { CommandPanelEntry } from "./command-panel";
import type { ComposerMentionOption } from "./composer-workflow";

interface AgentMentionThread {
  id?: string | null;
  threadSource?: string | null;
  agentNickname?: string | null;
  agentRole?: string | null;
  name?: string | null;
  preview?: string | null;
  cwd?: string | null;
}

interface AgentMentionOptionsContext {
  excludedThreadIds?: Iterable<string | null | undefined>;
}

export function mentionOptionsFromFuzzyFiles(files: Array<Record<string, unknown>>): ComposerMentionOption[] {
  const options: ComposerMentionOption[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const rawPath = stringRecordValue(file, "path");
    const root = stringRecordValue(file, "root");
    const path = stringRecordValue(file, "fsPath")
      || (rawPath ? joinRootRelativePath(root, rawPath) : "")
      || stringRecordValue(file, "file_path");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = stringRecordValue(file, "file_name")
      || stringRecordValue(file, "label")
      || basename(path);
    const detail = stringRecordValue(file, "relativePathWithoutFileName")
      || stringRecordValue(file, "relative_path_without_file_name")
      || dirname(rawPath || path)
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

/*
 * CODEX-REF:
 * - /private/tmp/codex-asar/pretty/use-at-mention-sections-_FUWQLLX.pretty.js:489-514
 *   builds the @ mention "Live agents" section from backgroundAgents.
 * - /private/tmp/codex-asar/pretty/mention-item-B-I-D-5A.pretty.js:136-144
 *   maps live agents to agent:// and configured roles to subagent://.
 */
export function mentionOptionsFromAgentThreads(
  threads: ReadonlyArray<AgentMentionThread>,
  query: string,
  context: AgentMentionOptionsContext = {},
): ComposerMentionOption[] {
  const excluded = new Set(
    Array.from(context.excludedThreadIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id)),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const options: ComposerMentionOption[] = [];
  const seen = new Set<string>();
  for (const thread of threads) {
    const threadId = thread.id?.trim() ?? "";
    if (!threadId || excluded.has(threadId) || seen.has(threadId)) continue;
    if (!isAgentMentionThread(thread)) continue;
    const displayName = stripLeadingAt(
      thread.agentNickname
      || thread.agentRole
      || thread.name
      || thread.preview
      || shortThreadId(threadId),
    );
    if (!displayName) continue;
    const role = thread.agentRole?.trim() ?? "";
    if (normalizedQuery && !agentMentionThreadMatchesQuery(thread, displayName, normalizedQuery)) {
      continue;
    }
    seen.add(threadId);
    options.push({
      kind: "agent",
      name: stripLeadingAt(displayName).toLowerCase(),
      displayName,
      description: role || undefined,
      scopeLabel: "Live agent",
      path: `agent://${threadId}`,
      detail: role || undefined,
    });
  }
  return options.slice(0, 25);
}

/*
 * Desktop fetches local custom agents via `local-custom-agents` and projects
 * `roles` into `subagent://{roleName}` mention items. Forge does not have
 * that host bridge yet; local app-server `config/read` serializes ConfigToml,
 * whose `agents` table is a flattened `[agents.<role>]` map.
 */
export function mentionOptionsFromConfiguredAgentsResponse(
  value: unknown,
  query: string,
  liveAgentRoles: Iterable<string | null | undefined> = [],
): ComposerMentionOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const liveRoles = new Set(
    Array.from(liveAgentRoles)
      .map((role) => role?.trim().toLowerCase())
      .filter((role): role is string => Boolean(role)),
  );
  const options: ComposerMentionOption[] = [];
  for (const role of configuredAgentRolesFromResponse(value)) {
    const roleName = role.roleName.trim();
    if (!roleName || liveRoles.has(roleName.toLowerCase())) continue;
    if (normalizedQuery && !configuredAgentMatchesQuery(role, normalizedQuery)) continue;
    options.push({
      kind: "agent",
      name: roleName,
      displayName: roleName,
      description: role.description || undefined,
      scopeLabel: "Custom agent",
      path: `subagent://${roleName}`,
      detail: role.description || undefined,
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
      /* Current-session registry metadata for the inline picker chip. */
      iconSmall: action.iconSmall,
      brandColor: action.brandColor,
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
      iconSmall: action.iconSmall,
      brandColor: action.brandColor,
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
      iconSmall: action.iconSmall,
      brandColor: action.brandColor,
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

function agentMentionThreadMatchesQuery(
  thread: AgentMentionThread,
  displayName: string,
  normalizedQuery: string,
): boolean {
  const values = [
    displayName,
    `@${displayName}`,
    thread.agentNickname ?? "",
    thread.agentRole ?? "",
    thread.name ?? "",
    thread.preview ?? "",
    thread.cwd ?? "",
    thread.id ?? "",
  ];
  return values.some((value) => value.toLowerCase().includes(normalizedQuery));
}

function configuredAgentMatchesQuery(
  role: { roleName: string; description: string; nicknameCandidates: string[] },
  normalizedQuery: string,
): boolean {
  return [
    role.roleName,
    `@${role.roleName}`,
    role.description,
    ...role.nicknameCandidates,
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
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

const CONFIGURED_AGENT_RESERVED_KEYS = new Set([
  "max_threads",
  "maxThreads",
  "max_depth",
  "maxDepth",
  "job_max_runtime_seconds",
  "jobMaxRuntimeSeconds",
  "interrupt_message",
  "interruptMessage",
]);

function configuredAgentRolesFromResponse(value: unknown): Array<{ roleName: string; description: string; nicknameCandidates: string[] }> {
  const root = asRecord(value);
  const config = objectRecord(root, "config") ?? root;
  const agents = asRecord(config?.agents);
  if (!agents) return [];

  const roles: Array<{ roleName: string; description: string; nicknameCandidates: string[] }> = [];
  for (const [key, rawRole] of Object.entries(agents)) {
    if (CONFIGURED_AGENT_RESERVED_KEYS.has(key)) continue;
    const role = asRecord(rawRole);
    if (!role) continue;
    const roleName = key.trim();
    if (!roleName.trim()) continue;
    roles.push({
      roleName,
      description: stringRecordValue(role, "description"),
      nicknameCandidates: stringArrayField(role, "nickname_candidates"),
    });
  }
  return roles;
}

function isAgentMentionThread(thread: AgentMentionThread): boolean {
  if (thread.threadSource === "subagent") return true;
  return Boolean(thread.agentNickname?.trim()) || Boolean(thread.agentRole?.trim());
}

function stripLeadingAt(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
}

function shortThreadId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function objectRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return asRecord(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function stringRecordValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "file";
}

function dirname(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separatorIndex <= 0) return "";
  return normalized.slice(0, separatorIndex);
}
