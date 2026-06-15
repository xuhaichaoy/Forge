/* codex: electron-menu-shortcuts-*.js — command catalog subset. */
// Forge migrates the keyboard shortcut entries that already have a
// handler (or a sensible fallback) inside ForgeApp. Descriptors are
// declared without handlers; ForgeApp registers handlers at mount.
//
// `title` and `description` strings on each descriptor mirror the upstream
// `codex.commandMenuTitle.<id>` (native `menuTitle`) / `codex.commandDescription.<id>`
// ICU defaultMessage (verified literally against the Codex Desktop bundle:
// catalog in `electron-menu-shortcuts-*.js`, defaultMessages in
// `keyboard-shortcuts-search-input-*.js`). Keep them in lockstep with Codex
// Desktop: changes here must be cross-checked with
// `rg "codex\\.commandMenuTitle\\.<id>|codex\\.commandDescription\\.<id>"`.
// The exceptions are `copyConversationMarkdown` (no native `menuTitle`/
// `menuTitleIntlId` upstream, only a description id, so its title keeps a
// Forge-original id) and `thread1`..`thread9`, which Forge renders through
// a single parameterized "Switch to thread N" / "Activate thread N in the
// sidebar." original (the upstream `codex.commandMenuTitle.thread{1..9}` titles
// are "Go to Chat N" with one shared `codex.commandDescription.threadSlot`).

import type { CommandDescriptor } from "./command-registry";
import { formatAccelerator, isMacPlatform } from "./command-registry";
import { resolveKeymapOverride } from "./keymap-overrides";
import { formatMessage } from "./i18n";

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
    title: "New Window",
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
    title: "Open Folder…",
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
    // codex: electron-menu-shortcuts-*.js#findInThread — commandMenuGroupKey
    // `navigation` (the command menu lists Find under Navigation, not Chat).
    group: "navigation",
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
    title: "Toggle Sidebar",
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
    title: "Toggle File Tree",
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
    title: "Search Chats…",
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
    title: "Search Files…",
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
    title: "New Chat",
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
    title: "Previous Chat or Tab",
    description: "Switch to the previous chat or tab",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      // codex electron-menu-shortcuts: previousThread carries TWO accelerators —
      // mac [⌘⇧[, ⌘⌥←], non-mac [Ctrl+Shift+[, Ctrl+PageUp].
      macOS: ["CmdOrCtrl+Shift+[", "Cmd+Alt+Left"],
      default: ["CmdOrCtrl+Shift+[", "Ctrl+PageUp"],
    },
  },
  // codex: electron-menu-shortcuts-*.js nextThread — ⌘⇧].
  {
    id: COMMAND_IDS.nextThread,
    title: "Next Chat or Tab",
    description: "Switch to the next chat or tab",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron", "browser"],
    defaultKeybindings: {
      // codex electron-menu-shortcuts: nextThread carries TWO accelerators —
      // mac [⌘⇧], ⌘⌥→], non-mac [Ctrl+Shift+], Ctrl+PageDown].
      macOS: ["CmdOrCtrl+Shift+]", "Cmd+Alt+Right"],
      default: ["CmdOrCtrl+Shift+]", "Ctrl+PageDown"],
    },
  },
  // codex: electron-menu-shortcuts-*.js settings — ⌘,.
  {
    id: COMMAND_IDS.settings,
    title: "Settings…",
    description: "Open Codex settings",
    // codex: electron-menu-shortcuts-*.js#settings — commandMenuGroupKey `app`
    // (Settings sits under the App section in Codex's command menu, not Configure;
    // `configure` stays the home of Keyboard Shortcuts only).
    group: "app",
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
    title: "Rename chat",
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
    title: "Pin/unpin chat",
    description: "Pin or unpin the current chat",
    group: "thread",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+Alt+P"],
      default: ["CmdOrCtrl+Alt+P"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#navigateBack — ⌘[ + Mouse Back.
  // Codex's base `defaultKeybindings:[{key:`CmdOrCtrl+[`},{key:`MouseBack`}]`
  // binds the mouse "back" side button (button 3) alongside the keyboard
  // accelerator. The `MouseBack` pseudo-key is consumed by the global mouse
  // navigation handler in ForgeApp (mirrors app-main `Ij`/`Fj`); the keyboard
  // matcher treats it as an inert entry (no DOM key is ever named "MouseBack").
  {
    id: COMMAND_IDS.navigateBack,
    title: "Back",
    description: "Go back in navigation history",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+[", "MouseBack"],
      default: ["CmdOrCtrl+[", "MouseBack"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#navigateForward — ⌘] + Mouse Forward.
  {
    id: COMMAND_IDS.navigateForward,
    title: "Forward",
    description: "Go forward in navigation history",
    group: "navigation",
    scope: "webview",
    availableIn: ["electron"],
    defaultKeybindings: {
      macOS: ["CmdOrCtrl+]", "MouseForward"],
      default: ["CmdOrCtrl+]", "MouseForward"],
    },
  },
  // codex: electron-menu-shortcuts-*.js#copySessionId — ⌘⌥C.
  {
    id: COMMAND_IDS.copySessionId,
    title: "Copy session id",
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
  // Forge offers it as a command-menu entry; menu items beyond the active
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
    title: "Keyboard Shortcuts",
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
 * codex: electron-menu-shortcuts-*.js — descriptor id → ICU title/description id.
 *
 * `COMMAND_DESCRIPTORS` is a module-level constant, so its `title`/`description`
 * literals are kept as the upstream English defaultMessage (and double as the
 * command-registry / test fixtures). Localized rendering must go through these
 * resolvers at *runtime* (never inline `formatMessage` in the array literal —
 * that would freeze the active locale at module-load time). The id maps mirror
 * Codex Desktop's `codex.commandMenuTitle.<id>` (native menu title) /
 * `codex.commandDescription.<id>` ICU keys (verified against the bundle);
 * `copyConversationMarkdown` has no upstream menu title (Forge-original title
 * id) and `thread1`..`thread9` render through a parameterized original id.
 */
const COMMAND_TITLE_INTL_ID: Readonly<Record<string, string>> = {
  // codex dialog/palette title resolver: `"titleIntlId" in cmd ?
  // formatMessage(codex.command.X) : formatMessage(codex.commandMenuTitle.X)`.
  // Webview commands that own a codex.command.* title use it (localized, sentence
  // case e.g. "New chat"); the menu-only ones fall back to commandMenuTitle.*.
  [COMMAND_IDS.openCommandMenu]: "codex.commandMenuTitle.openCommandMenu",
  [COMMAND_IDS.newWindow]: "codex.commandMenuTitle.newWindow",
  [COMMAND_IDS.openFolder]: "codex.command.openFolder",
  [COMMAND_IDS.findInThread]: "codex.command.findInThread",
  [COMMAND_IDS.toggleSidebar]: "codex.command.toggleSidebar",
  [COMMAND_IDS.toggleFileTreePanel]: "codex.commandMenuTitle.toggleFileTreePanel",
  [COMMAND_IDS.searchChats]: "codex.commandMenuTitle.searchChats",
  [COMMAND_IDS.searchFiles]: "codex.commandMenuTitle.searchFiles",
  [COMMAND_IDS.newThread]: "codex.command.newThread",
  [COMMAND_IDS.previousThread]: "codex.command.previousThread",
  [COMMAND_IDS.nextThread]: "codex.command.nextThread",
  [COMMAND_IDS.settings]: "codex.command.settings",
  [COMMAND_IDS.archiveThread]: "codex.command.archiveThread",
  [COMMAND_IDS.renameThread]: "codex.commandMenuTitle.renameThread",
  [COMMAND_IDS.toggleThreadPin]: "codex.command.toggleThreadPin",
  [COMMAND_IDS.navigateBack]: "codex.command.navigateBack",
  [COMMAND_IDS.navigateForward]: "codex.command.navigateForward",
  [COMMAND_IDS.copySessionId]: "codex.commandMenuTitle.copySessionId",
  [COMMAND_IDS.copyWorkingDirectory]: "codex.commandMenuTitle.copyWorkingDirectory",
  [COMMAND_IDS.copyConversationPath]: "codex.commandMenuTitle.copyConversationPath",
  [COMMAND_IDS.copyDeeplink]: "codex.commandMenuTitle.copyDeeplink",
  // codex: electron-menu-shortcuts-*.js#copyConversationMarkdown has no native
  // `menuTitle`/`menuTitleIntlId` (only descriptionIntlId), so there is no
  // upstream `codex.commandMenuTitle.copyConversationMarkdown`. Forge surfaces
  // it as a command-menu entry, so its title keeps a Forge-original id.
  [COMMAND_IDS.copyConversationMarkdown]: "hc.command.copyConversationMarkdown.title",
  [COMMAND_IDS.showKeyboardShortcuts]: "codex.command.showKeyboardShortcuts",
};

const COMMAND_DESCRIPTION_INTL_ID: Readonly<Record<string, string>> = {
  [COMMAND_IDS.openCommandMenu]: "codex.commandDescription.openCommandMenu",
  [COMMAND_IDS.newWindow]: "codex.commandDescription.newWindow",
  [COMMAND_IDS.openFolder]: "codex.commandDescription.openFolder",
  [COMMAND_IDS.findInThread]: "codex.commandDescription.findInThread",
  [COMMAND_IDS.toggleSidebar]: "codex.commandDescription.toggleSidebar",
  [COMMAND_IDS.toggleFileTreePanel]: "codex.commandDescription.toggleFileTreePanel",
  [COMMAND_IDS.searchChats]: "codex.commandDescription.searchChats",
  [COMMAND_IDS.searchFiles]: "codex.commandDescription.searchFiles",
  [COMMAND_IDS.newThread]: "codex.commandDescription.newThread",
  [COMMAND_IDS.previousThread]: "codex.commandDescription.previousThread",
  [COMMAND_IDS.nextThread]: "codex.commandDescription.nextThread",
  [COMMAND_IDS.settings]: "codex.commandDescription.settings",
  [COMMAND_IDS.archiveThread]: "codex.commandDescription.archiveThread",
  [COMMAND_IDS.renameThread]: "codex.commandDescription.renameThread",
  [COMMAND_IDS.toggleThreadPin]: "codex.commandDescription.toggleThreadPin",
  [COMMAND_IDS.navigateBack]: "codex.commandDescription.navigateBack",
  [COMMAND_IDS.navigateForward]: "codex.commandDescription.navigateForward",
  [COMMAND_IDS.copySessionId]: "codex.commandDescription.copySessionId",
  [COMMAND_IDS.copyWorkingDirectory]: "codex.commandDescription.copyWorkingDirectory",
  [COMMAND_IDS.copyConversationPath]: "codex.commandDescription.copyConversationPath",
  [COMMAND_IDS.copyDeeplink]: "codex.commandDescription.copyDeeplink",
  [COMMAND_IDS.copyConversationMarkdown]: "codex.commandDescription.copyConversationMarkdown",
  [COMMAND_IDS.showKeyboardShortcuts]: "codex.commandDescription.showKeyboardShortcuts",
};

// codex: electron-menu-shortcuts-*.js — `thread1`..`thread9` are Forge
// originals (no upstream ICU). The localized title/description are built from a
// single parameterized id + the slot ordinal so the dictionary stays compact.
const THREAD_SLOT_IDS = new Set<string>([
  COMMAND_IDS.thread1,
  COMMAND_IDS.thread2,
  COMMAND_IDS.thread3,
  COMMAND_IDS.thread4,
  COMMAND_IDS.thread5,
  COMMAND_IDS.thread6,
  COMMAND_IDS.thread7,
  COMMAND_IDS.thread8,
  COMMAND_IDS.thread9,
]);

function threadSlotNumber(commandId: string): number | undefined {
  if (!THREAD_SLOT_IDS.has(commandId)) return undefined;
  const slot = Number.parseInt(commandId.replace(/^thread/, ""), 10);
  return Number.isFinite(slot) ? slot : undefined;
}

/*
 * codex: electron-menu-shortcuts-*.js — runtime-localized command title.
 *
 * Resolves a descriptor's display title through the active locale. The
 * descriptor's English `title` is passed as the `defaultMessage` fallback so a
 * missing dictionary entry degrades to the upstream copy. Components that paint
 * the command catalog (keyboard-shortcuts dialog / settings panel) and the
 * read-only `keyboardShortcutsSettingsEntries` projector call this instead of
 * reading `descriptor.title` directly.
 */
export function commandDescriptorTitle(descriptor: CommandDescriptor): string {
  const slot = threadSlotNumber(descriptor.id);
  if (slot != null) {
    return formatMessage(
      { id: "hc.command.thread.switchTo", defaultMessage: "Switch to thread {slot}" },
      { slot },
    );
  }
  const intlId = COMMAND_TITLE_INTL_ID[descriptor.id];
  if (!intlId) return descriptor.title;
  return formatMessage({ id: intlId, defaultMessage: descriptor.title });
}

/*
 * codex: electron-menu-shortcuts-*.js — runtime-localized command description.
 *
 * Returns `undefined` when the descriptor has no description so callers keep
 * their existing "omit the secondary line" behavior. Same locale/fallback
 * contract as `commandDescriptorTitle`.
 */
export function commandDescriptorDescription(descriptor: CommandDescriptor): string | undefined {
  const slot = threadSlotNumber(descriptor.id);
  if (slot != null) {
    return formatMessage(
      { id: "hc.command.thread.activate", defaultMessage: "Activate thread {slot} in the sidebar." },
      { slot },
    );
  }
  if (descriptor.description == null) return undefined;
  const intlId = COMMAND_DESCRIPTION_INTL_ID[descriptor.id];
  if (!intlId) return descriptor.description;
  return formatMessage({ id: intlId, defaultMessage: descriptor.description });
}

/*
 * codex: electron-menu-shortcuts-*.js — static descriptor → label.
 *
 * `commandAcceleratorLabel` from command-registry reads the *registered*
 * registry which is populated by ForgeApp's mount effect. UI components
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
// Forge entries use string IDs (e.g. `command:new`, `command:search-files`,
// `command:settings`) which need to be normalized before the descriptor
// lookup. Anything that doesn't correspond to a registered shortcut returns
// undefined and the renderer simply omits the trailing kbd.
const COMMAND_PANEL_ENTRY_ID_TO_COMMAND_ID: Readonly<Record<string, string>> = {
  // Slash-command entries are emitted with the shape `command:<slash-id>` by
  // slashCommandEntries (state/app-shell-helpers.ts). Only IDs that map to a
  // registered keyboard shortcut are listed here — the rest are accelerator-less.
  "command:new": COMMAND_IDS.newThread,
  "command:settings": COMMAND_IDS.settings,
  // Bespoke menu entries surfaced by commandMenuEntries (ForgeApp.tsx).
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
