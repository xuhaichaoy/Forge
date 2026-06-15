import { useCallback } from "react";
import type { Thread } from "@forge/codex-protocol";

import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import { buildConversationMarkdown } from "../state/conversation-markdown";
import type { ConversationRenderUnit } from "../state/render-groups";
import { threadTitle } from "../state/thread-workflow";

export interface UseClipboardCopyActionsResult {
  copyTextToClipboard: (label: string, value: string) => Promise<void>;
  copyWorkingDirectory: () => void;
  copySessionId: () => void;
  copyThreadWorkingDirectory: (thread: Thread) => void;
  copyThreadSessionId: (thread: Thread) => void;
  copyThreadDeeplink: (thread: Thread) => void;
  copyConversationMarkdown: () => void;
}

/*
 * Clipboard copy actions (working directory / session id / deeplink /
 * conversation-as-Markdown) lifted verbatim out of ForgeApp. `dispatch` is the
 * stable useReducer dispatch, so listing it in the dep arrays never retriggers
 * anything. Toast wording ("Copied {noun}"
 * / "{Noun} is unavailable") and the `codex://threads/${id}` deeplink shape are
 * user/back-end visible and kept byte-for-byte.
 */
export function useClipboardCopyActions({
  activeThread,
  workspace,
  conversationUnits,
}: {
  activeThread: Thread | null | undefined;
  workspace: string;
  conversationUnits: ConversationRenderUnit[];
}): UseClipboardCopyActionsResult {
  const { dispatch } = useServices();
  const copyTextToClipboard = useCallback(async (label: string, value: string) => {
    const text = value.trim();
    // codex copy toasts read "Copied {noun}" with a lowercase mid-sentence noun
    // (threadHeader.copyWorkingDirectorySuccess "Copied working directory",
    // copyConversationMarkdownSuccess "Copied conversation as Markdown"); call sites pass the
    // lowercase noun. The sentence-initial "unavailable" warning capitalizes it.
    const sentenceLabel = label.charAt(0).toUpperCase() + label.slice(1);
    if (!text) {
      dispatch({ type: "log", text: `${sentenceLabel} is unavailable`, level: "warn" });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      dispatch({ type: "log", text: `Copied ${label}`, level: "info" });
    } catch (error) {
      dispatch({ type: "log", text: `copy failed: ${formatError(error)}`, level: "error" });
    }
  }, [dispatch]);

  const copyWorkingDirectory = useCallback(() => {
    void copyTextToClipboard("working directory", activeThread?.cwd || workspace || "");
  }, [activeThread?.cwd, copyTextToClipboard, workspace]);

  const copySessionId = useCallback(() => {
    void copyTextToClipboard("session id", activeThread?.id ?? "");
  }, [activeThread?.id, copyTextToClipboard]);

  const copyThreadWorkingDirectory = useCallback((thread: Thread) => {
    void copyTextToClipboard("working directory", thread.cwd || workspace || "");
  }, [copyTextToClipboard, workspace]);

  const copyThreadSessionId = useCallback((thread: Thread) => {
    void copyTextToClipboard("session id", thread.id);
  }, [copyTextToClipboard]);

  const copyThreadDeeplink = useCallback((thread: Thread) => {
    void copyTextToClipboard("Deeplink", `codex://threads/${thread.id}`);
  }, [copyTextToClipboard]);

  const copyConversationMarkdown = useCallback(() => {
    if (!activeThread) {
      dispatch({ type: "log", text: "Conversation markdown is unavailable", level: "warn" });
      return;
    }
    void copyTextToClipboard("conversation as Markdown", buildConversationMarkdown({
      title: threadTitle(activeThread),
      units: conversationUnits,
    }));
  }, [activeThread, conversationUnits, copyTextToClipboard, dispatch]);

  return {
    copyTextToClipboard,
    copyWorkingDirectory,
    copySessionId,
    copyThreadWorkingDirectory,
    copyThreadSessionId,
    copyThreadDeeplink,
    copyConversationMarkdown,
  };
}
