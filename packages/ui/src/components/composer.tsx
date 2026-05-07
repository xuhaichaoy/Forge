import { convertFileSrc } from "@tauri-apps/api/core";
import { AtSign, FileImage, FileText, Image, Loader2, Pause, Plus, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLOSED_ATTACHMENT_PICKER_STATE,
  DEFAULT_ATTACH_ACTIONS,
  DEFAULT_SLASH_COMMANDS,
  composerAttachmentPreviewSrc,
  attachmentLabel,
  compactAttachmentLabel,
  composerAttachmentsFromPaths,
  composerFilePath,
  closeAttachmentPicker,
  composerSubmitTooltip,
  composerEnterAction,
  confirmAttachmentInput,
  filterSlashCommands,
  mergeComposerAttachments,
  moveAttachmentPickerSelection,
  openAttachmentPicker,
  removeComposerAttachment,
  selectAttachmentInputMode,
  splitComposerTransferFiles,
  updateAttachmentInputDraft,
  type AttachActionId,
  type ComposerAttachmentPickerState,
  type ComposerAttachment,
  type ComposerSubmitState,
  type SlashCommand,
} from "../state/composer-workflow";

export interface ComposerProps {
  input: string;
  attachments: ComposerAttachment[];
  onInputChange: (value: string) => void;
  onAttachmentsChange: (value: ComposerAttachment[]) => void;
  submitState: ComposerSubmitState;
  onSend: () => void;
  onInterrupt: () => void;
  onSlashCommand: (command: SlashCommand) => void;
}

export function Composer({
  input,
  attachments,
  onInputChange,
  onAttachmentsChange,
  submitState,
  onSend,
  onInterrupt,
  onSlashCommand,
}: ComposerProps) {
  const inputRowRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>(attachments);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [attachmentPicker, setAttachmentPicker] = useState<ComposerAttachmentPickerState>(CLOSED_ATTACHMENT_PICKER_STATE);
  const [dropActive, setDropActive] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ src: string; label: string } | null>(null);
  const slashQuery = useMemo(() => slashSearchText(input), [input]);
  const slashCommands = useMemo(
    () => filterSlashCommands(slashQuery, DEFAULT_SLASH_COMMANDS).filter((command) => !command.hidden),
    [slashQuery],
  );
  const selectedSlashCommand = slashCommands[Math.min(slashIndex, Math.max(0, slashCommands.length - 1))] ?? null;
  const submitTitle = composerSubmitTooltip(submitState);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const addAttachments = useCallback((incoming: ComposerAttachment[]) => {
    if (incoming.length === 0) return;
    const merged = mergeComposerAttachments(attachmentsRef.current, incoming);
    if (merged.length === attachmentsRef.current.length) return;
    attachmentsRef.current = merged;
    onAttachmentsChange(merged);
    if (input.trim() === "+") onInputChange("");
    setAttachmentPicker(closeAttachmentPicker());
    setSlashOpen(false);
    requestComposerFocus(textareaRef.current);
  }, [input, onAttachmentsChange, onInputChange]);

  const addAttachmentPaths = useCallback((paths: string[]) => {
    addAttachments(composerAttachmentsFromPaths(paths));
  }, [addAttachments]);

  const addImageFilesAsDataUrls = useCallback((files: File[]) => {
    if (files.length === 0) return;
    void Promise.all(files.map(readImageFileAttachment)).then((items) => {
      addAttachments(items.filter((item): item is ComposerAttachment => item != null));
    });
  }, [addAttachments]);

  const addTransferFiles = useCallback((files: FileList | File[]) => {
    const { imageFiles, otherFiles } = splitComposerTransferFiles(files);
    const pathAttachments: ComposerAttachment[] = [];
    const imageFilesWithoutPath: File[] = [];

    for (const file of imageFiles) {
      const path = composerFilePath(file);
      if (path) pathAttachments.push(...composerAttachmentsFromPaths([path]));
      else imageFilesWithoutPath.push(file);
    }
    for (const file of otherFiles) {
      const path = composerFilePath(file);
      if (path) pathAttachments.push(...composerAttachmentsFromPaths([path]));
    }

    addAttachments(pathAttachments);
    addImageFilesAsDataUrls(imageFilesWithoutPath);
    return pathAttachments.length > 0 || imageFilesWithoutPath.length > 0;
  }, [addAttachments, addImageFilesAsDataUrls]);

  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);

  function updateInput(value: string) {
    onInputChange(value);
    const shouldOpenSlash = isSlashInput(value);
    setSlashOpen(shouldOpenSlash);
    if (shouldOpenSlash) {
      setSlashIndex(0);
      setAttachmentPicker(closeAttachmentPicker());
    }
    if (value.trim() === "+") {
      setAttachmentPicker(openAttachmentPicker());
      setSlashOpen(false);
    }
  }

  function selectSlashCommand(command: SlashCommand) {
    setSlashOpen(false);
    onSlashCommand(command);
    requestComposerFocus(textareaRef.current);
  }

  function showAttachmentMenu() {
    setAttachmentPicker((state) => state.status === "menu" ? closeAttachmentPicker() : openAttachmentPicker(state));
    setSlashOpen(false);
  }

  function selectAttachmentMode(actionId: AttachActionId) {
    setAttachmentPicker((state) => selectAttachmentInputMode(state, actionId));
    requestAttachmentInputFocus(attachmentInputRef.current);
  }

  function confirmAttachment() {
    setAttachmentPicker((state) => {
      const result = confirmAttachmentInput(state);
      if (result.attachment) {
        onAttachmentsChange([...attachments, result.attachment]);
        if (input.trim() === "+") onInputChange("");
        requestComposerFocus(textareaRef.current);
      } else {
        requestAttachmentInputFocus(attachmentInputRef.current);
      }
      return result.state;
    });
  }

  const selectedAttachAction = DEFAULT_ATTACH_ACTIONS[Math.min(
    attachmentPicker.activeIndex,
    Math.max(0, DEFAULT_ATTACH_ACTIONS.length - 1),
  )];
  const inputAttachAction = DEFAULT_ATTACH_ACTIONS.find((action) => action.id === attachmentPicker.inputMode) ?? null;
  const isTextAttachmentInput = attachmentPicker.inputMode === "plainText";

  return (
    <form
      className="hc-composer"
      data-runtime-status={submitState.threadRuntimeStatus}
      data-drop-active={dropActive}
      onPaste={(event) => {
        if (event.defaultPrevented) return;
        const handled = addTransferFiles(event.clipboardData.files);
        if (handled) event.preventDefault();
      }}
      onDragEnter={(event) => {
        if (!hasTransferFiles(event.dataTransfer)) return;
        if (!isDomDropInsideElement(inputRowRef.current, event)) {
          setDropActive(false);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!hasTransferFiles(event.dataTransfer)) return;
        if (!isDomDropInsideElement(inputRowRef.current, event)) {
          setDropActive(false);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        if (!isDomDropInsideElement(inputRowRef.current, event)) {
          setDropActive(false);
          return;
        }
        const handled = addTransferFiles(event.dataTransfer.files);
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
        }
        setDropActive(false);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (submitState.disabled) return;
        if (submitState.submitButtonMode === "stop") {
          onInterrupt();
          return;
        }
        onSend();
      }}
    >
      <div className="hc-composer-field">
        {attachments.length > 0 && (
          <div className="hc-attachment-strip">
            {attachments.map((attachment, index) => {
              const label = attachmentLabel(attachment);
              const displayLabel = compactAttachmentLabel(label);
              const previewSrc = resolveAttachmentPreviewSrc(attachment);
              return (
                <div
                  className="hc-attachment-chip"
                  key={`${attachment.type}-${index}-${label}`}
                  title={label}
                >
                  {previewSrc ? (
                    <button
                      className="hc-attachment-chip-main"
                      type="button"
                      aria-label={`Preview ${label}`}
                      onClick={() => setImagePreview({ src: previewSrc, label })}
                    >
                      <AttachmentPreview src={previewSrc} />
                      <span>{displayLabel}</span>
                    </button>
                  ) : (
                    <span className="hc-attachment-chip-main static">
                      <span>{displayLabel}</span>
                    </span>
                  )}
                  <button
                    className="hc-attachment-remove"
                    type="button"
                    title="Remove attachment"
                    aria-label={`Remove ${label}`}
                    onClick={() => onAttachmentsChange(removeComposerAttachment(attachments, index))}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
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

        {attachmentPicker.status === "menu" && (
          <div className="hc-composer-menu attach" role="menu" aria-label="Attach context">
            {DEFAULT_ATTACH_ACTIONS.map((action) => (
              <button
                className="hc-composer-menu-row"
                data-active={action.id === selectedAttachAction?.id}
                key={action.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectAttachmentMode(action.id)}
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

        {attachmentPicker.status === "input" && inputAttachAction && (
          <div className="hc-attachment-input-panel" role="dialog" aria-label={inputAttachAction.title}>
            <div className="hc-attachment-input-heading">
              {attachIcon(inputAttachAction.id)}
              <span>
                <strong>{inputAttachAction.title}</strong>
                <small>{inputAttachAction.description}</small>
              </span>
              <button
                type="button"
                aria-label="Cancel attachment"
                title="Cancel"
                onClick={() => {
                  setAttachmentPicker(closeAttachmentPicker());
                  requestComposerFocus(textareaRef.current);
                }}
              >
                <X size={14} />
              </button>
            </div>
            {isTextAttachmentInput ? (
              <textarea
                ref={(element) => {
                  attachmentInputRef.current = element;
                }}
                value={attachmentPicker.draft}
                placeholder={inputAttachAction.placeholder}
                onChange={(event) => setAttachmentPicker((state) => updateAttachmentInputDraft(state, event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setAttachmentPicker(closeAttachmentPicker());
                    requestComposerFocus(textareaRef.current);
                  }
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    confirmAttachment();
                  }
                }}
              />
            ) : (
              <input
                ref={(element) => {
                  attachmentInputRef.current = element;
                }}
                value={attachmentPicker.draft}
                placeholder={inputAttachAction.placeholder}
                onChange={(event) => setAttachmentPicker((state) => updateAttachmentInputDraft(state, event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setAttachmentPicker(closeAttachmentPicker());
                    requestComposerFocus(textareaRef.current);
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmAttachment();
                  }
                }}
              />
            )}
            {attachmentPicker.error && <small className="hc-attachment-input-error">{attachmentPicker.error}</small>}
            <div className="hc-attachment-input-actions">
              <button
                type="button"
                className="hc-mini-button"
                onClick={() => {
                  setAttachmentPicker(openAttachmentPicker(attachmentPicker));
                  requestComposerFocus(textareaRef.current);
                }}
              >
                Types
              </button>
              <button type="button" className="hc-mini-button accept" onClick={confirmAttachment}>
                Add
              </button>
            </div>
          </div>
        )}

        <div className="hc-composer-input-row" ref={inputRowRef}>
          <button
            className="hc-composer-plus"
            type="button"
            title="Add context"
            aria-label="Add context"
            aria-expanded={attachmentPicker.status !== "closed"}
            onClick={showAttachmentMenu}
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
                if (slashOpen || attachmentPicker.status !== "closed") {
                  event.preventDefault();
                  setSlashOpen(false);
                  setAttachmentPicker(closeAttachmentPicker());
                  return;
                }
                if (submitState.canStopFromEscape) {
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

              if (attachmentPicker.status === "menu") {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setAttachmentPicker((state) => moveAttachmentPickerSelection(state, 1));
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setAttachmentPicker((state) => moveAttachmentPickerSelection(state, -1));
                  return;
                }
                if (event.key === "Tab" || event.key === "Enter") {
                  event.preventDefault();
                  selectAttachmentMode(selectedAttachAction?.id ?? DEFAULT_ATTACH_ACTIONS[0].id);
                  return;
                }
              }

              if (
                event.key === "Backspace" &&
                input.length === 0 &&
                attachments.length > 0
              ) {
                event.preventDefault();
                onAttachmentsChange(removeComposerAttachment(attachments, attachments.length - 1));
                return;
              }

              const enterAction = composerEnterAction(input, event);
              if (enterAction.action === "send") {
                event.preventDefault();
                if (!submitState.disabled && submitState.submitButtonMode !== "stop") onSend();
                return;
              }
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                attachments.length > 0
              ) {
                event.preventDefault();
                if (!submitState.disabled && submitState.submitButtonMode !== "stop") onSend();
              }
            }}
          />
        </div>
      </div>
      <button
        className="hc-send-button"
        type="submit"
        title={submitTitle}
        aria-label={submitTitle}
        disabled={submitState.disabled}
        data-mode={submitState.submitButtonMode}
      >
        {submitState.threadRuntimeStatus === "connecting"
          ? <Loader2 className="hc-spin" size={16} />
          : submitState.submitButtonMode === "stop" ? <Pause size={16} /> : <Send size={16} />}
      </button>
      {imagePreview && (
        <div
          className="hc-image-preview-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImagePreview(null);
          }}
        >
          <div className="hc-image-preview-dialog" role="dialog" aria-modal="true" aria-label={imagePreview.label}>
            <div className="hc-image-preview-header">
              <span title={imagePreview.label}>{imagePreview.label}</span>
              <button type="button" aria-label="Close preview" title="Close" onClick={() => setImagePreview(null)}>
                <X size={16} />
              </button>
            </div>
            <img alt={imagePreview.label} src={imagePreview.src} />
          </div>
        </div>
      )}
    </form>
  );
}

function AttachmentPreview({ src }: { src: string }) {
  return <img className="hc-attachment-thumb" alt="" src={src} draggable={false} />;
}

function resolveAttachmentPreviewSrc(attachment: ComposerAttachment): string | null {
  const src = composerAttachmentPreviewSrc(attachment);
  if (!src) return null;
  if (attachment.type === "localImage" && isTauriRuntime()) {
    const path = attachment.path.trim();
    if (path && !/^(?:data|blob|https?|file):/i.test(path)) return convertFileSrc(path);
  }
  return src;
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

function requestAttachmentInputFocus(element: HTMLTextAreaElement | HTMLInputElement | null) {
  window.requestAnimationFrame(() => element?.focus());
}

function hasTransferFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files.length > 0) return true;
  return Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

function isDomDropInsideElement(
  element: HTMLElement | null,
  event: { clientX: number; clientY: number },
): boolean {
  if (!element) return false;
  return isPointInsideRect(event.clientX, event.clientY, element.getBoundingClientRect());
}

function readImageFileAttachment(file: File): Promise<ComposerAttachment | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) {
        resolve({ type: "image", url: result, name: file.name || undefined });
        return;
      }
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const runtimeWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(runtimeWindow.__TAURI_INTERNALS__ || runtimeWindow.__TAURI__);
}

function isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
