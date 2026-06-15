import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  attachActionsForComposerMode,
  closeAttachmentPicker,
  confirmAttachmentInput,
  mergeComposerAttachments,
  openAttachmentPicker,
  selectAttachmentInputMode,
  updateAttachmentInputDraft,
  type AttachActionId,
  type ComposerAttachment,
  type ComposerAttachmentPickerState,
  type ComposerMode,
} from "../state/composer-workflow";
import type { ComposerBrowseKind } from "./composer-types";
import { attachmentBrowseError, requestAttachmentInputFocus } from "./composer-focus-helpers";
import { isImageAttachment } from "./composer-attachments";

export function useComposerAttachmentPickerWorkflow({
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
}: {
  addAttachments: (incoming: ComposerAttachment[]) => void;
  attachmentInputRef: MutableRefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  attachmentPicker: ComposerAttachmentPickerState;
  attachmentsRef: MutableRefObject<ComposerAttachment[]>;
  changeAttachments: (next: ComposerAttachment[]) => void;
  closeComposerPopovers: () => void;
  closeMentionPicker: () => void;
  formatMessage: (descriptor: { id: string; defaultMessage: string }) => string;
  goalMode: boolean;
  input: string;
  mode: ComposerMode;
  onAttachmentError?: (message: string) => void;
  onBrowseFiles?: (kind: ComposerBrowseKind) => Promise<ComposerAttachment[]>;
  onInputChange: (value: string) => void;
  onOpenPlugins?: () => void;
  onPlanSelected?: () => void;
  onPursueGoal?: () => void;
  requestPromptFocus: () => void;
  setAttachmentPicker: Dispatch<SetStateAction<ComposerAttachmentPickerState>>;
  setSlashOpen: Dispatch<SetStateAction<boolean>>;
  supportsImageInput: boolean;
}) {
  const attachActions = useMemo(() => attachActionsForComposerMode(mode, goalMode), [goalMode, mode]);
  const selectedAttachAction = attachActions[Math.min(
    attachmentPicker.activeIndex,
    Math.max(0, attachActions.length - 1),
  )];
  const inputAttachAction = attachActions.find((action) => action.id === attachmentPicker.inputMode) ?? null;
  const isTextAttachmentInput = attachmentPicker.inputMode === "plainText";

  const showAttachmentMenu = () => {
    setAttachmentPicker((state) => state.status === "menu" ? closeAttachmentPicker() : openAttachmentPicker(state));
    setSlashOpen(false);
    closeMentionPicker();
  };

  const selectAttachmentMode = async (actionId: AttachActionId) => {
    if (actionId === "plan") {
      closeComposerPopovers();
      onPlanSelected?.();
      requestPromptFocus();
      return;
    }

    if (actionId === "goal") {
      closeComposerPopovers();
      onPursueGoal?.();
      requestPromptFocus();
      return;
    }

    if (actionId === "plugins") {
      closeComposerPopovers();
      onOpenPlugins?.();
      requestPromptFocus();
      return;
    }

    if ((actionId === "filePath" || actionId === "localImage") && onBrowseFiles) {
      if (actionId === "localImage" && !supportsImageInput) {
        onAttachmentError?.(formatMessage({
          id: "composer.imageInputsUnsupported",
          defaultMessage: "This model does not support image inputs. Try a different model.",
        }));
        closeComposerPopovers();
        requestPromptFocus();
        return;
      }
      closeComposerPopovers();
      try {
        const picked = await onBrowseFiles(actionId === "localImage" ? "image" : "file");
        addAttachments(picked);
      } catch (error) {
        onAttachmentError?.(attachmentBrowseError(error));
      }
      requestPromptFocus();
      return;
    }

    setAttachmentPicker((state) => selectAttachmentInputMode(state, actionId));
    setSlashOpen(false);
    closeMentionPicker();
    requestAttachmentInputFocus(attachmentInputRef.current);
  };

  const confirmAttachment = () => {
    setAttachmentPicker((state) => {
      const result = confirmAttachmentInput(state);
      if (result.attachment) {
        if (isImageAttachment(result.attachment) && !supportsImageInput) {
          const unsupportedMessage = formatMessage({
            id: "composer.imageInputsUnsupported",
            defaultMessage: "This model does not support image inputs. Try a different model.",
          });
          onAttachmentError?.(unsupportedMessage);
          requestAttachmentInputFocus(attachmentInputRef.current);
          return {
            ...state,
            error: unsupportedMessage,
          };
        }
        const merged = mergeComposerAttachments(attachmentsRef.current, [result.attachment]);
        changeAttachments(merged);
        if (input.trim() === "+") onInputChange("");
        setSlashOpen(false);
        closeMentionPicker();
        requestPromptFocus();
      } else {
        requestAttachmentInputFocus(attachmentInputRef.current);
      }
      return result.state;
    });
  };

  const updateAttachmentDraft = (value: string) => {
    setAttachmentPicker((state) => updateAttachmentInputDraft(state, value));
  };

  const cancelAttachmentInput = () => {
    setAttachmentPicker(closeAttachmentPicker());
    requestPromptFocus();
  };

  const showAttachmentTypes = () => {
    setAttachmentPicker((state) => openAttachmentPicker(state));
    requestPromptFocus();
  };

  return {
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
  };
}
