import { AppToastViewport } from "./app-toast-viewport";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { ModelPickerMenu, type ModelPickerProvider } from "./model-picker-menu";
import { ReasoningPickerMenu, type ReasoningPickerMenuProps } from "./reasoning-picker-menu";
import { UnifiedDiffFailureDialog, type UnifiedDiffFailure } from "./unified-diff-failure-dialog";
import type { LogLine } from "../state/codex-reducer";

/*
 * Global overlay group extracted from HiCodexApp's return: patch-failure
 * dialog, model + reasoning pickers, keyboard-shortcuts dialog, and the toast
 * viewport. Each is rendered conditionally on its anchor/open prop; all
 * callbacks are stable useCallback references built in HiCodexAppBody.
 */
export function AppOverlays({
  patchFailure,
  onPatchFailureClose,
  onPatchFailureOpenPath,
  modelPickerAnchor,
  modelPickerProviders,
  modelPickerSelectedKey,
  modelPickerDefaultKey,
  modelPickerReadyProviders,
  onModelSelect,
  onModelPickerOpenSettings,
  onModelPickerSignIn,
  onModelPickerClose,
  reasoningPickerAnchor,
  reasoningCurrentEffort,
  onReasoningSelect,
  onReasoningPickerClose,
  keyboardShortcutsOpen,
  onKeyboardShortcutsClose,
  toastLogs,
}: {
  patchFailure: UnifiedDiffFailure | null;
  onPatchFailureClose: () => void;
  onPatchFailureOpenPath: (path: string) => void;
  modelPickerAnchor: HTMLElement | null;
  modelPickerProviders: ModelPickerProvider[];
  modelPickerSelectedKey: string | null;
  modelPickerDefaultKey: string | null;
  modelPickerReadyProviders: ReadonlySet<string>;
  onModelSelect: (key: string | null) => void;
  onModelPickerOpenSettings: () => void;
  onModelPickerSignIn?: (providerId: string) => void | Promise<void>;
  onModelPickerClose: () => void;
  reasoningPickerAnchor: HTMLElement | null;
  reasoningCurrentEffort: ReasoningPickerMenuProps["currentEffort"];
  onReasoningSelect: (effort: string | null) => void;
  onReasoningPickerClose: () => void;
  keyboardShortcutsOpen: boolean;
  onKeyboardShortcutsClose: () => void;
  toastLogs: LogLine[];
}) {
  return (
    <>
      {patchFailure && (
        <UnifiedDiffFailureDialog
          failure={patchFailure}
          onClose={onPatchFailureClose}
          onOpenPath={onPatchFailureOpenPath}
        />
      )}
      {modelPickerAnchor && (
        <ModelPickerMenu
          anchor={modelPickerAnchor as HTMLElement}
          providers={modelPickerProviders}
          selectedKey={modelPickerSelectedKey}
          defaultKey={modelPickerDefaultKey}
          readyProviders={modelPickerReadyProviders}
          onSelect={onModelSelect}
          onOpenSettings={onModelPickerOpenSettings}
          onSignIn={onModelPickerSignIn}
          onClose={onModelPickerClose}
        />
      )}
      {/*
       * CODEX-REF: composer-*.js — Reasoning effort dropdown (Fa popover
       * with Fa.Title + Fa.Item children). Anchor 在 composer footer trigger 上。
       * 默认 effort 取自 effectiveThreadContextDefaults.reasoningEffort，由 user
       * 点击切换写入 reasoningEffortOverride。
       */}
      {reasoningPickerAnchor && (
        <ReasoningPickerMenu
          anchor={reasoningPickerAnchor as HTMLElement}
          currentEffort={reasoningCurrentEffort}
          onSelect={onReasoningSelect}
          onClose={onReasoningPickerClose}
        />
      )}
      {/*
       * codex: keyboard-shortcuts-settings-*.js — standalone
       * keyboard shortcuts dialog, triggered by ⌘⇧/.
       */}
      <KeyboardShortcutsDialog open={keyboardShortcutsOpen} onClose={onKeyboardShortcutsClose} />
      <AppToastViewport logs={toastLogs} />
    </>
  );
}
