import { COMMAND_DESCRIPTORS, COMMAND_IDS } from "../src/state/commands";

export default function runCommandDescriptorTests(): void {
  exposesOpenFolderCommandWithDesktopAccelerator();
  exposesNewThreadDesktopAccelerators();
}

function exposesOpenFolderCommandWithDesktopAccelerator(): void {
  const descriptor = COMMAND_DESCRIPTORS.find((entry) => entry.id === COMMAND_IDS.openFolder);
  if (!descriptor) throw new Error("openFolder command descriptor should exist");
  assertEqual(descriptor.title, "Open folder", "openFolder title should match Desktop command default");
  assertEqual(descriptor.description, "Add a local project to Codex", "openFolder description should match Desktop default");
  assertEqual(descriptor.group, "workspace", "openFolder should be a workspace command");
  assertEqual(descriptor.commandMenuGroupKey, "workspace", "openFolder command menu group should be workspace");
  assertEqual(descriptor.scope, "webview", "openFolder should dispatch through the webview handler");
  assertEqual(descriptor.availableIn?.includes("electron"), true, "openFolder should be desktop-only");
  assertEqual(descriptor.defaultKeybindings?.macOS?.[0], "CmdOrCtrl+O", "openFolder should use CmdOrCtrl+O on macOS");
  assertEqual(descriptor.defaultKeybindings?.default?.[0], "CmdOrCtrl+O", "openFolder should use CmdOrCtrl+O by default");
}

function exposesNewThreadDesktopAccelerators(): void {
  const descriptor = COMMAND_DESCRIPTORS.find((entry) => entry.id === COMMAND_IDS.newThread);
  if (!descriptor) throw new Error("newThread command descriptor should exist");
  assertArrayEqual(
    descriptor.defaultKeybindings?.macOS ?? [],
    ["CmdOrCtrl+N", "CmdOrCtrl+Shift+O"],
    "newThread should expose both Desktop macOS accelerators",
  );
  assertArrayEqual(
    descriptor.defaultKeybindings?.default ?? [],
    ["CmdOrCtrl+N", "CmdOrCtrl+Shift+O"],
    "newThread should expose both Desktop default accelerators",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual<T>(actual: T[], expected: T[], message: string): void {
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
