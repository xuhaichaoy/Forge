import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ArtifactPreviewPanel } from "../src/components/artifact-preview-panel";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runArtifactPreviewPanelDomTests(): Promise<void> {
  await sourceOptionsMenuOpensArtifactSourceLikeDesktop();
  await openOptionsMenuRevealsArtifactInFolder();
  await artifactPanelShowsManualRefreshPrompt();
}

async function sourceOptionsMenuOpensArtifactSourceLikeDesktop(): Promise<void> {
  const opened: string[] = [];
  const mounted = mountArtifactPreviewPanel({
    onOpenFileReference: (path) => opened.push(path),
  });
  try {
    dispatchMouse(mounted.env, mounted.button("Artifact viewer options"), "click");
    assertDeepEqual(menuLabels(mounted.env), ["View source"], "source options should expose Desktop's View source item");
    clickMenuItem(mounted.env, "View source");
    assertDeepEqual(opened, ["report.md"], "View source should open the artifact source reference");
  } finally {
    mounted.cleanup();
  }
}

async function openOptionsMenuRevealsArtifactInFolder(): Promise<void> {
  const revealed: string[] = [];
  const mounted = mountArtifactPreviewPanel({
    onRevealFileReference: (path) => revealed.push(path),
  });
  try {
    dispatchMouse(mounted.env, mounted.button("Open options"), "click");
    assertDeepEqual(menuLabels(mounted.env), ["Open in folder"], "open options should expose Desktop's folder reveal item");
    clickMenuItem(mounted.env, "Open in folder");
    assertDeepEqual(revealed, ["report.md"], "Open in folder should reveal the artifact reference");
  } finally {
    mounted.cleanup();
  }
}

async function artifactPanelShowsManualRefreshPrompt(): Promise<void> {
  const refreshes: number[] = [];
  const mounted = mountArtifactPreviewPanel({
    sourceChanged: true,
    onRefreshSource: () => refreshes.push(1),
  });
  try {
    const refreshButton = mounted.button("Refresh for latest");
    assertEqual(
      refreshButton.textContent?.includes("Refresh for latest"),
      true,
      "manual-refresh artifact tab should show Desktop's refresh prompt",
    );
    dispatchMouse(mounted.env, refreshButton, "click");
    assertDeepEqual(refreshes, [1], "Refresh for latest should call the artifact tab refresh handler");
  } finally {
    mounted.cleanup();
  }
}

function mountArtifactPreviewPanel({
  onOpenFileReference = () => undefined,
  onRefreshSource,
  onRevealFileReference = () => undefined,
  sourceChanged = false,
}: {
  onOpenFileReference?: (path: string) => void;
  onRefreshSource?: () => void;
  onRevealFileReference?: (path: string) => void;
  sourceChanged?: boolean;
} = {}): MountedArtifactPreviewPanel {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(
      ForgeIntlProvider,
      {
        locale: "en-US",
        children: createElement(ArtifactPreviewPanel, {
          entry: {
            id: "artifact:report",
            title: "report.md",
            meta: "report.md",
            reference: { path: "report.md", lineStart: 1 },
          },
          onClose: () => undefined,
          onOpenFileReference: (reference) => onOpenFileReference(reference.path),
          onOpenFileExternal: () => undefined,
          onRefreshSource,
          onRevealFileReference: (reference) => onRevealFileReference(reference.path),
          sourceChanged,
        }),
      },
    ));
  });
  return {
    button: (label: string) => {
      const button = env.document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      if (!button) throw new Error(`${label} button did not render`);
      return button;
    },
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    env,
    root,
  };
}

function dispatchMouse(env: DomTestEnv, target: HTMLElement, type: string): void {
  act(() => {
    target.dispatchEvent(new env.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
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

interface MountedArtifactPreviewPanel {
  button: (label: string) => HTMLButtonElement;
  cleanup: () => void;
  env: DomTestEnv;
  root: Root;
}
