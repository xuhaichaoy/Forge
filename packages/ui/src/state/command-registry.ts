// codex: electron-menu-shortcuts-*.js (command catalog + accelerator
// formatting). HiCodex's lightweight registry: descriptors are registered
// imperatively by consumers (no preloaded catalog) — keeping the registry
// free of UI policy decisions.

import { resolveKeymapOverride } from "./keymap-overrides";

// codex: electron-menu-shortcuts-*.js — command group keys.
export type CommandGroup =
  | "thread"
  | "navigation"
  | "panels"
  | "workspace"
  | "skills"
  | "configure"
  | "app";

// codex: electron-menu-shortcuts-*.js — shortcut scopes.
export type CommandScope = "webview" | "electron-only" | "os-global";

export type CommandAvailability = "electron" | "browser";

// codex: electron-menu-shortcuts-*.js — platform overrides for
// default keybindings.
export interface CommandPlatformKeybindings {
  macOS?: string[];
  default?: string[];
}

export interface CommandDescriptor {
  /** camelCase identifier, e.g. `openCommandMenu`. */
  id: string;
  title: string;
  description?: string;
  group: CommandGroup;
  scope: CommandScope;
  /** When `true` the command should surface in the command palette. Defaults to `true`. */
  showInCommandMenu?: boolean;
  /** Override grouping inside the command menu. Defaults to `group`. */
  commandMenuGroupKey?: string;
  /** Default keybindings keyed by platform (matches Codex schema). */
  defaultKeybindings?: CommandPlatformKeybindings;
  /** Environments where the command is exposed. Defaults to `["electron"]`. */
  availableIn?: CommandAvailability[];
}

export type CommandHandler = (event?: KeyboardEvent | Event) => void;

export interface RegisteredCommand extends CommandDescriptor {
  handler?: CommandHandler;
}

export interface ListCommandsFilter {
  group?: CommandGroup;
  showInCommandMenu?: boolean;
}

// codex: electron-menu-shortcuts-*.js — singleton registry map.
const registry = new Map<string, RegisteredCommand>();

function normalize(descriptor: CommandDescriptor): CommandDescriptor {
  return {
    showInCommandMenu: true,
    commandMenuGroupKey: descriptor.commandMenuGroupKey ?? descriptor.group,
    availableIn: descriptor.availableIn ?? ["electron"],
    ...descriptor,
  };
}

export function registerCommand(
  descriptor: CommandDescriptor,
  handler?: CommandHandler,
): void {
  // codex: electron-menu-shortcuts-*.js — duplicate IDs would shadow
  // existing commands. We replace silently (HiCodex consumers may re-register
  // on hot-reload), but the descriptor is normalized for downstream defaults.
  const normalized = normalize(descriptor);
  const entry: RegisteredCommand = handler != null ? { ...normalized, handler } : normalized;
  registry.set(descriptor.id, entry);
}

export function unregisterCommand(id: string): void {
  registry.delete(id);
}

// codex: electron-menu-shortcuts-*.js — lookup by ID.
export function getCommand(id: string): RegisteredCommand | undefined {
  return registry.get(id);
}

// codex: electron-menu-shortcuts-*.js (commandMenu filter).
export function listCommands(filter?: ListCommandsFilter): RegisteredCommand[] {
  const items = Array.from(registry.values());
  if (filter == null) return items;
  return items.filter((command) => {
    if (filter.group != null && command.group !== filter.group) return false;
    if (filter.showInCommandMenu != null) {
      const inMenu = command.showInCommandMenu ?? true;
      if (inMenu !== filter.showInCommandMenu) return false;
    }
    return true;
  });
}

// codex: electron-menu-shortcuts-*.js — Mac detection (duplicated
// from use-hotkey to avoid creating an import cycle between hooks/state).
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  if (platform.startsWith("Mac")) return true;
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

// codex: electron-menu-shortcuts-*.js — platform-specific keybinding
// lookup. Returns every accelerator configured for the current platform
// (preferring macOS on macOS, default elsewhere). Mirrors Codex's
// `platformDefaultKeybindings[platform]` which is itself an array.
//
// CODEX-REF: keyboard-shortcuts-settings-*.js — user keymap overrides
// take priority over the descriptor default. Override semantics from
// keymap-overrides.ts:
//   - string  → user-supplied accelerator wins, default is ignored
//   - null    → user explicitly unbound the command, return []
//   - missing → fall through to defaultKeybindings as before
export function commandAccelerators(id: string): string[] {
  const override = resolveKeymapOverride(id);
  if (override === null) return [];
  if (typeof override === "string") return [override];
  const command = registry.get(id);
  if (command == null) return [];
  const bindings = command.defaultKeybindings;
  if (bindings == null) return [];
  const isMac = isMacPlatform();
  const preferred = isMac ? bindings.macOS : bindings.default;
  if (preferred != null && preferred.length > 0) return [...preferred];
  const fallback = isMac ? bindings.default : bindings.macOS;
  if (fallback != null && fallback.length > 0) return [...fallback];
  return [];
}

// codex: electron-menu-shortcuts-*.js — back-compat single-accelerator
// helper. Returns the primary (first) binding so existing single-string
// consumers keep working unchanged.
export function commandAccelerator(id: string): string | undefined {
  const all = commandAccelerators(id);
  return all.length > 0 ? all[0] : undefined;
}

// codex: electron-menu-shortcuts-*.js — token → display formatter.
function formatToken(token: string, isMac: boolean): string {
  const tokens = token.split("+").filter(Boolean);
  const mods = new Set<string>();
  let key: string | null = null;
  for (const item of tokens) {
    switch (item) {
      case "CmdOrCtrl":
        mods.add(isMac ? "Command" : "Ctrl");
        break;
      case "Command":
      case "Cmd":
      case "Meta":
        mods.add(isMac ? "Command" : "Win");
        break;
      case "Control":
      case "Ctrl":
        mods.add("Ctrl");
        break;
      case "Alt":
      case "Option":
        mods.add("Alt");
        break;
      case "Shift":
        mods.add("Shift");
        break;
      default:
        key = item;
        break;
    }
  }
  // codex: electron-menu-shortcuts-*.js — Mac collapses Shift+/ → ?.
  if (isMac && key === "/" && mods.has("Shift")) {
    mods.delete("Shift");
    key = "?";
  }
  if (isMac) {
    const macGlyphs: Record<string, string> = {
      Ctrl: "⌃",
      Alt: "⌥",
      Shift: "⇧",
      Command: "⌘",
    };
    const order = ["Ctrl", "Alt", "Shift", "Command"];
    const prefix = order
      .filter((mod) => mods.has(mod))
      .map((mod) => macGlyphs[mod] ?? "")
      .join("");
    return `${prefix}${key ?? ""}`;
  }
  const renamed = Array.from(mods).map((mod) => (mod === "Command" ? "Cmd" : mod));
  const order = ["Ctrl", "Alt", "Shift", "Cmd", "Win"];
  const orderedMods = order.filter((mod) => renamed.includes(mod));
  return [...orderedMods, key ?? ""].filter(Boolean).join("+");
}

// codex: electron-menu-shortcuts-*.js — full accelerator → label.
export function formatAccelerator(accelerator: string, isMac: boolean): string {
  return accelerator
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => formatToken(token, isMac))
    .join(" ");
}

// codex: electron-menu-shortcuts-*.js — human-readable accelerator label.
export function commandAcceleratorLabel(id: string): string | undefined {
  const accelerator = commandAccelerator(id);
  if (accelerator == null) return undefined;
  return formatAccelerator(accelerator, isMacPlatform());
}
