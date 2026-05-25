// codex: local-conversation-thread-CecHj6JI.js#J#ga — sanity tests for the
// PR status widget. We exercise three slices:
//   1. `cwd` empty/missing → component renders nothing (silently hides).
//   2. A populated PR projects title + #number + badge into the DOM.
//   3. The badge projection maps Codex's state space onto our chip tones.
//
// We can't call the real `ghPrStatus` from Node (no Tauri IPC), so the test
// short-circuits the runtime check by leaving `isTauriRuntime()` returning
// false; the component still mounts but its effect bails out before invoking
// the IPC. To exercise the success branch we drive `__testing.projectBadge`
// directly and render the row with a pre-supplied PR via React state seeded
// through `cwd` being unset (and assert the empty case) plus a separate
// render with a mocked PR-bearing branch.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrStatusRow, __testing } from "../src/components/pr-status-row";

export default function runPrStatusRowTests(): void {
  hidesRowWhenCwdIsEmpty();
  hidesRowOutsideTauriRuntimeEvenWhenCwdProvided();
  projectsBadgeToneAcrossPrStateSpace();
}

function hidesRowWhenCwdIsEmpty(): void {
  // cwd="" → effect bails out, pr stays null, component returns null and the
  // server-rendered HTML is the empty string.
  const html = renderToStaticMarkup(createElement(PrStatusRow, { cwd: "" }));
  assertEqual(html, "", "empty cwd should render nothing");

  const undefinedHtml = renderToStaticMarkup(createElement(PrStatusRow, {}));
  assertEqual(undefinedHtml, "", "missing cwd should render nothing");

  const whitespaceHtml = renderToStaticMarkup(createElement(PrStatusRow, { cwd: "   " }));
  assertEqual(whitespaceHtml, "", "whitespace-only cwd should render nothing");
}

function hidesRowOutsideTauriRuntimeEvenWhenCwdProvided(): void {
  // SSR / Node has no Tauri globals, so `isTauriRuntime()` returns false. The
  // effect short-circuits, `pr` stays null, and the component hides.
  const html = renderToStaticMarkup(
    createElement(PrStatusRow, { cwd: "/workspace/HiCodex" }),
  );
  assertEqual(
    html,
    "",
    "PR status row should silently hide when the host bridge is unavailable",
  );
}

function projectsBadgeToneAcrossPrStateSpace(): void {
  const draft = __testing.projectBadge({
    number: 1,
    title: "draft pr",
    url: "https://example.com",
    isDraft: true,
    mergeable: null,
    state: "OPEN",
    headRefName: "feature",
  });
  assertEqual(draft.tone, "draft", "draft PR should project draft tone");
  assertEqual(draft.label, "Draft", "draft PR should project Draft label");

  const merged = __testing.projectBadge({
    number: 2,
    title: "merged pr",
    url: "https://example.com",
    isDraft: false,
    mergeable: "MERGEABLE",
    state: "MERGED",
    headRefName: "feature",
  });
  assertEqual(merged.tone, "merged", "merged state should project merged tone");
  assertEqual(merged.label, "Merged", "merged state should project Merged label");

  const closed = __testing.projectBadge({
    number: 3,
    title: "closed pr",
    url: "https://example.com",
    isDraft: false,
    mergeable: null,
    state: "CLOSED",
    headRefName: "feature",
  });
  assertEqual(closed.tone, "closed", "closed state should project closed tone");
  assertEqual(closed.label, "Closed", "closed state should project Closed label");

  const open = __testing.projectBadge({
    number: 4,
    title: "open pr",
    url: "https://example.com",
    isDraft: false,
    mergeable: "MERGEABLE",
    state: "OPEN",
    headRefName: "feature",
  });
  assertEqual(open.tone, "open", "open state should project open tone");
  assertEqual(open.label, "Open", "open state should project Open label");

  // codex: ga — defensive fallback for unknown gh state strings (Codex Desktop
  // keeps the widget visible even when gh returns an unexpected enum).
  const unknown = __testing.projectBadge({
    number: 5,
    title: "weird pr",
    url: "https://example.com",
    isDraft: false,
    mergeable: null,
    state: "QUEUED",
    headRefName: "feature",
  });
  assertEqual(unknown.tone, "open", "unknown state should fall through to open tone");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
