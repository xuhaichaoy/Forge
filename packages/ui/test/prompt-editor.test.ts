import {
  installPromptEditorViewStaleGuardsForTest,
  isStalePromptEditorViewError,
  promptEditorInlineNodesForTest,
  promptEditorPasteInlineNodesForTest,
  promptEditorPromptTextRoundTripForTest,
  setPromptEditorViewDetachedForTest,
  splitPromptEditorPasteFiles,
} from "../src/components/prompt-editor";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export default function runPromptEditorTests(): void {
  detectsStaleProseMirrorViewErrorsAcrossRealms();
  swallowsStaleProseMirrorViewOperations();
  skipsDetachedProseMirrorViewOperations();
  stillSurfacesUnrelatedProseMirrorViewOperations();
  splitsPastedImagesFromOtherFiles();
  parsesPromptMarkdownMentionsLikeCodexDesktop();
  parsesPastedPromptLinksLikeCodexDesktop();
  preservesPromptRichLinkSerialization();
}

function detectsStaleProseMirrorViewErrorsAcrossRealms(): void {
  assert(
    isStalePromptEditorViewError(new TypeError("null is not an object (evaluating 'this.docView.matchesNode')")),
    "Safari ProseMirror matchesNode errors should be treated as stale editor calls",
  );
  assert(
    isStalePromptEditorViewError({ message: "Cannot read properties of null (reading 'docView')" }),
    "cross-realm stale editor errors should not depend on instanceof TypeError",
  );
  assert(
    !isStalePromptEditorViewError(new Error("unrelated editor failure")),
    "unrelated editor errors should still surface",
  );
}

function swallowsStaleProseMirrorViewOperations(): void {
  const staleError = () => new TypeError("null is not an object (evaluating 'this.docView.matchesNode')");
  const view = fakeEditorView({
    update: () => {
      throw staleError();
    },
    setProps: () => {
      throw staleError();
    },
    updateState: () => {
      throw staleError();
    },
    updateStateInner: () => {
      throw staleError();
    },
    dispatch: () => {
      throw staleError();
    },
    focus: () => {
      throw staleError();
    },
    destroy: () => {
      throw staleError();
    },
    flush: () => {
      throw staleError();
    },
    flushSoon: () => {
      throw staleError();
    },
    forceFlush: () => {
      throw staleError();
    },
  });

  installPromptEditorViewStaleGuardsForTest(view as never);

  view.update({} as never);
  view.setProps({} as never);
  view.updateState({} as never);
  view.docView = {};
  view.updateStateInner({} as never, {} as never);
  view.dispatch({} as never);
  view.focus();
  view.domObserver.flush();
  view.docView = {};
  view.domObserver.flushSoon();
  view.domObserver.forceFlush();
  view.destroy();

  assert(view.docView == null, "stale destroy should mark the editor view as destroyed");
}

function skipsDetachedProseMirrorViewOperations(): void {
  let updateCalls = 0;
  let flushSoonCalls = 0;
  const view = fakeEditorView({
    updateState: () => {
      updateCalls += 1;
    },
    flushSoon: () => {
      flushSoonCalls += 1;
    },
  });

  installPromptEditorViewStaleGuardsForTest(view as never);
  setPromptEditorViewDetachedForTest(view as never, true);

  view.updateState({} as never);
  view.domObserver.flushSoon();

  assert(updateCalls === 0, "detached editor views should skip state updates");
  assert(flushSoonCalls === 0, "detached editor views should skip queued DOM observer flushes");

  setPromptEditorViewDetachedForTest(view as never, false);
  view.updateState({} as never);
  view.domObserver.flushSoon();

  assert(updateCalls === 1, "reattached editor views should resume state updates");
  assert(flushSoonCalls === 1, "reattached editor views should resume DOM observer flushes");
}

function stillSurfacesUnrelatedProseMirrorViewOperations(): void {
  const view = fakeEditorView({
    updateState: () => {
      throw new Error("real editor failure");
    },
  });

  installPromptEditorViewStaleGuardsForTest(view as never);

  let surfaced = false;
  try {
    view.updateState({} as never);
  } catch (error) {
    surfaced = error instanceof Error && error.message === "real editor failure";
  }
  assert(surfaced, "non-stale ProseMirror errors should still surface");
}

function splitsPastedImagesFromOtherFiles(): void {
  const png = { name: "diagram", type: "image/png" };
  const heic = { name: "photo.HEIC", type: "" };
  const text = { name: "notes.txt", type: "text/plain" };
  const result = splitPromptEditorPasteFiles({ 0: png, 1: heic, 2: text, length: 3 });

  assert(result.imageFiles.length === 2, "image pasted files should be grouped separately");
  assert(result.imageFiles[0] === png, "image mime file should be preserved");
  assert(result.imageFiles[1] === heic, "image extension file should be preserved");
  assert(result.otherFiles.length === 1 && result.otherFiles[0] === text, "non-image files should be grouped separately");
}

function parsesPromptMarkdownMentionsLikeCodexDesktop(): void {
  const github = promptEditorInlineNodesForTest("[$repo](https://github.com/openai/codex)")[0];
  assert(github?.type === "richLink", "known external URLs should parse as richLink before label-based skill mentions");
  assert(github.attrs.sourceAppId === "github", "richLink should carry Codex external app source id");

  const unsupportedUrl = promptEditorInlineNodesForTest("[link](https://example.com/docs)")[0];
  assert(unsupportedUrl?.type === "text", "unsupported URL-like markdown links should stay literal text");

  const file = promptEditorInlineNodesForTest("[README](README.md)")[0];
  assert(file?.type === "atMention", "file markdown links should parse as atMention");
  assert(file.attrs.fsPath === "README.md", "atMention should retain fsPath like Codex Desktop");

  const atPrefixedFile = promptEditorInlineNodesForTest("[@README](README.md)")[0];
  assert(atPrefixedFile?.type === "atMention", "@-prefixed local file links should not become agentMention");
  assert(atPrefixedFile.attrs.fsPath === "README.md", "@-prefixed local file links should retain fsPath");

  const agent = promptEditorInlineNodesForTest("[@thread](agent://abc123)")[0];
  assert(agent?.type === "agentMention", "agent paths should parse as agentMention");
  assert(agent.attrs.conversationId === "abc123", "agentMention should retain conversationId like Codex Desktop");

  const githubAgentLabel = promptEditorInlineNodesForTest("[@repo](https://github.com/openai/codex)")[0];
  assert(githubAgentLabel?.type === "richLink", "known external URLs should stay richLink even with @ labels");
}

function parsesPastedPromptLinksLikeCodexDesktop(): void {
  const path = "/Users/haichao/Library/Application Support/HiCodex/codex-home/skills/拆标/SKILL.md";
  const pasted = `[$拆标](<${path}>) 拆一下标`;
  const nodes = promptEditorPasteInlineNodesForTest(pasted);

  assert(nodes[0]?.type === "skillMention", "pasted $...SKILL.md prompt link should become a skillMention");
  assert(nodes[0].attrs.label === "$拆标", "pasted skillMention should keep the $ label");
  assert(nodes[0].attrs.name === "拆标", "pasted skillMention should keep the skill name");
  assert(nodes[0].attrs.displayName === "拆标", "pasted skillMention should keep the display name");
  assert(nodes[0].attrs.path === path, "pasted skillMention should unwrap the angle-bracket path");
  assert(nodes[1]?.type === "text" && nodes[1].text === " 拆一下标", "pasted skill link should keep trailing prose");
}

function preservesPromptRichLinkSerialization(): void {
  assert(
    promptEditorPromptTextRoundTripForTest("[repo](https://github.com/openai/codex)") === "[repo](https://github.com/openai/codex)",
    "richLink nodes should serialize back to prompt markdown",
  );
}

function fakeEditorView(overrides: FakeEditorViewOverrides = {}): FakeEditorView {
  return {
    isDestroyed: false,
    docView: {},
    dom: { isConnected: true },
    domObserver: {
      flush: overrides.flush ?? (() => undefined),
      flushSoon: overrides.flushSoon ?? (() => undefined),
      forceFlush: overrides.forceFlush ?? (() => undefined),
      start: overrides.start ?? (() => undefined),
      stop: overrides.stop ?? (() => undefined),
    },
    update: overrides.update ?? (() => undefined),
    setProps: overrides.setProps ?? (() => undefined),
    updateState: overrides.updateState ?? (() => undefined),
    updateStateInner: overrides.updateStateInner ?? (() => undefined),
    dispatch: overrides.dispatch ?? (() => undefined),
    focus: overrides.focus ?? (() => undefined),
    destroy: overrides.destroy ?? function destroy(this: FakeEditorView): void {
      this.docView = null;
      this.isDestroyed = true;
    },
  } as FakeEditorView;
}

type FakeEditorView = {
  isDestroyed: boolean;
  docView: unknown;
  dom: { isConnected: boolean };
  domObserver: {
    flush: () => void;
    flushSoon: () => void;
    forceFlush: () => void;
    start: () => void;
    stop: () => void;
  };
  update: (props: never) => void;
  setProps: (props: never) => void;
  updateState: (state: never) => void;
  updateStateInner: (state: never, prevProps: never) => void;
  dispatch: (transaction: never) => void;
  focus: () => void;
  destroy: () => void;
};

type FakeEditorViewOverrides = Partial<Omit<FakeEditorView, "domObserver">> & {
  flush?: () => void;
  flushSoon?: () => void;
  forceFlush?: () => void;
  start?: () => void;
  stop?: () => void;
};
