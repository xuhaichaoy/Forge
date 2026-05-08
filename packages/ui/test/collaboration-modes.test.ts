import {
  applyCollaborationModeMask,
  baseCollaborationMode,
  composerModeFromCollaborationMode,
  collaborationModeFromComposerMode,
  hasCollaborationModePreset,
} from "../src/state/collaboration-modes";

export default function runCollaborationModesTests(): void {
  appliesMasksUsingServerPresetSemantics();
  projectsComposerPlanModeFromServerPresets();
  mapsLatestCollaborationModeBackToComposerMode();
}

function appliesMasksUsingServerPresetSemantics(): void {
  const current = baseCollaborationMode({
    model: "gpt-5.2",
    developerInstructions: "custom developer instructions",
    reasoningEffort: "high",
  });
  const updated = applyCollaborationModeMask(current, {
    name: "Plan",
    mode: "plan",
    model: null,
    reasoning_effort: "medium",
  });

  assertDeepEqual(
    updated,
    {
      mode: "plan",
      settings: {
        model: "gpt-5.2",
        reasoning_effort: "medium",
        developer_instructions: null,
      },
    },
    "plan preset should preserve model, override reasoning effort, and let app-server fill built-in instructions",
  );
}

function projectsComposerPlanModeFromServerPresets(): void {
  const presets = [
    { name: "Plan", mode: "plan", model: null, reasoning_effort: "medium" },
    { name: "Default", mode: "default", model: null, reasoning_effort: null },
  ] as const;

  assertEqual(hasCollaborationModePreset([...presets], "plan"), true, "plan preset should be detected");
  assertDeepEqual(
    collaborationModeFromComposerMode("plan", [...presets], { model: "gpt-5.4", reasoningEffort: "high" }),
    {
      mode: "plan",
      settings: {
        model: "gpt-5.4",
        reasoning_effort: "medium",
        developer_instructions: null,
      },
    },
    "composer plan mode should be built from collaborationMode/list preset",
  );
  assertEqual(
    collaborationModeFromComposerMode("default", [...presets], { model: "gpt-5.4" }),
    null,
    "default composer mode should not send a collaborationMode override",
  );
}

function mapsLatestCollaborationModeBackToComposerMode(): void {
  assertEqual(
    composerModeFromCollaborationMode(null),
    "default",
    "missing latest collaboration mode should use the default composer mode",
  );
  assertEqual(
    composerModeFromCollaborationMode({
      mode: "plan",
      settings: {
        model: "gpt-5.4",
        reasoning_effort: "medium",
        developer_instructions: null,
      },
    }),
    "plan",
    "latest plan collaboration mode should restore the plan composer indicator",
  );
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
