import {
  assertDuplicateContentHash,
  yuxiSameNameCount,
} from "../src/components/kb-library-upload-actions";

export default function runKbLibraryUploadActionsTests(): void {
  countsSameNameUploadMetadata();
  requiresContentHashForDuplicates();
}

function countsSameNameUploadMetadata(): void {
  assertEqual(
    yuxiSameNameCount({ same_name_files: [{ id: 1 }, { id: 2 }], has_same_name: true }),
    2,
    "same_name_files should provide the duplicate count",
  );
  assertEqual(
    yuxiSameNameCount({ has_same_name: true }),
    1,
    "has_same_name should fall back to one duplicate when file list is absent",
  );
  assertEqual(
    yuxiSameNameCount({ has_same_name: false }),
    0,
    "missing duplicate metadata should count as zero",
  );
}

function requiresContentHashForDuplicates(): void {
  assertDuplicateContentHash(0, "", "missing hash");
  assertDuplicateContentHash(2, "hash-a", "missing hash");
  assertThrows(
    () => assertDuplicateContentHash(1, "", "missing hash"),
    "missing hash",
    "duplicates without content hash should fail",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

function assertThrows(action: () => unknown, expectedMessagePart: string, message: string): void {
  try {
    action();
  } catch (err) {
    const actual = err instanceof Error ? err.message : String(err);
    if (actual.includes(expectedMessagePart)) return;
    throw new Error(`Assertion failed: ${message}\n  expected error containing: ${expectedMessagePart}\n  actual: ${actual}`);
  }
  throw new Error(`Assertion failed: ${message}\n  expected action to throw`);
}
