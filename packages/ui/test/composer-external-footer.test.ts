import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ComposerExternalFooter,
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
    }) === "gpt-5.5 / Medium / Concise summaries",
    "intelligence label should include model, reasoning effort, and summary mode",
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
    }) === "Default permissions",
    "permissions label should project Desktop's default permissions chip",
  );
}

function rendersContextChipsWithOverflowHooks(): void {
  const html = renderToStaticMarkup(createElement(ComposerExternalFooter, {
    model: "gpt-5.5",
    reasoningEffort: "medium",
    reasoningSummary: "auto",
    sandboxMode: "workspace-write",
    approvalPolicy: "on-request",
    onOpenPermissions: () => undefined,
    onOpenModelPicker: () => undefined,
  }));

  assert(
    html.includes("hc-composer-external-footer-context"),
    "footer should group runtime context chips away from project chips",
  );
  assert(
    html.includes('data-chip="permissions"'),
    "footer should render a permissions chip",
  );
  assert(
    html.includes('title="Change permissions"'),
    "wired permissions chip should advertise the settings action",
  );
  assert(
    html.includes('data-chip="intelligence"'),
    "footer should render an intelligence chip",
  );
  assert(
    html.includes('data-chip="work-mode"'),
    "work-mode chip should remain visible while it is display-only",
  );
  assert(
    html.includes('data-interactive="true"'),
    "interactive intelligence chip should expose the interactive styling hook",
  );
  assert(
    html.includes("gpt-5.5 / Medium / Auto summaries"),
    "intelligence chip should show the full projected label before CSS truncates it",
  );
}
