import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HiCodexIntlProvider, useHiCodexIntl } from "../src/components/i18n-provider";
import {
  HICODEX_LOCALE_STORAGE_KEY,
  createI18nBundle,
  formatI18nMessage,
  loadHiCodexLocale,
  resolveHiCodexLocale,
  saveHiCodexLocale,
} from "../src/state/i18n";
import { settingsGroupHeadingTitle, settingsSectionTitle } from "../src/state/settings-panel-workflow";
import { composerPlaceholderText } from "../src/state/composer-workflow";

export default function runI18nTests(): void {
  resolvesDesktopStyleLocaleFallbacks();
  formatsMessagesWithLocalFallbacks();
  formatsDesktopPluralMessages();
  formatsMigratedSurfaceMessages();
  formatsSettingsNavLabels();
  persistsLocalePreference();
  rendersProviderConsumerWithLocalizedMessages();
}

// Locks the zh-CN copy + ICU wiring for the literals migrated to the catalog in
// the 2026-05-30 Phase-2 pass (reasoning picker, Appearance panel, MCP card/form,
// unified-diff). The Codex zh-CN strings come from `zh-CN-D2lLifL1.js`; the en-US
// path must reproduce the exact pre-migration English so wrapping is regression-free.
function formatsMigratedSurfaceMessages(): void {
  const en = createI18nBundle("en-US");
  const zh = createI18nBundle("zh-CN");

  // Reasoning effort labels (dropdown + footer chip).
  assertEqual(formatI18nMessage(zh, { id: "composer.mode.local.reasoning.high.label", defaultMessage: "High" }), "高", "reasoning high zh");
  assertEqual(formatI18nMessage(zh, { id: "composer.mode.local.reasoning.xhigh.label", defaultMessage: "Extra High" }), "超高", "reasoning xhigh zh");
  assertEqual(formatI18nMessage(en, { id: "composer.mode.local.reasoning.xhigh.label", defaultMessage: "Extra High" }), "Extra High", "reasoning xhigh en unchanged");
  assertEqual(formatI18nMessage(zh, { id: "composer.intelligenceDropdown.title", defaultMessage: "Reasoning" }), "推理", "reasoning dropdown title zh");

  // Appearance panel row labels + MCP card header.
  assertEqual(formatI18nMessage(zh, { id: "settings.general.appearance.theme", defaultMessage: "Theme" }), "主题", "appearance theme zh");
  assertEqual(formatI18nMessage(zh, { id: "settings.ide.language.label", defaultMessage: "Language" }), "语言", "appearance language zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.mcpTool.textBlock.plaintextTitle", defaultMessage: "plaintext" }), "纯文本", "mcp plaintext title zh");

  // MCP config form — save + {name} interpolation.
  assertEqual(formatI18nMessage(zh, { id: "settings.mcp.detail.save", defaultMessage: "Save" }), "保存", "mcp save zh");
  assertEqual(
    formatI18nMessage(zh, { id: "settings.mcp.detail.titleExisting", defaultMessage: "Update {name} MCP" }, { name: "github" }),
    "更新 github MCP",
    "mcp titleExisting {name} zh",
  );

  // Unified-diff title helpers — {filename} + plurals must match Codex zh-CN.
  assertEqual(
    formatI18nMessage(zh, { id: "codex.unifiedDiff.editedFile", defaultMessage: "Edited {filename}" }, { filename: "app.tsx" }),
    "已编辑 app.tsx",
    "unifiedDiff editedFile {filename} zh",
  );
  const editedFiles = { id: "codex.unifiedDiff.editedFiles", defaultMessage: "{fileCount, plural, one {Edited # file} other {Edited # files}}" };
  assertEqual(formatI18nMessage(en, editedFiles, { fileCount: 1 }), "Edited 1 file", "unifiedDiff editedFiles en singular");
  assertEqual(formatI18nMessage(en, editedFiles, { fileCount: 3 }), "Edited 3 files", "unifiedDiff editedFiles en plural");
  assertEqual(formatI18nMessage(zh, editedFiles, { fileCount: 3 }), "已编辑 3 个文件", "unifiedDiff editedFiles zh");
  const showMore = { id: "codex.unifiedDiff.showMoreFiles", defaultMessage: "{count, plural, one {Show # more file} other {Show # more files}}" };
  assertEqual(formatI18nMessage(en, showMore, { count: 1 }), "Show 1 more file", "unifiedDiff showMoreFiles en singular");
  assertEqual(formatI18nMessage(zh, showMore, { count: 2 }), "再显示 2 个文件", "unifiedDiff showMoreFiles zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.collapseFiles", defaultMessage: "Collapse files" }), "收起文件", "unifiedDiff collapseFiles zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.reviewChanges", defaultMessage: "Review here" }), "审查", "unifiedDiff reviewChanges zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.reviewChangesHover", defaultMessage: "Review changes" }), "查看更改", "unifiedDiff reviewChangesHover zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" }), "审核", "unifiedDiff viewDiffTooltip zh");

  // Unified-diff patch-failure dialog — titles, headings ({count}), error summary ({message}), close.
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.revertPatchPartial", defaultMessage: "Some changes reverted" }), "已还原部分更改", "failure dialog revertPatchPartial zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.reapplyPatchNotGitRepo", defaultMessage: "Reapply requires a Git repository" }), "重新应用需要使用 Git 代码仓库", "failure dialog reapplyPatchNotGitRepo zh");
  assertEqual(
    formatI18nMessage(zh, { id: "codex.unifiedDiff.patchAppliedPathsHeading", defaultMessage: "Applied cleanly ({count})" }, { count: 2 }),
    "已直接应用（2 个）",
    "failure dialog patchAppliedPathsHeading {count} zh",
  );
  assertEqual(
    formatI18nMessage(zh, { id: "codex.unifiedDiff.patchErrorOutputSummary", defaultMessage: "Git apply error: {message}" }, { message: "boom" }),
    "Git 应用错误：boom",
    "failure dialog patchErrorOutputSummary {message} zh",
  );
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.patchFailureDialogClose", defaultMessage: "Close" }), "关闭", "failure dialog close zh");

  // /memories dialog (slash-request projection) + scattered singles.
  assertEqual(
    formatI18nMessage(zh, {
      id: "codex.hooksReviewBanner.summary",
      defaultMessage: "{count, plural, one {# hook needs review before it can run} other {# hooks need review before they can run}}",
    }, { count: 2 }),
    "2 个钩子需要审查后才能运行",
    "hooks review banner summary zh",
  );
  assertEqual(formatI18nMessage(zh, { id: "codex.hooksReviewBanner.trustAll", defaultMessage: "Trust all" }), "全部信任", "hooks review trustAll zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.hooksReviewBanner.review", defaultMessage: "Review hooks" }), "审查钩子", "hooks review action zh");
  assertEqual(formatI18nMessage(zh, { id: "localConversation.planSummary.title", defaultMessage: "Plan" }), "套餐", "plan summary title zh");
  assertEqual(formatI18nMessage(zh, { id: "localConversation.planSummary.titleWriting", defaultMessage: "Writing plan" }), "编写计划", "plan summary titleWriting zh");
  assertEqual(formatI18nMessage(zh, { id: "localConversation.planSummary.download", defaultMessage: "Download plan" }), "下载套餐", "plan summary download zh");
  assertEqual(formatI18nMessage(zh, { id: "localConversation.planSummary.expand", defaultMessage: "Expand plan summary" }), "展开计划概要", "plan summary expand aria zh");
  assertEqual(formatI18nMessage(zh, { id: "localConversation.planSummary.collapse", defaultMessage: "Collapse plan summary" }), "折叠计划概要", "plan summary collapse aria zh");
  assertEqual(formatI18nMessage(zh, { id: "localConversation.planSummary.viewPlan", defaultMessage: "Expand plan" }), "展开计划", "plan summary view plan zh");
  assertEqual(formatI18nMessage(zh, { id: "copyButton.copyAriaLabel", defaultMessage: "Copy" }), "复制", "copy button copy zh");
  assertEqual(formatI18nMessage(zh, { id: "copyButton.copiedAriaLabel", defaultMessage: "Copied" }), "已复制", "copy button copied zh");
  assertEqual(formatI18nMessage(zh, { id: "composer.memoriesSlashCommand.dialogTitle", defaultMessage: "Chat memories" }), "对话记忆", "memories dialogTitle zh");
  assertEqual(formatI18nMessage(zh, { id: "composer.memoriesSlashCommand.useMemoriesLabel", defaultMessage: "Use memories" }), "使用记忆", "memories useMemoriesLabel zh");
  assertEqual(formatI18nMessage(zh, { id: "composer.memoriesSlashCommand.useMemoriesDescription", defaultMessage: "Let Codex bring existing memories into this chat’s context" }), "允许 Codex 将现有记忆带入此对话的上下文", "memories useMemoriesDescription zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.profileDropdown.logOut", defaultMessage: "Log out" }), "退出登录", "profile dropdown logout zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.rightPanel.expandFullWidth", defaultMessage: "Expand panel" }), "展开面板", "right panel expand zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.rightPanel.restoreWidth", defaultMessage: "Restore panel width" }), "恢复面板宽度", "right panel restore zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.localConversation.artifacts.empty", defaultMessage: "No artifacts yet" }), "暂无产物", "right rail artifacts empty zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.localConversation.sources.empty", defaultMessage: "No sources yet" }), "暂无来源", "right rail sources empty zh");
}

function resolvesDesktopStyleLocaleFallbacks(): void {
  assertEqual(resolveHiCodexLocale("zh-Hans-CN"), "zh-CN", "Simplified Chinese should resolve to zh-CN");
  assertEqual(resolveHiCodexLocale("fr-FR"), "en-US", "unsupported locales should fall back to en-US");
  assertEqual(resolveHiCodexLocale(null), "en-US", "missing locale should fall back to en-US");
}

function formatsMessagesWithLocalFallbacks(): void {
  const zh = createI18nBundle("zh-CN");
  assertEqual(
    formatI18nMessage(zh, { id: "hc.command.theme.title", defaultMessage: "Theme" }),
    "主题",
    "known messages should localize",
  );
  assertEqual(
    formatI18nMessage(zh, { id: "hc.test.value", defaultMessage: "Hello {name}" }, { name: "Codex" }),
    "Hello Codex",
    "unknown messages should fall back and interpolate",
  );
}

function formatsDesktopPluralMessages(): void {
  const en = createI18nBundle("en-US");
  const zh = createI18nBundle("zh-CN");
  const descriptor = {
    id: "assistantMessage.memoryCitations.summary",
    defaultMessage: "{count, plural, one {1 memory citation} other {# memory citations}}",
  };

  assertEqual(formatI18nMessage(en, descriptor, { count: 1 }), "1 memory citation", "English singular ICU label");
  assertEqual(formatI18nMessage(en, descriptor, { count: 2 }), "2 memory citations", "English plural ICU label");
  assertEqual(formatI18nMessage(zh, descriptor, { count: 2 }), "2 条记忆引用", "Chinese plural ICU label");
  assertEqual(
    formatI18nMessage(
      zh,
      {
        id: "localConversation.reviewComments.showMore",
        defaultMessage: "{count, plural, one {Show # more comment} other {Show # more comments}}",
      },
      { count: 2 },
    ),
    "再显示 2 条评论",
    "Chinese review comment show-more ICU label",
  );
  assertEqual(
    formatI18nMessage(
      zh,
      {
        id: "localConversationPage.planItemsCompleted",
        defaultMessage: "{completedItems} out of {totalItems, plural, one {# task completed} other {# tasks completed}}",
      },
      { completedItems: 1, totalItems: 3 },
    ),
    "共 3 个任务，已经完成 1 个",
    "Chinese inline todo-list completed summary should match Codex Desktop zh-CN copy",
  );
  assertEqual(
    formatI18nMessage(
      zh,
      {
        id: "codex.todoPlan.stepIndexPrefix",
        defaultMessage: "{index}.",
      },
      { index: 2 },
    ),
    "2.",
    "Chinese todo-list step index prefix should match Codex Desktop zh-CN copy",
  );
}

// Settings-nav titles localize via the SETTINGS_SECTION_I18N_IDS map + helper;
// HiCodex-only sections (no Codex id) and the no-formatMessage path stay English.
function formatsSettingsNavLabels(): void {
  const zh = createI18nBundle("zh-CN");
  const zhFormat = (descriptor: Parameters<typeof formatI18nMessage>[1], values?: Parameters<typeof formatI18nMessage>[2]) =>
    formatI18nMessage(zh, descriptor, values);

  assertEqual(settingsSectionTitle({ id: "appearance", title: "Appearance" }, zhFormat), "外观", "settings nav appearance zh");
  assertEqual(settingsSectionTitle({ id: "mcp", title: "MCP servers" }, zhFormat), "MCP 服务器", "settings nav mcp zh (mcp-settings id)");
  assertEqual(settingsSectionTitle({ id: "data-controls", title: "Archived chats" }, zhFormat), "已归档对话", "settings nav data-controls zh");
  assertEqual(settingsSectionTitle({ id: "models", title: "Models" }, zhFormat), "Models", "HiCodex-only section stays English even in zh");
  assertEqual(settingsSectionTitle({ id: "appearance", title: "Appearance" }), "Appearance", "no formatMessage → English");
  assertEqual(settingsGroupHeadingTitle("app", "App", zhFormat), "应用", "settings nav group heading app zh");
  assertEqual(settingsGroupHeadingTitle("host", "Host", zhFormat), "主机", "settings nav group heading host zh");

  // Composer placeholder — each branch resolves to the right Codex id + zh copy.
  assertEqual(
    composerPlaceholderText({ hasConversation: false }, zhFormat),
    "可向 Codex 询问任何事。输入 @ 使用插件或提及文件",
    "composer placeholder newTask zh",
  );
  assertEqual(
    composerPlaceholderText({ hasConversation: true, hasBackgroundAgentsPanel: true }, zhFormat),
    "要求提供后续变更或 @ 提及智能体",
    "composer placeholder follow-up with-agents zh",
  );
  assertEqual(
    composerPlaceholderText({ hasConversation: true }, zhFormat),
    "要求后续变更",
    "composer placeholder follow-up zh",
  );
  assertEqual(
    composerPlaceholderText({ hasConversation: false }),
    "Ask Codex anything. @ to use plugins or mention files",
    "composer placeholder English unchanged without formatMessage",
  );
}

function persistsLocalePreference(): void {
  const storage = memoryStorage();
  assertEqual(loadHiCodexLocale(storage, "zh-CN"), "zh-CN", "browser locale should be used without storage");
  saveHiCodexLocale(storage, "en-US");
  assertEqual(storage.values.get(HICODEX_LOCALE_STORAGE_KEY), "en-US", "locale should be persisted");
  assertEqual(loadHiCodexLocale(storage, "zh-CN"), "en-US", "stored locale should win");
}

function rendersProviderConsumerWithLocalizedMessages(): void {
  function Consumer() {
    const { locale, formatMessage } = useHiCodexIntl();
    return createElement(
      "span",
      { "data-locale": locale },
      formatMessage({ id: "hc.command.theme.toggleDark", defaultMessage: "Switch to dark theme" }),
    );
  }

  const html = renderToStaticMarkup(createElement(
    HiCodexIntlProvider,
    { locale: "zh-CN", children: createElement(Consumer) },
  ));
  assertIncludes(html, "data-locale=\"zh-CN\"", "provider consumer should receive the resolved locale");
  assertIncludes(html, "切换到深色主题", "provider consumer should format localized messages");
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
