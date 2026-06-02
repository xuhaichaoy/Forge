import {
  buildTrustAllHooksEdits,
  deriveHooksSettingsFocus,
  filterHooksListResponseForFocus,
  hookReviewProjectRoot,
  isHookNeedingReview,
  projectHooksNeedingReview,
} from "../src/state/hooks-review";

export default function runHooksReviewTests(): void {
  filtersUntrustedAndModifiedHooksForBanner();
  doesNotReviewHooksForAnotherCwd();
  doesNotReviewHooksForWhitespaceOnlyCwdMatch();
  doesNotReviewHooksForRootOrHomeCwd();
  derivesSettingsFocusForProjectPluginAndMixedHooks();
  filtersHooksSettingsListForFocus();
  buildsDesktopConfigBatchWriteEdit();
}

function filtersUntrustedAndModifiedHooksForBanner(): void {
  assertEqual(isHookNeedingReview({ trustStatus: "untrusted" } as never), true, "untrusted hook should need review");
  assertEqual(isHookNeedingReview({ trustStatus: "modified" } as never), true, "modified hook should need review");
  assertEqual(isHookNeedingReview({ trustStatus: "trusted" } as never), false, "trusted hook should not need review");
  const snapshot = projectHooksNeedingReview({
    data: [{
      cwd: "/repo",
      hooks: [
        hook("one", "hash-1", "untrusted"),
        hook("two", "hash-2", "modified"),
        hook("three", "hash-3", "trusted"),
        hook("managed", "hash-4", "managed"),
      ],
    }],
  }, "/repo");

  assertEqual(snapshot?.cwd, "/repo", "snapshot should carry cwd from hooks/list");
  assertEqual(snapshot?.count, 2, "only untrusted and modified hooks should be counted");
  assertDeepEqual(snapshot?.hooks, [
    { key: "one", currentHash: "hash-1", source: "project", pluginId: null },
    { key: "two", currentHash: "hash-2", source: "project", pluginId: null },
  ], "snapshot should preserve trust update fields");
  assertDeepEqual(snapshot?.focus, {
    source: "project",
    projectRoot: "/repo",
  }, "snapshot should focus Review hooks on the matching Desktop project source");
}

function doesNotReviewHooksForAnotherCwd(): void {
  const snapshot = projectHooksNeedingReview({
    data: [{
      cwd: "/other-repo",
      hooks: [
        hook("other", "hash-1", "untrusted"),
      ],
    }],
  }, "/repo");

  assertEqual(snapshot, null, "hooks review should require Desktop's exact cwd match");
}

function doesNotReviewHooksForWhitespaceOnlyCwdMatch(): void {
  const snapshot = projectHooksNeedingReview({
    data: [{
      cwd: "/repo ",
      hooks: [
        hook("drift", "hash-1", "untrusted"),
      ],
    }],
  }, "/repo");

  assertEqual(snapshot, null, "hooks review should not fall back to trimmed cwd equality");
}

function doesNotReviewHooksForRootOrHomeCwd(): void {
  assertEqual(hookReviewProjectRoot("/"), null, "root cwd should not produce a hook review project root");
  assertEqual(hookReviewProjectRoot("~"), null, "home shortcut cwd should not produce a hook review project root");
  assertEqual(projectHooksNeedingReview({
    data: [{ cwd: "/", hooks: [hook("root", "hash-1", "untrusted")] }],
  }, "/"), null, "hook review banner should be suppressed for root cwd");
}

function derivesSettingsFocusForProjectPluginAndMixedHooks(): void {
  assertDeepEqual(deriveHooksSettingsFocus([
    { key: "one", currentHash: "hash-1", source: "project", pluginId: null },
  ], "/repo"), {
    source: "project",
    projectRoot: "/repo",
  }, "project hooks should focus the project source and root");
  assertDeepEqual(deriveHooksSettingsFocus([
    { key: "one", currentHash: "hash-1", source: "plugin", pluginId: "plugin-a" },
    { key: "two", currentHash: "hash-2", source: "plugin", pluginId: "plugin-a" },
  ], "/repo"), {
    source: "plugin",
    pluginId: "plugin-a",
  }, "single-plugin hooks should focus the plugin section");
  assertDeepEqual(deriveHooksSettingsFocus([
    { key: "one", currentHash: "hash-1", source: "user", pluginId: null },
  ], "/repo"), {
    source: "user",
  }, "single non-project source should focus that source");
  assertEqual(deriveHooksSettingsFocus([
    { key: "one", currentHash: "hash-1", source: "project", pluginId: null },
    { key: "two", currentHash: "hash-2", source: "user", pluginId: null },
  ], "/repo"), null, "mixed hook sources should fall back to the host-level hooks list");
}

function filtersHooksSettingsListForFocus(): void {
  const response = {
    data: [{
      cwd: "/repo",
      hooks: [
        hook("project", "hash-1", "untrusted", "project"),
        hook("plugin-a", "hash-2", "untrusted", "plugin", "plugin-a"),
        hook("plugin-b", "hash-3", "untrusted", "plugin", "plugin-b"),
      ],
    }],
  };

  assertDeepEqual(filterHooksListResponseForFocus(response, {
    source: "plugin",
    pluginId: "plugin-a",
  }), {
    data: [{
      cwd: "/repo",
      hooks: [hook("plugin-a", "hash-2", "untrusted", "plugin", "plugin-a")],
    }],
  }, "settings focus should filter hooks to the target plugin");
}

function buildsDesktopConfigBatchWriteEdit(): void {
  assertDeepEqual(buildTrustAllHooksEdits([
    { key: "one", currentHash: "hash-1" },
    { key: "two", currentHash: "hash-2" },
  ]), [{
    keyPath: "hooks.state",
    value: {
      one: { trusted_hash: "hash-1" },
      two: { trusted_hash: "hash-2" },
    },
    mergeStrategy: "upsert",
  }], "Trust all should upsert hooks.state trusted_hash entries");
}

function hook(
  key: string,
  currentHash: string,
  trustStatus: string,
  source = "project",
  pluginId: string | null = null,
) {
  return { key, currentHash, trustStatus, source, pluginId };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
