import { stringField } from "../lib/format";
import type { AccumulatedThreadItem } from "../state/render-groups";
import {
  displayPath,
  execCommandActionRecords,
  execExitCode,
} from "../state/tool-activity-fields";
import { desktopSkillPathInfoForCommandPath } from "../state/tool-activity-grouping";
import type { ForgeIntlContextValue } from "./i18n-provider";

type ThreadItem = AccumulatedThreadItem;
type ItemRecord = ThreadItem & Record<string, unknown>;
type ToolDetailFormatMessage = ForgeIntlContextValue["formatMessage"];

// codex toolSummaryForCmd.* / hc.toolActivity.* - localize an exec-detail summary
// label. formatMessage is optional so the locale-free view-model + its tests keep
// the English output; the en-US dict resolves each id back to that same English.
function localizeToolSummary(
  formatMessage: ToolDetailFormatMessage | undefined,
  id: string,
  defaultMessage: string,
  values?: Record<string, string>,
): string {
  return formatMessage
    ? formatMessage({ id, defaultMessage }, values)
    : defaultMessage.replace(/\{(\w+)\}/g, (_match, key: string) => values?.[key] ?? `{${key}}`);
}

export function execFooter(record: ItemRecord, running: boolean): string {
  if (running) return "";
  if (record.executionStatus === "interrupted") return "Stopped";
  const exitCode = execExitCode(record);
  if (exitCode === 0) return "Success";
  if (exitCode !== null) return `Exit code ${exitCode}`;
  return "Exit code unknown";
}

export function normalizeDesktopShellCommand(value: string): string {
  const command = value.trim().replace(/^\$\s+/u, "");
  const normalized = stripDesktopShellQuotes(stripDesktopShellPrompt(command));
  const shellMatch = /^(?:\/bin\/zsh|\/bin\/bash|zsh|bash)\s+-lc\s+([\s\S]+)$/u.exec(normalized);
  if (shellMatch) return stripDesktopShellCommandArgument(shellMatch[1]?.trim() ?? "");
  const trailingShellMatch = /(?:\/bin\/zsh|\/bin\/bash|zsh|bash)\s+-lc\s+([\s\S]+)$/u.exec(command);
  return stripDesktopShellCommandArgument(
    trailingShellMatch
      ? trailingShellMatch[1]?.trim() ?? ""
      : normalized,
  );
}

function stripDesktopShellCommandArgument(value: string): string {
  let text = stripDesktopShellQuotes(value).trim();
  if (
    (text.startsWith("'") && !text.endsWith("'"))
    || (text.startsWith('"') && !text.endsWith('"'))
  ) {
    text = text.slice(1).trim();
  }
  if (
    (!text.startsWith("'") && text.endsWith("'"))
    || (!text.startsWith('"') && text.endsWith('"'))
  ) {
    text = text.slice(0, -1).trim();
  }
  return stripDesktopShellQuotes(text).trim();
}

function stripDesktopShellPrompt(value: string): string {
  let text = value.trim().replace(/^\$\s+/u, "");
  text = text.replaceAll("'\"'\"'", "'").replaceAll("\\'", "'").replaceAll('\\"', '"');
  let changed = true;
  while (changed) {
    changed = false;
    if (
      (text.startsWith("'") && text.endsWith("'"))
      || (text.startsWith('"') && text.endsWith('"'))
    ) {
      text = text.slice(1, -1).trim();
      changed = true;
    }
  }
  return text.replace(/^['"]+/u, "").replace(/['"]+$/u, "").trim();
}

function stripDesktopShellQuotes(value: string): string {
  let text = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (text.startsWith("$'") && text.endsWith("'")) {
      text = text.slice(2, -1).replaceAll("\\'", "'");
      changed = true;
      continue;
    }
    if (
      (text.startsWith("'") && text.endsWith("'"))
      || (text.startsWith('"') && text.endsWith('"'))
    ) {
      text = text
        .slice(1, -1)
        .replaceAll("'\"'\"'", "'")
        .replaceAll('\\"', '"');
      changed = true;
    }
  }
  return text;
}

export function execSummaryLabel(record: ItemRecord, running: boolean, formatMessage?: ToolDetailFormatMessage): string {
  const action = execSummaryAction(record);
  if (!action) return "";
  const skillLabel = execSkillSummaryLabel(action, stringField(record, "cwd"), running, formatMessage);
  if (skillLabel) return skillLabel;
  if (action.type === "read") {
    if (running && !action.finished) return "";
    const path = displayPath(action.name || action.path);
    return action.finished === false
      ? localizeToolSummary(formatMessage, "hc.toolActivity.read.reading", "Reading {path}", { path })
      : localizeToolSummary(formatMessage, "hc.toolActivity.read.read", "Read {path}", { path });
  }
  if (action.type === "search") {
    const inProgress = running || action.finished === false;
    const query = action.query.trim();
    const path = action.path.trim();
    if (query && path) {
      return inProgress
        ? localizeToolSummary(formatMessage, "toolSummaryForCmd.searchingForInPath", "Searching for {query} in {path}", { query, path: displayPath(path) })
        : localizeToolSummary(formatMessage, "hc.toolActivity.search.searchedForInPath", "Searched for {query} in {path}", { query, path: displayPath(path) });
    }
    if (query) {
      return inProgress
        ? localizeToolSummary(formatMessage, "hc.toolActivity.search.searchingFor", "Searching for {query}", { query })
        : localizeToolSummary(formatMessage, "hc.toolActivity.search.searchedFor", "Searched for {query}", { query });
    }
    // Codex has no path-only ("Searching {path}") exec-summary key, so keep this
    // branch English - there is no bundle evidence to localize it against.
    if (path) return `${inProgress ? "Searching" : "Searched"} ${displayPath(path)}`;
    return inProgress
      ? localizeToolSummary(formatMessage, "hc.toolActivity.search.searchingFiles", "Searching files")
      : localizeToolSummary(formatMessage, "hc.toolActivity.search.searchedFiles", "Searched files");
  }
  if (action.type === "list_files") {
    const inProgress = running || action.finished === false;
    if (action.path.trim()) {
      return inProgress
        ? localizeToolSummary(formatMessage, "toolSummaryForCmd.exploringFilesInPath", "Listing files in {path}", { path: displayPath(action.path) })
        : localizeToolSummary(formatMessage, "hc.toolActivity.list.listedFilesInPath", "Listed files in {path}", { path: displayPath(action.path) });
    }
    return inProgress
      ? localizeToolSummary(formatMessage, "hc.toolActivity.list.listingFiles", "Listing files")
      : localizeToolSummary(formatMessage, "hc.toolActivity.list.listedFiles", "Listed files");
  }
  return "";
}

function execSkillSummaryLabel(action: ExecSummaryAction, cwd: string, running: boolean, formatMessage?: ToolDetailFormatMessage): string {
  if (action.type === "read") {
    const skillInfo = desktopSkillPathInfoForCommandPath(action.path, cwd);
    if (!skillInfo) return "";
    if (skillInfo.isSkillDefinitionFile && (running || action.finished === false)) {
      return localizeToolSummary(formatMessage, "hc.toolActivity.skill.reading", "Reading {skillName} skill", { skillName: skillInfo.skillName });
    }
    return localizeToolSummary(formatMessage, "hc.toolActivity.skill.read", "Read {skillName} skill", { skillName: skillInfo.skillName });
  }
  if (action.type === "list_files") {
    const skillInfo = desktopSkillPathInfoForCommandPath(action.path, cwd);
    return skillInfo
      ? localizeToolSummary(formatMessage, "hc.toolActivity.skill.listedFiles", "Listed files in {skillName} skill", { skillName: skillInfo.skillName })
      : "";
  }
  const skillInfo = desktopSkillPathInfoForCommandPath(action.path, cwd);
  if (!skillInfo) return "";
  const query = action.query.trim();
  return query
    ? localizeToolSummary(formatMessage, "hc.toolActivity.skill.searchedFor", "Searched for {query} in {skillName} skill", { query, skillName: skillInfo.skillName })
    : localizeToolSummary(formatMessage, "hc.toolActivity.skill.searchedIn", "Searched in {skillName} skill", { skillName: skillInfo.skillName });
}

type ExecSummaryAction =
  | { type: "read"; path: string; name: string; finished: boolean | null }
  | { type: "search"; path: string; query: string; finished: boolean | null }
  | { type: "list_files"; path: string; finished: boolean | null };

/*
 * Source ordering is the shared `execCommandActionRecords` (commandActions
 * first - bundle-backed, see tool-activity-fields). The old local version
 * read the derived `parsedCmd` object FIRST and let an empty (filtered)
 * `commandActions` array block the fallback - both deviations from the
 * grouping side, now folded into the shared helper.
 */
function execSummaryAction(record: ItemRecord): ExecSummaryAction | null {
  for (const raw of execCommandActionRecords(record as ThreadItem)) {
    const action = normalizeExecSummaryAction(recordObject(raw));
    if (action) return action;
  }
  return null;
}

// Surface-specific shape: returns ONE summary action for the expanded exec
// detail; `null` for a read without a path so the summary falls back to the
// raw command text. The collapsed-row twin is tool-activity-grouping's
// `normalizeCommandAction` (coerces "file" for its label rows) - same wire
// fields, intentionally different fallbacks; keep both in sight when editing.
function normalizeExecSummaryAction(record: Record<string, unknown>): ExecSummaryAction | null {
  const type = stringField(record, "type");
  const finished = typeof record.isFinished === "boolean" ? record.isFinished : null;
  if (type === "read") {
    const path = stringField(record, "path") || stringField(record, "name");
    return path ? { type, path, name: stringField(record, "name"), finished } : null;
  }
  if (type === "search") {
    return {
      type,
      path: stringField(record, "path"),
      query: stringField(record, "query"),
      finished,
    };
  }
  if (type === "list_files" || type === "listFiles") {
    return {
      type: "list_files",
      path: stringField(record, "path"),
      finished,
    };
  }
  return null;
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
