import type { RefObject } from "react";
import {
  ComposerAttachInputPanel,
  ComposerAttachMenu,
  ComposerMentionMenu,
  ComposerSlashMenu,
  type MentionSection,
} from "./composer-menus";
import type {
  AttachAction,
  AttachActionId,
  ComposerAttachmentPickerState,
  ComposerMentionMarker,
  ComposerMentionOption,
  ComposerMode,
  SlashCommand,
} from "../state/composer-workflow";

type MentionPickerStatus = "closed" | "idle" | "loading" | "ready" | "error";

interface ComposerPopoverRegionProps {
  slashOpen: boolean;
  slashCommands: SlashCommand[];
  selectedSlashCommand: SlashCommand | null;
  slashMenuRef: RefObject<HTMLDivElement | null>;
  slashActiveRowRef: RefObject<HTMLButtonElement | null>;
  onSelectSlashCommand: (command: SlashCommand) => void;
  mentionOpen: boolean;
  mentionSections: MentionSection[];
  mentionOptions: ComposerMentionOption[];
  selectedMention: ComposerMentionOption | null;
  mentionStatus: MentionPickerStatus;
  mentionMarker: ComposerMentionMarker | null | undefined;
  mentionError: string | null;
  mentionMenuLabel: string;
  onSelectMention: (option: ComposerMentionOption) => void;
  attachmentPicker: ComposerAttachmentPickerState;
  attachActions: AttachAction[];
  selectedAttachAction: AttachAction | null | undefined;
  inputAttachAction: AttachAction | null | undefined;
  isTextAttachmentInput: boolean;
  attachmentInputRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  mode: ComposerMode;
  goalMode: boolean;
  onSelectAttachmentMode: (actionId: AttachActionId) => void | Promise<void>;
  onDraftChange: (value: string) => void;
  onConfirmAttachment: () => void;
  onCancelAttachmentInput: () => void;
  onShowAttachmentTypes: () => void;
}

export function ComposerPopoverRegion({
  slashOpen,
  slashCommands,
  selectedSlashCommand,
  slashMenuRef,
  slashActiveRowRef,
  onSelectSlashCommand,
  mentionOpen,
  mentionSections,
  mentionOptions,
  selectedMention,
  mentionStatus,
  mentionMarker,
  mentionError,
  mentionMenuLabel,
  onSelectMention,
  attachmentPicker,
  attachActions,
  selectedAttachAction,
  inputAttachAction,
  isTextAttachmentInput,
  attachmentInputRef,
  mode,
  goalMode,
  onSelectAttachmentMode,
  onDraftChange,
  onConfirmAttachment,
  onCancelAttachmentInput,
  onShowAttachmentTypes,
}: ComposerPopoverRegionProps) {
  return (
    <>
      {slashOpen && slashCommands.length > 0 && (
        <ComposerSlashMenu
          commands={slashCommands}
          selectedCommand={selectedSlashCommand}
          onSelect={onSelectSlashCommand}
          menuRef={slashMenuRef}
          activeRowRef={slashActiveRowRef}
        />
      )}

      {mentionOpen && (
        <ComposerMentionMenu
          sections={mentionSections}
          options={mentionOptions}
          selectedOption={selectedMention}
          status={mentionStatus}
          marker={mentionMarker}
          error={mentionError}
          menuLabel={mentionMenuLabel}
          onSelect={onSelectMention}
        />
      )}

      {attachmentPicker.status === "menu" && (
        <ComposerAttachMenu
          actions={attachActions}
          selectedAction={selectedAttachAction ?? undefined}
          mode={mode}
          goalMode={goalMode}
          onSelect={(actionId) => void onSelectAttachmentMode(actionId)}
        />
      )}

      {attachmentPicker.status === "input" && inputAttachAction && (
        <ComposerAttachInputPanel
          action={inputAttachAction}
          draft={attachmentPicker.draft}
          error={attachmentPicker.error}
          isTextInput={isTextAttachmentInput}
          inputRef={attachmentInputRef}
          onDraftChange={onDraftChange}
          onConfirm={onConfirmAttachment}
          onCancel={onCancelAttachmentInput}
          onShowTypes={onShowAttachmentTypes}
        />
      )}
    </>
  );
}
