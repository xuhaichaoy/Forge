import type { BrowserStorageLike } from "./image-generation-tool";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./hicodex-desktop-namespace";

export const LEGACY_HICODEX_LOCALE_STORAGE_KEY = "hicodex:locale";
export const HICODEX_LOCALE_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.locale;
export const HICODEX_DEFAULT_LOCALE = "en-US";

export type HiCodexLocale = "en-US" | "zh-CN";

export interface I18nMessageDescriptor {
  id: string;
  defaultMessage: string;
  description?: string;
}

export type I18nValues = Record<string, string | number | boolean | null | undefined>;

export interface I18nBundle {
  locale: HiCodexLocale;
  messages: Record<string, string>;
}

export const HICODEX_SUPPORTED_LOCALES: HiCodexLocale[] = ["en-US", "zh-CN"];

const HICODEX_MESSAGES: Record<HiCodexLocale, Record<string, string>> = {
  "en-US": {
    "hc.app.name": "HiCodex",
    "hc.command.theme.title": "Theme",
    "hc.command.theme.message": "Choose the UI appearance. The selection is saved locally.",
    "hc.command.theme.toggleDark": "Switch to dark theme",
    "hc.command.theme.toggleLight": "Switch to light theme",
    "assistantMessage.memoryCitations.summary": "{count, plural, one {1 memory citation} other {# memory citations}}",
    "assistantMessage.memoryCitations.openCitation": "Open {path}, {lineLabel}",
    "assistantMessage.memoryCitations.singleLineLabel": "line {line}",
    "assistantMessage.memoryCitations.lineRangeLabel": "lines {lineStart}-{lineEnd}",
    "localConversation.reviewComments.count": "{count, plural, one {# comment} other {# comments}}",
    "localConversation.reviewComments.openComment": "View {title} in {location}",
    "localConversation.reviewComments.showMore": "{count, plural, one {Show # more comment} other {Show # more comments}}",
    "localConversation.reviewComments.collapse": "Collapse comments",
    "localConversationPage.planItemsCompleted": "{completedItems} out of {totalItems, plural, one {# task completed} other {# tasks completed}}",
    "codex.todoPlan.stepIndexPrefix": "{index}.",
    "composer.intelligenceDropdown.title": "Reasoning",
    "composer.mode.local.reasoning.none.label": "None",
    "composer.mode.local.reasoning.minimal.label": "Minimal",
    "composer.mode.local.reasoning.low.label": "Low",
    "composer.mode.local.reasoning.medium.label": "Medium",
    "composer.mode.local.reasoning.high.label": "High",
    "composer.mode.local.reasoning.xhigh.label": "Extra High",
    "settings.general.appearance.theme": "Theme",
    "settings.general.appearance.codeFontSize.row": "Code font size",
    "settings.general.appearance.codeFontSize.row.description": "Adjust the base size used for code across chats and diffs",
    "settings.general.appearance.codeFontSize.units": "px",
    "settings.general.appearance.reducedMotion.label": "Reduce motion",
    "settings.ide.language.label": "Language",
    "settings.ide.language.description": "Language for the app UI",
    "codex.mcpTool.textBlock.plaintextTitle": "plaintext",
    "settings.mcp.detail.save": "Save",
    "settings.mcp.detail.titleExisting": "Update {name} MCP",
    "settings.mcp.detail.titleNew": "Connect to a custom MCP",
    "codex.unifiedDiff.editedFile": "Edited {filename}",
    "codex.unifiedDiff.editedFiles": "{fileCount, plural, one {Edited # file} other {Edited # files}}",
    "codex.unifiedDiff.filesChanged": "{fileCount, plural, one {# file changed} other {# files changed}}",
    "codex.unifiedDiff.viewDiffTooltip": "Review",
    "codex.unifiedDiff.reviewChangedFiles": "Review changed files",
    "codex.unifiedDiff.reviewChanges": "Review here",
    "codex.unifiedDiff.reviewChangesHover": "Review changes",
    "codex.unifiedDiff.showMoreFiles": "{count, plural, one {Show # more file} other {Show # more files}}",
    "codex.unifiedDiff.collapseFiles": "Collapse files",
    "codex.unifiedDiff.revertPatchNotGitRepo": "Undo requires a Git repository",
    "codex.unifiedDiff.reapplyPatchNotGitRepo": "Reapply requires a Git repository",
    "codex.unifiedDiff.revertPatchPartial": "Some changes reverted",
    "codex.unifiedDiff.reapplyPatchPartial": "Some changes reapplied",
    "codex.unifiedDiff.revertPatchNoChanges": "No changes reverted",
    "codex.unifiedDiff.reapplyPatchNoChanges": "No changes reapplied",
    "codex.unifiedDiff.revertPatchError": "Failed to revert changes",
    "codex.unifiedDiff.reapplyPatchError": "Failed to reapply changes",
    "codex.unifiedDiff.patchNotGitRepoDescription": "This action only works when running in a Git repository.",
    "codex.unifiedDiff.patchFailureDetailsIntroRevert": "There were issues reverting some files",
    "codex.unifiedDiff.patchFailureDetailsIntroReapply": "There were issues reapplying some files",
    "codex.unifiedDiff.patchErrorOutputSummary": "Git apply error: {message}",
    "codex.unifiedDiff.patchFailureNoDetails": "No file details were returned for this patch action.",
    "codex.unifiedDiff.patchAppliedPathsHeading": "Applied cleanly ({count})",
    "codex.unifiedDiff.patchSkippedPathsHeading": "Skipped ({count})",
    "codex.unifiedDiff.patchConflictedPathsHeading": "Conflicts ({count})",
    "codex.unifiedDiff.patchFailureDialogClose": "Close",
  },
  "zh-CN": {
    "hc.app.name": "HiCodex",
    "hc.command.theme.title": "主题",
    "hc.command.theme.message": "选择界面外观。该选择会保存在本机。",
    "hc.command.theme.toggleDark": "切换到深色主题",
    "hc.command.theme.toggleLight": "切换到浅色主题",
    "assistantMessage.memoryCitations.summary": "{count, plural, one {1 条记忆引用} other {# 条记忆引用}}",
    "assistantMessage.memoryCitations.openCitation": "打开 {path}，{lineLabel}",
    "assistantMessage.memoryCitations.singleLineLabel": "第 {line} 行",
    "assistantMessage.memoryCitations.lineRangeLabel": "{lineStart}-{lineEnd} 行",
    "localConversation.reviewComments.count": "{count, plural, one {# comment} other {# comments}}",
    "localConversation.reviewComments.openComment": "在{location}中查看{title}",
    "localConversation.reviewComments.showMore": "{count, plural, one {再显示 # 条评论} other {再显示 # 条评论}}",
    "localConversation.reviewComments.collapse": "收起评论",
    "localConversationPage.planItemsCompleted": "共 {totalItems, plural, other {# 个任务}}，已经完成 {completedItems} 个",
    "codex.todoPlan.stepIndexPrefix": "{index}.",
    "composer.intelligenceDropdown.title": "推理",
    "composer.mode.local.reasoning.none.label": "无",
    "composer.mode.local.reasoning.minimal.label": "极低",
    "composer.mode.local.reasoning.low.label": "低",
    "composer.mode.local.reasoning.medium.label": "中",
    "composer.mode.local.reasoning.high.label": "高",
    "composer.mode.local.reasoning.xhigh.label": "超高",
    "settings.general.appearance.theme": "主题",
    "settings.general.appearance.codeFontSize.row": "代码字体大小",
    "settings.general.appearance.codeFontSize.row.description": "调整聊天和差异视图中代码使用的基础字号",
    "settings.general.appearance.codeFontSize.units": "px",
    "settings.general.appearance.reducedMotion.label": "减少动态效果",
    "settings.ide.language.label": "语言",
    "settings.ide.language.description": "应用 UI 语言",
    "codex.mcpTool.textBlock.plaintextTitle": "纯文本",
    "settings.mcp.detail.save": "保存",
    "settings.mcp.detail.titleExisting": "更新 {name} MCP",
    "settings.mcp.detail.titleNew": "连接至自定义 MCP",
    "codex.unifiedDiff.editedFile": "已编辑 {filename}",
    "codex.unifiedDiff.editedFiles": "{fileCount, plural, one {已编辑 # 个文件} other {已编辑 # 个文件}}",
    "codex.unifiedDiff.filesChanged": "{fileCount, plural, other {# 个文件已更改}}",
    "codex.unifiedDiff.viewDiffTooltip": "审核",
    "codex.unifiedDiff.reviewChangedFiles": "审查已更改的文件",
    "codex.unifiedDiff.reviewChanges": "审查",
    "codex.unifiedDiff.reviewChangesHover": "查看更改",
    "codex.unifiedDiff.showMoreFiles": "{count, plural, one {再显示 # 个文件} other {再显示 # 个文件}}",
    "codex.unifiedDiff.collapseFiles": "收起文件",
    "codex.unifiedDiff.revertPatchNotGitRepo": "撤销需要使用 Git 代码仓库",
    "codex.unifiedDiff.reapplyPatchNotGitRepo": "重新应用需要使用 Git 代码仓库",
    "codex.unifiedDiff.revertPatchPartial": "已还原部分更改",
    "codex.unifiedDiff.reapplyPatchPartial": "已重新应用部分更改",
    "codex.unifiedDiff.revertPatchNoChanges": "未还原任何更改",
    "codex.unifiedDiff.reapplyPatchNoChanges": "未重新应用更改",
    "codex.unifiedDiff.revertPatchError": "无法还原更改",
    "codex.unifiedDiff.reapplyPatchError": "无法重新应用更改",
    "codex.unifiedDiff.patchNotGitRepoDescription": "此操作仅在 Git 代码仓库中运行时有效。",
    "codex.unifiedDiff.patchFailureDetailsIntroRevert": "还原部分文件时出错",
    "codex.unifiedDiff.patchFailureDetailsIntroReapply": "重新应用部分文件时出错",
    "codex.unifiedDiff.patchErrorOutputSummary": "Git 应用错误：{message}",
    "codex.unifiedDiff.patchFailureNoDetails": "此补丁操作未返回文件详情。",
    "codex.unifiedDiff.patchAppliedPathsHeading": "已直接应用（{count} 个）",
    "codex.unifiedDiff.patchSkippedPathsHeading": "已跳过（{count} 个）",
    "codex.unifiedDiff.patchConflictedPathsHeading": "冲突 ({count})",
    "codex.unifiedDiff.patchFailureDialogClose": "关闭",
    "settings.nav.heading.app": "应用",
    "settings.nav.heading.host": "主机",
    "settings.nav.general-settings": "常规",
    "settings.nav.appearance": "外观",
    "settings.nav.appshots": "应用快照",
    "settings.nav.connections": "连接",
    "settings.nav.git-settings": "Git",
    "settings.nav.usage": "使用情况和计费",
    "settings.nav.agent": "配置",
    "settings.nav.personalization": "个性化",
    "settings.nav.keyboard-shortcuts": "键盘快捷键",
    "settings.nav.mcp-settings": "MCP 服务器",
    "settings.nav.hooks-settings": "钩子",
    "settings.nav.plugins-settings": "插件",
    "settings.nav.skills-settings": "技能",
    "settings.nav.browser-use": "浏览器",
    "settings.nav.computer-use": "电脑操控",
    "settings.nav.local-environments": "环境",
    "settings.nav.worktrees": "工作树",
    "settings.nav.data-controls": "已归档对话",
    "composer.placeholder.newTask.locally.v2": "可向 Codex 询问任何事。输入 @ 使用插件或提及文件",
    "composer.placeholder.localFollowUp.locallyWithAgents": "要求提供后续变更或 @ 提及智能体",
    "composer.placeholder.localFollowUp.locally": "要求后续变更",
    "composer.memoriesSlashCommand.title": "记忆",
    "composer.memoriesSlashCommand.dialogTitle": "对话记忆",
    "composer.memoriesSlashCommand.newThreadDialogSubtitle": "这些设置仅适用于从此输入框发起的对话",
    "composer.memoriesSlashCommand.existingThreadDialogSubtitle": "这些设置仅适用于当前对话",
    "composer.memoriesSlashCommand.useMemoriesLabel": "使用记忆",
    "composer.memoriesSlashCommand.useMemoriesDescription": "允许 Codex 将现有记忆带入此对话的上下文",
    "composer.memoriesSlashCommand.generateMemoriesLabel": "生成记忆",
    "composer.memoriesSlashCommand.generateMemoriesDescription": "允许 Codex 在今后创建新记忆时使用此对话",
    "composer.memoriesSlashCommand.useMemoriesStartedDescription": "对话开始后无法更改",
    "codex.rightPanel.expandFullWidth": "展开面板",
    "codex.rightPanel.restoreWidth": "恢复面板宽度",
    "codex.localConversation.sources.empty": "暂无来源",
    "codex.localConversation.artifacts.empty": "暂无产物",
    "codex.profileDropdown.logOut": "退出登录",
  },
};

export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return Intl.getCanonicalLocales(trimmed.replace(/_/g, "-"))[0] ?? null;
  } catch {
    return trimmed.replace(/_/g, "-");
  }
}

export function resolveHiCodexLocale(preferred: unknown, fallback: HiCodexLocale = HICODEX_DEFAULT_LOCALE): HiCodexLocale {
  const normalized = normalizeLocale(preferred);
  if (!normalized) return fallback;
  if (normalized.toLowerCase() === "zh-cn" || normalized.toLowerCase().startsWith("zh-hans")) return "zh-CN";
  if (normalized.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en-US";
}

export function loadHiCodexLocale(storage: BrowserStorageLike | null, browserLocale?: string | null): HiCodexLocale {
  if (storage) {
    try {
      const stored = readMigratedStorageValue(storage, HICODEX_LOCALE_STORAGE_KEY, [LEGACY_HICODEX_LOCALE_STORAGE_KEY]);
      if (stored) return resolveHiCodexLocale(stored);
    } catch {
      // Fall through to browser locale.
    }
  }
  return resolveHiCodexLocale(browserLocale);
}

export function saveHiCodexLocale(storage: BrowserStorageLike | null, locale: HiCodexLocale): void {
  if (!storage) return;
  try {
    storage.setItem(HICODEX_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale still applies for this session when storage is unavailable.
  }
}

export function localeLabel(locale: HiCodexLocale): string {
  switch (locale) {
    case "zh-CN":
      return "Chinese (Simplified)";
    default:
      return "English";
  }
}

export function localeDescription(locale: HiCodexLocale): string {
  switch (locale) {
    case "zh-CN":
      return "Use Simplified Chinese for HiCodex shell labels.";
    default:
      return "Use English for HiCodex shell labels.";
  }
}

export function createI18nBundle(locale: HiCodexLocale): I18nBundle {
  return {
    locale,
    messages: HICODEX_MESSAGES[locale] ?? HICODEX_MESSAGES[HICODEX_DEFAULT_LOCALE],
  };
}

export function formatI18nMessage(
  bundle: I18nBundle,
  descriptor: I18nMessageDescriptor,
  values: I18nValues = {},
): string {
  const template = bundle.messages[descriptor.id]
    ?? HICODEX_MESSAGES[HICODEX_DEFAULT_LOCALE][descriptor.id]
    ?? descriptor.defaultMessage;
  return formatIcuPluralFragments(template, values).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
    const value = values[key];
    return value == null ? match : String(value);
  });
}

function formatIcuPluralFragments(template: string, values: I18nValues): string {
  return template.replace(
    /\{([A-Za-z0-9_]+),\s*plural,\s*(?:one\s*\{([^{}]*)\}\s*)?other\s*\{([^{}]*)\}\s*\}/g,
    (match, key: string, one: string | undefined, other: string) => {
      const rawValue = values[key];
      const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) return match;
      const selected = numericValue === 1 && one !== undefined ? one : other;
      return selected.replace(/#/g, String(rawValue));
    },
  );
}
