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
  rendersExternalFooterProjectAndWorkModeControls();
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
  // formatIntelligenceFooterLabel now mirrors Codex's model chip: model-only
  // input, `gpt-`/`gpt_` prefix stripped (composer-external-footer.tsx:564).
  assert(
    formatIntelligenceFooterLabel({ model: "gpt-5.5" }) === "5.5",
    "intelligence label should render the model with its gpt- prefix stripped",
  );
  assert(
    formatIntelligenceFooterLabel({ model: null }) === "",
    "intelligence label should be empty without a model",
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
    chips.includes(">5.5<"),
    "intelligence chip should show the gpt-stripped model label (composer-external-footer.tsx:564)",
  );
  assert(
    chips.includes('data-chip="reasoning"') && chips.includes(">Medium<"),
    "reasoning effort should render on its own chip, not inside the intelligence label",
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
    footer.includes("hc-composer-footer-workmode-chip") && footer.includes(">Local<"),
    "external footer should render the visible Desktop work-mode chip beside the project picker",
  );
  assert(
    !footer.includes('data-chip="permissions"') && !footer.includes('data-chip="intelligence"'),
    "model/permissions chips should move out of the external footer into the in-bubble cluster",
  );
}

function rendersExternalFooterProjectAndWorkModeControls(): void {
  const projectFooter = renderToStaticMarkup(createElement(ComposerExternalFooter, {
    branch: null,
    cwd: "/workspace/HiCodex",
    workMode: "worktree",
    workspaceRoots: [{ root: "/workspace/HiCodex", label: "HiCodex" }],
    onUseExistingFolder: () => undefined,
    onWorkspaceRootSelected: () => undefined,
  }));

  assert(
    projectFooter.includes("hc-composer-footer-project-chip") && projectFooter.includes(">HiCodex<"),
    "external footer should render the selected project label in the extracted project chip",
  );
  assert(
    projectFooter.includes("hc-composer-footer-workmode-chip") && projectFooter.includes(">Worktree<"),
    "external footer should render the selected work-mode label as its own chip",
  );
  assert(
    projectFooter.includes('aria-hidden="true"'),
    "external footer should mark the empty branch slot hidden when no branch label is available",
  );

  const projectlessFooter = renderToStaticMarkup(createElement(ComposerExternalFooter, {
    branch: null,
    cwd: "~",
    workMode: "local",
  }));

  assert(
    projectlessFooter.includes(">Work in a project<"),
    "projectless external footer should render Desktop's work-in-project CTA",
  );
}
