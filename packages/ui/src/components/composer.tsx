import { AtSign, FileImage, FileText, Image, Loader2, Pause, Plus, Send, Sparkles, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_ATTACH_ACTIONS,
  DEFAULT_SLASH_COMMANDS,
  attachmentLabel,
  composerEnterAction,
  createAttachmentFromInput,
  filterSlashCommands,
  type AttachActionId,
  type ComposerAttachment,
  type SlashCommand,
} from "../state/composer-workflow";

export type ComposerMode = "send" | "steer" | "stop";

export interface ComposerProps {
  input: string;
  attachments: ComposerAttachment[];
  onInputChange: (value: string) => void;
  onAttachmentsChange: (value: ComposerAttachment[]) => void;
  mode: ComposerMode;
  connecting: boolean;
  activeTurnId: string | null;
  onSend: () => void;
  onInterrupt: () => void;
  onSlashCommand: (command: SlashCommand) => void;
}

export function Composer({
  input,
  attachments,
  onInputChange,
  onAttachmentsChange,
  mode,
  connecting,
  activeTurnId,
  onSend,
  onInterrupt,
  onSlashCommand,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachIndex, setAttachIndex] = useState(0);
  const canInterrupt = mode !== "send" && Boolean(activeTurnId);
  const slashQuery = useMemo(() => slashSearchText(input), [input]);
  const slashCommands = useMemo(
    () => filterSlashCommands(slashQuery, DEFAULT_SLASH_COMMANDS).filter((command) => !command.hidden),
    [slashQuery],
  );
  const selectedSlashCommand = slashCommands[Math.min(slashIndex, Math.max(0, slashCommands.length - 1))] ?? null;
  const canSend = input.trim().length > 0 || attachments.length > 0;

  function updateInput(value: string) {
    onInputChange(value);
    const shouldOpenSlash = isSlashInput(value);
    setSlashOpen(shouldOpenSlash);
    if (shouldOpenSlash) {
      setSlashIndex(0);
      setAttachOpen(false);
    }
    if (value.trim() === "+") {
      setAttachOpen(true);
      setAttachIndex(0);
      setSlashOpen(false);
    }
  }

  function selectSlashCommand(command: SlashCommand) {
    setSlashOpen(false);
    onSlashCommand(command);
    requestComposerFocus(textareaRef.current);
  }

  function addAttachment(actionId: AttachActionId) {
    const action = DEFAULT_ATTACH_ACTIONS.find((item) => item.id === actionId);
    if (!action) return;
    const value = window.prompt(action.title, action.placeholder);
    const attachment = value === null ? null : createAttachmentFromInput(actionId, value);
    setAttachOpen(false);
    if (!attachment) return;
    onAttachmentsChange([...attachments, attachment]);
    if (input.trim() === "+") onInputChange("");
    requestComposerFocus(textareaRef.current);
  }

  return (
    <form
      className="hc-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "stop") {
          onInterrupt();
          return;
        }
        onSend();
      }}
    >
      <div className="hc-composer-field">
        {attachments.length > 0 && (
          <div className="hc-attachment-strip">
            {attachments.map((attachment, index) => (
              <button
                className="hc-attachment-chip"
                key={`${attachment.type}-${index}-${attachmentLabel(attachment)}`}
                type="button"
                title="Remove attachment"
                onClick={() => onAttachmentsChange(attachments.filter((_, itemIndex) => itemIndex !== index))}
              >
                <span>{attachmentLabel(attachment)}</span>
                <X size={13} />
              </button>
            ))}
          </div>
        )}

        {slashOpen && slashCommands.length > 0 && (
          <div className="hc-composer-menu" role="listbox" aria-label="Slash commands">
            {slashCommands.slice(0, 12).map((command, index) => (
              <button
                className="hc-composer-menu-row"
                data-active={command.id === selectedSlashCommand?.id}
                key={command.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSlashCommand(command)}
              >
                <span className="hc-command-icon">/{command.id.slice(0, 1)}</span>
                <span>
                  <strong>/{command.id}</strong>
                  <small>{command.description}</small>
                </span>
                <em>{command.supported}</em>
              </button>
            ))}
          </div>
        )}

        {attachOpen && (
          <div className="hc-composer-menu attach" role="menu" aria-label="Attach context">
            {DEFAULT_ATTACH_ACTIONS.map((action) => (
              <button
                className="hc-composer-menu-row"
                data-active={action.id === DEFAULT_ATTACH_ACTIONS[attachIndex]?.id}
                key={action.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addAttachment(action.id)}
              >
                {attachIcon(action.id)}
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.description}</small>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="hc-composer-input-row">
          <button
            className="hc-composer-plus"
            type="button"
            title="Add context"
            aria-label="Add context"
            onClick={() => {
              setAttachOpen((open) => {
                const next = !open;
                if (next) setAttachIndex(0);
                return next;
              });
              setSlashOpen(false);
            }}
          >
            <Plus size={17} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => updateInput(event.target.value)}
            placeholder="Ask Codex to inspect, edit, run, or explain this workspace"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (slashOpen || attachOpen) {
                  event.preventDefault();
                  setSlashOpen(false);
                  setAttachOpen(false);
                  return;
                }
                if (canInterrupt) {
                  event.preventDefault();
                  onInterrupt();
                  return;
                }
              }

              if (slashOpen && slashCommands.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSlashIndex((current) => (current + 1) % slashCommands.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSlashIndex((current) => (current - 1 + slashCommands.length) % slashCommands.length);
                  return;
                }
                if (event.key === "Tab" || event.key === "Enter") {
                  event.preventDefault();
                  if (selectedSlashCommand) selectSlashCommand(selectedSlashCommand);
                  return;
                }
              }

              if (attachOpen) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setAttachIndex((current) => (current + 1) % DEFAULT_ATTACH_ACTIONS.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setAttachIndex((current) => (current - 1 + DEFAULT_ATTACH_ACTIONS.length) % DEFAULT_ATTACH_ACTIONS.length);
                  return;
                }
                if (event.key === "Tab" || event.key === "Enter") {
                  event.preventDefault();
                  addAttachment(DEFAULT_ATTACH_ACTIONS[attachIndex]?.id ?? DEFAULT_ATTACH_ACTIONS[0].id);
                  return;
                }
              }

              const enterAction = composerEnterAction(input, event);
              if (enterAction.action === "send") {
                event.preventDefault();
                onSend();
                return;
              }
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                attachments.length > 0
              ) {
                event.preventDefault();
                onSend();
              }
            }}
          />
        </div>
      </div>
      <button
        className="hc-send-button"
        type="submit"
        title={mode === "stop" ? "Stop" : mode === "steer" ? "Steer" : "Send"}
        disabled={connecting || (mode !== "stop" && !canSend) || (mode === "stop" && !activeTurnId)}
        data-mode={mode}
      >
        {connecting ? <Loader2 className="hc-spin" size={16} /> : mode === "stop" ? <Pause size={16} /> : <Send size={16} />}
      </button>
    </form>
  );
}

function isSlashInput(value: string): boolean {
  const trimmed = value.trimStart();
  return trimmed.startsWith("/") && !trimmed.includes("\n");
}

function slashSearchText(value: string): string {
  if (!isSlashInput(value)) return "";
  return value.trimStart().replace(/^\/+/, "");
}

function attachIcon(actionId: AttachActionId) {
  switch (actionId) {
    case "mention":
      return <AtSign size={15} />;
    case "localImage":
      return <FileImage size={15} />;
    case "imageUrl":
      return <Image size={15} />;
    case "skill":
      return <Sparkles size={15} />;
    case "plainText":
      return <FileText size={15} />;
    case "filePath":
      return <FileText size={15} />;
  }
}

function requestComposerFocus(element: HTMLTextAreaElement | null) {
  window.requestAnimationFrame(() => element?.focus());
}
