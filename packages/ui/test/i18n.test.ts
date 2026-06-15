import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ForgeIntlProvider, useForgeIntl } from "../src/components/i18n-provider";
import {
  FORGE_LOCALE_STORAGE_KEY,
  createI18nBundle,
  formatI18nMessage,
  loadForgeLocale,
  resolveForgeLocale,
  saveForgeLocale,
} from "../src/state/i18n";
import { settingsGroupHeadingTitle, settingsSectionTitle, settingsSectionDescription } from "../src/state/settings-panel-workflow";
import { composerPlaceholderText } from "../src/state/composer-workflow";

export default function runI18nTests(): void {
  resolvesDesktopStyleLocaleFallbacks();
  formatsMessagesWithLocalFallbacks();
  formatsDesktopPluralMessages();
  formatsMigratedSurfaceMessages();
  formatsSettingsNavLabels();
  formatsDeepSweepLocalizations();
  formatsDeepSweep2Localizations();
  formatsDeepSweep3Localizations();
  persistsLocalePreference();
  rendersProviderConsumerWithLocalizedMessages();
}

// Locks zh-CN for the round-2 deep-sweep batch (automation schedule, auto-review,
// end-resource cards, mcp follow-up, side panel, copy/code, command groups).
function formatsDeepSweep2Localizations(): void {
  const en = createI18nBundle("en-US");
  const zh = createI18nBundle("zh-CN");
  const z = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatI18nMessage(zh, { id, defaultMessage }, values);
  const e = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatI18nMessage(en, { id, defaultMessage }, values);

  // Automation schedule summaries (incl. ICU number/plural + zh word reorder).
  assertEqual(z("settings.automations.scheduleSummary.daily", "Daily at {time}", { time: "9:00 AM" }), "每天 9:00 AM", "schedule daily zh");
  assertEqual(z("settings.automations.scheduleSummary.intervalMinutes", "Every {count}m", { count: 5 }), "每 5 分钟", "schedule intervalMinutes zh");
  assertEqual(z("settings.automations.scheduleSummary.intervalDayCount", "{count, plural, one {# day} other {# days}}", { count: 3 }), "3 天", "schedule intervalDayCount zh plural-other");
  assertEqual(e("settings.automations.scheduleSummary.daily", "Daily at {time}", { time: "9:00 AM" }), "Daily at 9:00 AM", "schedule daily en unchanged");

  // Auto-review titles/summaries.
  assertEqual(z("localConversation.automaticApprovalReview.title.inProgress", "Auto-reviewing"), "自动审核中", "autoReview title inProgress zh");
  assertEqual(z("localConversation.automaticApprovalReview.summary.completed", "x"), "经优化提示的审查智能体已审查此请求。", "autoReview summary completed zh");
  assertEqual(z("localConversation.approvalRequest.inProgress", "Awaiting approval"), "待批准", "approvalRequest inProgress zh");

  // End-resource cards (title + ICU {extension} fileType + google subtitle).
  assertEqual(z("localConversation.endResource.websiteTitle", "Web preview"), "网页预览", "endResource websiteTitle zh");
  assertEqual(z("localConversation.endResource.documentFileType", "Document · {extension}", { extension: "PDF" }), "文档 · PDF", "endResource documentFileType {extension} zh");
  assertEqual(z("localConversation.endResource.googleDocsSubtitle", "Docs"), "文档", "endResource googleDocsSubtitle zh");
  assertEqual(z("localConversation.endResource.showMore", "Show {count, number} more", { count: 1234 }), "显示另外 1,234 个", "endResource showMore {count, number} zh");

  // mcp follow-up + side panel + copy/code + command groups + composer suggestion.
  assertEqual(z("codex.mcpTool.confirmFollowUp.promptAriaLabel", "Prompt"), "提示", "mcp promptAriaLabel zh");
  assertEqual(z("thread.sidePanel.openFile", "Files"), "文件", "sidePanel openFile zh");
  assertEqual(z("codex.tabs.closeNamed", "Close {title} tab", { title: "Source" }), "关闭Source标签页", "tabs closeNamed {title} zh");
  assertEqual(z("copyButton.copyCode", "Copy code"), "复制代码", "copyButton copyCode zh");
  assertEqual(z("composer.aboveSuggestion.plan.title", "Create a plan"), "创建计划", "aboveSuggestion plan.title zh");
}

// Locks zh-CN for the round-3 deep-sweep batch (settings nav titles, worktree mode
// menu, sidebar groups, reconnecting, automation directives, exec command verbs,
// composer status panel, app-control tool labels, exec-detail exploration verbs,
// multi-agent rows). en-US keeps the bundle defaultMessage so English is unchanged.
function formatsDeepSweep3Localizations(): void {
  const en = createI18nBundle("en-US");
  const zh = createI18nBundle("zh-CN");
  const z = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatI18nMessage(zh, { id, defaultMessage }, values);
  const e = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatI18nMessage(en, { id, defaultMessage }, values);

  // Settings nav panel titles (zh present, en falls back to the switch defaultMessage).
  assertEqual(z("settings.nav.computer-use", "Computer use"), "电脑操控", "settings.nav computer-use zh");
  assertEqual(z("settings.nav.data-controls", "Archived chats"), "已归档对话", "settings.nav data-controls zh");
  assertEqual(e("settings.nav.mcp-settings", "MCP"), "MCP", "settings.nav mcp en fallback");

  // Worktree mode menu items.
  assertEqual(z("composer.mode.local.short", "Local"), "本地", "worktree mode local zh");
  assertEqual(z("composer.mode.worktreeSegment", "Worktree"), "工作树", "worktree mode worktree zh");
  assertEqual(z("composer.mode.runInCloud", "Cloud"), "云端", "worktree mode cloud zh");

  // Sidebar groups + reconnecting progress.
  assertEqual(z("sidebarElectron.recentThreads", "Recent chats"), "近期对话", "sidebar recentThreads zh");
  assertEqual(z("sidebarElectron.connectionGroup.local", "Local"), "本地", "sidebar connectionGroup.local zh");
  assertEqual(z("localConversation.streamError.reconnecting", "Reconnecting {progress}", { progress: "1/5" }), "正在重新连接 1/5", "stream-error reconnecting zh");

  // Automation directive verbs.
  assertEqual(z("automation.updateDirective.created", "Created"), "已创建", "automation directive created zh");
  assertEqual(z("automation.updateDirective.proposedUpdate", "Proposed update"), "建议更新", "automation directive proposedUpdate zh");

  // Exec command verbs (Cluster A toolSummaryForCmd + Cluster B action verbs).
  assertEqual(z("toolSummaryForCmd.ranSpecificCommand", "Ran {command}", { command: "npm test" }), "已运行 npm test", "exec ranSpecificCommand zh");
  assertEqual(z("hc.toolActivity.command.action.running", "Running"), "正在运行", "exec command action running zh");
  assertEqual(e("hc.toolActivity.command.action.ran", "Ran"), "Ran", "exec command action ran en unchanged");
  assertEqual(z("localConversation.dynamicToolCallGroup.repeatCount", " {count} times", { count: 3 }), "3 次", "dynamicToolCallGroup repeatCount zh");

  // Composer status panel.
  assertEqual(z("composer.statusPlain.heading", "Status"), "状态", "status heading zh");
  assertEqual(z("composer.statusPlain.sessionLabel", "Session:"), "会话：", "status sessionLabel zh");
  assertEqual(z("composer.statusPlain.contextValueRemaining", "{remaining}% left", { remaining: 89 }), "剩余 89%", "status contextValueRemaining zh");
  assertEqual(z("composer.statusPlain.rateLimitUnavailable", "Unavailable"), "不可用", "status rateLimitUnavailable zh");
  assertEqual(e("composer.statusPlain.contextValueMetadata", "({used} used / {total})", { used: "28,300", total: "249K" }), "(28,300 used / 249K)", "status contextValueMetadata en unchanged");

  // App-control (manage_codex_threads) tool labels.
  assertEqual(z("localConversation.appControlToolCall.threadsList.completed", "Listed threads"), "已列出对话线程", "appControl threadsList completed zh");
  assertEqual(z("localConversation.appControlToolCall.threadsSetTitle.active", "Renaming thread"), "正在重命名对话线程", "appControl threadsSetTitle active zh");

  // Exec-detail exploration verbs.
  assertEqual(z("toolSummaryForCmd.exploringFilesInPath", "Listing files in {path}", { path: "packages/ui" }), "正在列出 packages/ui 中的文件", "exec exploringFilesInPath zh");
  assertEqual(z("hc.toolActivity.skill.read", "Read {skillName} skill", { skillName: "Code Review" }), "已读取 Code Review 技能", "exec skill read zh");

  // Multi-agent rows + state + meta.
  assertEqual(z("localConversation.multiAgentAction.rowAction.spawn.inProgress", "Spawning"), "正在生成", "multiAgent rowAction spawn inProgress zh");
  assertEqual(z("localConversation.multiAgentAction.agentState.running", "running"), "正在运行", "multiAgent agentState running zh");
  assertEqual(z("localConversation.multiAgentAction.meta.prompt", "Input: {prompt}", { prompt: "x" }), "输入：x", "multiAgent meta.prompt zh");
  assertEqual(z("localConversation.multiAgentAction.row.spawn.createdWithInstructions", "Created {agent} with the instructions: {instructions}", { agent: "A", instructions: "B" }), "已根据以下指令创建 A：B", "multiAgent createdWithInstructions zh reorder");

  // deep-sweep-4 residuals: copyConversationMarkdown command title (was missing
  // from both dicts → leaked English in zh) + tool-activity-detail's second
  // autoReview copy (now routes through the shared keys).
  assertEqual(z("hc.command.copyConversationMarkdown.title", "Copy as Markdown"), "复制为 Markdown", "copyConversationMarkdown command title zh");
  assertEqual(e("hc.command.copyConversationMarkdown.title", "Copy as Markdown"), "Copy as Markdown", "copyConversationMarkdown command title en unchanged");
  assertEqual(z("localConversation.automaticApprovalReview.title.approved", "Auto-review approved"), "自动审核已批准", "autoReview approved zh (tool-activity-detail copy)");

  // thread-goal objective length cap (4000 chars, codex composer-B7sGHJVq.js cd=4e3).
  assertEqual(z("composer.threadGoal.objectiveTooLong", "Goal must be {maxCharacters, number} characters or fewer", { maxCharacters: 4000 }), "目标不能超过 4,000 个字符", "goal objectiveTooLong zh ICU number");
  assertEqual(e("composer.threadGoal.objectiveTooLong", "Goal must be {maxCharacters, number} characters or fewer", { maxCharacters: 4000 }), "Goal must be 4,000 characters or fewer", "goal objectiveTooLong en ICU number");

  // "Pursue goal" composer goal-mode feature (composer "+" toggle + indicator + placeholder).
  assertEqual(z("composer.goalDropdown", "Pursue goal"), "追求目标", "goalDropdown zh");
  assertEqual(z("composer.placeholder.goal", "What should Codex keep working toward?"), "Codex 应继续朝哪个目标努力？", "goal placeholder zh");
  assertEqual(z("composer.goalModeIndicator", "Goal"), "目标", "goalModeIndicator zh");
  assertEqual(z("composer.threadGoal.setError", "Failed to set goal"), "无法设置目标", "goal setError zh");
  assertEqual(z("composer.threadGoal.replaceConfirmation.title", "Replace current goal?"), "替换当前目标吗？", "goal replaceConfirmation title zh");
  assertEqual(z("composer.threadGoal.replaceConfirmation.confirm", "Replace goal"), "替换目标", "goal replaceConfirmation confirm zh");
  assertEqual(z("composer.threadGoal.resumeConfirmation.title", "Resume paused goal?"), "恢复已暂停的目标吗？", "goal resumeConfirmation title zh");
  assertEqual(z("composer.threadGoal.resumeConfirmation.keepPaused", "Keep paused"), "保持暂停", "goal resumeConfirmation keepPaused zh");
  assertEqual(z("composer.threadGoal.resumeConfirmation.notNow", "Not now"), "暂不", "goal resumeConfirmation notNow zh");
}

// Locks the zh-CN values for the strings the multi-agent deep-sweep found leaking
// English in Forge (verbatim-aligned to Codex Desktop bundle 26.602). en-US keeps
// the bundle defaultMessage so English output is unchanged.
function formatsDeepSweepLocalizations(): void {
  const en = createI18nBundle("en-US");
  const zh = createI18nBundle("zh-CN");
  const z = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatI18nMessage(zh, { id, defaultMessage }, values);
  const e = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatI18nMessage(en, { id, defaultMessage }, values);

  // Permission-request row labels (completes the RequestDetailRow localization).
  assertEqual(z("permissionRequest.network", "Network"), "网络", "permissionRequest.network zh");
  assertEqual(z("permissionRequest.fileRead", "Read"), "读取", "permissionRequest.fileRead zh");
  assertEqual(z("permissionRequest.fileWrite", "Write"), "写入", "permissionRequest.fileWrite zh");
  assertEqual(z("permissionRequest.fileReadWrite", "Read and write"), "读取和写入", "permissionRequest.fileReadWrite zh");
  assertEqual(e("permissionRequest.network", "Network"), "Network", "permissionRequest.network en unchanged");

  // Patch per-change verbs (bare, status-aware).
  assertEqual(z("codex.patch.change.creating", "Creating"), "正在创建", "patch.change.creating zh");
  assertEqual(z("codex.patch.change.stoppedDeleting", "Stopped deleting"), "已停止删除", "patch.change.stoppedDeleting zh");
  assertEqual(z("codex.patch.change.rejected-add", "Rejected"), "已拒绝", "patch.change.rejected zh");
  assertEqual(e("codex.patch.change.edited", "Edited"), "Edited", "patch.change.edited en unchanged");

  // Exec footer labels (incl. ICU {code}).
  assertEqual(z("execFooter.success", "Success"), "成功", "execFooter.success zh");
  assertEqual(z("execFooter.stopped", "Stopped"), "已停止", "execFooter.stopped zh");
  assertEqual(z("execFooter.exitCode", "Exit code {code}", { code: 1 }), "退出码 1", "execFooter.exitCode {code} zh");
  assertEqual(z("execFooter.exitCode.unknown", "unknown"), "未知", "execFooter.exitCode.unknown zh");

  // Hooks summary + automation next-run + browser-use source + sidebar empty state.
  assertEqual(z("assistantMessage.hookStats.title", "Hooks summary"), "钩子摘要", "hookStats.title zh");
  assertEqual(z("assistantMessage.hookStats.blockedCount", "Blocked"), "已阻止", "hookStats.blockedCount zh");
  assertEqual(
    z("codex.localConversation.heartbeatAutomation.nextRun", "Next run: {nextRunLabel}", { nextRunLabel: "9:00 AM" }),
    "下次运行：9:00 AM",
    "heartbeatAutomation.nextRun {nextRunLabel} zh",
  );
  assertEqual(z("localConversation.toolActivitySummary.mcpToolCalls.source.browser", "the browser"), "浏览器", "mcpToolCalls.source.browser zh");
  assertEqual(z("sidebarElectron.noRecentChats", "No chats"), "暂无对话", "sidebarElectron.noRecentChats zh (暂无 prefix)");
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

  // Summary-panel expandable list — ICU `{count, number}` argument (Codex uses locale-aware number formatting).
  const summaryShowMore = { id: "codex.localConversation.summaryPanelExpandableList.showMore", defaultMessage: "Show {count, number} more" };
  assertEqual(formatI18nMessage(en, summaryShowMore, { count: 3 }), "Show 3 more", "summaryPanel showMore {count, number} en");
  assertEqual(formatI18nMessage(zh, summaryShowMore, { count: 3 }), "再显示 3 个", "summaryPanel showMore {count, number} zh");
  assertEqual(formatI18nMessage(en, summaryShowMore, { count: 1234 }), "Show 1,234 more", "summaryPanel showMore {count, number} en thousands grouping");

  // Codex EN-source parity — exact English must match Codex Desktop's defaultMessage (audited verbatim).
  assertEqual(formatI18nMessage(en, { id: "codex.appUpsellBanner.learnMoreLowercase", defaultMessage: "learn more" }), "learn more", "appUpsell learnMoreLowercase en (lowercase per key name)");
  assertEqual(formatI18nMessage(en, { id: "codex.localConversation.closeGeneratedImagePreview", defaultMessage: "Close image preview" }), "Close image preview", "closeGeneratedImagePreview en");
  assertEqual(formatI18nMessage(en, { id: "codex.unifiedDiff.reviewChanges", defaultMessage: "Review" }), "Review", "unifiedDiff reviewChanges en");
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.collapseFiles", defaultMessage: "Collapse files" }), "收起文件", "unifiedDiff collapseFiles zh");
  assertEqual(formatI18nMessage(zh, { id: "codex.unifiedDiff.reviewChanges", defaultMessage: "Review" }), "审查", "unifiedDiff reviewChanges zh");
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
  assertEqual(resolveForgeLocale("zh-Hans-CN"), "zh-CN", "Simplified Chinese should resolve to zh-CN");
  assertEqual(resolveForgeLocale("fr-FR"), "en-US", "unsupported locales should fall back to en-US");
  assertEqual(resolveForgeLocale(null), "en-US", "missing locale should fall back to en-US");
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
// Forge-only sections (models/images/…) are now localized via hc.settings.* keys,
// and subtitles localize the same way; only the no-formatMessage path stays English.
function formatsSettingsNavLabels(): void {
  const zh = createI18nBundle("zh-CN");
  const zhFormat = (descriptor: Parameters<typeof formatI18nMessage>[1], values?: Parameters<typeof formatI18nMessage>[2]) =>
    formatI18nMessage(zh, descriptor, values);

  assertEqual(settingsSectionTitle({ id: "appearance", title: "Appearance" }, zhFormat), "外观", "settings nav appearance zh");
  assertEqual(settingsSectionTitle({ id: "mcp", title: "MCP servers" }, zhFormat), "MCP 服务器", "settings nav mcp zh (mcp-settings id)");
  assertEqual(settingsSectionTitle({ id: "data-controls", title: "Archived chats" }, zhFormat), "已归档对话", "settings nav data-controls zh");
  assertEqual(settingsSectionTitle({ id: "models", title: "Models" }, zhFormat), "模型", "Forge-only section (models) now localized in zh");
  assertEqual(settingsSectionTitle({ id: "appearance", title: "Appearance" }), "Appearance", "no formatMessage → English");
  assertEqual(settingsGroupHeadingTitle("personal", "Personal", zhFormat), "个人", "settings nav group heading personal zh");
  assertEqual(settingsGroupHeadingTitle("integrations", "Integrations", zhFormat), "集成", "settings nav group heading integrations zh");
  assertEqual(settingsGroupHeadingTitle("coding", "Coding", zhFormat), "编码", "settings nav group heading coding zh");
  assertEqual(settingsGroupHeadingTitle("archived", "Archived", zhFormat), "已归档", "settings nav group heading archived zh");
  assertEqual(settingsSectionDescription({ id: "general", description: "Runtime and workspace" }, zhFormat), "运行时与工作区", "settings nav general subtitle zh");
  assertEqual(settingsSectionDescription({ id: "models", description: "Provider and model profile" }, zhFormat), "提供方与模型档案", "settings nav models subtitle zh");
  assertEqual(settingsSectionDescription({ id: "models", description: "Provider and model profile" }), "Provider and model profile", "no formatMessage → English subtitle");

  // Composer placeholder — each branch resolves to the right Codex id + zh copy.
  assertEqual(
    composerPlaceholderText({ hasConversation: false }, zhFormat),
    "可向 Forge 询问任何事。输入 @ 使用插件或提及文件",
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
    "Ask Forge anything. @ to use plugins or mention files",
    "composer placeholder English unchanged without formatMessage",
  );
}

function persistsLocalePreference(): void {
  const storage = memoryStorage();
  assertEqual(loadForgeLocale(storage, "zh-CN"), "zh-CN", "browser locale should be used without storage");
  saveForgeLocale(storage, "en-US");
  assertEqual(storage.values.get(FORGE_LOCALE_STORAGE_KEY), "en-US", "locale should be persisted");
  assertEqual(loadForgeLocale(storage, "zh-CN"), "en-US", "stored locale should win");
}

function rendersProviderConsumerWithLocalizedMessages(): void {
  function Consumer() {
    const { locale, formatMessage } = useForgeIntl();
    return createElement(
      "span",
      { "data-locale": locale },
      formatMessage({ id: "hc.command.theme.toggleDark", defaultMessage: "Switch to dark theme" }),
    );
  }

  const html = renderToStaticMarkup(createElement(
    ForgeIntlProvider,
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
