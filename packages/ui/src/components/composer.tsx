import {
  ArrowUp,
  AtSign,
  Bot,
  Bug,
  Cpu,
  FileText,
  GitBranch,
  ListChecks,
  Loader2,
  Paperclip,
  PlugZap,
  Plus,
  Server,
  Settings as SettingsIcon,
  Slash,
  Sparkles,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { convertLocalFileSrc, listenNativeFileDropEvents } from "../lib/tauri-host";
import { AboveComposerPlanSuggestion } from "./above-composer-plan-suggestion";
import { useHiCodexIntl } from "./i18n-provider";
import { focusPromptEditorElement, PromptEditor, replacePromptEditorTextRangeWithMention } from "./prompt-editor";
import { Tooltip } from "./tooltip";
import {
  CLOSED_ATTACHMENT_PICKER_STATE,
  DEFAULT_SLASH_COMMANDS,
  attachActionsForComposerMode,
  composerAttachmentPreviewSrc,
  attachmentLabel,
  compactAttachmentLabel,
  composerAttachmentKindLabel,
  composerAttachmentsFromPaths,
  composerFilePath,
  closeAttachmentPicker,
  composerSubmitTooltip,
  confirmAttachmentInput,
  findActiveMentionTrigger,
  filterSlashCommands,
  mergeComposerAttachments,
  moveAttachmentPickerSelection,
  openAttachmentPicker,
  removeMentionTriggerText,
  removeComposerAttachment,
  selectAttachmentInputMode,
  slashCommandsForComposerMode,
  splitComposerTransferFiles,
  updateAttachmentInputDraft,
  type AttachActionId,
  type ComposerAttachmentPickerState,
  type ComposerAttachment,
  type ComposerMentionMarker,
  type ComposerMentionOption,
  type ComposerMentionTrigger,
  type ComposerMode,
  type ComposerSendOptions,
  type ComposerSubmitState,
  type FollowUpSubmitAction,
  type SlashCommand,
} from "../state/composer-workflow";

export type ComposerBrowseKind = "file" | "image";
export type ComposerLayoutMode = "multiline" | "auto-single-line";

type MentionPickerStatus = "closed" | "idle" | "loading" | "ready" | "error";

interface MentionPickerState {
  status: MentionPickerStatus;
  trigger: ComposerMentionTrigger | null;
  query: string;
  options: ComposerMentionOption[];
  activeIndex: number;
  error: string | null;
}

const CLOSED_MENTION_PICKER_STATE: MentionPickerState = {
  status: "closed",
  trigger: null,
  query: "",
  options: [],
  activeIndex: 0,
  error: null,
};

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
  onOpenPlugins?: () => void;
  showPlanKeywordSuggestion?: boolean;
  pendingRequestContent?: ReactNode;
  /*
   * codex: composer-*.js — Codex Desktop keeps the model-intelligence /
   * reasoning-effort / permissions chips INSIDE the composer bubble's footer
   * (`composer-footer` grid middle column), not in the below-bubble strip.
   * HiCodex injects that chip cluster here as a slot; the branch + work-mode
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
  onOpenPlugins,
  showPlanKeywordSuggestion = true,
  pendingRequestContent,
  footerSettings,
  onSend,
  onInterrupt,
  onSlashCommand,
}: ComposerProps) {
  const { formatMessage } = useHiCodexIntl();
  const composerRef = useRef<HTMLFormElement | null>(null);
  const composerFieldRef = useRef<HTMLDivElement | null>(null);
  const footerLeftMeasureRef = useRef<HTMLDivElement | null>(null);
  const footerRightMeasureRef = useRef<HTMLElement | null>(null);
  const inputMeasureRef = useRef<HTMLSpanElement | null>(null);
  const promptEditorRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>(attachments);
  const slashMenuRef = useRef<HTMLDivElement | null>(null);
  const slashActiveRowRef = useRef<HTMLButtonElement | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [attachmentPicker, setAttachmentPicker] = useState<ComposerAttachmentPickerState>(CLOSED_ATTACHMENT_PICKER_STATE);
  const [mentionPicker, setMentionPicker] = useState<MentionPickerState>(CLOSED_MENTION_PICKER_STATE);
  const [dropActive, setDropActive] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ src: string; label: string } | null>(null);
  const slashQuery = useMemo(() => slashSearchText(input), [input]);
  const attachActions = useMemo(() => attachActionsForComposerMode(mode), [mode]);
  const availableSlashCommands = useMemo(() => slashCommandsForComposerMode(mode, DEFAULT_SLASH_COMMANDS), [mode]);
  const slashCommands = useMemo(
    () => filterSlashCommands(slashQuery, availableSlashCommands).filter((command) => !command.hidden),
    [availableSlashCommands, slashQuery],
  );
  const selectedSlashCommand = slashCommands[Math.min(slashIndex, Math.max(0, slashCommands.length - 1))] ?? null;
  const submitTitle = composerSubmitTooltip(submitState, formatMessage);
  const placeholder = placeholderText ?? formatMessage({
    id: "composer.placeholder.newTask.locally.v2",
    defaultMessage: "Ask Codex anything. @ to use plugins or mention files",
  });
  const mentionOpen = mentionPicker.status !== "closed";
  const hasComposerPopover = slashOpen || attachmentPicker.status !== "closed" || mentionOpen;
  /*
   * codex: composer-*.js — the plan keyword suggestion is
   * mounted into a composer-local floating target only when `!Jr`; Desktop's
   * `Jr = Pt || Ye || Xe || rn != null || Gr` suppresses the suggestion for
   * pending-request replacement surfaces and for the active composer overlay
   * state (`Gr`). HiCodex maps `Gr` to slash/mention/attachment popovers.
   */
  const shouldRenderPlanSuggestion = showPlanKeywordSuggestion && pendingRequestContent == null && !hasComposerPopover;
  /*
   * codex: at-mention-list-with-sources-*.js — Codex Desktop renders
   * mention results grouped into sections (Live agents / Custom agents / Skills /
   * Apps / Plugins / Files) via `use-at-mention-sections#r({sections})`.
   * HiCodex preserves the underlying score-based ranking but lays the rows out
   * in a stable per-kind order so users can scan by category. Flat keyboard
   * navigation is preserved by reading from `mentionOptions` (already in the
   * grouped order).
   */
  const mentionOptions = useMemo(
    () => groupedMentionOptions(mentionPicker.options.slice(0, 8)),
    [mentionPicker.options],
  );
  const mentionSections = useMemo(() => mentionSectionsFromOptions(mentionOptions), [mentionOptions]);
  const selectedMention = mentionOptions[Math.min(
    mentionPicker.activeIndex,
    Math.max(0, mentionOptions.length - 1),
  )] ?? null;
  const mentionMenuLabel = mentionPicker.trigger?.marker === "$"
    ? formatMessage({ id: "hc.composer.mention.skillsAndApps", defaultMessage: "Skills and apps" })
    : formatMessage({ id: "composer.atMentionList.appPlugins", defaultMessage: "Plugins" });
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

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const changeAttachments = useCallback((next: ComposerAttachment[]) => {
    attachmentsRef.current = next;
    onAttachmentsChange(next);
  }, [onAttachmentsChange]);

  useLayoutEffect(() => {
    if (!slashOpen) return;
    const menu = slashMenuRef.current;
    const row = slashActiveRowRef.current;
    if (!menu || !row) return;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const visibleTop = menu.scrollTop;
    const visibleBottom = visibleTop + menu.clientHeight;
    if (rowTop < visibleTop) {
      menu.scrollTop = Math.max(0, rowTop - 6);
    } else if (rowBottom > visibleBottom) {
      menu.scrollTop = rowBottom - menu.clientHeight + 6;
    }
  }, [slashCommands.length, slashIndex, slashOpen]);

  const closeComposerPopovers = useCallback(() => {
    setSlashOpen(false);
    setAttachmentPicker(closeAttachmentPicker());
    setMentionPicker(CLOSED_MENTION_PICKER_STATE);
  }, []);

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

  const addAttachments = useCallback((incoming: ComposerAttachment[]) => {
    if (incoming.length === 0) return;
    const merged = mergeComposerAttachments(attachmentsRef.current, incoming);
    if (merged.length === attachmentsRef.current.length) return;
    changeAttachments(merged);
    if (input.trim() === "+") onInputChange("");
    setAttachmentPicker(closeAttachmentPicker());
    setSlashOpen(false);
    setMentionPicker(CLOSED_MENTION_PICKER_STATE);
    requestComposerFocus(promptEditorRef.current);
  }, [changeAttachments, input, onInputChange]);

  const addAttachmentPaths = useCallback((paths: string[]) => {
    addAttachments(composerAttachmentsFromPaths(paths));
  }, [addAttachments]);

  const addImageFilesAsDataUrls = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (!supportsImageInput) {
      onAttachmentError?.(formatMessage({
        id: "composer.imageInputsUnsupported",
        defaultMessage: "This model does not support image inputs. Try a different model.",
      }));
      return;
    }
    void Promise.all(files.map(readImageFileAttachment)).then((items) => {
      addAttachments(items.filter((item): item is ComposerAttachment => item != null));
    });
  }, [addAttachments, onAttachmentError, supportsImageInput]);

  const addTransferFiles = useCallback((
    files: FileList | File[],
    options: { warnUnavailablePaths?: boolean } = {},
  ) => {
    const { imageFiles, otherFiles } = splitComposerTransferFiles(files);
    const pathAttachments: ComposerAttachment[] = [];
    const imageFilesWithoutPath: File[] = [];
    let unavailablePathCount = 0;

    if (imageFiles.length > 0 && !supportsImageInput) {
      onAttachmentError?.(formatMessage({
        id: "composer.imageInputsUnsupported",
        defaultMessage: "This model does not support image inputs. Try a different model.",
      }));
    } else {
      for (const file of imageFiles) {
        const path = composerFilePath(file);
        if (path) pathAttachments.push(...composerAttachmentsFromPaths([path]));
        else imageFilesWithoutPath.push(file);
      }
    }
    for (const file of otherFiles) {
      const path = composerFilePath(file);
      if (path) pathAttachments.push(...composerAttachmentsFromPaths([path]));
      else unavailablePathCount += 1;
    }
    if (unavailablePathCount > 0 && options.warnUnavailablePaths !== false) {
      onAttachmentError?.(formatMessage({
        id: "hc.composer.attach.filePathUnavailable",
        defaultMessage: "File path is unavailable. Use the + file picker or drag the file from Finder.",
      }));
    }

    addAttachments(pathAttachments);
    addImageFilesAsDataUrls(imageFilesWithoutPath);
    return pathAttachments.length > 0
      || imageFilesWithoutPath.length > 0
      || imageFiles.length > 0
      || unavailablePathCount > 0;
  }, [addAttachments, addImageFilesAsDataUrls, onAttachmentError, supportsImageInput]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void listenNativeFileDropEvents((event) => {
      if (event.type === "leave") {
        setDropActive(false);
        return;
      }

      /*
       * Codex Desktop scopes file drag/drop to the composer drop target:
       * `composer-*.js` registers drag/drop listeners on the
       * composer element (`V`) and its inner composer surface, not the whole
       * conversation window. Tauri native file-drop events arrive at the
       * webview level, so HiCodex keeps this listener but applies the same
       * composer hit-test before showing active state or accepting paths.
       */
      const insideComposer = event.position
        ? isNativeDropInsideElement(composerFieldRef.current, event.position)
        : false;
      if (event.type === "enter" || event.type === "over") {
        setDropActive(insideComposer);
        return;
      }

      if (event.type === "drop") {
        setDropActive(false);
        if (event.paths.length === 0) return;
        if (!insideComposer) return;
        addAttachmentPaths(event.paths);
        requestComposerFocus(promptEditorRef.current);
      }
    }).then((nextUnlisten) => {
      if (cancelled) {
        nextUnlisten?.();
      } else {
        unlisten = nextUnlisten;
      }
    }).catch(() => {
      // Browser/dev fallbacks still handle regular HTML paste and drop events.
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addAttachmentPaths]);

  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);

  useEffect(() => {
    const trigger = mentionPicker.trigger;
    const query = mentionPicker.query;
    if (!trigger) return;
    const marker = trigger.marker;

    const matchesActiveTrigger = (state: MentionPickerState) => (
      state.trigger?.from === trigger.from
      && state.trigger?.marker === trigger.marker
      && state.trigger?.to === trigger.to
      && state.query === query
    );

    if (!onMentionSearch) {
      setMentionPicker((state) => matchesActiveTrigger(state)
        ? {
            ...state,
            status: "error",
            error: formatMessage({
              id: "hc.composer.mention.searchUnavailable",
              defaultMessage: "Mention search is unavailable",
            }),
            options: [],
          }
        : state);
      return;
    }

    const trimmedQuery = query.trim();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setMentionPicker((state) => matchesActiveTrigger(state)
        ? { ...state, status: "loading", error: null }
        : state);
      void onMentionSearch(trimmedQuery, marker)
        .then((options) => {
          if (cancelled) return;
          setMentionPicker((state) => matchesActiveTrigger(state)
            ? {
                ...state,
                status: "ready",
                options,
                activeIndex: Math.min(state.activeIndex, Math.max(0, options.length - 1)),
                error: null,
              }
            : state);
        })
        .catch((error) => {
          if (cancelled) return;
          setMentionPicker((state) => matchesActiveTrigger(state)
            ? {
                ...state,
                status: "error",
                options: [],
                activeIndex: 0,
                error: mentionSearchError(error),
              }
            : state);
        });
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    mentionPicker.query,
    mentionPicker.trigger?.from,
    mentionPicker.trigger?.marker,
    mentionPicker.trigger?.to,
    onMentionSearch,
  ]);

  function updateInput(value: string) {
    onInputChange(value);
    const shouldOpenSlash = isSlashInput(value);
    setSlashOpen(shouldOpenSlash);
    if (shouldOpenSlash) {
      setSlashIndex(0);
      setAttachmentPicker(closeAttachmentPicker());
      setMentionPicker(CLOSED_MENTION_PICKER_STATE);
      return;
    }
    if (value.trim() === "+") {
      setAttachmentPicker(openAttachmentPicker());
      setSlashOpen(false);
      setMentionPicker(CLOSED_MENTION_PICKER_STATE);
      return;
    }
    const mentionTrigger = findActiveMentionTrigger(value);
    if (mentionTrigger) {
      setMentionPicker({
        status: "idle",
        trigger: mentionTrigger,
        query: mentionTrigger.query,
        options: [],
        activeIndex: 0,
        error: null,
      });
      setAttachmentPicker(closeAttachmentPicker());
      setSlashOpen(false);
      return;
    }
    setAttachmentPicker(closeAttachmentPicker());
    setMentionPicker(CLOSED_MENTION_PICKER_STATE);
  }

  function selectSlashCommand(command: SlashCommand) {
    closeComposerPopovers();
    onSlashCommand(command);
    requestComposerFocus(promptEditorRef.current);
  }

  function showAttachmentMenu() {
    setAttachmentPicker((state) => state.status === "menu" ? closeAttachmentPicker() : openAttachmentPicker(state));
    setSlashOpen(false);
    setMentionPicker(CLOSED_MENTION_PICKER_STATE);
  }

  async function selectAttachmentMode(actionId: AttachActionId) {
    if (actionId === "plan") {
      closeComposerPopovers();
      onPlanSelected?.();
      requestComposerFocus(promptEditorRef.current);
      return;
    }

    if (actionId === "plugins") {
      closeComposerPopovers();
      onOpenPlugins?.();
      requestComposerFocus(promptEditorRef.current);
      return;
    }

    if ((actionId === "filePath" || actionId === "localImage") && onBrowseFiles) {
      if (actionId === "localImage" && !supportsImageInput) {
        onAttachmentError?.(formatMessage({
          id: "composer.imageInputsUnsupported",
          defaultMessage: "This model does not support image inputs. Try a different model.",
        }));
        closeComposerPopovers();
        requestComposerFocus(promptEditorRef.current);
        return;
      }
      setAttachmentPicker(closeAttachmentPicker());
      setSlashOpen(false);
      setMentionPicker(CLOSED_MENTION_PICKER_STATE);
      try {
        const picked = await onBrowseFiles(actionId === "localImage" ? "image" : "file");
        addAttachments(picked);
      } catch (error) {
        onAttachmentError?.(attachmentBrowseError(error));
      }
      requestComposerFocus(promptEditorRef.current);
      return;
    }

    setAttachmentPicker((state) => selectAttachmentInputMode(state, actionId));
    setSlashOpen(false);
    setMentionPicker(CLOSED_MENTION_PICKER_STATE);
    requestAttachmentInputFocus(attachmentInputRef.current);
  }

  function confirmAttachment() {
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
        setMentionPicker(CLOSED_MENTION_PICKER_STATE);
        requestComposerFocus(promptEditorRef.current);
      } else {
        requestAttachmentInputFocus(attachmentInputRef.current);
      }
      return result.state;
    });
  }

  function sendComposer(options: ComposerSendOptions = {}) {
    onSend({
      ...options,
      input,
      attachments: attachmentsRef.current,
    });
  }

  function selectMention(option: ComposerMentionOption) {
    const trigger = mentionPicker.trigger ?? findActiveMentionTrigger(input);
    const isSkill = option.kind === "skill";
    const isApp = option.kind === "app";
    const isPlugin = option.kind === "plugin";
    const isAgent = option.kind === "agent";
    if (isSkill || isApp || isPlugin || isAgent) {
      if (trigger) {
        const inserted = replacePromptEditorTextRangeWithMention(promptEditorRef.current, {
          kind: option.kind,
          name: option.name || mentionOptionName(option),
          displayName: mentionOptionDisplayName(option),
          path: option.path,
          description: option.description ?? option.detail,
          iconSmall: option.iconSmall ?? undefined,
          brandColor: option.brandColor ?? undefined,
        }, { from: trigger.from, to: trigger.to });
        if (!inserted) {
          onInputChange(replaceMentionTriggerText(input, trigger, mentionPromptReference(option)));
        }
      }
      closeComposerPopovers();
      requestComposerFocus(promptEditorRef.current);
      return;
    }
    const nextAttachment: ComposerAttachment = {
      type: "mention",
      name: option.name || mentionOptionName(option),
      path: option.path,
    };
    const merged = mergeComposerAttachments(attachmentsRef.current, [nextAttachment]);
    changeAttachments(merged);
    if (trigger) {
      const nextInput = removeMentionTriggerText(input, trigger);
      onInputChange(nextInput);
    }
    closeComposerPopovers();
    requestComposerFocus(promptEditorRef.current);
  }

  const selectedAttachAction = attachActions[Math.min(
    attachmentPicker.activeIndex,
    Math.max(0, attachActions.length - 1),
  )];
  const inputAttachAction = attachActions.find((action) => action.id === attachmentPicker.inputMode) ?? null;
  const isTextAttachmentInput = attachmentPicker.inputMode === "plainText";
  const isSingleLineLayout = layoutMode === "auto-single-line"
    && !pendingRequestContent
    && mode === "default"
    && attachments.length === 0
    && !input.includes("\n")
    && measuredSingleLine;

  return (
    <form
      ref={composerRef}
      className="hc-composer"
      /*
       * Do NOT mark the form with `data-codex-composer`. Codex Desktop and
       * HiCodex both expect `document.querySelector("[data-codex-composer]")`
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
      onPaste={(event) => {
        if (event.defaultPrevented) return;
        const pastedPaths = droppedAttachmentPaths(event.clipboardData);
        if (pastedPaths.length > 0) addAttachmentPaths(pastedPaths);
        const handled = addTransferFiles(event.clipboardData.files, {
          warnUnavailablePaths: pastedPaths.length === 0,
        });
        if (handled || pastedPaths.length > 0) event.preventDefault();
      }}
      onDragEnter={(event) => {
        if (!hasAttachmentTransfer(event.dataTransfer)) return;
        if (!isDomDropInsideElement(composerFieldRef.current, event)) {
          setDropActive(false);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!hasAttachmentTransfer(event.dataTransfer)) return;
        if (!isDomDropInsideElement(composerFieldRef.current, event)) {
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
        if (!isDomDropInsideElement(composerFieldRef.current, event)) {
          setDropActive(false);
          return;
        }
        if (!hasAttachmentTransfer(event.dataTransfer)) {
          setDropActive(false);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const droppedPaths = droppedAttachmentPaths(event.dataTransfer);
        const handled = addTransferFiles(event.dataTransfer.files, {
          warnUnavailablePaths: droppedPaths.length === 0,
        });
        if (droppedPaths.length > 0) addAttachmentPaths(droppedPaths);
        if (!handled && droppedPaths.length === 0) requestComposerFocus(promptEditorRef.current);
        setDropActive(false);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (submitState.disabled) return;
        if (submitState.submitButtonMode === "stop") {
          onInterrupt();
          return;
        }
        sendComposer();
      }}
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
            {attachments.length > 0 && (
              <div className="hc-attachment-strip">
                {attachments.map((attachment, index) => {
                  const label = attachmentLabel(attachment);
                  const displayLabel = compactAttachmentLabel(label);
                  const kindLabel = composerAttachmentKindLabel(attachment);
                  const previewSrc = resolveAttachmentPreviewSrc(attachment);
                  const chipTitle = `${kindLabel}: ${label}`;
                  return (
                    <div
                      className="hc-attachment-chip"
                      key={`${attachment.type}-${index}-${label}`}
                      title={chipTitle}
                      data-attachment-kind={attachment.type}
                    >
                      {previewSrc ? (
                        <button
                          className="hc-attachment-chip-main"
                          type="button"
                          aria-label={formatMessage(
                            { id: "hc.composer.attach.previewChip", defaultMessage: "Preview {label}" },
                            { label: chipTitle },
                          )}
                          onClick={() => setImagePreview({ src: previewSrc, label })}
                        >
                          <AttachmentPreview src={previewSrc} />
                          {/*
                           * codex composer-CwxGJF3C.js — file chips show the
                           * filename (and, where available, "{extension} ·
                           * {lineInfo}"), never a synthetic "Mention/Image/File"
                           * category word. The kind is conveyed by the icon
                           * alone; kindLabel is kept only for the hover title.
                           */}
                          <span className="hc-attachment-label">{displayLabel}</span>
                        </button>
                      ) : (
                        <span className="hc-attachment-chip-main static">
                          <AttachmentStaticIcon attachment={attachment} />
                          <span className="hc-attachment-label">{displayLabel}</span>
                        </span>
                      )}
                      <button
                        className="hc-attachment-remove"
                        type="button"
                        title={formatMessage({ id: "hc.composer.attach.removeAttachment", defaultMessage: "Remove attachment" })}
                        aria-label={formatMessage(
                          { id: "appshotAttachment.removeAriaLabel", defaultMessage: "Remove {title}" },
                          { title: chipTitle },
                        )}
                        onClick={() => changeAttachments(removeComposerAttachment(attachments, index))}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {slashOpen && slashCommands.length > 0 && (
              /*
               * `data-state="open"` mirrors the Radix-style marker the
               * focus-routing selector expects. HiCodex's
               * `HiCodexApp.tsx::focusComposerFromPlainTextKey` (and the
               * upstream Codex Desktop equivalent in `composer-*.js`)
               * queries `[role="listbox"][data-state="open"]` — and the
               * `dialog`/`menu` variants below — to suppress type-to-focus
               * while a popover is mounted. Each popover here is rendered
               * only while open, so the marker can be hard-coded.
               */
              <div ref={slashMenuRef} className="hc-composer-menu" role="listbox" aria-label={formatMessage({ id: "composer.slashCommands.dialogTitle", defaultMessage: "Slash commands" })} data-state="open">
                {slashCommands.map((command) => {
                  const active = command.id === selectedSlashCommand?.id;
                  return (
                    <button
                      ref={active ? slashActiveRowRef : undefined}
                      className="hc-composer-menu-row"
                      data-active={active}
                      key={command.id}
                      role="option"
                      aria-selected={active}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSlashCommand(command)}
                    >
                      <span className="hc-command-icon">{slashCommandIcon(command)}</span>
                      <span>
                        <strong>/{command.id}</strong>
                        <small>{command.description}</small>
                      </span>
                      {/*
                       * codex slash-command-item-Cubjf4gi.js — the right slot is
                       * an optional secondary text (arg hint), not the internal
                       * routing channel. We surface inlineArgs when present and
                       * drop the `supported` (direct/panel/pending…) badge, which
                       * is an implementation detail Codex never shows the user.
                       */}
                      {command.inlineArgs && <em className="hc-command-args">{command.inlineArgs}</em>}
                    </button>
                  );
                })}
              </div>
            )}

            {mentionOpen && (
              <div className="hc-composer-menu mention" role="listbox" aria-label={mentionMenuLabel} data-state="open">
                {/*
                 * codex: at-mention-list-with-sources-*.js —
                 * sectioned layout. Each section header is rendered above the
                 * rows that belong to it (Codex `r({sections})`). The flat
                 * keyboard index still works because `mentionOptions` is in
                 * section-render order.
                 */}
                {mentionSections.length === 0 && mentionOptions.length > 0 && (
                  <div className="hc-composer-menu-section-label">{mentionMenuLabel}</div>
                )}
                {mentionSections.map((section) => (
                  <div key={section.kind} className="hc-composer-menu-section">
                    <div className="hc-composer-menu-section-label">{formatMessage({ id: section.i18nId, defaultMessage: section.title })}</div>
                    {section.options.map((option) => (
                      <button
                        className="hc-composer-menu-row"
                        data-active={mentionOptionKey(option) === (selectedMention ? mentionOptionKey(selectedMention) : "")}
                        key={mentionOptionKey(option)}
                        type="button"
                        role="option"
                        aria-selected={mentionOptionKey(option) === (selectedMention ? mentionOptionKey(selectedMention) : "")}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectMention(option)}
                      >
                        {mentionOptionIcon(option)}
                        <span>
                          <strong>{mentionOptionDisplayName(option)}</strong>
                          <small>{mentionOptionDetail(option)}</small>
                        </span>
                        <em>{mentionOptionScope(option)}</em>
                      </button>
                    ))}
                  </div>
                ))}
                {/*
                 * codex at-mention-list-GuqX2GsW.js — the @ list uses
                 * atMentionList.emptyQuery / .loading / .noResults. The $ (skill)
                 * branch keeps skillMentionList.* (already correct).
                 */}
                {mentionPicker.status === "idle" && (
                  <div className="hc-composer-menu-empty">{formatMessage({ id: "composer.atMentionList.emptyQuery", defaultMessage: "Type to search for files" })}</div>
                )}
                {mentionPicker.status === "loading" && mentionOptions.length === 0 && (
                  <div className="hc-composer-menu-empty">
                    <Loader2 className="hc-spin" size={13} />
                    {mentionPicker.trigger?.marker === "$"
                      ? formatMessage({ id: "composer.skillMentionList.loading", defaultMessage: "Loading skills and apps…" })
                      : formatMessage({ id: "composer.atMentionList.loading", defaultMessage: "Searching files…" })}
                  </div>
                )}
                {mentionPicker.status === "ready" && mentionOptions.length === 0 && (
                  <div className="hc-composer-menu-empty">
                    {mentionPicker.trigger?.marker === "$"
                      ? formatMessage({ id: "composer.skillMentionList.noResults", defaultMessage: "No skills or apps found" })
                      : formatMessage({ id: "composer.atMentionList.noResults", defaultMessage: "No results" })}
                  </div>
                )}
                {mentionPicker.status === "error" && (
                  <div className="hc-composer-menu-empty">{mentionPicker.error || formatMessage({ id: "hc.composer.mention.searchFailed", defaultMessage: "Unable to search mentions" })}</div>
                )}
              </div>
            )}

            {attachmentPicker.status === "menu" && (
              <div className="hc-composer-menu attach" role="menu" aria-label={formatMessage({ id: "hc.composer.attach.menuLabel", defaultMessage: "Attach context" })} data-state="open">
                {attachActions.map((action) => {
                  const isPlanAction = action.id === "plan";
                  const checked = isPlanAction && mode === "plan";
                  return (
                    <button
                      className="hc-composer-menu-row"
                      data-active={action.id === selectedAttachAction?.id}
                      data-checked={checked}
                      key={action.id}
                      type="button"
                      role={isPlanAction ? "switch" : "menuitem"}
                      aria-checked={isPlanAction ? checked : undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void selectAttachmentMode(action.id)}
                    >
                      {attachIcon(action.id)}
                      <span>
                        <strong>{action.title}</strong>
                        <small>{action.description}</small>
                      </span>
                      {isPlanAction && (
                        <span className="hc-composer-menu-switch" aria-hidden="true">
                          <span />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {attachmentPicker.status === "input" && inputAttachAction && (
              <div className="hc-attachment-input-panel" role="dialog" aria-label={inputAttachAction.title} data-state="open">
                <div className="hc-attachment-input-heading">
                  {attachIcon(inputAttachAction.id)}
                  <span>
                    <strong>{inputAttachAction.title}</strong>
                    <small>{inputAttachAction.description}</small>
                  </span>
                  <button
                    type="button"
                    aria-label={formatMessage({ id: "hc.composer.attach.cancelAttachment", defaultMessage: "Cancel attachment" })}
                    title={formatMessage({ id: "hc.composer.attach.cancel", defaultMessage: "Cancel" })}
                    onClick={() => {
                      setAttachmentPicker(closeAttachmentPicker());
                      requestComposerFocus(promptEditorRef.current);
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
                        requestComposerFocus(promptEditorRef.current);
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
                        requestComposerFocus(promptEditorRef.current);
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
                      requestComposerFocus(promptEditorRef.current);
                    }}
                  >
                    {formatMessage({ id: "hc.composer.attach.types", defaultMessage: "Types" })}
                  </button>
                  <button type="button" className="hc-mini-button accept" onClick={confirmAttachment}>
                    {formatMessage({ id: "hc.composer.attach.add", defaultMessage: "Add" })}
                  </button>
                </div>
              </div>
            )}

            <div className="hc-composer-editor-row">
              {isSingleLineLayout && (
                <ComposerFooterLeft
                  ref={footerLeftMeasureRef}
                  attachmentPickerOpen={attachmentPicker.status !== "closed"}
                  mode={mode}
                  onPlanSelected={onPlanSelected}
                  onShowAttachmentMenu={showAttachmentMenu}
                />
              )}
              <div className="hc-composer-input-row">
                <div
                  className="hc-composer-input-popover-dismiss-layer"
                  onMouseDown={() => {
                    if (hasComposerPopover) closeComposerPopovers();
                  }}
                >
                  <PromptEditor
                    ref={promptEditorRef}
                    value={input}
                    singleLine={isSingleLineLayout}
                    placeholder={placeholder}
                    ariaLabel={placeholder}
                    onChange={updateInput}
                    onPastedFiles={addTransferFiles}
                    onPastedImages={addTransferFiles}
                    onSubmit={() => {
                      if (!submitState.disabled && submitState.submitButtonMode !== "stop") sendComposer();
                    }}
                    onKeyDown={(event) => {
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
                        event.key === "Tab" &&
                        event.shiftKey &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.altKey &&
                        !hasComposerPopover
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
                        event.key === "Backspace" &&
                        input.length === 0 &&
                        attachments.length > 0
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
                    }}
                  />
                </div>
              </div>
              {isSingleLineLayout && (
                <ComposerSubmitButton
                  ref={setFooterRightMeasureElement}
                  submitState={submitState}
                  submitTitle={submitTitle}
                />
              )}
            </div>
            {!isSingleLineLayout && (
              <div className="hc-composer-footer">
                <ComposerFooterLeft
                  ref={footerLeftMeasureRef}
                  attachmentPickerOpen={attachmentPicker.status !== "closed"}
                  mode={mode}
                  onPlanSelected={onPlanSelected}
                  onShowAttachmentMenu={showAttachmentMenu}
                />
                <div className="hc-composer-footer-middle">{footerSettings}</div>
                <div className="hc-composer-footer-right" ref={setFooterRightMeasureElement}>
                  <ComposerSubmitButton submitState={submitState} submitTitle={submitTitle} />
                </div>
              </div>
            )}
            <span className="hc-composer-input-measure" ref={inputMeasureRef} aria-hidden="true">
              {input || placeholder}
            </span>
          </>
        )}
        </div>
      </div>
      {imagePreview && (
        <div
          className="hc-image-preview-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImagePreview(null);
          }}
        >
          <div className="hc-image-preview-dialog" role="dialog" aria-modal="true" aria-label={imagePreview.label} data-state="open">
            <div className="hc-image-preview-header">
              <span title={imagePreview.label}>{imagePreview.label}</span>
              <button type="button" aria-label={formatMessage({ id: "codex.localConversation.closeGeneratedImagePreview", defaultMessage: "Close preview" })} title={formatMessage({ id: "hc.composer.preview.close", defaultMessage: "Close" })} onClick={() => setImagePreview(null)}>
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

function alternateFollowUpSubmitAction(
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

interface ComposerFooterLeftProps {
  attachmentPickerOpen: boolean;
  mode: ComposerMode;
  onPlanSelected?: () => void;
  onShowAttachmentMenu: () => void;
}

const ComposerFooterLeft = forwardRef<HTMLDivElement, ComposerFooterLeftProps>(function ComposerFooterLeft({
  attachmentPickerOpen,
  mode,
  onPlanSelected,
  onShowAttachmentMenu,
}, ref) {
  const { formatMessage } = useHiCodexIntl();
  const addContextLabel = formatMessage({ id: "composer.addContextDropdown.ariaLabel", defaultMessage: "Add files and more" });
  return (
    <div className="hc-composer-footer-left" ref={ref}>
      <button
        className="hc-composer-plus"
        type="button"
        // codex composer.addContextDropdown.ariaLabel — "Add files and more"
        title={addContextLabel}
        aria-label={addContextLabel}
        aria-expanded={attachmentPickerOpen}
        onClick={onShowAttachmentMenu}
      >
        <Plus size={18} />
      </button>
      {mode === "plan" && (
        /*
         * codex composer-CwxGJF3C.js — the plan-mode indicator tooltip is a
         * styled Tooltip with three centred segments, not a one-line `title`:
         *   composer.planModeIndicator.tooltipText     = "Create a plan"
         *   composer.planModeIndicator.tooltipShortcut = "{shortcut}" (kbd)
         *   composer.planModeIndicator.tooltipToggle   = "to toggle"
         * rendered `flex flex-col items-center text-center` with the shortcut in
         * a keycap. HiCodex injects "Shift + Tab" as the shortcut (matching the
         * Codex bundle's literal value) and renders it inside <kbd>.
         */
        <Tooltip content={<PlanModeTooltipContent />}>
          <button
            type="button"
            className="hc-composer-mode-pill"
            aria-label={formatMessage({ id: "composer.planModeDropdown.ariaLabel", defaultMessage: "Plan mode" })}
            onClick={() => onPlanSelected?.()}
          >
            <ListChecks size={13} />
            <span className="composer-footer__label--sm">{formatMessage({ id: "composer.planModeIndicator", defaultMessage: "Plan" })}</span>
          </button>
        </Tooltip>
      )}
    </div>
  );
});

/*
 * codex composer-CwxGJF3C.js — `flex flex-col items-center text-center
 * leading-tight` container: tooltipText on the first line, then a line with the
 * shortcut keycap followed by tooltipToggle ("to toggle").
 */
function PlanModeTooltipContent() {
  const { formatMessage } = useHiCodexIntl();
  return (
    <span className="hc-plan-tooltip">
      <span>{formatMessage({ id: "composer.planModeIndicator.tooltipText", defaultMessage: "Create a plan" })}</span>
      <span className="hc-plan-tooltip-shortcut-row">
        <kbd className="hc-plan-tooltip-kbd">
          {formatMessage({ id: "composer.planModeIndicator.tooltipShortcut", defaultMessage: "{shortcut}" }, { shortcut: "Shift + Tab" })}
        </kbd>
        <span>{formatMessage({ id: "composer.planModeIndicator.tooltipToggle", defaultMessage: "to toggle" })}</span>
      </span>
    </span>
  );
}

interface ComposerSubmitButtonProps {
  submitState: ComposerSubmitState;
  submitTitle: string;
}

const ComposerSubmitButton = forwardRef<HTMLButtonElement, ComposerSubmitButtonProps>(function ComposerSubmitButton({
  submitState,
  submitTitle,
}, ref) {
  return (
    <button
      ref={ref}
      className="hc-send-button"
      type="submit"
      title={submitTitle}
      aria-label={submitTitle}
      disabled={submitState.disabled}
      data-mode={submitState.submitButtonMode}
    >
      {/* codex send/stop glyphs are uniform icon-sm (18px) */}
      {submitState.threadRuntimeStatus === "connecting"
        ? <Loader2 className="hc-spin" size={18} />
        : submitState.submitButtonMode === "stop" ? <Square size={18} /> : <ArrowUp size={18} />}
    </button>
  );
});

/*
 * codex composer-CwxGJF3C.js — the drop overlay has TWO mutually-exclusive
 * states (not a stacked card):
 *   • composer.dropOverlay.holdShift   = "Hold {key} to drop" ({key}=Shift
 *     keycap) — while an image is dragged WITHOUT Shift held.
 *   • composer.dropOverlay.dropToAttach = "Drop to attach" — when the drag can
 *     be dropped to attach.
 * HiCodex only tracks a single `dropActive` boolean (droppable) and has no
 * drag-modifier state to drive the Shift-held variant, so it renders just the
 * "Drop to attach" state. The self-made "Hold"/"to drop" fragment strings are
 * removed; the holdShift {key} ICU is registered for parity but not shown until
 * the drag-modifier data flow exists.
 */
function ComposerDropOverlay() {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div className="hc-composer-drop-overlay" aria-hidden="true">
      <div className="hc-composer-drop-card">
        <span className="hc-composer-drop-action">
          {formatMessage({ id: "composer.dropOverlay.dropToAttach", defaultMessage: "Drop to attach" })}
        </span>
      </div>
    </div>
  );
}

function useComposerSingleLineLayout({
  fieldRef,
  input,
  leftControlsRef,
  measureRef,
  rightControlsRef,
}: {
  fieldRef: RefObject<HTMLDivElement | null>;
  input: string;
  leftControlsRef: RefObject<HTMLElement | null>;
  measureRef: RefObject<HTMLSpanElement | null>;
  rightControlsRef: RefObject<HTMLElement | null>;
}): boolean {
  const [metrics, setMetrics] = useState({
    fieldWidth: 0,
    leftControlsWidth: 0,
    rightControlsWidth: 0,
    textWidth: 0,
  });
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const measure = measureRef.current;
    if (!field || !measure) return;
    const update = () => {
      const next = {
        fieldWidth: field.clientWidth,
        leftControlsWidth: leftControlsRef.current?.getBoundingClientRect().width ?? 0,
        rightControlsWidth: rightControlsRef.current?.getBoundingClientRect().width ?? 0,
        textWidth: measure.getBoundingClientRect().width,
      };
      setMetrics((current) => (
        current.fieldWidth === next.fieldWidth
        && current.leftControlsWidth === next.leftControlsWidth
        && current.rightControlsWidth === next.rightControlsWidth
        && current.textWidth === next.textWidth
          ? current
          : next
      ));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(field);
    observer.observe(measure);
    if (leftControlsRef.current) observer.observe(leftControlsRef.current);
    if (rightControlsRef.current) observer.observe(rightControlsRef.current);
    return () => observer.disconnect();
  });

  if (metrics.fieldWidth <= 0 || metrics.textWidth <= 0) return true;
  const prospectiveInputWidth = Math.max(
    0,
    metrics.fieldWidth - metrics.leftControlsWidth - metrics.rightControlsWidth - 32,
  );
  return metrics.textWidth + 32 <= prospectiveInputWidth;
}

function isImageAttachment(attachment: ComposerAttachment): boolean {
  return attachment.type === "image" || attachment.type === "localImage";
}

function AttachmentPreview({ src }: { src: string }) {
  return <img className="hc-attachment-thumb" alt="" src={src} draggable={false} />;
}

function AttachmentStaticIcon({ attachment }: { attachment: ComposerAttachment }) {
  const className = "hc-attachment-file-icon";
  if (attachment.type === "mention") return <AtSign aria-hidden="true" className={className} size={14} />;
  if (attachment.type === "skill") return <Sparkles aria-hidden="true" className={className} size={14} />;
  return <FileText aria-hidden="true" className={className} size={14} />;
}

function resolveAttachmentPreviewSrc(attachment: ComposerAttachment): string | null {
  const src = composerAttachmentPreviewSrc(attachment);
  if (!src) return null;
  if (attachment.type === "localImage") {
    const path = attachment.path.trim();
    if (path && !/^(?:data|blob|https?|file):/i.test(path)) {
      try {
        return convertLocalFileSrc(path);
      } catch {
        return src;
      }
    }
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

/*
 * codex slash-command-item-Cubjf4gi.js — every slash row renders a real
 * LeftIcon (icon-xs), not a text glyph built from the command's first letter.
 * HiCodex has no per-command icon registry, so we map by category and fall
 * back to a generic slash icon — replacing the old "/m" / "/r" pseudo-glyph.
 */
function slashCommandIcon(command: Pick<SlashCommand, "category">) {
  switch (command.category) {
    case "model":
      return <Cpu size={16} />;
    case "thread":
      return <ListChecks size={16} />;
    case "workspace":
      return <GitBranch size={16} />;
    case "tools":
      return <Wrench size={16} />;
    case "mcp":
      return <Server size={16} />;
    case "team":
      return <Bot size={16} />;
    case "settings":
      return <SettingsIcon size={16} />;
    case "debug":
      return <Bug size={16} />;
    default:
      return <Slash size={16} />;
  }
}

function attachIcon(actionId: AttachActionId) {
  switch (actionId) {
    case "filePath":
      return <Paperclip size={15} />;
    case "plan":
      return <ListChecks size={15} />;
    case "plugins":
      return <PlugZap size={15} />;
    case "mention":
      return <AtSign size={15} />;
    case "localImage":
      return <Paperclip size={15} />;
    case "imageUrl":
      return <Paperclip size={15} />;
    case "skill":
      return <Sparkles size={15} />;
    case "plainText":
      return <FileText size={15} />;
  }
}

function requestComposerFocus(element: HTMLElement | null) {
  window.requestAnimationFrame(() => {
    focusPromptEditorElement(element);
  });
}

function requestAttachmentInputFocus(element: HTMLTextAreaElement | HTMLInputElement | null) {
  window.requestAnimationFrame(() => {
    if (element?.isConnected) element.focus();
  });
}

function attachmentBrowseError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unable to attach selected files";
}

function mentionSearchError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unable to search mentions";
}

/*
 * codex: at-mention-list-with-sources-*.js — section order
 * (Live agents / Custom agents / Skills / Apps / Plugins / Files). HiCodex
 * does not distinguish Live vs Custom agents, so they collapse into one
 * "Agents" section; the rest mirrors Codex.
 */
/*
 * codex at-mention-list-GuqX2GsW.js — the @ list has no standalone "Apps"
 * section: app results are grouped under "Plugins" (atMentionList.appPlugins).
 * `composer.skillMentionList.app` ("App", singular) belongs to the $ skill
 * list, not here. So HiCodex folds the `app` kind into the Plugins section and
 * keeps the Codex `atMentionList.*` ids. Each section can match several kinds.
 */
const MENTION_SECTION_ORDER: ReadonlyArray<{ kinds: ReadonlyArray<NonNullable<ComposerMentionOption["kind"]>>; title: string; i18nId: string }> = [
  { kinds: ["agent"], title: "Agents", i18nId: "composer.atMentionList.agents" },
  { kinds: ["skill"], title: "Skills", i18nId: "composer.atMentionList.skills" },
  { kinds: ["plugin", "app"], title: "Plugins", i18nId: "composer.atMentionList.plugins" },
  { kinds: ["file"], title: "Files", i18nId: "composer.atMentionList.files" },
];

interface MentionSection {
  kind: NonNullable<ComposerMentionOption["kind"]>;
  title: string;
  i18nId: string;
  options: ComposerMentionOption[];
}

const MENTION_SECTION_KINDS: ReadonlySet<string> = new Set(
  MENTION_SECTION_ORDER.flatMap((entry) => entry.kinds),
);

/* Reorder options so that section-grouped layout still drives a contiguous
 * flat array (keyboard nav uses `mentionPicker.activeIndex` against this list).
 * Within each section the original score-based ordering is preserved. Options
 * without a recognized kind are appended at the end, kept ungrouped. */
function groupedMentionOptions(options: ComposerMentionOption[]): ComposerMentionOption[] {
  if (options.length === 0) return options;
  const ungrouped: ComposerMentionOption[] = [];
  const recognized: ComposerMentionOption[] = [];
  for (const option of options) {
    if (option.kind && MENTION_SECTION_KINDS.has(option.kind)) recognized.push(option);
    else ungrouped.push(option);
  }
  const ordered: ComposerMentionOption[] = [];
  for (const entry of MENTION_SECTION_ORDER) {
    for (const option of recognized) {
      if (option.kind && entry.kinds.includes(option.kind)) ordered.push(option);
    }
  }
  ordered.push(...ungrouped);
  return ordered;
}

function mentionSectionsFromOptions(options: ComposerMentionOption[]): MentionSection[] {
  if (options.length === 0) return [];
  const sections: MentionSection[] = [];
  for (const entry of MENTION_SECTION_ORDER) {
    const filtered = options.filter((option) => option.kind != null && entry.kinds.includes(option.kind));
    if (filtered.length > 0) {
      sections.push({ kind: entry.kinds[0]!, title: entry.title, i18nId: entry.i18nId, options: filtered });
    }
  }
  return sections;
}

function mentionOptionName(option: ComposerMentionOption): string {
  const name = option.name.trim();
  if (name) return name;
  const normalized = option.path.replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "file";
}

function mentionOptionDisplayName(option: ComposerMentionOption): string {
  return option.displayName?.trim() || option.name || mentionOptionName(option);
}

function mentionOptionDetail(option: ComposerMentionOption): string {
  return option.description?.trim() || option.detail || option.path;
}

function mentionOptionScope(option: ComposerMentionOption): string {
  return option.scopeLabel?.trim() || mentionOptionPrefix(option);
}

function mentionOptionKey(option: ComposerMentionOption): string {
  return `${option.kind ?? "file"}:${option.path}`;
}

function mentionOptionIcon(option: ComposerMentionOption) {
  if ((option.kind === "app" || option.kind === "plugin") && option.iconSmall?.trim()) {
    return <img className="hc-composer-menu-entry-icon" alt="" src={option.iconSmall.trim()} draggable={false} />;
  }
  if (option.kind === "skill") return <Sparkles size={15} />;
  if (option.kind === "app") return <PlugZap size={15} />;
  if (option.kind === "plugin") return <PlugZap size={15} />;
  return <FileText size={15} />;
}

function mentionOptionPrefix(option: ComposerMentionOption): string {
  return option.kind === "skill" || option.kind === "app" ? "$" : "@";
}

function mentionPromptReference(option: ComposerMentionOption): string {
  const name = option.name || mentionOptionName(option);
  // skill/app 用 $ 前缀；plugin/agent 用 @；file 走文件路径不走这里
  const prefix = option.kind === "plugin" || option.kind === "agent" ? "@" : "$";
  return `[${prefix}${name}](${escapePromptPath(option.path)}) `;
}

function escapePromptPath(value: string): string {
  if (/[\s()<>]/.test(value)) {
    return `<${value.replace(/\\/g, "\\\\").replace(/>/g, "\\>")}>`;
  }
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

function appendMentionPromptText(current: string, promptText: string): string {
  if (!promptText.trim()) return current;
  if (!current.trim()) return promptText;
  return `${current.trimEnd()}\n${promptText}`;
}

function replaceMentionTriggerText(input: string, trigger: ComposerMentionTrigger, promptText: string): string {
  if (!promptText.trim()) return removeMentionTriggerText(input, trigger);
  if (trigger.from < 0 || trigger.to < trigger.from || trigger.to > input.length) {
    return appendMentionPromptText(input, promptText);
  }
  const prefix = input.slice(0, trigger.from);
  const suffix = input.slice(trigger.to);
  const separator = suffix && !/^\s/.test(suffix) ? " " : "";
  return `${prefix}${promptText}${separator}${suffix}`;
}

function hasAttachmentTransfer(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files.length > 0) return true;
  const types = Array.from(dataTransfer.types);
  if (types.some((type) => type === "Files" || type === "public.file-url" || type === "text/uri-list")) return true;
  return Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

function droppedAttachmentPaths(dataTransfer: DataTransfer): string[] {
  const values = [
    dataTransfer.getData("text/uri-list"),
    dataTransfer.getData("text/plain"),
  ];
  const paths: string[] = [];
  for (const value of values) {
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (isLikelyDroppedFilePath(trimmed)) paths.push(trimmed);
    }
  }
  return Array.from(new Set(paths));
}

function isLikelyDroppedFilePath(value: string): boolean {
  return /^file:/i.test(value) || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function isDomDropInsideElement(
  element: HTMLElement | null,
  event: { clientX: number; clientY: number },
): boolean {
  if (!element) return false;
  return isPointInsideRect(event.clientX, event.clientY, element.getBoundingClientRect());
}

function isNativeDropInsideElement(
  element: HTMLElement | null,
  position: { x: number; y: number },
): boolean {
  if (!element || typeof window === "undefined") return false;
  /*
   * Tauri 2.x labels `onDragDropEvent`'s position as `PhysicalPosition`, but
   * the underlying wry value is platform-dependent:
   *   - macOS (wkwebview): `NSDraggingInfo.draggingLocation()` is in NSView
   *     local points = CSS pixels. Tauri still wraps it as PhysicalPosition,
   *     so dividing by devicePixelRatio on Retina halves the y coordinate and
   *     the composer hit-test silently fails.
   *   - Windows (webview2): `ScreenToClient` returns physical pixels under
   *     HiDPI awareness — DPR division is required.
   * Detect macOS and skip the scale.
   */
  const scale = isMacOSPlatform() ? 1 : (window.devicePixelRatio || 1);
  return isPointInsideRect(position.x / scale, position.y / scale, element.getBoundingClientRect());
}

function isMacOSPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  if (platform.startsWith("Mac")) return true;
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(ua);
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

function isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
