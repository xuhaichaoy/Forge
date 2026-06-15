/*
 * Skill entry projection: skills/list entries, recommended skills, skill
 * file-read results, and the starter-skill creator target. Moved verbatim
 * out of state/command-panel.ts.
 */
import { isAbsolutePath } from "./command-panel-file-search";
import {
  booleanField,
  cleanSecondaryActions,
  firstLine,
  inferNameFromPath,
  recordField,
} from "./command-panel-value-utils";
import {
  arrayField,
  cleanList,
  fieldText,
  isRecord,
  responseItems,
  textDetails,
} from "./command-panel-entry-fields";
import {
  joinFixedPath,
  skillConfigToggleAction,
  skillFileReadAction,
  skillPromptText,
  skillScopeLabel,
  starterSkillContents,
} from "./command-panel-skill-helpers";
import type { CommandPanelEntry } from "./command-panel-types";

const STARTER_SKILL_NAME = "starter-skill";

export function projectSkillManagementEntries(
  skills: unknown,
  options: {
    recommendedSkills?: unknown;
    workspace?: string;
  } = {},
): CommandPanelEntry[] {
  return [
    ...projectSkillEntries(skills),
    ...projectRecommendedSkillEntries(options.recommendedSkills, {
      existingSkills: skills,
    }),
    skillCreatorEntry(options.workspace),
  ];
}

export function projectSkillFileReadResultEntries(path: string, contents: string): CommandPanelEntry[] {
  return [{
    id: `skill-file:${path}`,
    title: inferNameFromPath(path),
    kind: "status",
    status: "read",
    meta: path,
    details: textDetails(contents),
  }];
}

export function projectPluginSkillReadResultEntries(
  skillName: string,
  source: string,
  contents: string | null | undefined,
): CommandPanelEntry[] {
  return [{
    id: `plugin-skill-file:${source}:${skillName}`,
    title: skillName || "Plugin skill",
    kind: "status",
    status: contents ? "read" : "empty",
    meta: source,
    details: contents ? textDetails(contents) : ["plugin/skill/read returned no source contents."],
  }];
}

export function projectSkillEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).flatMap((item) => {
    if (Array.isArray(item.skills)) {
      const cwd = fieldText(item, "cwd");
      return [
        ...arrayField(item, "skills").map((skill) => skillEntry(skill, cwd)),
        ...arrayField(item, "errors").map((error) => skillErrorEntry(error, cwd)),
      ];
    }
    return [skillEntry(item)];
  });
}

function skillEntry(skill: Record<string, unknown>, cwd = ""): CommandPanelEntry {
  const name = fieldText(skill, "name") || fieldText(skill, "path") || "skill";
  const interfaceInfo = recordField(skill, "interface");
  const displayName = fieldText(interfaceInfo, "displayName") || name;
  const path = fieldText(skill, "path");
  const scope = fieldText(skill, "scope");
  const defaultPrompt = fieldText(interfaceInfo, "defaultPrompt");
  /*
   * SkillInterface 字段提取（iconSmall / brandColor）— 透传到 attachSkill action。
   * 字段来自 `skills/list` RPC 响应（packages/codex-protocol/src/generated/v2/SkillInterface.ts）。
   */
  const iconSmall = fieldText(interfaceInfo, "iconSmall") || null;
  const brandColor = fieldText(interfaceInfo, "brandColor") || null;
  const dependencies = arrayField(recordField(skill, "dependencies"), "tools")
    .map(skillDependencyLabel)
    .filter(Boolean);
  const hasEnabled = Object.prototype.hasOwnProperty.call(skill, "enabled");
  const enabled = booleanField(skill, "enabled");
  const secondaryActions = cleanSecondaryActions([
    path ? skillFileReadAction({ displayName, path }) : undefined,
    hasEnabled ? skillConfigToggleAction({ name, displayName, path, enabled }) : undefined,
  ]);
  return {
    id: `skill:${name}`,
    title: displayName,
    kind: "skill",
    status: hasEnabled ? enabled ? "enabled" : "disabled" : undefined,
    meta: cleanList([skillScopeLabel(scope), path || cwd]).join(" · ") || undefined,
    details: cleanList([
      fieldText(interfaceInfo, "shortDescription")
        || fieldText(skill, "shortDescription")
        || fieldText(skill, "description"),
      defaultPrompt && `Default prompt: ${firstLine(defaultPrompt)}`,
      dependencies.length > 0 && `Tools: ${dependencies.join(", ")}`,
      path && `Path: ${path}`,
      cwd && `CWD: ${cwd}`,
    ]),
    disabled: hasEnabled && !enabled ? true : undefined,
    action: path
      ? {
          type: "attachSkill",
          name,
          path,
          promptText: skillPromptText({ name, path, defaultPrompt }),
          // 仅在有值时透传，避免无关字段污染 action 对象（测试 fixture 保持简洁）
          ...(iconSmall ? { iconSmall } : {}),
          ...(brandColor ? { brandColor } : {}),
        }
      : undefined,
    secondaryActions: secondaryActions.length > 0 ? secondaryActions : undefined,
  };
}

export function projectRecommendedSkillEntries(
  value: unknown,
  options: {
    existingSkills?: unknown;
  } = {},
): CommandPanelEntry[] {
  const existing = skillIdentityKeys(options.existingSkills);
  return pluginDetails(value).flatMap((plugin, pluginIndex) => {
    const summary = recordField(plugin, "summary");
    const marketplaceName = fieldText(plugin, "marketplaceName") || fieldText(plugin, "remoteMarketplaceName");
    const marketplacePath = fieldText(plugin, "marketplacePath") || null;
    const pluginId = fieldText(summary, "id")
      || fieldText(summary, "remotePluginId")
      || fieldText(summary, "name")
      || `plugin-${pluginIndex + 1}`;
    const remotePluginId = fieldText(summary, "remotePluginId") || pluginId;
    const pluginName = fieldText(summary, "name") || pluginId;
    const interfaceInfo = recordField(summary, "interface");
    const pluginTitle = fieldText(interfaceInfo, "displayName") || pluginName;
    const installed = booleanField(summary, "installed");
    const availability = fieldText(summary, "availability");
    const installPolicy = fieldText(summary, "installPolicy");
    const canInstall = !installed
      && availability !== "DISABLED_BY_ADMIN"
      && installPolicy !== "NOT_AVAILABLE"
      && Boolean(marketplacePath || marketplaceName);
    return arrayField(plugin, "skills")
      .map((skill, skillIndex) => recommendedSkillEntry({
        canInstall,
        existing,
        installed,
        marketplaceName,
        marketplacePath,
        pluginId,
        pluginName,
        pluginTitle,
        remotePluginId,
        skill,
        skillIndex,
      }))
      .filter((entry): entry is CommandPanelEntry => entry !== null);
  });
}

function recommendedSkillEntry({
  canInstall,
  existing,
  installed,
  marketplaceName,
  marketplacePath,
  pluginId,
  pluginName,
  pluginTitle,
  remotePluginId,
  skill,
  skillIndex,
}: {
  canInstall: boolean;
  existing: Set<string>;
  installed: boolean;
  marketplaceName: string;
  marketplacePath: string | null;
  pluginId: string;
  pluginName: string;
  pluginTitle: string;
  remotePluginId: string;
  skill: Record<string, unknown>;
  skillIndex: number;
}): CommandPanelEntry | null {
  const name = fieldText(skill, "name") || `skill-${skillIndex + 1}`;
  const path = fieldText(skill, "path");
  if (existing.has(`name:${name.toLowerCase()}`) || (path && existing.has(`path:${path}`))) return null;

  const interfaceInfo = recordField(skill, "interface");
  const displayName = fieldText(interfaceInfo, "displayName") || name;
  const defaultPrompt = fieldText(interfaceInfo, "defaultPrompt");
  const enabled = !Object.prototype.hasOwnProperty.call(skill, "enabled") || booleanField(skill, "enabled");
  const remoteReadable = marketplaceName && remotePluginId && name;
  const secondaryActions = cleanSecondaryActions([
    path ? skillFileReadAction({ displayName, path }) : undefined,
    !path && remoteReadable ? {
      id: `recommended-skill:${pluginId}:${name}:read`,
      label: "View",
      title: `View ${displayName} source`,
      action: {
        type: "readPluginSkill" as const,
        title: `View ${displayName}`,
        remoteMarketplaceName: marketplaceName,
        remotePluginId,
        skillName: name,
      },
    } : undefined,
    path && Object.prototype.hasOwnProperty.call(skill, "enabled")
      ? skillConfigToggleAction({ name, displayName, path, enabled })
      : undefined,
    canInstall ? {
      id: `recommended-skill:${pluginId}:${name}:install`,
      label: "Install plugin",
      title: `Install ${pluginTitle}`,
      tone: "success" as const,
      action: {
        type: "installPlugin" as const,
        title: `Install ${pluginTitle}`,
        pluginId,
        pluginName,
        marketplaceName,
        marketplacePath,
        remotePluginId,
      },
    } : undefined,
  ]);

  return {
    id: `recommended-skill:${pluginId}:${name}`,
    title: displayName,
    kind: "skill",
    status: path ? enabled ? "available" : "disabled" : installed ? "plugin skill" : "install plugin",
    meta: `Recommended Skills · ${pluginTitle}`,
    details: cleanList([
      fieldText(interfaceInfo, "shortDescription")
        || fieldText(skill, "shortDescription")
        || fieldText(skill, "description"),
      defaultPrompt && `Default prompt: ${firstLine(defaultPrompt)}`,
      `Plugin: ${pluginTitle}`,
      path ? `Path: ${path}` : "Source: plugin/skill/read",
      !installed && "Install the plugin to materialize this skill locally.",
    ]),
    disabled: path && enabled ? undefined : true,
    action: path && enabled
      ? (() => {
          const recommendedIconSmall = fieldText(interfaceInfo, "iconSmall");
          const recommendedBrandColor = fieldText(interfaceInfo, "brandColor");
          return {
            type: "attachSkill" as const,
            name,
            path,
            promptText: skillPromptText({ name, path, defaultPrompt }),
            ...(recommendedIconSmall ? { iconSmall: recommendedIconSmall } : {}),
            ...(recommendedBrandColor ? { brandColor: recommendedBrandColor } : {}),
          };
        })()
      : undefined,
    secondaryActions: secondaryActions.length > 0 ? secondaryActions : undefined,
  };
}

function skillCreatorEntry(workspace: string | undefined): CommandPanelEntry {
  const target = starterSkillTarget(workspace);
  return {
    id: "skill-creator:local-helper",
    title: "Skill creator",
    kind: "skill",
    status: target ? "starter available" : "workspace required",
    meta: "Recommended Skills · available boundary",
    details: cleanList([
      "No app-server creator RPC is exposed; this creates a starter SKILL.md through fs/createDirectory and fs/writeFile.",
      target ? `Directory: ${target.directoryPath}` : "Open an absolute workspace folder before creating a starter skill.",
      target ? `File: ${target.filePath}` : undefined,
    ]),
    disabled: target ? undefined : true,
    secondaryActions: target ? [{
      id: "skill-creator:create-starter",
      label: "Create",
      title: "Create starter skill",
      tone: "success",
      action: {
        type: "createStarterSkill",
        title: "Create starter skill",
        ...target,
      },
    }] : undefined,
  };
}

export interface StarterSkillTarget {
  skillName: string;
  directoryPath: string;
  filePath: string;
  contents: string;
}

export function starterSkillTarget(workspace: string | undefined): StarterSkillTarget | null {
  const root = workspace?.trim().replace(/[\\/]+$/u, "") ?? "";
  if (!isAbsolutePath(root)) return null;
  const directoryPath = joinFixedPath(root, ".codex", "skills", STARTER_SKILL_NAME);
  return {
    skillName: STARTER_SKILL_NAME,
    directoryPath,
    filePath: joinFixedPath(directoryPath, "SKILL.md"),
    contents: starterSkillContents(STARTER_SKILL_NAME),
  };
}

function skillDependencyLabel(dependency: Record<string, unknown>): string {
  const value = fieldText(dependency, "value") || fieldText(dependency, "type");
  const transport = fieldText(dependency, "transport");
  const command = fieldText(dependency, "command");
  const url = fieldText(dependency, "url");
  const detail = cleanList([
    transport,
    command && `cmd: ${command}`,
    url,
  ]).join(" · ");
  return detail ? `${value} (${detail})` : value;
}

function skillErrorEntry(error: Record<string, unknown>, cwd = ""): CommandPanelEntry {
  const path = fieldText(error, "path");
  return {
    id: `skill-error:${path || cwd || "unknown"}`,
    title: path ? inferNameFromPath(path) : "Skill load error",
    kind: "skill",
    status: "error",
    meta: path || cwd || undefined,
    details: cleanList([fieldText(error, "message")]),
    disabled: true,
  };
}

function pluginDetails(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(pluginDetails);
  if (!isRecord(value)) return [];
  if (isRecord(value.plugin)) return [value.plugin];
  const direct = arrayField(value, "plugins");
  if (direct.length > 0) return direct;
  const details = arrayField(value, "pluginDetails");
  if (details.length > 0) return details.flatMap(pluginDetails);
  return [];
}

function skillIdentityKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  for (const item of responseItems(value)) {
    const skills = Array.isArray(item.skills) ? arrayField(item, "skills") : [item];
    for (const skill of skills) {
      const name = fieldText(skill, "name");
      const path = fieldText(skill, "path");
      if (name) keys.add(`name:${name.toLowerCase()}`);
      if (path) keys.add(`path:${path}`);
    }
  }
  return keys;
}
