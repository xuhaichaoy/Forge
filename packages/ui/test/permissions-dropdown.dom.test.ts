/*
 * DOM regression suite for the composer permissions dropdown's full-access
 * confirmation gate (src/components/composer-permissions-dropdown.tsx +
 * composer-permissions-full-access-dialog.tsx).
 *
 * Pins the codex `q`/`ke` gate semantics: clicking "Full access" must open the
 * "Are you sure?" modal instead of applying directly; confirming applies
 * EXACTLY the "full-access" mode and persists the skip flag through
 * setDesktopAppSettingValue (key FORGE_DESKTOP_CONFIG_KEYS.skipFullAccessConfirm
 * = desktop.hicodex.permissions.skipFullAccessConfirm, value "true", with the
 * legacy hicodex.skipFullAccessConfirm key honored on read); an existing skip
 * flag bypasses the modal; Escape cancels without applying. Everything runs
 * against a real mounted component in jsdom (test/dom-test-env.ts) and real
 * DOM events (MouseEvent click / KeyboardEvent) — no bare handler calls.
 * jsdom's per-window localStorage stands in for the production storage.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposerPermissionsDropdown } from "../src/components/composer-permissions-dropdown";
import type { PermissionMode } from "../src/state/permissions-mode";
import { FORGE_DESKTOP_CONFIG_KEYS } from "../src/state/forge-desktop-namespace";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

const SKIP_FLAG_KEY = FORGE_DESKTOP_CONFIG_KEYS.skipFullAccessConfirm;
// Frozen pre-namespace literal the dropdown still honors on read (migration).
const LEGACY_SKIP_FLAG_KEY = "hicodex.skipFullAccessConfirm";

interface DropdownCallLog {
  /** Every onApplyMode invocation's FULL argument tuple, in order. */
  applies: [PermissionMode][];
  closes: number;
  customs: number;
}

interface MountedPermissionsDropdown {
  env: DomTestEnv;
  root: Root;
  calls: DropdownCallLog;
  storage: Storage;
  menu: () => HTMLElement | null;
  itemButton: (key: string) => HTMLButtonElement;
  dialog: () => HTMLElement | null;
  dispatchClick: (target: HTMLElement) => MouseEvent;
  dispatchKeyDown: (target: HTMLElement, init: KeyboardEventInit) => KeyboardEvent;
  cleanup: () => void;
}

function mountPermissionsDropdown(
  options: { seedStorage?: Record<string, string> } = {},
): MountedPermissionsDropdown {
  const env = setupDomTestEnv();
  const storage = env.window.localStorage;
  for (const [key, value] of Object.entries(options.seedStorage ?? {})) {
    storage.setItem(key, value);
  }
  const anchor = env.document.createElement("button");
  env.document.body.appendChild(anchor);
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const calls: DropdownCallLog = { applies: [], closes: 0, customs: 0 };
  const root = createRoot(container);
  act(() => {
    root.render(createElement(ComposerPermissionsDropdown, {
      anchor,
      // "auto" resolves to the default ("Ask for approval") row, so the
      // full-access row is a genuine mode CHANGE (the gate's live path).
      currentMode: "auto",
      onApplyMode: (...args: [PermissionMode]) => {
        calls.applies.push(args);
      },
      onOpenCustomSettings: () => {
        calls.customs += 1;
      },
      onClose: () => {
        calls.closes += 1;
      },
    }));
  });

  const menu = (): HTMLElement | null =>
    env.document.querySelector<HTMLElement>(".hc-composer-permissions-menu");
  if (!menu()) {
    env.teardown();
    throw new Error("permissions dropdown menu did not render");
  }
  if (env.document.querySelectorAll("button[data-permission-key]").length !== 4) {
    env.teardown();
    throw new Error("permissions dropdown must render its four mode rows");
  }

  const dispatch = <T extends Event>(target: HTMLElement, event: T): T => {
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  return {
    env,
    root,
    calls,
    storage,
    menu,
    itemButton: (key) => {
      const button = env.document.querySelector<HTMLButtonElement>(
        `button[data-permission-key="${key}"]`,
      );
      if (!button) throw new Error(`dropdown row ${JSON.stringify(key)} did not render`);
      return button;
    },
    dialog: () => env.document.querySelector<HTMLElement>(".hc-full-access-confirm"),
    dispatchClick: (target) =>
      dispatch(target, new env.window.MouseEvent("click", { bubbles: true, cancelable: true })),
    dispatchKeyDown: (target, init) =>
      dispatch(target, new env.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      })),
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
  };
}

function dialogConfirmButton(mounted: MountedPermissionsDropdown): HTMLButtonElement {
  const button = mounted.dialog()?.querySelector<HTMLButtonElement>(".hc-kb-topbar-btn--danger");
  if (!button) throw new Error("full-access dialog must render its danger confirm button");
  return button;
}

/*
 * ① Clicking "Full access" opens the confirm modal — it must NOT apply the
 * mode, close the dropdown, or write the skip flag by itself.
 */
export function fullAccessClickOpensConfirmDialogInsteadOfApplying(): void {
  const mounted = mountPermissionsDropdown();
  try {
    mounted.dispatchClick(mounted.itemButton("full-access"));
    const dialog = mounted.dialog();
    if (!dialog) throw new Error("clicking Full access must open the confirmation dialog");
    assertEqual(dialog.getAttribute("role"), "alertdialog", "the confirmation is an alertdialog");
    assertEqual(mounted.calls.applies.length, 0, "the row click alone must NOT apply full access");
    assertEqual(mounted.calls.closes, 0, "the dropdown must stay open behind the dialog");
    assertEqual(mounted.calls.customs, 0, "the full-access row must not route to custom settings");
    assertEqual(
      mounted.storage.getItem(SKIP_FLAG_KEY),
      null,
      "merely opening the dialog must not persist the skip flag",
    );
  } finally {
    mounted.cleanup();
  }
}

/*
 * ② Confirming in the dialog applies EXACTLY ("full-access") — one call, one
 * argument — closes the dropdown, and persists the skip flag "true" under the
 * desktop.hicodex namespace key (the setDesktopAppSettingValue write path).
 */
export function dialogConfirmAppliesFullAccessAndPersistsSkipFlag(): void {
  // The write path (setDesktopAppSettingValue) only mirrors keys under the
  // desktop.hicodex.* namespace — pin the exact key it receives.
  assertEqual(
    SKIP_FLAG_KEY,
    "desktop.hicodex.permissions.skipFullAccessConfirm",
    "skip flag must be the namespaced desktop app-setting key",
  );
  const mounted = mountPermissionsDropdown();
  try {
    mounted.dispatchClick(mounted.itemButton("full-access"));
    mounted.dispatchClick(dialogConfirmButton(mounted));
    assertDeepEqual(
      mounted.calls.applies,
      [["full-access"]],
      "confirm must call onApplyMode exactly once with the single argument \"full-access\"",
    );
    assertEqual(mounted.calls.applies[0].length, 1, "onApplyMode must receive exactly one argument");
    assertEqual(mounted.calls.closes, 1, "confirm must close the dropdown");
    assertEqual(
      mounted.storage.getItem("desktop.hicodex.permissions.skipFullAccessConfirm"),
      "true",
      "confirm must persist the skip flag as the string \"true\"",
    );
  } finally {
    mounted.cleanup();
  }
}

/*
 * ③ A pre-existing skip flag bypasses the dialog: Full access applies
 * directly. Both the canonical namespaced key and the legacy key (the
 * readMigratedStorageValue migration path) must bypass.
 */
export function existingSkipFlagBypassesDialogAndAppliesDirectly(): void {
  const canonical = mountPermissionsDropdown({ seedStorage: { [SKIP_FLAG_KEY]: "true" } });
  try {
    canonical.dispatchClick(canonical.itemButton("full-access"));
    assertEqual(canonical.dialog(), null, "an existing skip flag must suppress the dialog");
    assertDeepEqual(
      canonical.calls.applies,
      [["full-access"]],
      "the bypass must apply full-access directly",
    );
    assertEqual(canonical.calls.closes, 1, "the bypass must close the dropdown");
  } finally {
    canonical.cleanup();
  }

  const legacy = mountPermissionsDropdown({ seedStorage: { [LEGACY_SKIP_FLAG_KEY]: "true" } });
  try {
    legacy.dispatchClick(legacy.itemButton("full-access"));
    assertEqual(legacy.dialog(), null, "the legacy skip key must also suppress the dialog");
    assertDeepEqual(
      legacy.calls.applies,
      [["full-access"]],
      "the legacy-key bypass must apply full-access directly",
    );
    assertEqual(
      legacy.storage.getItem(SKIP_FLAG_KEY),
      null,
      "the bypass read must not backfill the canonical key",
    );
  } finally {
    legacy.cleanup();
  }
}

/*
 * ④ Escape closes the dialog without applying, without persisting the skip
 * flag, and without closing the dropdown (the dialog owns dismissal while it
 * is up — the menu's own Escape handler is suspended). The full-access row
 * stays re-armable afterwards.
 */
export function escapeClosesDialogWithoutApplying(): void {
  const mounted = mountPermissionsDropdown();
  try {
    mounted.dispatchClick(mounted.itemButton("full-access"));
    const dialog = mounted.dialog();
    if (!dialog) throw new Error("precondition: the confirmation dialog must be open");

    // Real keydown bubbling from the dialog up to the window listener.
    const escape = mounted.dispatchKeyDown(dialog, { key: "Escape" });
    assertEqual(mounted.dialog(), null, "Escape must close the dialog");
    assertEqual(escape.defaultPrevented, true, "the dialog must claim the Escape key");
    assertEqual(mounted.calls.applies.length, 0, "Escape must NOT apply full access");
    assertEqual(
      mounted.storage.getItem(SKIP_FLAG_KEY),
      null,
      "Escape must not persist the skip flag",
    );
    assertEqual(mounted.calls.closes, 0, "Escape dismisses only the dialog, not the dropdown");
    if (!mounted.menu()) throw new Error("the dropdown menu must still be mounted after Escape");

    // The cancel path must reset cleanly: the gate re-arms on the next click.
    mounted.dispatchClick(mounted.itemButton("full-access"));
    if (!mounted.dialog()) throw new Error("Full access must re-open the dialog after a cancel");
    assertEqual(mounted.calls.applies.length, 0, "the re-opened gate must still not apply");
  } finally {
    mounted.cleanup();
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
