import type { ReactNode, Ref } from "react";
import { ComposerFooterLeft, ComposerSubmitButton } from "./composer-footer";
import { PromptEditor } from "./prompt-editor";
import type {
  ComposerMode,
  ComposerSubmitState,
} from "../state/composer-workflow";

interface ComposerEditorRegionProps {
  input: string;
  placeholder: string;
  isSingleLineLayout: boolean;
  attachmentPickerOpen: boolean;
  mode: ComposerMode;
  goalMode: boolean;
  footerSettings?: ReactNode;
  footerLeftMeasureRef: Ref<HTMLDivElement>;
  footerRightMeasureRef: (element: HTMLElement | null) => void;
  inputMeasureRef: Ref<HTMLSpanElement>;
  promptEditorRef: Ref<HTMLDivElement>;
  hasComposerPopover: boolean;
  submitState: ComposerSubmitState;
  submitTitle: string;
  onInputChange: (value: string) => void;
  onTransferFiles: (files: File[]) => void;
  onSubmit: () => void;
  onPromptKeyDown: (event: KeyboardEvent) => boolean | void;
  onPlanSelected?: () => void;
  onPursueGoal?: () => void;
  onShowAttachmentMenu: () => void;
  onCloseComposerPopovers: () => void;
}

export function ComposerEditorRegion({
  input,
  placeholder,
  isSingleLineLayout,
  attachmentPickerOpen,
  mode,
  goalMode,
  footerSettings,
  footerLeftMeasureRef,
  footerRightMeasureRef,
  inputMeasureRef,
  promptEditorRef,
  hasComposerPopover,
  submitState,
  submitTitle,
  onInputChange,
  onTransferFiles,
  onSubmit,
  onPromptKeyDown,
  onPlanSelected,
  onPursueGoal,
  onShowAttachmentMenu,
  onCloseComposerPopovers,
}: ComposerEditorRegionProps) {
  return (
    <>
      <div className="hc-composer-editor-row">
        {isSingleLineLayout && (
          <ComposerFooterLeft
            ref={footerLeftMeasureRef}
            attachmentPickerOpen={attachmentPickerOpen}
            mode={mode}
            goalMode={goalMode}
            onPlanSelected={onPlanSelected}
            onPursueGoal={onPursueGoal}
            onShowAttachmentMenu={onShowAttachmentMenu}
          />
        )}
        <div className="hc-composer-input-row">
          <div
            className="hc-composer-input-popover-dismiss-layer"
            onMouseDown={() => {
              if (hasComposerPopover) onCloseComposerPopovers();
            }}
          >
            <PromptEditor
              ref={promptEditorRef}
              value={input}
              singleLine={isSingleLineLayout}
              placeholder={placeholder}
              ariaLabel={placeholder}
              onChange={onInputChange}
              onPastedFiles={onTransferFiles}
              onPastedImages={onTransferFiles}
              onSubmit={onSubmit}
              onKeyDown={onPromptKeyDown}
            />
          </div>
        </div>
        {isSingleLineLayout && (
          <ComposerSubmitButton
            ref={footerRightMeasureRef}
            submitState={submitState}
            submitTitle={submitTitle}
          />
        )}
      </div>
      {!isSingleLineLayout && (
        <div className="hc-composer-footer">
          <ComposerFooterLeft
            ref={footerLeftMeasureRef}
            attachmentPickerOpen={attachmentPickerOpen}
            mode={mode}
            goalMode={goalMode}
            onPlanSelected={onPlanSelected}
            onPursueGoal={onPursueGoal}
            onShowAttachmentMenu={onShowAttachmentMenu}
          />
          <div className="hc-composer-footer-middle">{footerSettings}</div>
          <div className="hc-composer-footer-right" ref={footerRightMeasureRef}>
            <ComposerSubmitButton submitState={submitState} submitTitle={submitTitle} />
          </div>
        </div>
      )}
      <span className="hc-composer-input-measure" ref={inputMeasureRef} aria-hidden="true">
        {input || placeholder}
      </span>
    </>
  );
}
