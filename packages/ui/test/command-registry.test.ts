import { formatAccelerator, mouseNavigationDirection } from "../src/state/command-registry";
import { COMMAND_DESCRIPTORS, COMMAND_IDS } from "../src/state/commands";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// codex: app-main-*.js#Ij — mouse button 3 → back, button 4 → forward, each
// gated on its enabled flag (binding still carries the mouse pseudo-key).
function mapsMouseButtonsToNavigationDirection(): void {
  assertEqual(mouseNavigationDirection(3, true, true), "back", "button 3 → back");
  assertEqual(mouseNavigationDirection(4, true, true), "forward", "button 4 → forward");
  // Gating: a disabled side mirrors Codex dropping the MouseBack/Forward binding.
  assertEqual(mouseNavigationDirection(3, false, true), null, "button 3 disabled when back not bound");
  assertEqual(mouseNavigationDirection(4, true, false), null, "button 4 disabled when forward not bound");
  // Primary / middle / unknown buttons never navigate.
  assertEqual(mouseNavigationDirection(0, true, true), null, "primary button never navigates");
  assertEqual(mouseNavigationDirection(1, true, true), null, "middle button never navigates");
  assertEqual(mouseNavigationDirection(2, true, true), null, "secondary button never navigates");
}

// codex: electron-menu-shortcuts-*.js — display switch maps the mouse
// pseudo-keys to "Mouse Back" / "Mouse Forward" in the shortcuts UI.
function formatsMousePseudoKeyLabels(): void {
  assertEqual(formatAccelerator("MouseBack", false), "Mouse Back", "MouseBack label (non-mac)");
  assertEqual(formatAccelerator("MouseBack", true), "Mouse Back", "MouseBack label (mac)");
  assertEqual(formatAccelerator("MouseForward", false), "Mouse Forward", "MouseForward label (non-mac)");
  assertEqual(formatAccelerator("MouseForward", true), "Mouse Forward", "MouseForward label (mac)");
  // Regular accelerators are unaffected by the pseudo-key mapping.
  assertEqual(formatAccelerator("CmdOrCtrl+[", false), "Ctrl+[", "CmdOrCtrl+[ non-mac unchanged");
  assertEqual(formatAccelerator("CmdOrCtrl+[", true), "⌘[", "CmdOrCtrl+[ mac unchanged");
}

// codex: electron-menu-shortcuts-*.js navigateBack/navigateForward —
// base defaultKeybindings bind the mouse side buttons alongside ⌘[ / ⌘].
function bindsMouseSideButtonsToHistoryNavigation(): void {
  const back = COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.navigateBack);
  const forward = COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.navigateForward);
  assert(back != null, "navigateBack descriptor exists");
  assert(forward != null, "navigateForward descriptor exists");
  for (const platform of ["macOS", "default"] as const) {
    assert(
      back!.defaultKeybindings?.[platform]?.includes("MouseBack") === true,
      `navigateBack ${platform} binds MouseBack`,
    );
    assert(
      forward!.defaultKeybindings?.[platform]?.includes("MouseForward") === true,
      `navigateForward ${platform} binds MouseForward`,
    );
    // The keyboard accelerator must still lead so commandAccelerator() (first
    // entry) keeps returning the ⌘[ / ⌘] keystroke for useHotkey.
    assertEqual(back!.defaultKeybindings?.[platform]?.[0], "CmdOrCtrl+[", `navigateBack ${platform} keyboard first`);
    assertEqual(forward!.defaultKeybindings?.[platform]?.[0], "CmdOrCtrl+]", `navigateForward ${platform} keyboard first`);
  }
}

export default function runCommandRegistryTests(): void {
  mapsMouseButtonsToNavigationDirection();
  formatsMousePseudoKeyLabels();
  bindsMouseSideButtonsToHistoryNavigation();
}
