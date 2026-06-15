import { useCallback, useEffect, useMemo, useState } from "react";
import {
  groupedMentionOptions,
  mentionOptionDisplayName,
  mentionOptionName,
  mentionSectionsFromOptions,
} from "./composer-menus";
import {
  mentionPromptReference,
  replaceMentionTriggerText,
} from "./composer-text-utils";
import { mentionSearchError } from "./composer-focus-helpers";
import type { ForgeIntlContextValue } from "./i18n-provider";
import {
  CLOSED_MENTION_PICKER_STATE,
  type MentionPickerState,
} from "./composer-mention-state";
import { replacePromptEditorTextRangeWithMention } from "./prompt-editor";
import {
  findActiveMentionTrigger,
  mergeComposerAttachments,
  removeMentionTriggerText,
  type ComposerAttachment,
  type ComposerMentionMarker,
  type ComposerMentionOption,
} from "../state/composer-workflow";

export interface ComposerMentionWorkflowOptions {
  attachmentsRef: { current: ComposerAttachment[] };
  changeAttachments: (attachments: ComposerAttachment[]) => void;
  closePeerPopovers: () => void;
  formatMessage: ForgeIntlContextValue["formatMessage"];
  input: string;
  onInputChange: (value: string) => void;
  onMentionSearch?: (query: string, marker: ComposerMentionMarker) => Promise<ComposerMentionOption[]>;
  promptEditorRef: { current: HTMLDivElement | null };
  requestPromptFocus: () => void;
}

export function useComposerMentionWorkflow({
  attachmentsRef,
  changeAttachments,
  closePeerPopovers,
  formatMessage,
  input,
  onInputChange,
  onMentionSearch,
  promptEditorRef,
  requestPromptFocus,
}: ComposerMentionWorkflowOptions) {
  const [mentionPicker, setMentionPicker] = useState<MentionPickerState>(CLOSED_MENTION_PICKER_STATE);
  const mentionOpen = mentionPicker.status !== "closed";

  /*
   * codex: at-mention-list-with-sources-*.js — Codex Desktop renders
   * mention results grouped into sections (Live agents / Custom agents / Skills /
   * Apps / Plugins / Files) via `use-at-mention-sections#r({sections})`.
   * Forge preserves the underlying score-based ranking but lays the rows out
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
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- 故意以 trigger 的 from/marker/to 字段为失效键：mentionPicker.trigger 对象引用随无关 picker state 更新而变，整对象入依赖会反复重置搜索去抖
  }, [
    formatMessage,
    mentionPicker.query,
    mentionPicker.trigger?.from,
    mentionPicker.trigger?.marker,
    mentionPicker.trigger?.to,
    onMentionSearch,
  ]);

  const closeMentionPicker = useCallback(() => {
    setMentionPicker(CLOSED_MENTION_PICKER_STATE);
  }, []);

  const openMentionPickerForInput = useCallback((value: string): boolean => {
    const mentionTrigger = findActiveMentionTrigger(value);
    if (!mentionTrigger) return false;
    setMentionPicker({
      status: "idle",
      trigger: mentionTrigger,
      query: mentionTrigger.query,
      options: [],
      activeIndex: 0,
      error: null,
    });
    return true;
  }, []);

  const selectMention = useCallback((option: ComposerMentionOption) => {
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
          onInputChange(replaceMentionTriggerText(input, trigger, mentionPromptReference(option, mentionOptionName(option))));
        }
      }
      closePeerPopovers();
      closeMentionPicker();
      requestPromptFocus();
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
    closePeerPopovers();
    closeMentionPicker();
    requestPromptFocus();
  }, [
    attachmentsRef,
    changeAttachments,
    closeMentionPicker,
    closePeerPopovers,
    input,
    mentionPicker.trigger,
    onInputChange,
    promptEditorRef,
    requestPromptFocus,
  ]);

  return {
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
  };
}
