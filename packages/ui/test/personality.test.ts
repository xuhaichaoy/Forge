import {
  personalityConfigEdits,
  personalityFromThreadContext,
  projectPersonalityCommandEntries,
} from "../src/state/personality";

export default function runPersonalityTests(): void {
  defaultsToDesktopFriendlyPersonality();
  projectsDesktopPersonalityOptions();
  writesDesktopPersonalityConfigShape();
}

function defaultsToDesktopFriendlyPersonality(): void {
  assertEqual(personalityFromThreadContext(null), "friendly", "missing config should default to Desktop's friendly personality");
  assertEqual(
    personalityFromThreadContext({ personality: "none" }),
    "none",
    "explicit none should remain visible as the current resolved personality",
  );
}

function projectsDesktopPersonalityOptions(): void {
  const entries = projectPersonalityCommandEntries({
    personality: "friendly",
    model: "gpt-5.2",
  });

  assertDeepEqual(
    entries.map((entry) => ({ id: entry.id, title: entry.title, status: entry.status, meta: entry.meta, disabled: entry.disabled === true })),
    [
      {
        id: "personality:friendly",
        title: "Friendly",
        status: "current",
        meta: "Warm, collaborative, and helpful",
        disabled: true,
      },
      {
        id: "personality:pragmatic",
        title: "Pragmatic",
        status: "select",
        meta: "Concise, task-focused, and direct",
        disabled: false,
      },
      {
        id: "personality:current",
        title: "Current personality",
        status: "friendly",
        meta: "(Does not apply to current model)",
        disabled: false,
      },
    ],
    "personality panel should show Desktop slash command options and current model suffix",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "personality:pragmatic")?.action,
    {
      type: "writeConfig",
      title: "Personality",
      message: "Set personality to Pragmatic.",
      edits: personalityConfigEdits("pragmatic"),
      reloadUserConfig: true,
      afterWrite: { type: "addPersonalityChangeSyntheticItem", personality: "pragmatic" },
    },
    "selectable personality rows should write Codex config and request the Desktop synthetic transcript event",
  );
}

function writesDesktopPersonalityConfigShape(): void {
  assertDeepEqual(
    personalityConfigEdits("friendly"),
    [
      { keyPath: "personality", value: "friendly", mergeStrategy: "upsert" },
      { keyPath: "model_personality", value: null, mergeStrategy: "replace" },
    ],
    "personality selection should upsert personality and clear Desktop's legacy model_personality key",
  );
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
