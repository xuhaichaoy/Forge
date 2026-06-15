import type { CommandPanelSecondaryAction } from "./command-panel-types";

export function starterSkillContents(skillName: string): string {
  return `---
name: ${skillName}
description: Use when the user asks to try or customize the starter skill workflow.
metadata:
  short-description: Starter skill
---

# Starter Skill

Use this file to capture a focused workflow, domain rule, or repeatable task.

## Workflow

1. Identify when this skill should apply.
2. Follow the project-specific steps here.
3. Verify the result before responding.
`;
}

export function joinFixedPath(root: string, ...parts: string[]): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return [root, ...parts].map((part, index) => {
    if (index === 0) return part.replace(/[\\/]+$/u, "");
    return part.replace(/^[\\/]+|[\\/]+$/gu, "");
  }).filter(Boolean).join(separator);
}

export function skillFileReadAction(skill: {
  displayName: string;
  path: string;
}): CommandPanelSecondaryAction {
  return {
    id: `skill:${skill.path}:read`,
    label: "View",
    title: `View ${skill.displayName} source`,
    action: {
      type: "readSkillFile",
      title: `View ${skill.displayName}`,
      path: skill.path,
    },
  };
}

export function skillConfigToggleAction(skill: {
  name: string;
  displayName: string;
  path: string;
  enabled: boolean;
}): CommandPanelSecondaryAction {
  const nextEnabled = !skill.enabled;
  const label = nextEnabled ? "Enable" : "Disable";
  return {
    id: `skill:${skill.name}:${nextEnabled ? "enable" : "disable"}`,
    label,
    title: `${label} ${skill.displayName}`,
    tone: nextEnabled ? "success" : "danger",
    action: {
      type: "writeSkillConfig",
      title: `${label} ${skill.displayName}`,
      name: skill.name,
      path: skill.path || undefined,
      enabled: nextEnabled,
    },
  };
}

export function skillPromptText(skill: { name: string; path: string; defaultPrompt: string }): string {
  const prompt = skill.defaultPrompt.trim();
  const reference = skillPromptReference(skill.name, skill.path);
  if (!prompt) return ensureTrailingSpace(reference);

  const lowerPrompt = prompt.toLowerCase();
  const lowerName = skill.name.toLowerCase();
  if (lowerPrompt.includes(`[$${lowerName}](`)) return ensureTrailingSpace(prompt);
  if (!skill.path && lowerPrompt.includes(`$${lowerName}`)) return ensureTrailingSpace(prompt);
  return ensureTrailingSpace(`${prompt} ${reference}`);
}

function skillPromptReference(name: string, path: string): string {
  return path ? `[$${name}](${escapePromptPath(path)})` : `$${name}`;
}

export function ensureTrailingSpace(value: string): string {
  return value.endsWith(" ") ? value : `${value} `;
}

export function escapePromptPath(value: string): string {
  if (/[\s()<>]/.test(value)) {
    return `<${value.replace(/\\/g, "\\\\").replace(/>/g, "\\>")}>`;
  }
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

export function skillScopeLabel(scope: string): string {
  switch (scope) {
    case "system":
      return "System";
    case "repo":
      return "Repo";
    case "user":
      return "User";
    case "admin":
      return "Admin";
    default:
      return "";
  }
}
