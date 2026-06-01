import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ComposerExternalFooter,
  ComposerSettingsChips,
  formatIntelligenceFooterLabel,
  formatPermissionsFooterLabel,
  formatWorkspaceProjectLabel,
} from "../src/components/composer-external-footer";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export default function runComposerExternalFooterTests(): void {
  formatsProjectDropdownLabelLikeDesktopFooter();
  formatsContextChipLabels();
  rendersContextChipsWithOverflowHooks();
}

function formatsProjectDropdownLabelLikeDesktopFooter(): void {
  assert(
    formatWorkspaceProjectLabel(null, []) === "Select your project",
    "empty cwd should use Desktop's project selector fallback",
  );
  assert(
    formatWorkspaceProjectLabel("/workspace/HiCodex/", [{ root: "/workspace/HiCodex", label: "HiCodex" }]) === "HiCodex",
    "known cwd should use the workspace root label",
  );
  assert(
    formatWorkspaceProjectLabel("/workspace/apps/src-tauri", []) === "src-tauri",
    "unknown cwd should fall back to the cwd basename",
  );
}

function formatsContextChipLabels(): void {
  assert(
    formatIntelligenceFooterLabel({
      model: "gpt-5.5",
      reasoningEffort: "medium",
      reasoningSummary: "concise",
    }) === "gpt-5.5 Medium",
    "intelligence label should include model and effort only",
  );
  assert(
    formatPermissionsFooterLabel({
      sandboxMode: "danger-full-access",
      approvalPolicy: "never",
      approvalsReviewer: "user",
    }) === "Full access",
    "permissions label should project full access mode",
  );
  assert(
    formatPermissionsFooterLabel({
      sandboxMode: "workspace-write",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
    }) === "Ask for approval",
    "permissions chip should render Desktop's default-mode shortLabel (composer.permissionsDropdown.default.shortLabel)",
  );
}

function rendersContextChipsWithOverflowHooks(): void {
  /*
   * codex: composer-*.js — the model-intelligence / reasoning-effort /
   * permissions chips render INSIDE the composer bubble footer (Composer
   * `footerSettings` slot) via ComposerSettingsChips. The below-bubble external
   * footer keeps only the project add-menu + branch chip.
   */
  const chips = renderToStaticMarkup(createElement(ComposerSettingsChips, {
    model: "gpt-5.5",
    reasoningEffort: "medium",
    sandboxMode: "workspace-write",
    approvalPolicy: "on-request",
    onOpenPermissions: () => undefined,
    onOpenModelPicker: () => undefined,
  }));

  assert(
    chips.includes("hc-composer-settings-chips"),
    "in-bubble settings cluster should wrap the model/reasoning/permissions chips",
  );
  assert(
    chips.includes('data-chip="permissions"'),
    "settings cluster should render a permissions chip",
  );
  assert(
    chips.includes("hc-tooltip-trigger"),
    "settings chips should be wrapped in a styled Tooltip (codex tooltip-CDzchJxN.js), not a native title",
  );
  assert(
    chips.includes('data-chip="intelligence"'),
    "settings cluster should render an intelligence chip",
  );
  assert(
    chips.includes('data-interactive="true"'),
    "interactive intelligence chip should expose the interactive styling hook",
  );
  assert(
    chips.includes("gpt-5.5 Medium"),
    "intelligence chip should show the Desktop-style model and effort label",
  );
  assert(
    !chips.includes("Auto summaries") && !chips.includes(" / "),
    "intelligence chip should not expose summary mode or slash-joined labels",
  );

  const footer = renderToStaticMarkup(createElement(ComposerExternalFooter, {
    branch: "main",
    cwd: "/workspace/HiCodex",
  }));

  assert(
    footer.includes('aria-label="Project and work mode"'),
    "external footer should keep project and work mode behind the left add menu",
  );
  assert(
    footer.includes("hc-composer-footer-branch") && footer.includes("main"),
    "external footer should render the current branch chip",
  );
  assert(
    !footer.includes('data-chip="work-mode"'),
    "work-mode should not remain as a persistent footer chip",
  );
  assert(
    !footer.includes('data-chip="permissions"') && !footer.includes('data-chip="intelligence"'),
    "model/permissions chips should move out of the external footer into the in-bubble cluster",
  );
}
