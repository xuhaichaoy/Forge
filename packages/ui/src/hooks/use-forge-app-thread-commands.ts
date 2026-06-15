import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect } from "react";
import type { Thread } from "@forge/codex-protocol";
import { formatError } from "../lib/format";
import { openThreadWindow, revealPath } from "../lib/tauri-host";
import type { CodexUiState } from "../state/codex-reducer";
import {
  commandAccelerator,
  commandAccelerators,
  getCommand,
  mouseNavigationDirection,
  registerCommand,
  unregisterCommand,
} from "../state/command-registry";
import { COMMAND_DESCRIPTORS, COMMAND_IDS } from "../state/commands";
import type { CommandPanelState } from "../state/command-panel";
import type { ComposerMode } from "../state/composer-workflow";
import type { AppRegistryEntry, projectConversation } from "../state/render-groups";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import { useAppBackedPanelRefresh } from "./use-app-backed-panel-refresh";
import { useClipboardCopyActions } from "./use-clipboard-copy-actions";
import { useHotkey } from "./use-hotkey";
import { useSkillsPanelRefresh } from "./use-skills-panel-refresh";
import type { useAppOverlayState } from "./use-app-overlay-state";
import type { useThreadActions } from "./use-thread-actions";
import type { useThreadPins } from "./use-thread-pins";
import type { SettingsPanelId } from "../state/composer-workflow";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (skills/app-backed panel refreshers + clipboard copy actions + thread
 * folder/window/unread/slot actions + the second wave of command
 * registrations, mouse back/forward navigation, and their useHotkey
 * bindings). Hook call order inside the cluster is unchanged, and the cluster
 * is invoked from the exact source position the first extracted hook
 * previously occupied, so React's linear hook sequence is preserved.
 */
export interface ForgeAppThreadCommandsArgs {
  activeSettingsPanel: SettingsPanelId | null;
  activeThread: Thread | null;
  archiveSelectedThread: ReturnType<typeof useThreadActions>["archiveSelectedThread"];
  commandPanel: CommandPanelState | null;
  conversation: ReturnType<typeof projectConversation>;
  dispatch: ThreadWorkflowDispatch;
  ensureConnected: () => Promise<boolean>;
  openKeyboardShortcuts: ReturnType<typeof useAppOverlayState>["openKeyboardShortcuts"];
  openRenameThreadDialog: ReturnType<typeof useThreadActions>["openRenameThreadDialog"];
  pinnedThreadIds: ReturnType<typeof useThreadPins>["pinnedThreadIds"];
  selectThreadById: (threadId: string) => void;
  setAppRegistry: Dispatch<SetStateAction<AppRegistryEntry[]>>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setSettingsPanelState: Dispatch<SetStateAction<CommandPanelState | null>>;
  state: CodexUiState;
  toggleThreadPinned: ReturnType<typeof useThreadPins>["toggleThreadPinned"];
  workspace: string;
}

export function useForgeAppThreadCommands(args: ForgeAppThreadCommandsArgs) {
  const {
    activeSettingsPanel,
    activeThread,
    archiveSelectedThread,
    commandPanel,
    conversation,
    dispatch,
    ensureConnected,
    openKeyboardShortcuts,
    openRenameThreadDialog,
    pinnedThreadIds,
    selectThreadById,
    setAppRegistry,
    setCommandPanel,
    setSettingsPanelState,
    state,
    toggleThreadPinned,
    workspace,
  } = args;
  useSkillsPanelRefresh({
    activeSettingsPanel,
    commandPanelPanel: commandPanel?.panel,
    ensureConnected,
    setCommandPanel,
    setSettingsPanelState,
    skillsChangedNonce: state.invalidation.skills,
    workspace,
  });

  useAppBackedPanelRefresh({
    activeSettingsPanel,
    activeThreadId: state.activeThreadId,
    appListMessage: state.invalidation.appListMessage,
    appListNonce: state.invalidation.appList,
    commandPanelPanel: commandPanel?.panel,
    ensureConnected,
    mcpServerStartupStatuses: state.mcpServerStartupStatuses,
    mcpStatusMessage: state.invalidation.mcpStatusMessage,
    mcpStatusNonce: state.invalidation.mcpStatus,
    setAppRegistry,
    setCommandPanel,
    setSettingsPanelState,
    workspace,
  });

  const setActiveComposerMode = useCallback((mode: ComposerMode) => {
    dispatch({ type: "setActiveComposerMode", mode });
  }, [dispatch]);

  const {
    copyTextToClipboard,
    copyWorkingDirectory,
    copySessionId,
    copyThreadWorkingDirectory,
    copyThreadSessionId,
    copyThreadDeeplink,
    copyConversationMarkdown,
  } = useClipboardCopyActions({
    activeThread,
    workspace,
    conversationUnits: conversation.units,
  });

  const openThreadFolder = useCallback(async (thread: Thread) => {
    const cwd = typeof thread.cwd === "string" ? thread.cwd.trim() : "";
    if (!cwd) {
      dispatch({ type: "log", text: "Working directory is unavailable", level: "warn" });
      return;
    }
    try {
      // codex sidebar-thread-section `open-thread-folder` — REVEAL the workspace
      // root in the OS file manager ("Reveal in Finder", i18n desc "reveal a
      // folder"), i.e. select it in its parent, rather than just opening it.
      await revealPath(cwd);
    } catch (error) {
      dispatch({ type: "log", text: `reveal folder failed: ${formatError(error)}`, level: "error" });
    }
  }, [dispatch]);

  // codex threadHeader.openInNewWindow — open the thread in a second app window
  // (host_open_thread_window; the new window routes to the thread on startup).
  const openThreadInNewWindow = useCallback((thread: Thread) => {
    void openThreadWindow(thread.id).catch((error) => {
      dispatch({ type: "log", text: `open in new window failed: ${formatError(error)}`, level: "warn" });
    });
  }, [dispatch]);

  const markThreadUnread = useCallback((thread: Thread) => {
    dispatch({
      type: "setThreads",
      threads: state.threads.map((item) =>
        item.id === thread.id
          ? ({ ...(item as Thread & Record<string, unknown>), hasUnreadTurn: true, has_unread_turn: true } as Thread)
          : item,
      ),
    });
  }, [dispatch, state.threads]);

  // codex: electron-menu-shortcuts-*.js#thread1..thread9 — slot helper.
  // Resolves the Nth visible thread in `state.threads` (Codex's keyboard
  // shortcuts target the same ordered list rendered in the sidebar) and
  // delegates to the existing `selectThreadById` path so we share its
  // workbench-tab + thread-read side-effects.
  const activateThreadBySlot = useCallback((slotIndex: number) => {
    const thread = state.threads[slotIndex];
    if (!thread) {
      dispatch({
        type: "log",
        text: `Thread slot ${slotIndex + 1} is empty`,
        level: "info",
      });
      return;
    }
    selectThreadById(thread.id);
  }, [dispatch, selectThreadById, state.threads]);

  // codex: electron-menu-shortcuts-*.js#archiveThread/renameThread/
  // toggleThreadPin/copy* — register the second wave of Codex desktop
  // shortcuts. Mirrors the existing register/unregister pattern; handlers
  // closed-over from this scope reference the latest state via React refs
  // inside useCallback.
  useEffect(() => {
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.archiveThread)!,
      () => {
        if (!activeThread) {
          dispatch({ type: "log", text: "No active thread to archive", level: "info" });
          return;
        }
        void archiveSelectedThread(activeThread);
      },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.renameThread)!,
      () => {
        if (!activeThread) {
          dispatch({ type: "log", text: "No active thread to rename", level: "info" });
          return;
        }
        openRenameThreadDialog(activeThread);
      },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.toggleThreadPin)!,
      () => {
        if (!activeThread) {
          dispatch({ type: "log", text: "No active thread to pin", level: "info" });
          return;
        }
        const pinned = pinnedThreadIds.has(activeThread.id);
        toggleThreadPinned(activeThread, !pinned);
      },
    );
    // codex: electron-menu-shortcuts-*.js#navigateBack — Codex
    // Desktop dispatches `host-message` (run-command-*.js) to fire
    // `history.back/forward` against its webview. Forge has no router,
    // so we drive an in-app thread history stack maintained in the
    // reducer (`./state/thread-history.ts`). Boundary checks live in the
    // reducer so the handler can stay a no-op on either end of the stack.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.navigateBack)!,
      () => dispatch({ type: "navigateBackInHistory" }),
    );
    // codex: electron-menu-shortcuts-*.js#navigateForward — mirror
    // of navigateBack against the same thread history stack.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.navigateForward)!,
      () => dispatch({ type: "navigateForwardInHistory" }),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copySessionId)!,
      () => copySessionId(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copyWorkingDirectory)!,
      () => copyWorkingDirectory(),
    );
    // codex: local-conversation-thread-*.js registers copy-conversation-path
    // to the same copyWorkingDirectory(cwd) action as copy-working-directory.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copyConversationPath)!,
      () => copyWorkingDirectory(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copyDeeplink)!,
      () => {
        if (!activeThread) {
          dispatch({ type: "log", text: "No active thread to copy deeplink", level: "info" });
          return;
        }
        copyThreadDeeplink(activeThread);
      },
    );
    // codex: electron-menu-shortcuts-*.js#copyConversationMarkdown.
    // Wires the existing `copyConversationMarkdown` callback (which already
    // owns the Markdown serialization via `buildConversationMarkdown`) into
    // the shared command registry so menu/command-palette entries can dispatch
    // it. The callback was previously defined but never registered.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copyConversationMarkdown)!,
      () => copyConversationMarkdown(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread1)!,
      () => activateThreadBySlot(0),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread2)!,
      () => activateThreadBySlot(1),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread3)!,
      () => activateThreadBySlot(2),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread4)!,
      () => activateThreadBySlot(3),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread5)!,
      () => activateThreadBySlot(4),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread6)!,
      () => activateThreadBySlot(5),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread7)!,
      () => activateThreadBySlot(6),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread8)!,
      () => activateThreadBySlot(7),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread9)!,
      () => activateThreadBySlot(8),
    );
    // codex: electron-menu-shortcuts-*.js#showKeyboardShortcuts — ⌘⇧/.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.showKeyboardShortcuts)!,
      () => openKeyboardShortcuts(),
    );
    return () => {
      unregisterCommand(COMMAND_IDS.archiveThread);
      unregisterCommand(COMMAND_IDS.renameThread);
      unregisterCommand(COMMAND_IDS.toggleThreadPin);
      unregisterCommand(COMMAND_IDS.navigateBack);
      unregisterCommand(COMMAND_IDS.navigateForward);
      unregisterCommand(COMMAND_IDS.copySessionId);
      unregisterCommand(COMMAND_IDS.copyWorkingDirectory);
      unregisterCommand(COMMAND_IDS.copyConversationPath);
      unregisterCommand(COMMAND_IDS.copyDeeplink);
      unregisterCommand(COMMAND_IDS.copyConversationMarkdown);
      unregisterCommand(COMMAND_IDS.thread1);
      unregisterCommand(COMMAND_IDS.thread2);
      unregisterCommand(COMMAND_IDS.thread3);
      unregisterCommand(COMMAND_IDS.thread4);
      unregisterCommand(COMMAND_IDS.thread5);
      unregisterCommand(COMMAND_IDS.thread6);
      unregisterCommand(COMMAND_IDS.thread7);
      unregisterCommand(COMMAND_IDS.thread8);
      unregisterCommand(COMMAND_IDS.thread9);
      unregisterCommand(COMMAND_IDS.showKeyboardShortcuts);
    };
  }, [
    activateThreadBySlot,
    activeThread,
    archiveSelectedThread,
    copyConversationMarkdown,
    copySessionId,
    copyTextToClipboard,
    copyThreadDeeplink,
    copyWorkingDirectory,
    dispatch,
    openKeyboardShortcuts,
    openRenameThreadDialog,
    pinnedThreadIds,
    toggleThreadPinned,
    workspace,
  ]);

  // codex: app-main-*.js#Ij/Fj — mouse "back"/"forward" side buttons (button
  // 3/4) drive history navigation, mirroring Codex Desktop. The gesture is gated
  // on each command still carrying its MouseBack/MouseForward pseudo-key (so a
  // keymap override that drops it also disables the gesture); button 3/4 presses
  // are suppressed on mousedown/auxclick (preventDefault + stopPropagation) and
  // navigation fires on a trusted mouseup. Reuses the same in-app history actions
  // as the ⌘[ / ⌘] keyboard accelerators (navigateBack/navigateForward handlers).
  useEffect(() => {
    const backEnabled = commandAccelerators(COMMAND_IDS.navigateBack).includes("MouseBack");
    const forwardEnabled = commandAccelerators(COMMAND_IDS.navigateForward).includes("MouseForward");
    if (!backEnabled && !forwardEnabled) return;
    const suppress = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleMouseUp = (event: MouseEvent) => {
      suppress(event);
      if (!event.isTrusted) return;
      const direction = mouseNavigationDirection(event.button, backEnabled, forwardEnabled);
      if (direction === "back") dispatch({ type: "navigateBackInHistory" });
      else if (direction === "forward") dispatch({ type: "navigateForwardInHistory" });
    };
    window.addEventListener("mousedown", suppress, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("auxclick", suppress, true);
    return () => {
      window.removeEventListener("mousedown", suppress, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("auxclick", suppress, true);
    };
  }, [dispatch]);

  // codex: use-hotkey-*.js — one useHotkey call per ported command
  // from the second wave (archive/rename/pin/navigate/copy/threadN).
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.archiveThread) ?? "CmdOrCtrl+Shift+A",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.archiveThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.renameThread) ?? "CmdOrCtrl+Alt+R",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.renameThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.toggleThreadPin) ?? "CmdOrCtrl+Alt+P",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.toggleThreadPin)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.navigateBack) ?? "CmdOrCtrl+[",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.navigateBack)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.navigateForward) ?? "CmdOrCtrl+]",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.navigateForward)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.copySessionId) ?? "CmdOrCtrl+Alt+C",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.copySessionId)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.copyWorkingDirectory) ?? "CmdOrCtrl+Shift+C",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.copyWorkingDirectory)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.copyConversationPath) ?? "CmdOrCtrl+Alt+Shift+C",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.copyConversationPath)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.copyDeeplink) ?? "CmdOrCtrl+Alt+L",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.copyDeeplink)?.handler?.(event);
    },
  });
  // codex: electron-menu-shortcuts-*.js#thread1..thread9 — 9 top-level
  // useHotkey calls (no loop / no conditional) so React's rules-of-hooks
  // ordering is preserved and each binding owns its own listener.
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread1) ?? "CmdOrCtrl+1",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread1)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread2) ?? "CmdOrCtrl+2",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread2)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread3) ?? "CmdOrCtrl+3",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread3)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread4) ?? "CmdOrCtrl+4",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread4)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread5) ?? "CmdOrCtrl+5",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread5)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread6) ?? "CmdOrCtrl+6",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread6)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread7) ?? "CmdOrCtrl+7",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread7)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread8) ?? "CmdOrCtrl+8",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread8)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread9) ?? "CmdOrCtrl+9",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread9)?.handler?.(event);
    },
  });
  // codex: electron-menu-shortcuts-*.js#showKeyboardShortcuts — ⌘⇧/.
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.showKeyboardShortcuts) ?? "CmdOrCtrl+Shift+/",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.showKeyboardShortcuts)?.handler?.(event);
    },
  });
  return {
    copyThreadDeeplink,
    copyThreadSessionId,
    copyThreadWorkingDirectory,
    markThreadUnread,
    openThreadFolder,
    openThreadInNewWindow,
    setActiveComposerMode,
  };
}
