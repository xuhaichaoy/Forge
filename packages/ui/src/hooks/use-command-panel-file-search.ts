import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { formatError } from "../lib/format";
import type { WorkspaceDirEntry } from "../lib/tauri-host";
import {
  createCommandPanelState,
  isCommandMenuPanel,
  projectFileSearchEntries,
  type CommandPanelEntry,
  type CommandPanelState,
} from "../state/command-panel";
import type { CodexUiAction } from "../state/codex-reducer";
import {
  createDedupedFileSearchSession,
  fuzzyFileResultsToWorkspaceEntries,
  WorkspaceFuzzyFileSearchController,
  type WorkspaceFuzzyFileSearchSession,
} from "../state/fuzzy-file-search-session";

export function useCommandPanelFileSearch({
  activeThreadCwd,
  commandMenuEntries,
  commandPanel,
  defaultCwd,
  dispatch,
  ensureConnected,
  fileSearchControllerRef,
  setCommandPanel,
  workspace,
}: {
  activeThreadCwd?: string | null;
  commandMenuEntries: () => CommandPanelEntry[];
  commandPanel: CommandPanelState | null;
  defaultCwd?: string | null;
  dispatch: Dispatch<CodexUiAction>;
  ensureConnected: () => Promise<boolean>;
  fileSearchControllerRef: MutableRefObject<WorkspaceFuzzyFileSearchController | null>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  workspace: string;
}) {
  const fileSearchRequestSeqRef = useRef(0);
  const fileSearchSessionRef = useRef<WorkspaceFuzzyFileSearchSession | null>(null);
  const fileSearchSessionRootsKeyRef = useRef("");
  const fileSearchActiveQueryRef = useRef("");
  const commandMenuSearchRequestSeqRef = useRef(0);
  const commandMenuFileSearchSessionRef = useRef<WorkspaceFuzzyFileSearchSession | null>(null);
  const commandMenuFileSearchSessionRootsKeyRef = useRef("");
  const commandMenuFileSearchActiveRef = useRef<{
    query: string;
    baseEntries: CommandPanelEntry[];
  } | null>(null);

  const stopFileSearchSession = useCallback(() => {
    fileSearchRequestSeqRef.current += 1;
    fileSearchActiveQueryRef.current = "";
    fileSearchSessionRootsKeyRef.current = "";
    const session = fileSearchSessionRef.current;
    fileSearchSessionRef.current = null;
    if (!session) return;
    void session.stop().catch((error) => {
      dispatch({ type: "log", text: `Failed to close fuzzy file search session: ${formatError(error)}`, level: "warn" });
    });
  }, [dispatch]);

  const stopCommandMenuFileSearchSession = useCallback(() => {
    commandMenuSearchRequestSeqRef.current += 1;
    commandMenuFileSearchActiveRef.current = null;
    commandMenuFileSearchSessionRootsKeyRef.current = "";
    const session = commandMenuFileSearchSessionRef.current;
    commandMenuFileSearchSessionRef.current = null;
    if (!session) return;
    void session.stop().catch((error) => {
      dispatch({ type: "log", text: `Failed to close command menu file search session: ${formatError(error)}`, level: "warn" });
    });
  }, [dispatch]);

  const getFileSearchSession = useCallback(createDedupedFileSearchSession({
    sessionRef: fileSearchSessionRef,
    rootsKeyRef: fileSearchSessionRootsKeyRef,
    controllerRef: fileSearchControllerRef,
    onCloseError: (error) => {
      dispatch({ type: "log", text: `Failed to close fuzzy file search session: ${formatError(error)}`, level: "warn" });
    },
    onUpdated: ({ query, files }) => {
      if (query !== fileSearchActiveQueryRef.current) return;
      const entries = projectFileSearchEntries({ files });
      setCommandPanel((current) => current?.panel === "files"
        ? createCommandPanelState("files", {
            status: entries.length > 0 ? "ready" : "empty",
            title: "Search files",
            message: entries.length > 0
              ? `${entries.length} matching file(s). Select one to mention it.`
              : "No matching files found.",
            entries,
          })
        : current);
    },
  }), [dispatch, fileSearchControllerRef, setCommandPanel]);

  const getCommandMenuFileSearchSession = useCallback(createDedupedFileSearchSession({
    sessionRef: commandMenuFileSearchSessionRef,
    rootsKeyRef: commandMenuFileSearchSessionRootsKeyRef,
    controllerRef: fileSearchControllerRef,
    onCloseError: (error) => {
      dispatch({ type: "log", text: `Failed to close command menu file search session: ${formatError(error)}`, level: "warn" });
    },
    onUpdated: ({ query, files }) => {
      const active = commandMenuFileSearchActiveRef.current;
      if (!active || query !== active.query) return;
      const fileEntries = projectFileSearchEntries({ files });
      setCommandPanel((current) => isCommandMenuPanel(current)
        ? createCommandPanelState("generic", {
            status: "ready",
            title: "Search commands and chats",
            message: fileEntries.length > 0 ? `${fileEntries.length} workspace file result(s).` : "",
            entries: [...active.baseEntries, ...fileEntries],
            searchable: true,
          })
        : current);
    },
  }), [dispatch, fileSearchControllerRef, setCommandPanel]);

  const openFileSearchPanel = useCallback(() => {
    fileSearchRequestSeqRef.current += 1;
    stopCommandMenuFileSearchSession();
    setCommandPanel(createCommandPanelState("files", {
      status: "empty",
      title: "Search files",
      message: "Type to search workspace files.",
      entries: [],
    }));
  }, [setCommandPanel, stopCommandMenuFileSearchSession]);

  const searchFilesFromCommandPanel = useCallback((query: string) => {
    const trimmedQuery = query.trim();
    const cwd = activeThreadCwd?.trim() || workspace.trim() || defaultCwd?.trim() || "";
    const requestSeq = fileSearchRequestSeqRef.current + 1;
    fileSearchRequestSeqRef.current = requestSeq;
    fileSearchActiveQueryRef.current = trimmedQuery;
    if (!trimmedQuery) {
      setCommandPanel((current) => current?.panel === "files"
        ? createCommandPanelState("files", {
            status: "empty",
            title: "Search files",
            message: "Type to search workspace files.",
            entries: [],
          })
        : current);
      return;
    }
    if (!cwd) {
      setCommandPanel((current) => current?.panel === "files"
        ? createCommandPanelState("files", {
            status: "error",
            title: "Search files",
            error: "No workspace cwd is available for file search.",
            entries: [],
          })
        : current);
      return;
    }
    setCommandPanel((current) => current?.panel === "files"
      ? createCommandPanelState("files", {
          status: "loading",
          title: "Search files",
          message: `Searching files for "${trimmedQuery}"...`,
          entries: [],
        })
      : current);
    void (async () => {
      try {
        if (!(await ensureConnected())) {
          if (fileSearchRequestSeqRef.current !== requestSeq) return;
          setCommandPanel((current) => current?.panel === "files"
            ? createCommandPanelState("files", {
                status: "error",
                title: "Search files",
                error: "Runtime is offline.",
                entries: [],
              })
            : current);
          return;
        }
        const session = await getFileSearchSession([cwd]);
        if (fileSearchRequestSeqRef.current !== requestSeq) return;
        await session.update(trimmedQuery);
      } catch (error) {
        if (fileSearchRequestSeqRef.current !== requestSeq) return;
        setCommandPanel((current) => current?.panel === "files"
          ? createCommandPanelState("files", {
              status: "error",
              title: "Search files",
              error: formatError(error),
              entries: [],
            })
          : current);
      }
    })();
  }, [activeThreadCwd, defaultCwd, ensureConnected, getFileSearchSession, setCommandPanel, workspace]);

  const searchWorkspaceFilesForFilesTab = useCallback(async (
    query: string,
    root: string,
  ): Promise<WorkspaceDirEntry[]> => {
    if (!(await ensureConnected())) {
      throw new Error("Runtime is offline.");
    }
    const controller = fileSearchControllerRef.current;
    if (!controller) throw new Error("Fuzzy file search is unavailable.");
    const result = await controller.searchOnce({ roots: [root], query });
    return fuzzyFileResultsToWorkspaceEntries(root, result.files ?? []);
  }, [ensureConnected, fileSearchControllerRef]);

  const searchCommandMenuFromPanel = useCallback((query: string) => {
    const trimmedQuery = query.trim();
    const baseEntries = commandMenuEntries();
    const cwd = activeThreadCwd?.trim() || workspace.trim() || defaultCwd?.trim() || "";
    const requestSeq = commandMenuSearchRequestSeqRef.current + 1;
    commandMenuSearchRequestSeqRef.current = requestSeq;
    commandMenuFileSearchActiveRef.current = trimmedQuery
      ? { query: trimmedQuery, baseEntries }
      : null;
    if (!trimmedQuery || !cwd) {
      setCommandPanel((current) => isCommandMenuPanel(current)
        ? createCommandPanelState("generic", {
            status: "ready",
            title: "Search commands and chats",
            message: "",
            entries: baseEntries,
            searchable: true,
          })
        : current);
      return;
    }
    void (async () => {
      try {
        if (!(await ensureConnected())) return;
        const session = await getCommandMenuFileSearchSession([cwd]);
        if (commandMenuSearchRequestSeqRef.current !== requestSeq) return;
        await session.update(trimmedQuery);
      } catch {
        if (commandMenuSearchRequestSeqRef.current !== requestSeq) return;
        setCommandPanel((current) => isCommandMenuPanel(current)
          ? createCommandPanelState("generic", {
              status: "ready",
              title: "Search commands and chats",
              message: "",
              entries: baseEntries,
              searchable: true,
            })
          : current);
      }
    })();
  }, [activeThreadCwd, commandMenuEntries, defaultCwd, ensureConnected, getCommandMenuFileSearchSession, setCommandPanel, workspace]);

  useEffect(() => {
    if (!commandPanel) {
      stopFileSearchSession();
      stopCommandMenuFileSearchSession();
      return;
    }
    if (commandPanel.panel !== "files") stopFileSearchSession();
    if (!isCommandMenuPanel(commandPanel)) stopCommandMenuFileSearchSession();
  }, [commandPanel, stopCommandMenuFileSearchSession, stopFileSearchSession]);

  const closeCommandPanel = useCallback(() => {
    stopFileSearchSession();
    stopCommandMenuFileSearchSession();
    setCommandPanel(null);
  }, [setCommandPanel, stopCommandMenuFileSearchSession, stopFileSearchSession]);

  return {
    closeCommandPanel,
    openFileSearchPanel,
    searchCommandMenuFromPanel,
    searchFilesFromCommandPanel,
    searchWorkspaceFilesForFilesTab,
  };
}
