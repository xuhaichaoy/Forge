/*
 * Exploration / skill-read collapse layer of the tool-activity grouping
 * projection, extracted verbatim from tool-activity-grouping.ts (mechanical
 * split): exec command-action normalization, the exploration summary + detail
 * rows, and the Desktop skill-path read labels.
 */
import { stringField } from "../lib/format";

import { formatMessage } from "./i18n";
import type { ItemRecord, ThreadItem, ToolActivitySummary } from "./render-group-types";
import { dedupe, isItemInProgress, itemType } from "./thread-item-fields";
import { displayPath, execCommandActionRecords } from "./tool-activity-fields";
import {
  normalizeSearchPathSegments,
  parseDesktopSkillPathInfo,
  type DesktopSkillPathInfo,
} from "./tool-activity-skill-path";

interface ExplorationSummary {
  reads: number;
  readKeys: string[];
  searches: number;
  lists: number;
  label: string;
  activeLabel: string;
}

export function explorationSummary(item: ThreadItem): ExplorationSummary | null {
  const actions = execCommandActionRecords(item).map(normalizeCommandAction).filter((action) => action !== null);
  if (actions.length === 0) return null;
  if (runningSkillDefinitionReadAction(actions, item)) return null;

  const readKeys = dedupe(actions.flatMap((action) => action.type === "read" ? [explorationReadKey(action.path, item)] : []));
  const reads = readKeys.length;
  const searches = actions.filter((action) => action.type === "search").length;
  const lists = actions.filter((action) => action.type === "listFiles").length;
  if (reads + searches + lists === 0) return null;

  const activeAction = actions[actions.length - 1];
  return {
    reads,
    readKeys,
    searches,
    lists,
    label: explorationSummaryLabel({ reads, searches, lists }, false) ?? "Explored",
    activeLabel: activeAction ? explorationActionLabel(activeAction, true, item) : explorationSummaryLabel({ reads, searches, lists }, true) ?? "Exploring",
  };
}

function explorationReadKey(path: string, item: ThreadItem): string {
  const normalizedPath = normalizeSearchPath(path);
  if (!normalizedPath) return `unknown:${item.id}`;
  if (isAbsoluteSearchPath(normalizedPath)) return normalizeSearchPathSegments(normalizedPath);
  const cwd = normalizeSearchPath(stringField(item as ItemRecord, "cwd"));
  return normalizeSearchPathSegments(cwd ? `${cwd}/${normalizedPath}` : normalizedPath);
}

function normalizeSearchPath(value: string): string {
  return value.trim().replace(/^file:\/\//u, "").replace(/\\/gu, "/").replace(/^\.\/+/u, "");
}

function isAbsoluteSearchPath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//u.test(value);
}

export function explorationDetail(item: ThreadItem): string {
  const actions = execCommandActionRecords(item).map(normalizeCommandAction).filter((action) => action !== null);
  if (actions.length === 0) return "";
  const inProgress = isItemInProgress(item);
  return actions.map((action) => explorationActionLabel(action, inProgress, item)).join("\n");
}

type NormalizedCommandAction =
  | { type: "read"; path: string; name: string; finished: boolean | null }
  | { type: "search"; path: string; query: string; finished: boolean | null }
  | { type: "listFiles"; path: string; finished: boolean | null };

function normalizeCommandAction(action: Record<string, unknown>): NormalizedCommandAction | null {
  const type = stringField(action, "type");
  const finished = typeof action.isFinished === "boolean" ? action.isFinished : null;
  if (type === "read") {
    const name = stringField(action, "name");
    return { type: "read", path: stringField(action, "path") || name || "file", name, finished };
  }
  if (type === "search") {
    return {
      type: "search",
      path: stringField(action, "path"),
      query: stringField(action, "query"),
      finished,
    };
  }
  if (type === "listFiles" || type === "list_files") {
    return { type: "listFiles", path: stringField(action, "path"), finished };
  }
  return null;
}

export function directRunningSkillDefinitionReadLabelParts(
  items: ThreadItem[],
): { action: string; detail: string } | null {
  if (items.length !== 1) return null;
  const item = items[0];
  return item && itemType(item) === "exec" ? runningSkillDefinitionReadLabelParts(item) : null;
}

export function runningSkillDefinitionReadLabelParts(item: ThreadItem): { action: string; detail: string } | null {
  const action = runningSkillDefinitionReadAction(
    execCommandActionRecords(item).map(normalizeCommandAction).filter((candidate) => candidate !== null),
    item,
  );
  if (!action) return null;
  const skillInfo = skillPathInfoForAction(action, item);
  return skillInfo
    ? {
        action: formatMessage({ id: "hc.toolActivity.skill.action.reading", defaultMessage: "Reading" }),
        detail: formatMessage({ id: "hc.toolActivity.skillDetail", defaultMessage: "{skillName} skill" }, { skillName: skillInfo.skillName }),
      }
    : null;
}

export function isRunningSkillDefinitionRead(item: ThreadItem): boolean {
  return Boolean(runningSkillDefinitionReadAction(
    execCommandActionRecords(item).map(normalizeCommandAction).filter((candidate) => candidate !== null),
    item,
  ));
}

function runningSkillDefinitionReadAction(
  actions: NormalizedCommandAction[],
  item: ThreadItem,
): Extract<NormalizedCommandAction, { type: "read" }> | null {
  for (const action of actions) {
    if (action.type !== "read" || action.finished !== false) continue;
    const skillInfo = skillPathInfoForAction(action, item);
    if (skillInfo?.isSkillDefinitionFile) return action;
  }
  return null;
}

function explorationActionLabel(action: NormalizedCommandAction, inProgress: boolean, item: ThreadItem): string {
  const skillLabel = skillExplorationLabel(action, item, inProgress);
  if (skillLabel) return skillLabel;
  if (action.type === "read") {
    const path = displayPath(inProgress ? action.path : action.name || action.path);
    return inProgress
      ? formatMessage({ id: "hc.toolActivity.read.reading", defaultMessage: "Reading {path}" }, { path })
      : formatMessage({ id: "hc.toolActivity.read.read", defaultMessage: "Read {path}" }, { path });
  }
  if (action.type === "search") {
    if (inProgress) {
      if (action.path) return formatMessage({ id: "hc.toolActivity.search.searchingFilesInFolder", defaultMessage: "Searching files in {path} folder" }, { path: displayPath(action.path) });
      if (action.query) return formatMessage({ id: "hc.toolActivity.search.searchingFor", defaultMessage: "Searching for {query}" }, { query: action.query });
      return formatMessage({ id: "hc.toolActivity.search.searchingFiles", defaultMessage: "Searching files" });
    }
    if (action.query && action.path) return formatMessage({ id: "hc.toolActivity.search.searchedForInPath", defaultMessage: "Searched for {query} in {path}" }, { query: action.query, path: displayPath(action.path) });
    if (action.query) return formatMessage({ id: "hc.toolActivity.search.searchedFor", defaultMessage: "Searched for {query}" }, { query: action.query });
    return formatMessage({ id: "hc.toolActivity.search.searchedFiles", defaultMessage: "Searched files" });
  }
  if (action.path) {
    return inProgress
      ? formatMessage({ id: "hc.toolActivity.list.listingFilesInFolder", defaultMessage: "Listing files in {path} folder" }, { path: displayPath(action.path) })
      : formatMessage({ id: "hc.toolActivity.list.listedFilesInPath", defaultMessage: "Listed files in {path}" }, { path: displayPath(action.path) });
  }
  return inProgress
    ? formatMessage({ id: "hc.toolActivity.list.listingFiles", defaultMessage: "Listing files" })
    : formatMessage({ id: "hc.toolActivity.list.listedFiles", defaultMessage: "Listed files" });
}

function skillExplorationLabel(
  action: NormalizedCommandAction,
  item: ThreadItem,
  inProgress: boolean,
): string | null {
  const skillInfo = skillPathInfoForAction(action, item);
  if (!skillInfo) return null;
  const skillName = skillInfo.skillName;
  if (action.type === "read") {
    if (skillInfo.isSkillDefinitionFile && (inProgress || action.finished === false)) {
      return formatMessage({ id: "hc.toolActivity.skill.reading", defaultMessage: "Reading {skillName} skill" }, { skillName });
    }
    return formatMessage({ id: "hc.toolActivity.skill.read", defaultMessage: "Read {skillName} skill" }, { skillName });
  }
  if (action.type === "listFiles") {
    return formatMessage({ id: "hc.toolActivity.skill.listedFiles", defaultMessage: "Listed files in {skillName} skill" }, { skillName });
  }
  const query = action.query.trim();
  return query
    ? formatMessage({ id: "hc.toolActivity.skill.searchedFor", defaultMessage: "Searched for {query} in {skillName} skill" }, { query, skillName })
    : formatMessage({ id: "hc.toolActivity.skill.searchedIn", defaultMessage: "Searched in {skillName} skill" }, { skillName });
}

function skillPathInfoForAction(action: NormalizedCommandAction, item: ThreadItem): DesktopSkillPathInfo | null {
  if (!action.path) return null;
  return desktopSkillPathInfoForCommandPath(action.path, stringField(item as ItemRecord, "cwd"));
}

export function desktopSkillPathInfoForCommandPath(path: string, cwd = ""): DesktopSkillPathInfo | null {
  const normalizedPath = normalizeSearchPath(path);
  if (!normalizedPath) return null;
  if (isAbsoluteSearchPath(normalizedPath)) return parseDesktopSkillPathInfo(normalizeSearchPathSegments(normalizedPath));
  const normalizedCwd = normalizeSearchPath(cwd);
  return parseDesktopSkillPathInfo(normalizeSearchPathSegments(normalizedCwd ? `${normalizedCwd}/${normalizedPath}` : normalizedPath));
}

export function explorationSummaryLabel(
  counts: Pick<ToolActivitySummary["counts"], "exploredFiles" | "searches" | "lists"> | { reads: number; searches: number; lists: number },
  inProgress: boolean,
): string | null {
  const reads = "reads" in counts ? counts.reads : counts.exploredFiles;
  const searches = counts.searches;
  const lists = counts.lists;
  if (reads === 0 && searches === 0 && lists === 0) return null;
  if (reads === 0 && searches === 0 && lists > 0) {
    return inProgress
      ? formatMessage({ id: "localConversation.toolActivitySummary.exploration.listingFiles.leading", defaultMessage: "Listing files" })
      : formatMessage({ id: "localConversation.toolActivitySummary.exploration.listedFiles.leading", defaultMessage: "Listed files" });
  }
  /*
   * Codex Desktop joins the exploration header counts with a plain ", " and NO
   * conjunction word — the ICU string `localConversationTurn.exploration.accordion
   * .count.separator` has defaultMessage exactly ", " (described as "Separator
   * between counts in the exploration header"). So 3 parts render
   * "Explored 1 file, 2 searches, 3 lists", not the Oxford-comma "..., and ..."
   * form. (The `formatList({type:"conjunction"})` join in the same chunk is used
   * only for the cross-type web-search/MCP summary — see `completedActivitySummaryLabel`
   * — and is intentionally left on `joinConjunction`.) Order stays files -> searches -> lists.
   */
  const separator = formatMessage({ id: "localConversationTurn.exploration.accordion.count.separator", defaultMessage: ", " });
  const parts = [
    reads > 0 ? formatMessage({ id: "localConversation.toolActivitySummary.exploration.files", defaultMessage: "{count, plural, one {# file} other {# files}}" }, { count: reads }) : "",
    searches > 0 ? formatMessage({ id: "localConversation.toolActivitySummary.exploration.searches", defaultMessage: "{count, plural, one {# search} other {# searches}}" }, { count: searches }) : "",
    lists > 0 ? formatMessage({ id: "localConversation.toolActivitySummary.exploration.lists", defaultMessage: "{count, plural, one {# list} other {# lists}}" }, { count: lists }) : "",
  ].filter(Boolean);
  const details = parts.join(separator);
  return inProgress
    ? formatMessage({ id: "localConversation.toolActivitySummary.exploration.exploring.leading", defaultMessage: "Exploring {details}" }, { details })
    : formatMessage({ id: "localConversation.toolActivitySummary.exploration.leading", defaultMessage: "Explored {details}" }, { details });
}
