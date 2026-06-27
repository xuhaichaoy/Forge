import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  SidePanelNewTabPage,
  SidePanelSuggestedArtifacts,
} from "../src/components/side-panel-new-tab-page";
import type { RailEntry } from "../src/state/render-groups";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default function runSidePanelNewTabPageDomTests(): void {
  rendersSuggestedArtifactsWithoutEmptyState();
  opensSuggestedArtifacts();
}

function rendersSuggestedArtifactsWithoutEmptyState(): void {
  const mounted = mountSuggestedArtifacts();
  try {
    assertTextIncludes(mounted.container.textContent ?? "", "Suggested", "suggested heading should render");
    assertTextIncludes(mounted.container.textContent ?? "", "report.md", "suggested artifact title should render");
    assertEqual(
      mounted.container.textContent?.includes("No tabs are available for this thread"),
      false,
      "empty state should be hidden when suggested artifacts exist",
    );
  } finally {
    mounted.cleanup();
  }
}

function opensSuggestedArtifacts(): void {
  const mounted = mountSuggestedArtifacts();
  try {
    const button = mounted.suggestedButton();
    act(() => {
      button.dispatchEvent(new mounted.env.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    assertDeepEqual(mounted.openedArtifactIds, ["artifact:report"], "click should open the artifact entry");
  } finally {
    mounted.cleanup();
  }
}

interface MountedSuggestedArtifacts {
  cleanup: () => void;
  container: HTMLElement;
  env: DomTestEnv;
  openedArtifactIds: string[];
  root: Root;
  suggestedButton: () => HTMLButtonElement;
}

function mountSuggestedArtifacts(): MountedSuggestedArtifacts {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  const openedArtifactIds: string[] = [];
  const artifacts: RailEntry[] = [{
    id: "artifact:report",
    title: "report.md",
    reference: { path: "/tmp/report.md", lineStart: 1 },
  }];

  act(() => {
    root.render(createElement(SidePanelNewTabPage, {
      actions: [],
      suggestedSlot: createElement(SidePanelSuggestedArtifacts, {
        artifacts,
        onOpenArtifact: (entry: RailEntry) => {
          openedArtifactIds.push(entry.id);
        },
      }),
    }));
  });

  const suggestedButton = (): HTMLButtonElement => {
    const button = container.querySelector<HTMLButtonElement>(".hc-side-panel-new-tab__suggested-button");
    if (!button) throw new Error("suggested artifact button did not render");
    return button;
  };

  const cleanup = (): void => {
    act(() => {
      root.unmount();
    });
    env.teardown();
  };

  return {
    cleanup,
    container,
    env,
    openedArtifactIds,
    root,
    suggestedButton,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${message}: expected ${right}, got ${left}`);
  }
}

function assertTextIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
