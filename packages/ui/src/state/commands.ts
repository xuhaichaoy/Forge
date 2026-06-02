/* codex: electron-menu-shortcuts-*.js — command catalog subset. */
// HiCodex migrates the keyboard shortcut entries that already have a
// handler (or a sensible fallback) inside HiCodexApp. Descriptors are
// declared without handlers; HiCodexApp registers handlers at mount.
//
// `title` and `description` strings on each descriptor mirror the upstream
// `codex.command.<id>` / `codex.commandDescription.<id>` ICU defaultMessage
// (verified literally against the Codex Desktop bundle chunks). Keep them in
// lockstep with Codex Desktop: changes here must be cross-checked with
// `rg "codex\\.command(?:Description)?\\.<id>"` against the
// `electron-menu-shortcuts-*.js` chunk.
// The exceptions are `thread1`..`thread9` (no upstream
// `codex.command.thread*` / `codex.commandDescription.thread*` ICU exists,
// so HiCodex keeps the "Switch to thread N" / "Activate the Nth thread in
// the sidebar." copy as a HiCodex original).

import type { CommandDescriptor } from "./command-registry";
import { formatAccelerator, isMacPlatform } from "./command-registry";
import { resolveKeymapOverride } from "./keymap-overrides";

// codex: electron-menu-shortcuts-*.js — command IDs ported here.
export const COMMAND_IDS = {
  openCommandMenu: "openCommandMenu",
  findInThread: "findInThread",
  toggleSidebar: "toggleSidebar",
  toggleFileTreePanel: "toggleFileTreePanel",
  searchChats: "searchChats",
  searchFiles: "searchFiles",
  newThread: "newThread",
  // codex: electron-menu-shortcuts-*.js#newWindow — New Window ⌘⇧N.
  newWindow: "newWindow",
  // codex: electron-menu-shortcuts-*.js#openFolder — Open Folder… ⌘O.
  openFolder: "openFolder",
  previousThread: "previousThread",
  nextThread: "nextThread",
  settings: "settings",
  // codex: electron-menu-shortcuts-*.js#archiveThread
  archiveThread: "archiveThread",
  // codex: electron-menu-shortcuts-*.js#renameThread
  renameThread: "renameThread",
  // codex: electron-menu-shortcuts-*.js#toggleThreadPin
  toggleThreadPin: "toggleThreadPin",
  // codex: electron-menu-shortcuts-*.js#navigateBack
  navigateBack: "navigateBack",
  // codex: electron-menu-shortcuts-*.js#navigateForward
  navigateForward: "navigateForward",
  // codex: electron-menu-shortcuts-*.js#copySessionId
  copySessionId: "copySessionId",
  // codex: electron-menu-shortcuts-*.js#copyWorkingDirectory
  copyWorkingDirectory: "copyWorkingDirectory",
  // codex: electron-menu-shortcuts-*.js#copyConversationPath
  copyConversationPath: "copyConversationPath",
  // codex: electron-menu-shortcuts-*.js#copyDeeplink
  copyDeeplink: "copyDeeplink",
  // codex: electron-menu-shortcuts-*.js#copyConversationMarkdown — no
  // upstream default accelerator (string verified absent in chunk grep).
  copyConversationMarkdown: "copyConversationMarkdown",
  // codex: electron-menu-shortcuts-*.js#thread1..thread9 — slot-based switches.
  thread1: "thread1",
  thread2: "thread2",
  thread3: "thread3",
  thread4: "thread4",
  thread5: "thread5",
  thread6: "thread6",
  thread7: "thread7",
  thread8: "thread8",
  thread9: "thread9",
  // codex: electron-menu-shortcuts-*.js#showKeyboardShortcuts — ⌘⇧/.
  showKeyboardShortcuts: "showKeyboardShortcuts",
} as const;

// codex: electron-menu-shortcuts-*.js — declarative catalog.
export const COMMAND_DESCRIPTORS: CommandDescriptor[] = [
  // codex: electron-menu-shortcuts-*.js openCommandMenu — ⌘K / ⌘⇧P.
  {
    id: COMMAND_IDS.openCommandMenu,
    title: "Open command menu",
    description: "Open the command menu",
    group: "navigation",
    commandMenuGroupKey: "navigation",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+K", "CmdOrCtrl+Shift+P"],
      default: ["CmdOrCtrl+K", "CmdOrCtrl+Shift+P"],
    },
  },
  // codex: electron-menu-shortcuts-*.js newWindow — "New Window" ⌘⇧N. Desktop-only
  // (opens a second Tauri webview); the handler thunks into openNewWindow().
  {
    id: COMMAND_IDS.newWindow,
    title: "New window",
    description: "Open a new window",
    group: "navigation",
    commandMenuGroupKey: "navigation",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Shift+N"],
      default: ["CmdOrCtrl+Shift+N"],
    },
  },
  // codex: electron-menu-shortcuts-*.js openFolder — command menu workspace
  // item, native File menu title "Open Folder…", accelerator ⌘O.
  {
    id: COMMAND_IDS.openFolder,
    title: "Open folder",
    description: "Add a local project to Codex",
    group: "workspace",
    commandMenuGroupKey: "workspace",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+O"],
      default: ["CmdOrCtrl+O"],
    },
  },
  // codex: electron-menu-shortcuts-*.js findInThread — ⌘F.
  {
    id: COMMAND_IDS.findInThread,
    title: "Find",
    description: "Search the current chat",
    group: "thread",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+F"],
      default: ["CmdOrCtrl+F"],
    },
  },
  // codex: electron-menu-shortcuts-*.js openSidebar — toggleSidebar ⌘B.
  {
    id: COMMAND_IDS.toggleSidebar,
    title: "Toggle sidebar",
    description: "Show or hide the sidebar",
    group: "panels",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+B"],
      default: ["CmdOrCtrl+B"],
    },
  },
  // codex: electron-menu-shortcuts-*.js toggleFileTreePanel — ⌘⇧E.
  {
    id: COMMAND_IDS.toggleFileTreePanel,
    title: "Toggle workspace files panel",
    description: "Toggle the file tree panel",
    group: "panels",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Shift+E"],
      default: ["CmdOrCtrl+Shift+E"],
    },
  },
  // codex: electron-menu-shortcuts-*.js searchChats — ⌘G.
  {
    id: COMMAND_IDS.searchChats,
    title: "Search chats",
    description: "Search chats",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+G"],
      default: ["CmdOrCtrl+G"],
    },
  },
  // codex: electron-menu-shortcuts-*.js searchFiles — ⌘P.
  {
    id: COMMAND_IDS.searchFiles,
    title: "Search files",
    description: "Search files",
    group: "workspace",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+P"],
      default: ["CmdOrCtrl+P"],
    },
  },
  // codex: electron-menu-shortcuts-*.js newThread — ⌘N / ⌘⇧O.
  {
    id: COMMAND_IDS.newThread,
    title: "New chat",
    description: "Start a new chat",
    group: "thread",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+N", "CmdOrCtrl+Shift+O"],
      default: ["CmdOrCtrl+N", "CmdOrCtrl+Shift+O"],
    },
  },
  // codex: electron-menu-shortcuts-*.js previousThread — ⌘⇧[.
  {
    id: COMMAND_IDS.previousThread,
    title: "Previous chat",
    description: "Switch to the previous chat",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Shift+["],
      default: ["CmdOrCtrl+Shift+["],
    },
  },
  // codex: electron-menu-shortcuts-*.js nextThread — ⌘⇧].
  {
    id: COMMAND_IDS.nextThread,
    title: "Next chat",
    description: "Switch to the next chat",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Shift+]"],
      default: ["CmdOrCtrl+Shift+]"],
    },
  },
  // codex: electron-menu-shortcuts-*.js settings — ⌘,.
  {
    id: COMMAND_IDS.settings,
    title: "Settings",
    description: "Open Codex settings",
    group: "configure",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+,"],
      default: ["CmdOrCtrl+,"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#archiveThread — ⌘⇧A.
  {
    id: COMMAND_IDS.archiveThread,
    title: "Archive chat",
    description: "Archive the current chat",
    group: "thread",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Shift+A"],
      default: ["CmdOrCtrl+Shift+A"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#renameThread — ⌘⌥R.
  {
    id: COMMAND_IDS.renameThread,
    title: "Rename thread",
    description: "Rename the current chat",
    group: "thread",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Alt+R"],
      default: ["CmdOrCtrl+Alt+R"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#toggleThreadPin — ⌘⌥P.
  {
    id: COMMAND_IDS.toggleThreadPin,
    title: "Toggle pin",
    description: "Pin or unpin the current chat",
    group: "thread",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Alt+P"],
      default: ["CmdOrCtrl+Alt+P"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#navigateBack — ⌘[.
  {
    id: COMMAND_IDS.navigateBack,
    title: "Back",
    description: "Go back in navigation history",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+["],
      default: ["CmdOrCtrl+["],
    },
  },
  // codex: electron-menu-shortcuts-*.js#navigateForward — ⌘].
  {
    id: COMMAND_IDS.navigateForward,
    title: "Forward",
    description: "Go forward in navigation history",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+]"],
      default: ["CmdOrCtrl+]"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#copySessionId — ⌘⌥C.
  {
    id: COMMAND_IDS.copySessionId,
    title: "Copy session ID",
    description: "Copy the current chat session ID",
    group: "thread",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Alt+C"],
      default: ["CmdOrCtrl+Alt+C"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#copyWorkingDirectory — ⌘⇧C.
  {
    id: COMMAND_IDS.copyWorkingDirectory,
    title: "Copy working directory",
    description: "Copy the current chat working directory",
    group: "workspace",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Shift+C"],
      default: ["CmdOrCtrl+Shift+C"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#copyConversationPath — ⌘⌥⇧C.
  {
    id: COMMAND_IDS.copyConversationPath,
    title: "Copy conversation path",
    description: "Copy the current chat path",
    group: "thread",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Alt+Shift+C"],
      default: ["CmdOrCtrl+Alt+Shift+C"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#copyDeeplink — ⌘⌥L.
  {
    id: COMMAND_IDS.copyDeeplink,
    title: "Copy deeplink",
    description: "Copy a deeplink to the current chat",
    group: "thread",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Alt+L"],
      default: ["CmdOrCtrl+Alt+L"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#copyConversationMarkdown — no
  // upstream default keybinding (chunk only carries titleIntlId/descriptionIntlId).
  // Codex ICU `threadHeader.copyConversationMarkdown` defaultMessage `Copy as Markdown`.
  // HiCodex offers it as a command-menu entry; menu items beyond the active
  // thread chrome can opt into it as the surface lands.
  {
    id: COMMAND_IDS.copyConversationMarkdown,
    title: "Copy as Markdown",
    description: "Copy the current chat as Markdown",
    group: "thread",
    scope: "electron-only",
    availableIn: ["electron"],
  },
  // codex: electron-menu-shortcuts-*.js#thread1 — ⌘1.
  {
    id: COMMAND_IDS.thread1,
    title: "Switch to thread 1",
    description: "Activate the first thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+1"],
      default: ["CmdOrCtrl+1"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#thread2 — ⌘2.
  {
    id: COMMAND_IDS.thread2,
    title: "Switch to thread 2",
    description: "Activate the second thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+2"],
      default: ["CmdOrCtrl+2"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#thread3 — ⌘3.
  {
    id: COMMAND_IDS.thread3,
    title: "Switch to thread 3",
    description: "Activate the third thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+3"],
      default: ["CmdOrCtrl+3"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#thread4 — ⌘4.
  {
    id: COMMAND_IDS.thread4,
    title: "Switch to thread 4",
    description: "Activate the fourth thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+4"],
      default: ["CmdOrCtrl+4"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#thread5 — ⌘5.
  {
    id: COMMAND_IDS.thread5,
    title: "Switch to thread 5",
    description: "Activate the fifth thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+5"],
      default: ["CmdOrCtrl+5"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#thread6 — ⌘6.
  {
    id: COMMAND_IDS.thread6,
    title: "Switch to thread 6",
    description: "Activate the sixth thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+6"],
      default: ["CmdOrCtrl+6"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#thread7 — ⌘7.
  {
    id: COMMAND_IDS.thread7,
    title: "Switch to thread 7",
    description: "Activate the seventh thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+7"],
      default: ["CmdOrCtrl+7"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#thread8 — ⌘8.
  {
    id: COMMAND_IDS.thread8,
    title: "Switch to thread 8",
    description: "Activate the eighth thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+8"],
      default: ["CmdOrCtrl+8"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#thread9 — ⌘9.
  {
    id: COMMAND_IDS.thread9,
    title: "Switch to thread 9",
    description: "Activate the ninth thread in the sidebar.",
    group: "navigation",
    scope: "electron-only",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+9"],
      default: ["CmdOrCtrl+9"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#showKeyboardShortcuts — ⌘⇧/.
  {
    id: COMMAND_IDS.showKeyboardShortcuts,
    title: "Show keyboard shortcuts",
    description: "Show the shortcuts available right now",
    group: "configure",
    commandMenuGroupKey: "configure",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Shift+/"],
      default: ["CmdOrCtrl+Shift+/"],
    },
  },
];

/*
 * codex: electron-menu-shortcuts-*.js — static descriptor → label.
 *
 * `commandAcceleratorLabel` from command-registry reads the *registered*
 * registry which is populated by HiCodexApp's mount effect. UI components
 * that render on first paint (sidebar, conversation chrome) need the
 * keybinding label before that effect commits, so we expose a pure static
 * lookup that reads `COMMAND_DESCRIPTORS` directly. Same formatter as
 * `commandAcceleratorLabel`.
 */
export function descriptorAcceleratorLabel(commandId: string): string | undefined {
  // CODEX-REF: keyboard-shortcuts-settings-*.js — user keymap override
  // takes priority over the descriptor default. Override semantics:
  //   - string  → format the override and return it
  //   - null    → user explicitly unbound the command; return undefined so
  //               callers render "—" or hide the accelerator slot entirely
  //   - missing → fall through to the descriptor's defaultKeybindings
  const override = resolveKeymapOverride(commandId);
  if (override === null) return undefined;
  if (typeof override === "string") return formatAccelerator(override, isMacPlatform());
  const descriptor = COMMAND_DESCRIPTORS.find((entry) => entry.id === commandId);
  if (!descriptor || !descriptor.defaultKeybindings) return undefined;
  const platform = isMacPlatform() ? descriptor.defaultKeybindings.macOS : descriptor.defaultKeybindings.default;
  const accelerator = platform?.[0] ?? descriptor.defaultKeybindings.default?.[0] ?? descriptor.defaultKeybindings.macOS?.[0];
  if (!accelerator) return undefined;
  return formatAccelerator(accelerator, isMacPlatform());
}

// codex: app-main-*.js — cmdk command-item right-side shortcut.
// Maps a CommandPanelEntry.id to the matching COMMAND_IDS descriptor so the
// command palette can render an accelerator hint (kbd) on the right side of
// each row. The Codex command dialog drives this via its descriptor catalog;
// HiCodex entries use string IDs (e.g. `command:new`, `command:search-files`,
// `command:settings`) which need to be normalized before the descriptor
// lookup. Anything that doesn't correspond to a registered shortcut returns
// undefined and the renderer simply omits the trailing kbd.
const COMMAND_PANEL_ENTRY_ID_TO_COMMAND_ID: Readonly<Record<string, string>> = {
  // Slash-command entries are emitted with the shape `command:<slash-id>` by
  // slashCommandEntries (state/app-shell-helpers.ts). Only IDs that map to a
  // registered keyboard shortcut are listed here — the rest are accelerator-less.
  "command:new": COMMAND_IDS.newThread,
  "command:settings": COMMAND_IDS.settings,
  // Bespoke menu entries surfaced by commandMenuEntries (HiCodexApp.tsx).
  "command:search-files": COMMAND_IDS.searchFiles,
  "command:toggle-thread-pin": COMMAND_IDS.toggleThreadPin,
};

// codex: app-main-*.js — cmdk command-item right-side shortcut helper.
// Resolves a CommandPanelEntry.id to its accelerator label, returning
// undefined when the entry does not correspond to a registered shortcut.
// Two-step lookup: explicit map first (for slash-command / synthetic IDs),
// then fall back to treating the raw entry id as a command id so future
// callers can pass COMMAND_IDS values directly without extending the map.
export function commandPanelEntryAcceleratorLabel(entryId: string): string | undefined {
  if (!entryId) return undefined;
  const mapped = COMMAND_PANEL_ENTRY_ID_TO_COMMAND_ID[entryId];
  if (mapped) return descriptorAcceleratorLabel(mapped);
  return descriptorAcceleratorLabel(entryId);
}
