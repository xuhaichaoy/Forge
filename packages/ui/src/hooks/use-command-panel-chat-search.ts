import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { ThreadSearchResult } from "@forge/codex-protocol/generated/v2/ThreadSearchResult";
import type { ThreadSearchResponse } from "@forge/codex-protocol/generated/v2/ThreadSearchResponse";
import type { ThreadSortKey } from "@forge/codex-protocol/generated/v2/ThreadSortKey";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import {
  buildCommandPanelThreadSearchParams,
  COMMAND_PANEL_CHAT_SEARCH_DEBOUNCE_MS,
  COMMAND_PANEL_CHAT_SEARCH_LIMIT,
  mergeCommandPanelThreadSearchEntries,
} from "../state/command-panel-chat-search";
import {
  createCommandPanelState,
  isChatSearchPanel,
  type CommandPanelEntry,
  type CommandPanelState,
} from "../state/command-panel";
import type { CodexUiAction } from "../state/codex-reducer";

export function useCommandPanelChatSearch({
  client,
  commandPanel,
  dispatch,
  ensureConnected,
  loadedChatEntries,
  projectSearchResults,
  setCommandPanel,
  sortKey,
}: {
  client: CodexJsonRpcClient;
  commandPanel: CommandPanelState | null;
  dispatch: Dispatch<CodexUiAction>;
  ensureConnected: () => Promise<boolean>;
  loadedChatEntries: () => CommandPanelEntry[];
  projectSearchResults: (results: ThreadSearchResult[]) => CommandPanelEntry[];
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  sortKey: ThreadSortKey;
}) {
  const chatSearchRequestSeqRef = useRef(0);
  const chatSearchDebounceRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const runChatSearch = useCallback((query: string) => {
    const requestSeq = chatSearchRequestSeqRef.current + 1;
    chatSearchRequestSeqRef.current = requestSeq;
    const loadedEntries = loadedChatEntries();
    const params = buildCommandPanelThreadSearchParams(query, sortKey, COMMAND_PANEL_CHAT_SEARCH_LIMIT);
    if (!params) {
      setCommandPanel((current) => isChatSearchPanel(current)
        ? createCommandPanelState("generic", {
            status: loadedEntries.length > 0 ? "ready" : "empty",
            title: "Search chats",
            message: "",
            entries: loadedEntries,
            searchable: true,
          })
        : current);
      return;
    }
    setCommandPanel((current) => isChatSearchPanel(current)
      ? createCommandPanelState("generic", {
          status: "loading",
          title: "Search chats",
          message: "Loading chats…",
          entries: loadedEntries,
          searchable: true,
        })
      : current);
    void (async () => {
      try {
        if (!(await ensureConnected())) {
          if (chatSearchRequestSeqRef.current !== requestSeq) return;
          setCommandPanel((current) => isChatSearchPanel(current)
            ? createCommandPanelState("generic", {
                status: "error",
                title: "Search chats",
                error: "Runtime is offline.",
                entries: loadedEntries,
                searchable: true,
              })
            : current);
          return;
        }
        const result = await client.request<ThreadSearchResponse>("thread/search", params);
        if (chatSearchRequestSeqRef.current !== requestSeq) return;
        for (const { thread } of result.data ?? []) {
          dispatch({ type: "upsertThread", thread, select: false });
        }
        const searchEntries = projectSearchResults(result.data ?? []);
        const entries = mergeCommandPanelThreadSearchEntries({ loadedEntries, searchEntries });
        setCommandPanel((current) => isChatSearchPanel(current)
          ? createCommandPanelState("generic", {
              status: entries.length > 0 ? "ready" : "empty",
              title: "Search chats",
              message: entries.length > 0 ? "" : "No matches",
              entries,
              searchable: true,
            })
          : current);
      } catch (error) {
        if (chatSearchRequestSeqRef.current !== requestSeq) return;
        dispatch({ type: "log", text: `Failed to search chats: ${formatError(error)}`, level: "warn" });
        setCommandPanel((current) => isChatSearchPanel(current)
          ? createCommandPanelState("generic", {
              status: "error",
              title: "Search chats",
              error: formatError(error),
              entries: loadedEntries,
              searchable: true,
            })
          : current);
      }
    })();
  }, [client, dispatch, ensureConnected, loadedChatEntries, projectSearchResults, setCommandPanel, sortKey]);

  const searchChatsFromCommandPanel = useCallback((query: string) => {
    chatSearchRequestSeqRef.current += 1;
    if (chatSearchDebounceRef.current !== null) {
      globalThis.clearTimeout(chatSearchDebounceRef.current);
    }
    chatSearchDebounceRef.current = globalThis.setTimeout(() => {
      chatSearchDebounceRef.current = null;
      runChatSearch(query);
    }, COMMAND_PANEL_CHAT_SEARCH_DEBOUNCE_MS);
  }, [runChatSearch]);

  useEffect(() => {
    if (!isChatSearchPanel(commandPanel)) {
      if (chatSearchDebounceRef.current !== null) {
        globalThis.clearTimeout(chatSearchDebounceRef.current);
        chatSearchDebounceRef.current = null;
      }
      chatSearchRequestSeqRef.current += 1;
    }
  }, [commandPanel]);

  useEffect(() => () => {
    if (chatSearchDebounceRef.current !== null) {
      globalThis.clearTimeout(chatSearchDebounceRef.current);
      chatSearchDebounceRef.current = null;
    }
  }, []);

  return { searchChatsFromCommandPanel };
}
