import { act, createElement } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileCitationMenuContext } from "../src/components/file-citation-menu";
import { FileCitationAnchor } from "../src/components/message-file-citations";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runMessageFileCitationsDomTests(): Promise<void> {
  await opensInlineFileCitationsLikeDesktop();
  await showsPathTooltipForInlineFileCitations();
  await exposesWorkspaceFileContextMenuForInlineFileCitations();
  await formatsArtifactCitationLocationLabelsLikeDesktop();
  await keepsCodeLineOneVisibleLikeDesktop();
}

async function opensInlineFileCitationsLikeDesktop(): Promise<void> {
  const opened: string[] = [];
  const openedExternal: string[] = [];
  const mounted = mountFileCitationAnchor({
    onOpenFileReference: (reference) => opened.push(`${reference.path}:${reference.lineStart}`),
    onOpenFileReferenceExternal: (reference) => openedExternal.push(`${reference.path}:${reference.lineStart}`),
  });
  try {
    const marker = mounted.marker();
    dispatchMouse(mounted.env, marker, "click");
    assertDeepEqual(opened, ["/workspace/src/app.ts:3"], "plain click should open the in-app file preview");
    assertDeepEqual(openedExternal, [], "plain click should not open externally");

    dispatchMouse(mounted.env, marker, "click", { metaKey: true });
    assertDeepEqual(openedExternal, ["/workspace/src/app.ts:3"], "modified click should route to the external opener");

    dispatchKey(mounted.env, marker, "keydown", "Enter");
    assertDeepEqual(opened, ["/workspace/src/app.ts:3", "/workspace/src/app.ts:3"], "Enter should open the file reference");

    dispatchKey(mounted.env, marker, "keydown", " ");
    dispatchKey(mounted.env, marker, "keyup", " ");
    assertDeepEqual(opened, ["/workspace/src/app.ts:3", "/workspace/src/app.ts:3", "/workspace/src/app.ts:3"], "Space keyup should open the file reference");
  } finally {
    mounted.cleanup();
  }
}

async function showsPathTooltipForInlineFileCitations(): Promise<void> {
  const mounted = mountFileCitationAnchor();
  const originalSetTimeout = mounted.env.window.setTimeout;
  Object.defineProperty(mounted.env.window, "setTimeout", {
    configurable: true,
    value: (handler: TimerHandler, _timeout?: number, ..._args: unknown[]) => {
      if (typeof handler === "function") handler();
      return 1;
    },
  });
  try {
    dispatchMouse(mounted.env, mounted.marker(), "mouseover");
    await act(async () => {
      await Promise.resolve();
    });
    const tooltip = mounted.env.document.querySelector<HTMLElement>('[role="tooltip"]');
    if (!tooltip) throw new Error("file citation tooltip should render on hover");
    assertEqual(
      tooltip.textContent?.includes("/workspace/src/app.ts"),
      true,
      "inline file citation tooltip should show the resolved path",
    );
  } finally {
    Object.defineProperty(mounted.env.window, "setTimeout", {
      configurable: true,
      value: originalSetTimeout,
    });
    mounted.cleanup();
  }
}

async function exposesWorkspaceFileContextMenuForInlineFileCitations(): Promise<void> {
  const opened: string[] = [];
  const copiedContents: string[] = [];
  const mounted = mountFileCitationAnchor({
    menuActions: {
      onCopyContents: (reference) => copiedContents.push(reference.path),
    },
    onOpenFileReference: (reference) => opened.push(reference.path),
  });
  try {
    dispatchMouse(mounted.env, mounted.marker(), "contextmenu", {
      clientX: 24,
      clientY: 32,
    });
    const labels = menuLabels(mounted.env);
    assertDeepEqual(
      labels,
      ["Open file", "Copy path", "Copy file contents"],
      "context menu should expose the Desktop workspace-file subset in order",
    );

    clickMenuItem(mounted.env, "Open file");
    assertDeepEqual(opened, ["/workspace/src/app.ts"], "Open file menu item should use the in-app opener");

    dispatchMouse(mounted.env, mounted.marker(), "contextmenu", { clientX: 24, clientY: 32 });
    clickMenuItem(mounted.env, "Copy path");
    assertDeepEqual(
      mounted.clipboard.writeTextCalls,
      ["/workspace/src/app.ts"],
      "Copy path should write the citation path to the clipboard",
    );

    dispatchMouse(mounted.env, mounted.marker(), "contextmenu", { clientX: 24, clientY: 32 });
    clickMenuItem(mounted.env, "Copy file contents");
    assertDeepEqual(copiedContents, ["/workspace/src/app.ts"], "Copy file contents should call the host-backed copy handler");
  } finally {
    mounted.cleanup();
  }
}

async function formatsArtifactCitationLocationLabelsLikeDesktop(): Promise<void> {
  const documentCitation = mountFileCitationAnchor({
    displayPath: "/workspace/report",
    entry: {
      path: "/workspace/report",
      lineStart: 1,
      lineEnd: 1,
      artifactCitation: {
        target: { artifactKind: "document", pageNumber: 7 },
      },
    },
  });
  try {
    assertEqual(documentCitation.marker().textContent, "report (page 7)", "document citations should show page labels");
    assertEqual(
      documentCitation.marker().getAttribute("aria-label"),
      "report, Document (page 7)",
      "extensionless document citations should include the fallback type in the aria label",
    );
  } finally {
    documentCitation.cleanup();
  }

  const presentationCitation = mountFileCitationAnchor({
    displayPath: "/workspace/deck.pptx",
    entry: {
      path: "/workspace/deck.pptx",
      lineStart: 1,
      lineEnd: 1,
      artifactCitation: {
        label: "Revenue chart",
        target: { artifactKind: "presentation", objectId: "chart-1", slideId: "slide-3", slideNumber: 3 },
      },
    },
  });
  try {
    assertEqual(
      presentationCitation.marker().textContent,
      "deck.pptx (slide 3, Revenue chart)",
      "presentation object citations should combine slide and label",
    );
  } finally {
    presentationCitation.cleanup();
  }

  const workbookCitation = mountFileCitationAnchor({
    displayPath: "/workspace/model.xlsx",
    entry: {
      path: "/workspace/model.xlsx",
      lineStart: 1,
      lineEnd: 1,
      artifactCitation: {
        target: { artifactKind: "workbook", sheet: "Forecast", range: "A1:B4" },
      },
    },
  });
  try {
    assertEqual(
      workbookCitation.marker().textContent,
      "model.xlsx (Forecast!A1:B4)",
      "workbook range citations should use the sheet-range label",
    );
  } finally {
    workbookCitation.cleanup();
  }
}

async function keepsCodeLineOneVisibleLikeDesktop(): Promise<void> {
  const mounted = mountFileCitationAnchor({
    displayPath: "/workspace/src/app.ts",
    entry: { path: "/workspace/src/app.ts", lineStart: 1, lineEnd: 1 },
  });
  try {
    assertEqual(mounted.marker().textContent, "app.ts (line 1)", "code citations should keep line 1 visible");
  } finally {
    mounted.cleanup();
  }
}

function mountFileCitationAnchor({
  displayPath = "/workspace/src/app.ts",
  entry = { path: "/workspace/src/app.ts", lineStart: 3, lineEnd: 5 },
  menuActions,
  onOpenFileReference = () => undefined,
  onOpenFileReferenceExternal,
}: {
  displayPath?: ComponentProps<typeof FileCitationAnchor>["displayPath"];
  entry?: ComponentProps<typeof FileCitationAnchor>["entry"];
  menuActions?: ComponentProps<typeof FileCitationMenuContext.Provider>["value"];
  onOpenFileReference?: ComponentProps<typeof FileCitationAnchor>["onOpenFileReference"];
  onOpenFileReferenceExternal?: ComponentProps<typeof FileCitationAnchor>["onOpenFileReferenceExternal"];
} = {}): {
  cleanup: () => void;
  clipboard: ClipboardRecorder;
  env: DomTestEnv;
  marker: () => HTMLElement;
  root: Root;
} {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  const clipboard = installClipboardRecorder(env);
  act(() => {
    root.render(createElement(
      ForgeIntlProvider,
      {
        locale: "en-US",
        children: createElement(
        FileCitationMenuContext.Provider,
        { value: menuActions ?? null },
        createElement(FileCitationAnchor, {
          displayPath,
          entry,
          onOpenFileReference,
          onOpenFileReferenceExternal,
        }),
        ),
      },
    ));
  });
  return {
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    clipboard,
    env,
    marker: () => {
      const marker = env.document.querySelector<HTMLElement>("[data-file-reference]");
      if (!marker) throw new Error("file citation marker did not render");
      return marker;
    },
    root,
  };
}

function installClipboardRecorder(env: DomTestEnv): ClipboardRecorder {
  const recorder: ClipboardRecorder = { writeTextCalls: [] };
  Object.defineProperty(env.window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        recorder.writeTextCalls.push(text);
      },
    },
  });
  return recorder;
}

function dispatchMouse(env: DomTestEnv, target: HTMLElement, type: string, init: MouseEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new env.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      ...init,
    }));
  });
}

function dispatchKey(env: DomTestEnv, target: HTMLElement, type: "keydown" | "keyup", key: string): void {
  act(() => {
    target.dispatchEvent(new env.window.KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key,
    }));
  });
}

function menuLabels(env: DomTestEnv): string[] {
  return Array.from(env.document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .map((item) => item.textContent?.trim() ?? "");
}

function clickMenuItem(env: DomTestEnv, label: string): void {
  const item = Array.from(env.document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!item) throw new Error(`menu item ${label} did not render`);
  dispatchMouse(env, item, "click");
}

interface ClipboardRecorder {
  writeTextCalls: string[];
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
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
