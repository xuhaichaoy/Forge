import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import { FileReferencePreviewTab, fileSourceBreadcrumbParts } from "../src/components/file-preview-panel";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runFilePreviewPanelDomTests(): Promise<void> {
  sourceTabBreadcrumbSplitsWorkspacePathLikeDesktop();
  await sourceTabToolbarOpensWorkspaceFileLikeDesktop();
  await sourceTabOptionsKeepDesktopWorkspaceFileOrder();
  await markdownSourceTabOffersRichPreviewToggle();
  await artifactSourceTabOffersReturnToRichPreview();
  await sourceTabShowsManualRefreshPrompt();
  await nonRawSourceTabsHideWordWrapOption();
}

function sourceTabBreadcrumbSplitsWorkspacePathLikeDesktop(): void {
  assertDeepEqual(
    fileSourceBreadcrumbParts("/workspace/src/app.ts"),
    ["/", "workspace", "src", "app.ts"],
    "absolute workspace file paths should keep a root crumb",
  );
  assertDeepEqual(
    fileSourceBreadcrumbParts("src/app.ts"),
    ["src", "app.ts"],
    "relative workspace file paths should split into path crumbs",
  );
}

async function sourceTabToolbarOpensWorkspaceFileLikeDesktop(): Promise<void> {
  const opened: string[] = [];
  const mounted = mountFileReferencePreviewTab({
    onOpenFile: () => opened.push("/workspace/src/app.ts"),
  });
  try {
    const breadcrumb = mounted.env.document.querySelector<HTMLElement>('nav[aria-label="File path"]');
    if (!breadcrumb) throw new Error("source tab breadcrumb did not render");
    assertEqual(breadcrumb.getAttribute("title"), "/workspace/src/app.ts", "source tab breadcrumb should expose the full path title");
    const openButton = mounted.button("Open file");
    dispatchMouse(mounted.env, openButton, "click");
    assertDeepEqual(opened, ["/workspace/src/app.ts"], "source tab toolbar Open file should call the host opener");
  } finally {
    mounted.cleanup();
  }
}

async function markdownSourceTabOffersRichPreviewToggle(): Promise<void> {
  const mounted = mountFileReferencePreviewTab({ path: "/workspace/README.md" });
  try {
    dispatchMouse(mounted.env, mounted.button("File viewer options"), "click", {
      clientX: 24,
      clientY: 32,
    });
    assertDeepEqual(
      menuLabels(mounted.env),
      ["Copy path", "Copy file contents", "Disable rich view"],
      "markdown rich preview source tab options menu should hide Desktop's raw word-wrap toggle",
    );
    clickMenuItem(mounted.env, "Disable rich view");
    dispatchMouse(mounted.env, mounted.button("File viewer options"), "click", {
      clientX: 24,
      clientY: 32,
    });
    assertDeepEqual(
      menuLabels(mounted.env),
      ["Copy path", "Copy file contents", "Enable rich view", "Disable word wrap"],
      "markdown source tab rich preview toggle should switch to enable after disabling rich view",
    );
  } finally {
    mounted.cleanup();
  }
}

async function nonRawSourceTabsHideWordWrapOption(): Promise<void> {
  const mounted = mountFileReferencePreviewTab({ path: "/workspace/report.pdf" });
  try {
    dispatchMouse(mounted.env, mounted.button("File viewer options"), "click", {
      clientX: 24,
      clientY: 32,
    });
    assertDeepEqual(
      menuLabels(mounted.env),
      ["Copy path", "Copy file contents"],
      "non-raw source tab options should hide Desktop's word-wrap control",
    );
  } finally {
    mounted.cleanup();
  }
}

async function artifactSourceTabOffersReturnToRichPreview(): Promise<void> {
  const opened: string[] = [];
  const mounted = mountFileReferencePreviewTab({
    path: "/workspace/report.pdf",
    onOpenArtifactPreview: () => opened.push("rich"),
  });
  try {
    dispatchMouse(mounted.env, mounted.button("File viewer options"), "click", {
      clientX: 24,
      clientY: 32,
    });
    assertDeepEqual(
      menuLabels(mounted.env),
      ["Copy path", "Copy file contents", "Enable rich view"],
      "artifact source tabs should offer Desktop's return-to-rich-preview action",
    );
    clickMenuItem(mounted.env, "Enable rich view");
    assertDeepEqual(opened, ["rich"], "Enable rich view should reopen the artifact rich preview");
  } finally {
    mounted.cleanup();
  }
}

async function sourceTabShowsManualRefreshPrompt(): Promise<void> {
  const refreshes: number[] = [];
  const mounted = mountFileReferencePreviewTab({
    sourceChanged: true,
    onRefreshSource: () => refreshes.push(1),
  });
  try {
    const refreshButton = mounted.button("Refresh for latest");
    assertEqual(
      refreshButton.textContent?.includes("Refresh for latest"),
      true,
      "manual-refresh source tab should show Desktop's refresh prompt",
    );
    dispatchMouse(mounted.env, refreshButton, "click");
    assertDeepEqual(refreshes, [1], "Refresh for latest should call the tab refresh handler");
  } finally {
    mounted.cleanup();
  }
}

async function sourceTabOptionsKeepDesktopWorkspaceFileOrder(): Promise<void> {
  const copiedContents: string[] = [];
  const mounted = mountFileReferencePreviewTab({
    onCopyContents: () => copiedContents.push("/workspace/src/app.ts"),
  });
  try {
    dispatchMouse(mounted.env, mounted.button("File viewer options"), "click", {
      clientX: 24,
      clientY: 32,
    });
    assertDeepEqual(
      menuLabels(mounted.env),
      ["Copy path", "Copy file contents", "Disable word wrap"],
      "source tab options menu should keep Desktop's workspace-file action order for implemented actions",
    );

    clickMenuItem(mounted.env, "Copy path");
    assertDeepEqual(mounted.clipboard.writeTextCalls, ["/workspace/src/app.ts"], "Copy path should write the file path");

    dispatchMouse(mounted.env, mounted.button("File viewer options"), "click", { clientX: 24, clientY: 32 });
    clickMenuItem(mounted.env, "Copy file contents");
    assertDeepEqual(copiedContents, ["/workspace/src/app.ts"], "Copy file contents should call the host-backed reader");
  } finally {
    mounted.cleanup();
  }
}

function mountFileReferencePreviewTab({
  onOpenFile = () => undefined,
  onCopyContents = () => undefined,
  onOpenArtifactPreview,
  onRefreshSource,
  path = "/workspace/src/app.ts",
  sourceChanged = false,
}: {
  onOpenFile?: () => void;
  onCopyContents?: () => void;
  onOpenArtifactPreview?: () => void;
  onRefreshSource?: () => void;
  path?: string;
  sourceChanged?: boolean;
} = {}): MountedFileReferencePreviewTab {
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
        children: createElement(FileReferencePreviewTab, {
          path,
          lineStart: 3,
          lineEnd: 5,
          onOpenFile,
          onCopyPath: () => {
            void env.window.navigator.clipboard?.writeText(path);
          },
          onCopyContents,
          onOpenArtifactPreview,
          onRefreshSource,
          sourceChanged,
        }),
      },
    ));
  });
  return {
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    button: (label: string) => {
      const button = env.document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      if (!button) throw new Error(`${label} button did not render`);
      return button;
    },
    clipboard,
    env,
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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

interface MountedFileReferencePreviewTab {
  button: (label: string) => HTMLButtonElement;
  cleanup: () => void;
  clipboard: ClipboardRecorder;
  env: DomTestEnv;
  root: Root;
}

interface ClipboardRecorder {
  writeTextCalls: string[];
}
