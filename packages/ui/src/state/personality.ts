import type { ThreadContextDefaults } from "./codex-reducer";
import type { CommandPanelEntry, ConfigWriteActionEdit } from "./command-panel";

export type SelectablePersonality = "friendly" | "pragmatic";
export type PersonalityStatus = SelectablePersonality | "none";

const PERSONALITIES: SelectablePersonality[] = ["friendly", "pragmatic"];

export function projectPersonalityCommandEntries(context: ThreadContextDefaults | null): CommandPanelEntry[] {
  const current = personalityFromThreadContext(context);
  const currentModel = typeof context?.model === "string" ? context.model.trim() : "";
  const notApplicable = isPersonalityNotApplicableToModel(currentModel);
  return [
    ...PERSONALITIES.map((personality) => personalityEntry(personality, current)),
    {
      id: "personality:current",
      title: "Current personality",
      kind: "status",
      status: current,
      meta: notApplicable ? "(Does not apply to current model)" : "Default tone for Codex responses",
      details: [
        `personality: ${current}`,
        ...(currentModel ? [`model: ${currentModel}`] : []),
      ],
    },
  ];
}

export function personalityFromThreadContext(context: ThreadContextDefaults | null): PersonalityStatus {
  const value = context?.personality;
  if (value === "friendly" || value === "pragmatic" || value === "none") return value;
  return "friendly";
}

export function personalityConfigEdits(personality: SelectablePersonality): ConfigWriteActionEdit[] {
  return [
    { keyPath: "personality", value: personality, mergeStrategy: "upsert" },
    { keyPath: "model_personality", value: null, mergeStrategy: "replace" },
  ];
}

function personalityEntry(
  personality: SelectablePersonality,
  current: PersonalityStatus,
): CommandPanelEntry {
  const label = personalityLabel(personality);
  const selected = personality === current;
  return {
    id: `personality:${personality}`,
    title: label,
    kind: "status",
    status: selected ? "current" : "select",
    meta: personalityDescription(personality),
    disabled: selected,
    action: selected ? undefined : {
      type: "writeConfig",
      title: "Personality",
      message: `Set personality to ${label}.`,
      edits: personalityConfigEdits(personality),
      reloadUserConfig: true,
      afterWrite: { type: "addPersonalityChangeSyntheticItem", personality },
    },
  };
}

function personalityLabel(personality: SelectablePersonality): string {
  switch (personality) {
    case "friendly":
      return "Friendly";
    case "pragmatic":
      return "Pragmatic";
  }
}

function personalityDescription(personality: SelectablePersonality): string {
  switch (personality) {
    case "friendly":
      return "Warm, collaborative, and helpful";
    case "pragmatic":
      return "Concise, task-focused, and direct";
  }
}

function isPersonalityNotApplicableToModel(model: string): boolean {
  return model === "gpt-5.2" || model.startsWith("gpt-5.1");
}
