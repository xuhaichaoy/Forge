import {
  DESKTOP_PINNED_THREAD_IDS_STORAGE_KEY,
  loadPinnedThreadIds,
  savePinnedThreadIds,
  updatePinnedThreadIds,
} from "../src/state/thread-pins";

export default function runThreadPinsTests(): void {
  persistsPinnedThreadIdsUsingDesktopKey();
  updatesPinnedThreadIdsWithoutDuplicates();
}

function persistsPinnedThreadIdsUsingDesktopKey(): void {
  const storage = new MemoryStorage();
  savePinnedThreadIds(storage, ["thread-a", "thread-b", "thread-a"]);

  assertEqual(
    storage.getItem(DESKTOP_PINNED_THREAD_IDS_STORAGE_KEY),
    JSON.stringify(["thread-a", "thread-b"]),
    "pinned thread ids should persist under Desktop's pinned-thread-ids key",
  );
  assertDeepEqual(
    [...loadPinnedThreadIds(storage)],
    ["thread-a", "thread-b"],
    "pinned thread ids should load in stored order",
  );
}

function updatesPinnedThreadIdsWithoutDuplicates(): void {
  const current = new Set(["thread-a", "thread-b"]);
  const pinned = updatePinnedThreadIds(current, "thread-a", true);
  assertDeepEqual([...pinned], ["thread-a", "thread-b"], "repinning an existing id should keep the stored order");

  const unpinned = updatePinnedThreadIds(pinned, "thread-b", false);
  assertDeepEqual([...unpinned], ["thread-a"], "unpin should remove the id");
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
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
