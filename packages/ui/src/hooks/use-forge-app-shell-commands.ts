import { useCallback, useEffect, useMemo, useRef } from "react";
import { focusComposerFromPlainTextKey } from "../components/composer-keyboard";
import { formatError } from "../lib/format";
import {
  isTauriRuntime,
  listenNativeShellEvents,
  openNewWindow,
} from "../lib/tauri-host";
import type { CodexUiState } from "../state/codex-reducer";
import {
  commandAccelerator,
  commandAccelerators,
  getCommand,
  registerCommand,
  unregisterCommand,
} from "../state/command-registry";
import { COMMAND_DESCRIPTORS, COMMAND_IDS } from "../state/commands";
import type { SettingsPanelId } from "../state/composer-workflow";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import { useHotkey } from "./use-hotkey";
import type { useSidePanelTabHost } from "./use-side-panel-tab-host";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (workspace-files panel toggle + composer plain-text focus + first wave of
 * command registrations with their useHotkey bindings + native shell events +
 * initial thread / new-chat window routing). Hook call order inside the
 * cluster is unchanged, and the cluster is invoked from the exact source
 * position the first extracted hook previously occupied, so React's linear
 * hook sequence is preserved. The cluster has no outputs consumed elsewhere —
 * it is a pure side-effect hook.
 */
export interface ForgeAppShellCommandsArgs {
  FILES_TAB_ID: string;
  createWorkbenchThread: () => Promise<void>;
  dispatch: ThreadWorkflowDispatch;
  loadSettingsPanel: (panel: SettingsPanelId) => Promise<void>;
  openChatSearchPanel: () => void;
  openCommandMenu: () => void;
  openDeepLinkUrl: (url: string | null | undefined) => Promise<void>;
  openExistingWorkspaceFolder: () => Promise<void>;
  openFilesTabRef: { current: (() => void) | null };
  openFileSearchPanel: () => void;
  openThreadFindBar: () => void;
  selectThreadById: (threadId: string) => void;
  sidePanel: ReturnType<typeof useSidePanelTabHost>;
  state: CodexUiState;
  toggleSidebar: () => void;
}

export function useForgeAppShellCommands(args: ForgeAppShellCommandsArgs) {
  const {
    FILES_TAB_ID,
    createWorkbenchThread,
    dispatch,
    loadSettingsPanel,
    openChatSearchPanel,
    openCommandMenu,
    openDeepLinkUrl,
    openExistingWorkspaceFolder,
    openFilesTabRef,
    openFileSearchPanel,
    openThreadFindBar,
    selectThreadById,
    sidePanel,
    state,
    toggleSidebar,
  } = args;
  const toggleWorkspaceFilesPanel = useCallback(() => {
    const snapshot = sidePanel.controller.getSnapshot();
    const filesTabExists = snapshot.tabsById[FILES_TAB_ID] != null;
    const filesActive = snapshot.activeTabId === FILES_TAB_ID;
    if (sidePanel.panelOpen && filesActive) {
      sidePanel.setPanelOpen(false);
      return;
    }
    if (filesTabExists) {
      sidePanel.controller.activateTab(FILES_TAB_ID);
      sidePanel.setPanelOpen(true);
      return;
    }
    openFilesTabRef.current?.();
  }, [FILES_TAB_ID, openFilesTabRef, sidePanel]);
  // codex: use-hotkey-*.js — composer auto-focus on plain-text keypresses
  // stays a non-hotkey listener (it is not modifier-gated).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      focusComposerFromPlainTextKey(event);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // codex: electron-menu-shortcuts-*.js — derive prev/next thread IDs
  // from the visible thread list so the hotkey handlers can dispatch instantly.
  const previousThreadId = useMemo<string | null>(() => {
    if (!state.activeThreadId) return null;
    const index = state.threads.findIndex((t) => t.id === state.activeThreadId);
    if (index <= 0) return null;
    return state.threads[index - 1]?.id ?? null;
  }, [state.activeThreadId, state.threads]);
  const nextThreadId = useMemo<string | null>(() => {
    if (!state.activeThreadId) return null;
    const index = state.threads.findIndex((t) => t.id === state.activeThreadId);
    if (index < 0 || index >= state.threads.length - 1) return null;
    return state.threads[index + 1]?.id ?? null;
  }, [state.activeThreadId, state.threads]);

  // codex: electron-menu-shortcuts-*.js — register the ported command
  // descriptors with handlers that thunk into the existing ForgeApp callbacks.
  // Handlers are read via getCommand() inside useHotkey closures so they always
  // see the latest registry entry without re-binding listeners.
  useEffect(() => {
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.openCommandMenu)!,
      () => openCommandMenu(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.findInThread)!,
      () => openThreadFindBar(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.toggleSidebar)!,
      () => toggleSidebar(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.toggleFileTreePanel)!,
      () => toggleWorkspaceFilesPanel(),
    );
    // codex: TODO — searchChats fallback reuses openChatSearchPanel until a
    // dedicated `chats` sub-mode is wired into the command menu.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.searchChats)!,
      () => openChatSearchPanel(),
    );
    // codex: app-main-*.js — searchFiles opens the cmdk Hd="files"
    // sub-mode. openFileSearchPanel installs a `files` CommandPanelState
    // which CommandPanel reads via commandPanelSubModeFromPanel() to swap
    // to the "Search files" placeholder and the file-list empty state.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.searchFiles)!,
      () => openFileSearchPanel(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.newThread)!,
      () => { void createWorkbenchThread(); },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.openFolder)!,
      () => { void openExistingWorkspaceFolder(); },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.previousThread)!,
      () => {
        if (previousThreadId) selectThreadById(previousThreadId);
      },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.nextThread)!,
      () => {
        if (nextThreadId) selectThreadById(nextThreadId);
      },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.settings)!,
      () => { void loadSettingsPanel("general"); },
    );
    // codex newWindow — ⌘⇧N opens a fresh window (desktop-only; no-op/caught in browser).
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.newWindow)!,
      () => { void openNewWindow().catch(() => undefined); },
    );
    return () => {
      // codex: electron-menu-shortcuts-*.js — only unregister the
      // IDs this effect owns so the second-wave effect (archive/rename/pin/
      // navigate/copy/threadN) keeps its registrations when this effect
      // re-runs due to dependency churn.
      unregisterCommand(COMMAND_IDS.openCommandMenu);
      unregisterCommand(COMMAND_IDS.findInThread);
      unregisterCommand(COMMAND_IDS.toggleSidebar);
      unregisterCommand(COMMAND_IDS.toggleFileTreePanel);
      unregisterCommand(COMMAND_IDS.searchChats);
      unregisterCommand(COMMAND_IDS.searchFiles);
      unregisterCommand(COMMAND_IDS.newThread);
      unregisterCommand(COMMAND_IDS.openFolder);
      unregisterCommand(COMMAND_IDS.previousThread);
      unregisterCommand(COMMAND_IDS.nextThread);
      unregisterCommand(COMMAND_IDS.settings);
      unregisterCommand(COMMAND_IDS.newWindow);
    };
  }, [
    createWorkbenchThread,
    loadSettingsPanel,
    nextThreadId,
    openChatSearchPanel,
    openCommandMenu,
    openFileSearchPanel,
    openThreadFindBar,
    previousThreadId,
    selectThreadById,
    toggleSidebar,
    toggleWorkspaceFilesPanel,
    openExistingWorkspaceFolder,
  ]);

  // codex: use-hotkey-*.js — one useHotkey call per ported command. The
  // accelerator string is resolved through the registry so users overriding a
  // descriptor still bind through the same path.
  // codex: electron-menu-shortcuts-*.js#openCommandMenu — bind both
  // CmdOrCtrl+K and CmdOrCtrl+Shift+P (Codex's platformDefaultKeybindings
  // ships both accelerators for openCommandMenu on macOS and default).
  const openCommandMenuAccelerators = useMemo(() => {
    const all = commandAccelerators(COMMAND_IDS.openCommandMenu);
    return all.length > 0 ? all : ["CmdOrCtrl+K", "CmdOrCtrl+Shift+P"];
  }, []);
  // codex: electron-menu-shortcuts-*.js#newThread — Desktop binds both
  // CmdOrCtrl+N and CmdOrCtrl+Shift+O to New Chat.
  const newThreadAccelerators = useMemo(() => {
    const all = commandAccelerators(COMMAND_IDS.newThread);
    return all.length > 0 ? all : ["CmdOrCtrl+N", "CmdOrCtrl+Shift+O"];
  }, []);
  useHotkey({
    accelerator: openCommandMenuAccelerators,
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.openCommandMenu)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.findInThread) ?? "CmdOrCtrl+F",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.findInThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.toggleSidebar) ?? "CmdOrCtrl+B",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.toggleSidebar)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.toggleFileTreePanel) ?? "CmdOrCtrl+Shift+E",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.toggleFileTreePanel)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.searchChats) ?? "CmdOrCtrl+G",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.searchChats)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.searchFiles) ?? "CmdOrCtrl+P",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.searchFiles)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: newThreadAccelerators,
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.newThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.openFolder) ?? "CmdOrCtrl+O",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.openFolder)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.previousThread) ?? "CmdOrCtrl+Shift+[",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.previousThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.nextThread) ?? "CmdOrCtrl+Shift+]",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.nextThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.settings) ?? "CmdOrCtrl+,",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.settings)?.handler?.(event);
    },
  });

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void listenNativeShellEvents((event) => {
      switch (event.action) {
        case "newChat":
          void createWorkbenchThread();
          return;
        case "openFolder":
          void openExistingWorkspaceFolder();
          return;
        case "openCommandMenu":
        case "search":
          openCommandMenu();
          return;
        case "searchChats":
          openChatSearchPanel();
          return;
        case "searchFiles":
          openFileSearchPanel();
          return;
        case "settings":
          void loadSettingsPanel("general");
          return;
        case "openDeepLink":
          void openDeepLinkUrl(event.url);
          return;
        default:
          if (event.message) {
            dispatch({ type: "log", text: event.message, level: event.supported === false ? "warn" : "info" });
          }
      }
    }).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unlisten = dispose;
    }).catch((error) => {
      dispatch({ type: "log", text: `native shell listener failed: ${formatError(error)}`, level: "warn" });
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [
    createWorkbenchThread,
    dispatch,
    loadSettingsPanel,
    openChatSearchPanel,
    openCommandMenu,
    openDeepLinkUrl,
    openExistingWorkspaceFolder,
    openFileSearchPanel,
  ]);

  // codex threadHeader.openInNewWindow — a window opened via host_open_thread_window
  // injects `window.__HICODEX_INITIAL_THREAD__`; once connected, route to that thread
  // once via the existing deep-link path. The first/main window has no such global.
  const initialThreadRoutedRef = useRef(false);
  useEffect(() => {
    if (initialThreadRoutedRef.current || !state.connected) return;
    const globalScope =
      typeof window !== "undefined" ? (window as { __HICODEX_INITIAL_THREAD__?: unknown }) : null;
    if (!globalScope) return;
    const initialThread = globalScope.__HICODEX_INITIAL_THREAD__;
    if (typeof initialThread !== "string" || initialThread.length === 0) return;
    initialThreadRoutedRef.current = true;
    delete globalScope.__HICODEX_INITIAL_THREAD__;
    void openDeepLinkUrl(`codex://threads/${initialThread}`);
  }, [state.connected, openDeepLinkUrl]);

  // codex newWindow — a window opened via host_open_new_window injects
  // `window.__HICODEX_INITIAL_NEW_CHAT__`; once connected, start a fresh chat once. The
  // first/main window has no such global, so this is a no-op there.
  const initialNewChatRef = useRef(false);
  useEffect(() => {
    if (initialNewChatRef.current || !state.connected) return;
    const globalScope =
      typeof window !== "undefined" ? (window as { __HICODEX_INITIAL_NEW_CHAT__?: unknown }) : null;
    if (!globalScope || globalScope.__HICODEX_INITIAL_NEW_CHAT__ !== true) return;
    initialNewChatRef.current = true;
    delete globalScope.__HICODEX_INITIAL_NEW_CHAT__;
    void createWorkbenchThread();
  }, [state.connected, createWorkbenchThread]);
}
