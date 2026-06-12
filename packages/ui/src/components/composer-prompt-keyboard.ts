import type { Dispatch, SetStateAction } from "react";
import type {
  AttachAction,
  ComposerAttachment,
  ComposerAttachmentPickerState,
  ComposerSendOptions,
  ComposerSubmitState,
  FollowUpSubmitAction,
  SlashCommand,
} from "../state/composer-workflow";
import {
  moveAttachmentPickerSelection,
  removeComposerAttachment,
} from "../state/composer-workflow";
import type { MentionPickerState } from "./composer-mention-state";

export interface ComposerPromptKeyDownContext {
  attachActions: AttachAction[];
  attachmentPicker: ComposerAttachmentPickerState;
  attachments: ComposerAttachment[];
  changeAttachments: (attachments: ComposerAttachment[]) => void;
  closeComposerPopovers: () => void;
  hasComposerPopover: boolean;
  input: string;
  mentionOpen: boolean;
  mentionOptions: MentionPickerState["options"];
  onInterrupt: () => void;
  onPlanSelected?: () => void;
  selectAttachmentMode: (actionId: AttachAction["id"]) => void | Promise<void>;
  selectMention: (option: MentionPickerState["options"][number]) => void;
  selectSlashCommand: (command: SlashCommand) => void;
  selectedAttachAction?: AttachAction;
  selectedMention: MentionPickerState["options"][number] | null;
  selectedSlashCommand: SlashCommand | null;
  sendComposer: (options?: ComposerSendOptions) => void;
  setAttachmentPicker: Dispatch<SetStateAction<ComposerAttachmentPickerState>>;
  setMentionPicker: Dispatch<SetStateAction<MentionPickerState>>;
  setSlashIndex: Dispatch<SetStateAction<number>>;
  slashCommands: SlashCommand[];
  slashOpen: boolean;
  submitState: ComposerSubmitState;
}

export function handleComposerPromptKeyDown(
  event: KeyboardEvent,
  context: ComposerPromptKeyDownContext,
): boolean {
  const {
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
  } = context;

  if (event.key === "Escape") {
    if (hasComposerPopover) {
      event.preventDefault();
      closeComposerPopovers();
      return true;
    }
    if (submitState.canStopFromEscape) {
      event.preventDefault();
      onInterrupt();
      return true;
    }
  }

  if (
    event.key === "Tab"
    && event.shiftKey
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !hasComposerPopover
  ) {
    event.preventDefault();
    event.stopPropagation();
    closeComposerPopovers();
    onPlanSelected?.();
    return true;
  }

  if (slashOpen && slashCommands.length > 0) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((current) => (current + 1) % slashCommands.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((current) => (current - 1 + slashCommands.length) % slashCommands.length);
      return true;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      if (selectedSlashCommand) selectSlashCommand(selectedSlashCommand);
      return true;
    }
  }

  if (mentionOpen) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (mentionOptions.length > 0) {
        setMentionPicker((state) => ({
          ...state,
          activeIndex: (state.activeIndex + 1) % mentionOptions.length,
        }));
      }
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (mentionOptions.length > 0) {
        setMentionPicker((state) => ({
          ...state,
          activeIndex: (state.activeIndex - 1 + mentionOptions.length) % mentionOptions.length,
        }));
      }
      return true;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      if (selectedMention) selectMention(selectedMention);
      return true;
    }
  }

  if (attachmentPicker.status === "menu") {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAttachmentPicker((state) => moveAttachmentPickerSelection(state, 1));
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAttachmentPicker((state) => moveAttachmentPickerSelection(state, -1));
      return true;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      void selectAttachmentMode(selectedAttachAction?.id ?? attachActions[0].id);
      return true;
    }
  }

  if (
    event.key === "Backspace"
    && input.length === 0
    && attachments.length > 0
  ) {
    event.preventDefault();
    changeAttachments(removeComposerAttachment(attachments, attachments.length - 1));
    return true;
  }

  const followUpSubmitAction = alternateFollowUpSubmitAction(submitState, event);
  if (followUpSubmitAction) {
    event.preventDefault();
    if (!submitState.disabled && submitState.submitButtonMode !== "stop") {
      sendComposer({ followUpSubmitAction });
    }
    return true;
  }

  return false;
}

export function alternateFollowUpSubmitAction(
  submitState: ComposerSubmitState,
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    isComposing?: boolean;
    nativeEvent?: { isComposing?: boolean };
  },
): FollowUpSubmitAction | null {
  if (event.key !== "Enter") return null;
  if (event.isComposing || event.nativeEvent?.isComposing) return null;
  if (event.shiftKey || event.altKey) return null;
  if (!event.metaKey && !event.ctrlKey) return null;
  if (submitState.submitButtonMode !== "queue") return null;
  if (submitState.threadRuntimeStatus !== "running") return null;
  return submitState.isQueueingEnabled ? "steer" : "queue";
}
