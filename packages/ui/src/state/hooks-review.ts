import type { HookMetadata } from "@hicodex/codex-protocol/generated/v2/HookMetadata";
import type { HookSource } from "@hicodex/codex-protocol/generated/v2/HookSource";
import type { HooksListResponse } from "@hicodex/codex-protocol/generated/v2/HooksListResponse";
import type { ConfigWriteActionEdit } from "./command-panel";

export interface HookTrustUpdate {
  key: string;
  currentHash: string;
  source: HookSource;
  pluginId: string | null;
}

export interface HooksSettingsFocus {
  source?: HookSource;
  projectRoot?: string;
  pluginId?: string;
}

export interface HooksReviewSnapshot {
  cwd: string;
  hooks: HookTrustUpdate[];
  count: number;
  focus: HooksSettingsFocus | null;
}

export function isHookNeedingReview(hook: Pick<HookMetadata, "trustStatus"> | null | undefined): boolean {
  return hook?.trustStatus === "untrusted" || hook?.trustStatus === "modified";
}

export function projectHooksNeedingReview(
  response: unknown,
  cwd: string,
): HooksReviewSnapshot | null {
  const normalizedCwd = cwd.trim();
  if (!hookReviewProjectRoot(normalizedCwd)) return null;
  const data = (response as Partial<HooksListResponse> | null)?.data;
  if (!Array.isArray(data)) return null;
  const entry = data.find((candidate) => candidate?.cwd === normalizedCwd);
  if (!entry) return null;
  const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
  const needingReview = hooks
    .filter(isHookNeedingReview)
    .map((hook) => ({
      key: hook.key,
      currentHash: hook.currentHash,
      source: hook.source,
      pluginId: hook.pluginId,
    }))
    .filter((hook) => hook.key.trim().length > 0 && hook.currentHash.trim().length > 0);
  return {
    cwd: typeof entry?.cwd === "string" && entry.cwd.trim() ? entry.cwd.trim() : normalizedCwd,
    hooks: needingReview,
    count: needingReview.length,
    focus: deriveHooksSettingsFocus(needingReview, normalizedCwd),
  };
}

export function deriveHooksSettingsFocus(
  hooks: readonly HookTrustUpdate[],
  cwd: string,
): HooksSettingsFocus | null {
  if (hooks.length === 0) return null;
  const sources = uniqueValues(hooks.map((hook) => hook.source));
  if (sources.length !== 1) return null;
  const source = sources[0];
  if (!source) return null;
  if (source === "project") {
    const projectRoot = hookReviewProjectRoot(cwd);
    return projectRoot ? { source, projectRoot } : null;
  }
  if (source === "plugin") {
    const pluginIds = uniqueValues(hooks.map((hook) => hook.pluginId ?? ""));
    return pluginIds.length === 1 && pluginIds[0] ? { source, pluginId: pluginIds[0] } : null;
  }
  return { source };
}

export function filterHooksListResponseForFocus(
  response: unknown,
  focus: HooksSettingsFocus | null | undefined,
): unknown {
  if (!focus || Object.keys(focus).length === 0) return response;
  const record = response && typeof response === "object" && !Array.isArray(response)
    ? response as Record<string, unknown>
    : null;
  const data = Array.isArray(record?.data) ? record.data : null;
  if (!record || !data) return response;
  return {
    ...record,
    data: data.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const entryRecord = entry as Record<string, unknown>;
      const hooks = Array.isArray(entryRecord.hooks) ? entryRecord.hooks : [];
      return {
        ...entryRecord,
        hooks: hooks.filter((hook) => hookMatchesFocus(hook, focus)),
      };
    }),
  };
}

export function hooksSettingsFocusMessage(focus: HooksSettingsFocus | null | undefined): string | undefined {
  if (!focus?.source) return undefined;
  if (focus.source === "project" && focus.projectRoot) return `Showing project hooks for ${focus.projectRoot}.`;
  if (focus.source === "plugin" && focus.pluginId) return `Showing plugin hooks for ${focus.pluginId}.`;
  return `Showing ${focus.source} hooks.`;
}

export function hookReviewProjectRoot(cwd: string): string | null {
  const normalized = cwd.trim().replace(/[\\/]+$/, "") || cwd.trim();
  return normalized && normalized !== "/" && normalized !== "~" ? normalized : null;
}

export function buildTrustAllHooksEdits(hooks: readonly Pick<HookTrustUpdate, "key" | "currentHash">[]): ConfigWriteActionEdit[] {
  const value = Object.fromEntries(
    hooks
      .filter((hook) => hook.key.trim().length > 0 && hook.currentHash.trim().length > 0)
      .map((hook) => [hook.key, { trusted_hash: hook.currentHash }]),
  );
  return [{
    keyPath: "hooks.state",
    value,
    mergeStrategy: "upsert",
  }];
}

function hookMatchesFocus(hook: unknown, focus: HooksSettingsFocus): boolean {
  if (!hook || typeof hook !== "object" || Array.isArray(hook)) return false;
  const record = hook as Partial<HookMetadata>;
  if (focus.source && record.source !== focus.source) return false;
  if (focus.pluginId && record.pluginId !== focus.pluginId) return false;
  return true;
}

function uniqueValues<T extends string>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(value);
  }
  return result;
}
