import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useComposerSingleLineLayout } from "../hooks/use-composer-single-line-layout";
import { AboveComposerPlanSuggestion } from "./above-composer-plan-suggestion";
import { useComposerAttachmentPickerWorkflow } from "./composer-attachment-picker-workflow";
import { useComposerAttachmentTransfer } from "./composer-attachment-transfer";
import type { ComposerBrowseKind } from "./composer-types";
import {
  ComposerAttachmentStrip,
  ComposerDropOverlay,
  ComposerImagePreviewPortal,
} from "./composer-attachments";
import { ComposerEditorRegion } from "./composer-editor-region";
import { ComposerPopoverRegion } from "./composer-popover-region";
import {
  requestComposerFocus,
} from "./composer-focus-helpers";
import { handleComposerPromptKeyDown } from "./composer-prompt-keyboard";
import { useComposerInputWorkflow } from "./composer-input-workflow";
import {
  shouldUseComposerSingleLineLayout,
  useComposerAttachmentState,
  useComposerImagePreviewState,
} from "./composer-local-state";
import {
  useComposerMentionWorkflow,
} from "./composer-mention-workflow";
import { useComposerSlashWorkflow } from "./composer-slash-workflow";
import { useForgeIntl } from "./i18n-provider";
import {
  CLOSED_ATTACHMENT_PICKER_STATE,
  closeAttachmentPicker,
  composerSubmitTooltip,
  removeComposerAttachment,
  type ComposerAttachmentPickerState,
  type ComposerAttachment,
  type ComposerMentionMarker,
  type ComposerMentionOption,
  type ComposerMode,
  type ComposerSendOptions,
  type ComposerSubmitState,
  type SlashCommand,
} from "../state/composer-workflow";

export type { ComposerBrowseKind } from "./composer-types";
export type ComposerLayoutMode = "multiline" | "auto-single-line";

export interface ComposerProps {
  input: string;
  attachments: ComposerAttachment[];
  conversationId?: string | null;
  mode?: ComposerMode;
  hasPlanMode?: boolean;
  layoutMode?: ComposerLayoutMode;
  placeholder?: string;
  onInputChange: (value: string) => void;
  onAttachmentsChange: (value: ComposerAttachment[]) => void;
  submitState: ComposerSubmitState;
  supportsImageInput?: boolean;
  onAttachmentError?: (message: string) => void;
  onBrowseFiles?: (kind: ComposerBrowseKind) => Promise<ComposerAttachment[]>;
  onMentionSearch?: (query: string, marker: ComposerMentionMarker) => Promise<ComposerMentionOption[]>;
  onPlanSelected?: () => void;
  onPursueGoal?: () => void;
  goalMode?: boolean;
  onOpenPlugins?: () => void;
  showPlanKeywordSuggestion?: boolean;
  pendingRequestContent?: ReactNode;
  /*
   * codex: composer-*.js — Codex Desktop keeps the model-intelligence /
   * reasoning-effort / permissions chips INSIDE the composer bubble's footer
   * (`composer-footer` grid middle column), not in the below-bubble strip.
   * Forge injects that chip cluster here as a slot; the branch + work-mode
   * controls stay in the external below-bubble footer.
   */
  footerSettings?: ReactNode;
  onSend: (options?: ComposerSendOptions) => void;
  onInterrupt: () => void;
  onSlashCommand: (command: SlashCommand) => void;
}

export function Composer({
  input,
  attachments,
  conversationId = null,
  mode = "default",
  hasPlanMode = false,
  layoutMode = "multiline",
  placeholder: placeholderText,
  onInputChange,
  onAttachmentsChange,
  submitState,
  supportsImageInput = true,
  onAttachmentError,
  onBrowseFiles,
  onMentionSearch,
  onPlanSelected,
  onPursueGoal,
  goalMode = false,
  onOpenPlugins,
  showPlanKeywordSuggestion = true,
  pendingRequestContent,
  footerSettings,
  onSend,
  onInterrupt,
  onSlashCommand,
}: ComposerProps) {
  const { formatMessage } = useForgeIntl();
  const composerRef = useRef<HTMLFormElement | null>(null);
  const composerFieldRef = useRef<HTMLDivElement | null>(null);
  const footerLeftMeasureRef = useRef<HTMLDivElement | null>(null);
  const footerRightMeasureRef = useRef<HTMLElement | null>(null);
  const inputMeasureRef = useRef<HTMLSpanElement | null>(null);
  const promptEditorRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [attachmentPicker, setAttachmentPicker] = useState<ComposerAttachmentPickerState>(CLOSED_ATTACHMENT_PICKER_STATE);
  const { attachmentsRef, changeAttachments } = useComposerAttachmentState(attachments, onAttachmentsChange);
  const { imagePreview, setImagePreview } = useComposerImagePreviewState();
  const {
    slashMenuRef,
    slashActiveRowRef,
    slashOpen,
    setSlashOpen,
    setSlashIndex,
    slashCommands,
    selectedSlashCommand,
  } = useComposerSlashWorkflow(input, mode);
  const submitTitle = composerSubmitTooltip(submitState, formatMessage);
  const placeholder = placeholderText ?? formatMessage({
    id: "composer.placeholder.newTask.locally.v2",
    defaultMessage: "Ask Forge anything. @ to use plugins or mention files",
  });
  const setFooterRightMeasureElement = useCallback((element: HTMLElement | null) => {
    footerRightMeasureRef.current = element;
  }, []);
  const measuredSingleLine = useComposerSingleLineLayout({
    fieldRef: composerFieldRef,
    input,
    leftControlsRef: footerLeftMeasureRef,
    measureRef: inputMeasureRef,
    rightControlsRef: footerRightMeasureRef,
  });

  const requestPromptFocus = useCallback(() => {
    requestComposerFocus(promptEditorRef.current);
  }, []);

  const closeMentionPeerPopovers = useCallback(() => {
    setSlashOpen(false);
    setAttachmentPicker(closeAttachmentPicker());
  }, [setSlashOpen]);

  const {
    closeMentionPicker,
    mentionMenuLabel,
    mentionOpen,
    mentionOptions,
    mentionPicker,
    mentionSections,
    openMentionPickerForInput,
    selectMention,
    selectedMention,
    setMentionPicker,
  } = useComposerMentionWorkflow({
    attachmentsRef,
    changeAttachments,
    closePeerPopovers: closeMentionPeerPopovers,
    formatMessage,
    input,
    onInputChange,
    onMentionSearch,
    promptEditorRef,
    requestPromptFocus,
  });

  const hasComposerPopover = slashOpen || attachmentPicker.status !== "closed" || mentionOpen;
  /*
   * codex: composer-*.js — the plan keyword suggestion is
   * mounted into a composer-local floating target only when `!Jr`; Desktop's
   * `Jr = Pt || Ye || Xe || rn != null || Gr` suppresses the suggestion for
   * pending-request replacement surfaces and for the active composer overlay
   * state (`Gr`). Forge maps `Gr` to slash/mention/attachment popovers.
   */
  const shouldRenderPlanSuggestion = showPlanKeywordSuggestion && pendingRequestContent == null && !hasComposerPopover;

  const closeComposerPopovers = useCallback(() => {
    closeMentionPeerPopovers();
    closeMentionPicker();
  }, [closeMentionPeerPopovers, closeMentionPicker]);

  useEffect(() => {
    if (!hasComposerPopover) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && composerRef.current?.contains(target)) return;
      closeComposerPopovers();
    };
    document.addEventListener("pointerdown", closeOnPointerDown, true);
    return () => document.removeEventListener("pointerdown", closeOnPointerDown, true);
  }, [closeComposerPopovers, hasComposerPopover]);

  const {
    addAttachments,
    addPastedText,
    addTransferFiles,
    dropActive,
    transferHandlers,
  } = useComposerAttachmentTransfer({
    attachmentsRef,
    changeAttachments,
    closeComposerPopovers,
    composerFieldRef,
    formatMessage,
    input,
    onAttachmentError,
    onInputChange,
    requestPromptFocus,
    supportsImageInput,
  });

  const {
    attachActions,
    cancelAttachmentInput,
    confirmAttachment,
    inputAttachAction,
    isTextAttachmentInput,
    selectAttachmentMode,
    selectedAttachAction,
    showAttachmentMenu,
    showAttachmentTypes,
    updateAttachmentDraft,
  } = useComposerAttachmentPickerWorkflow({
    addAttachments,
    attachmentInputRef,
    attachmentPicker,
    attachmentsRef,
    changeAttachments,
    closeComposerPopovers,
    closeMentionPicker,
    formatMessage,
    goalMode,
    input,
    mode,
    onAttachmentError,
    onBrowseFiles,
    onInputChange,
    onOpenPlugins,
    onPlanSelected,
    onPursueGoal,
    requestPromptFocus,
    setAttachmentPicker,
    setSlashOpen,
    supportsImageInput,
  });

  const {
    updateInput,
    selectSlashCommand,
    sendComposer,
    submitComposerForm,
  } = useComposerInputWorkflow({
    attachmentsRef,
    closeComposerPopovers,
    closeMentionPeerPopovers,
    closeMentionPicker,
    input,
    onInputChange,
    onInterrupt,
    onSend,
    onSlashCommand,
    openMentionPickerForInput,
    requestPromptFocus,
    setAttachmentPicker,
    setSlashIndex,
    setSlashOpen,
    submitState,
  });

  const isSingleLineLayout = shouldUseComposerSingleLineLayout(layoutMode, pendingRequestContent, mode, attachments.length, input, measuredSingleLine);

  return (
    <>
      <form
        ref={composerRef}
        className="hc-composer"
        /*
         * Do NOT mark the form with `data-codex-composer`. Codex Desktop and
         * Forge both expect `document.querySelector("[data-codex-composer]")`
         * to return the ProseMirror editor view's DOM node so
         * `insertPromptEditorText` can resolve a `pmViewDesc` and dispatch the
         * keystroke through the editor (`prompt-editor.tsx::insertPromptEditorText`).
         * `prompt-editor.tsx:358` already sets `dom.dataset.codexComposer = "true"`
         * on the live editor view; setting it on the wrapping form too caused the
         * selector to return the form first (DOM tree order) and the fallback
         * path appended raw text nodes outside the editor. Keep the marker on the
         * editor view only.
         *
         * `hooks/use-hotkey.ts::DEFAULT_IGNORE_WITHIN` still works because
         * `event.target.closest("[data-codex-composer]")` walks upward and the
         * editor view inside the form satisfies the closest() match.
        */
        data-runtime-status={submitState.threadRuntimeStatus}
        data-drop-active={dropActive}
        onPaste={transferHandlers.onPaste}
        onDragEnter={transferHandlers.onDragEnter}
        onDragOver={transferHandlers.onDragOver}
        onDragLeave={transferHandlers.onDragLeave}
        onDrop={transferHandlers.onDrop}
        onSubmit={submitComposerForm}
      >
      <div className="hc-composer-surface">
        {/*
         * codex: composer-*.js — `AboveComposerSuggestions` is
         * rendered into a sibling `Cn` target with
         * `pointer-events-none absolute inset-x-0 bottom-full z-20 mb-2 flex
         * justify-center`, separate from `data-above-composer-portal`.
         */}
        <div className="hc-above-composer-suggestion-portal" data-codex-above-composer-suggestion-portal="true">
          {onPlanSelected ? (
            <AboveComposerPlanSuggestion
              composerText={input}
              conversationId={conversationId}
              hasPlanMode={hasPlanMode}
              mode={mode}
              onPlanSelected={onPlanSelected}
              showPlanKeywordSuggestion={shouldRenderPlanSuggestion}
            />
          ) : null}
        </div>
        <div
          ref={composerFieldRef}
          className="hc-composer-field"
          data-layout={isSingleLineLayout ? "single" : "multiline"}
          data-mode={pendingRequestContent ? "request" : "input"}
        >
        {pendingRequestContent ? (
          <div className="hc-composer-request-region">
            {pendingRequestContent}
          </div>
        ) : (
          <>
            {dropActive && (
              <ComposerDropOverlay />
            )}
            <ComposerAttachmentStrip
              attachments={attachments}
              onPreviewImage={setImagePreview}
              onRemoveAttachment={(index) => changeAttachments(removeComposerAttachment(attachments, index))}
            />

            <ComposerPopoverRegion
              slashOpen={slashOpen}
              slashCommands={slashCommands}
              selectedSlashCommand={selectedSlashCommand}
              slashMenuRef={slashMenuRef}
              slashActiveRowRef={slashActiveRowRef}
              onSelectSlashCommand={selectSlashCommand}
              mentionOpen={mentionOpen}
              mentionSections={mentionSections}
              mentionOptions={mentionOptions}
              selectedMention={selectedMention}
              mentionStatus={mentionPicker.status}
              mentionMarker={mentionPicker.trigger?.marker}
              mentionError={mentionPicker.error}
              mentionMenuLabel={mentionMenuLabel}
              onSelectMention={selectMention}
              attachmentPicker={attachmentPicker}
              attachActions={attachActions}
              selectedAttachAction={selectedAttachAction}
              inputAttachAction={inputAttachAction}
              isTextAttachmentInput={isTextAttachmentInput}
              attachmentInputRef={attachmentInputRef}
              mode={mode}
              goalMode={goalMode}
              onSelectAttachmentMode={selectAttachmentMode}
              onDraftChange={updateAttachmentDraft}
              onConfirmAttachment={confirmAttachment}
              onCancelAttachmentInput={cancelAttachmentInput}
              onShowAttachmentTypes={showAttachmentTypes}
            />

            <ComposerEditorRegion
              input={input}
              placeholder={placeholder}
              isSingleLineLayout={isSingleLineLayout}
              attachmentPickerOpen={attachmentPicker.status !== "closed"}
              mode={mode}
              goalMode={goalMode}
              footerSettings={footerSettings}
              footerLeftMeasureRef={footerLeftMeasureRef}
              footerRightMeasureRef={setFooterRightMeasureElement}
              inputMeasureRef={inputMeasureRef}
              promptEditorRef={promptEditorRef}
              hasComposerPopover={hasComposerPopover}
              submitState={submitState}
              submitTitle={submitTitle}
              onInputChange={updateInput}
              onTransferFiles={addTransferFiles}
              onPastedText={addPastedText}
              onSubmit={() => {
                if (!submitState.disabled && submitState.submitButtonMode !== "stop") sendComposer();
              }}
              onPromptKeyDown={(event) => handleComposerPromptKeyDown(event, {
                attachActions,
                attachmentPicker,
                attachments,
                changeAttachments,
                closeComposerPopovers,
                hasComposerPopover,
                input,
                mentionOpen,
                mentionOptions,
                onInterrupt,
                onPlanSelected,
                selectAttachmentMode,
                selectMention,
                selectSlashCommand,
                selectedAttachAction,
                selectedMention,
                selectedSlashCommand,
                sendComposer,
                setAttachmentPicker,
                setMentionPicker,
                setSlashIndex,
                slashCommands,
                slashOpen,
                submitState,
              })}
              onPlanSelected={onPlanSelected}
              onPursueGoal={onPursueGoal}
              onShowAttachmentMenu={showAttachmentMenu}
              onCloseComposerPopovers={closeComposerPopovers}
            />
          </>
        )}
        </div>
      </div>
      </form>
      <ComposerImagePreviewPortal preview={imagePreview} onClose={() => setImagePreview(null)} />
    </>
  );
}
