import { useCallback, type Dispatch, type FormEvent, type MutableRefObject, type SetStateAction } from "react";
import {
  closeAttachmentPicker,
  openAttachmentPicker,
  type ComposerAttachment,
  type ComposerAttachmentPickerState,
  type ComposerSendOptions,
  type ComposerSubmitState,
  type SlashCommand,
} from "../state/composer-workflow";
import { isSlashInput } from "./composer-text-utils";

interface UseComposerInputWorkflowInput {
  attachmentsRef: MutableRefObject<ComposerAttachment[]>;
  closeComposerPopovers: () => void;
  closeMentionPeerPopovers: () => void;
  closeMentionPicker: () => void;
  input: string;
  onInputChange: (value: string) => void;
  onInterrupt: () => void;
  onSend: (options?: ComposerSendOptions) => void;
  onSlashCommand: (command: SlashCommand) => void;
  openMentionPickerForInput: (value: string) => boolean;
  requestPromptFocus: () => void;
  setAttachmentPicker: Dispatch<SetStateAction<ComposerAttachmentPickerState>>;
  setSlashIndex: Dispatch<SetStateAction<number>>;
  setSlashOpen: Dispatch<SetStateAction<boolean>>;
  submitState: ComposerSubmitState;
}

export function useComposerInputWorkflow({
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
}: UseComposerInputWorkflowInput) {
  const updateInput = useCallback((value: string) => {
    onInputChange(value);
    const shouldOpenSlash = isSlashInput(value);
    setSlashOpen(shouldOpenSlash);
    if (shouldOpenSlash) {
      setSlashIndex(0);
      setAttachmentPicker(closeAttachmentPicker());
      closeMentionPicker();
      return;
    }
    if (value.trim() === "+") {
      setAttachmentPicker(openAttachmentPicker());
      setSlashOpen(false);
      closeMentionPicker();
      return;
    }
    if (openMentionPickerForInput(value)) {
      closeMentionPeerPopovers();
      return;
    }
    setAttachmentPicker(closeAttachmentPicker());
    closeMentionPicker();
  }, [
    closeMentionPeerPopovers,
    closeMentionPicker,
    onInputChange,
    openMentionPickerForInput,
    setAttachmentPicker,
    setSlashIndex,
    setSlashOpen,
  ]);

  const selectSlashCommand = useCallback((command: SlashCommand) => {
    closeComposerPopovers();
    onSlashCommand(command);
    requestPromptFocus();
  }, [closeComposerPopovers, onSlashCommand, requestPromptFocus]);

  const sendComposer = useCallback((options: ComposerSendOptions = {}) => {
    onSend({
      ...options,
      input,
      attachments: attachmentsRef.current,
    });
  }, [attachmentsRef, input, onSend]);

  const submitComposerForm = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitState.disabled) return;
    if (submitState.submitButtonMode === "stop") {
      onInterrupt();
      return;
    }
    sendComposer();
  }, [onInterrupt, sendComposer, submitState]);

  return {
    updateInput,
    selectSlashCommand,
    sendComposer,
    submitComposerForm,
  };
}
