import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerExternalFooter, formatWorkspaceProjectLabel } from "../src/components/composer-external-footer";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export default function runComposerExternalFooterTests(): void {
  formatsProjectDropdownLabelLikeDesktopFooter();
  rendersModelChipAsPickerTriggerWhenHandlerIsProvided();
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

function rendersModelChipAsPickerTriggerWhenHandlerIsProvided(): void {
  const html = renderToStaticMarkup(createElement(ComposerExternalFooter, {
    model: "gpt-5.5",
    onOpenModelPicker: () => undefined,
  }));

  assert(
    html.includes("hc-composer-footer-model"),
    "footer should render the model chip when a model is available",
  );
  assert(
    html.includes('title="Switch model for new chats"'),
    "interactive model chip should advertise the picker action",
  );
  assert(
    html.includes('data-interactive="true"'),
    "interactive model chip should expose the interactive styling hook",
  );
}
