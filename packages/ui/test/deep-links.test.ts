import { threadIdFromCodexDeepLink } from "../src/state/deep-links";

export default function runDeepLinksTests(): void {
  parsesThreadDeepLinks();
}

function parsesThreadDeepLinks(): void {
  assertEqual(threadIdFromCodexDeepLink("codex://threads/thread-123"), "thread-123", "threads host link");
  assertEqual(threadIdFromCodexDeepLink("codex://thread/thread-123"), "thread-123", "thread host link");
  assertEqual(threadIdFromCodexDeepLink("codex://local/thread-123"), "thread-123", "local host link");
  assertEqual(threadIdFromCodexDeepLink("codex:///threads/thread%20123"), "thread 123", "path-style threads link");
  assertEqual(threadIdFromCodexDeepLink("https://example.com/threads/thread-123"), null, "non-codex scheme");
  assertEqual(threadIdFromCodexDeepLink("codex://settings"), null, "unsupported codex path");
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
