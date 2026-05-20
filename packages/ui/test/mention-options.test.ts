import {
  dedupeComposerMentionOptions,
  mentionOptionsFromAppsResponse,
  mentionOptionsFromFuzzyFiles,
  mentionOptionsFromPluginsResponse,
  mentionOptionsFromSkillsResponse,
} from "../src/state/mention-options";

export default function runMentionOptionTests(): void {
  projectsFileMentionOptionsFromFuzzySearch();
  projectsSkillMentionOptionsFromSkillsList();
  projectsAppMentionOptionsFromAppsList();
  projectsPluginMentionOptionsFromPluginList();
  filtersConnectorBackedPluginMentionsWithAppsList();
  dedupesMentionOptionsByKindAndPath();
}

function projectsFileMentionOptionsFromFuzzySearch(): void {
  const options = mentionOptionsFromFuzzyFiles([
    {
      path: "/workspace/packages/ui/src/HiCodexApp.tsx",
      file_name: "HiCodexApp.tsx",
      relativePathWithoutFileName: "packages/ui/src",
      score: 91,
    },
  ]);

  assertDeepEqual(
    options,
    [{
      kind: "file",
      name: "HiCodexApp.tsx",
      path: "/workspace/packages/ui/src/HiCodexApp.tsx",
      detail: "packages/ui/src",
      score: 91,
    }],
    "fuzzy file results should become Desktop-style file mention options",
  );
}

function projectsSkillMentionOptionsFromSkillsList(): void {
  const options = mentionOptionsFromSkillsResponse(
    {
      data: [
        {
          cwd: "/workspace",
          skills: [
            {
              name: "review",
              path: "/workspace/.codex/skills/review/SKILL.md",
              scope: "repo",
              enabled: true,
              interface: {
                displayName: "Review",
                shortDescription: "Review local changes.",
                defaultPrompt: "Review the current diff.",
              },
            },
            {
              name: "docs",
              path: "/workspace/.codex/skills/docs/SKILL.md",
              scope: "repo",
              enabled: false,
              interface: { displayName: "Docs" },
            },
          ],
          errors: [],
        },
      ],
    },
    "rev",
  );

  assertDeepEqual(
    options,
    [{
      kind: "skill",
      name: "review",
      displayName: "Review",
      description: "Review local changes.",
      scopeLabel: "Repo",
      path: "/workspace/.codex/skills/review/SKILL.md",
      detail: "Repo · /workspace/.codex/skills/review/SKILL.md",
      promptText: "Review the current diff. [$review](/workspace/.codex/skills/review/SKILL.md) ",
    }],
    "skills/list results should become selectable skill mention options with default prompt text",
  );

  assertDeepEqual(
    mentionOptionsFromSkillsResponse(
      {
        data: [{
          cwd: "/workspace",
          skills: [{
            name: "docs",
            path: "/workspace/.codex/skills/docs/SKILL.md",
            enabled: false,
            interface: { displayName: "Docs" },
          }],
          errors: [],
        }],
      },
      "docs",
    ),
    [],
    "disabled skills should not become attachable mention options",
  );

  assertDeepEqual(
    mentionOptionsFromSkillsResponse(
      {
        data: [{
          cwd: "/workspace",
          skills: [{
            name: "tender-outline-from-rfp",
            path: "/workspace/.codex/skills/tender-outline-from-rfp/SKILL.md",
            scope: "user",
            enabled: true,
            interface: {
              displayName: "标书解析拆分",
              shortDescription: "通用解析标书/RFP",
              defaultPrompt: "拆出响应文件目录。",
            },
          }],
          errors: [],
        }],
      },
      "标书",
    ),
    [{
      kind: "skill",
      name: "tender-outline-from-rfp",
      displayName: "标书解析拆分",
      description: "通用解析标书/RFP",
      scopeLabel: "User",
      path: "/workspace/.codex/skills/tender-outline-from-rfp/SKILL.md",
      detail: "User · /workspace/.codex/skills/tender-outline-from-rfp/SKILL.md",
      promptText: "拆出响应文件目录。 [$tender-outline-from-rfp](/workspace/.codex/skills/tender-outline-from-rfp/SKILL.md) ",
    }],
    "localized skill display names should be searchable from the inline skill picker",
  );
}

function projectsAppMentionOptionsFromAppsList(): void {
  const options = mentionOptionsFromAppsResponse(
    {
      data: [
        {
          id: "figma",
          name: "figma",
          title: "Figma",
          description: "Design workspace",
          isAccessible: true,
        },
        {
          id: "gmail",
          name: "gmail",
          title: "Gmail",
          isAccessible: false,
        },
      ],
    },
    "fig",
  );

  assertDeepEqual(
    options,
    [{
      kind: "app",
      name: "figma",
      displayName: "Figma",
      description: "Design workspace",
      scopeLabel: "App",
      path: "app://figma",
      detail: "figma",
      promptText: "[$figma](app://figma) ",
    }],
    "app/list results should become selectable app mention options with Desktop prompt links",
  );
}

function projectsPluginMentionOptionsFromPluginList(): void {
  const options = mentionOptionsFromPluginsResponse(
    {
      marketplaces: [
        {
          name: "OpenAI",
          plugins: [
            {
              id: "browser-use",
              name: "browser-use",
              installed: true,
              enabled: true,
              interface: {
                displayName: "Browser Use",
                shortDescription: "Inspect web pages.",
                defaultPrompt: ["Use the browser to inspect this."],
              },
            },
            {
              id: "disabled-plugin",
              name: "Disabled",
              installed: true,
              enabled: false,
            },
          ],
        },
      ],
    },
    "brow",
  );

  assertDeepEqual(
    options,
    [{
      kind: "plugin",
      name: "Browser",
      displayName: "Browser Use",
      description: "Inspect web pages.",
      scopeLabel: "OpenAI",
      path: "plugin://browser-use",
      detail: "OpenAI",
      promptText: "Use the browser to inspect this. [@Browser](plugin://browser-use) ",
    }],
    "plugin/list results should become selectable plugin mention options with Desktop prompt links",
  );
}

function filtersConnectorBackedPluginMentionsWithAppsList(): void {
  const options = mentionOptionsFromPluginsResponse(
    {
      marketplaces: [{
        name: "OpenAI",
        plugins: [{
          id: "gmail",
          name: "gmail",
          installed: true,
          enabled: true,
          interface: { displayName: "Gmail" },
        }],
      }],
    },
    "gmail",
    {
      data: [{
        id: "gmail-app",
        name: "Gmail",
        isAccessible: false,
        isEnabled: false,
        pluginDisplayNames: ["Gmail"],
      }],
    },
  );

  assertDeepEqual(
    options,
    [],
    "plugin mentions should honor imported connector app accessibility when app/list is available",
  );
}

function dedupesMentionOptionsByKindAndPath(): void {
  const options = dedupeComposerMentionOptions([
    { kind: "file", name: "a.ts", path: "/workspace/a.ts" },
    { kind: "file", name: "a.ts", path: "/workspace/a.ts" },
    { kind: "skill", name: "a", path: "/workspace/a.ts" },
    { kind: "app", name: "a", path: "/workspace/a.ts" },
    { kind: "plugin", name: "a", path: "/workspace/a.ts" },
  ]);

  assertDeepEqual(
    options,
    [
      { kind: "file", name: "a.ts", path: "/workspace/a.ts" },
      { kind: "skill", name: "a", path: "/workspace/a.ts" },
      { kind: "app", name: "a", path: "/workspace/a.ts" },
      { kind: "plugin", name: "a", path: "/workspace/a.ts" },
    ],
    "dedupe should preserve distinct mention kinds for the same target path",
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
