import {
  dedupeComposerMentionOptions,
  mentionOptionsFromAgentThreads,
  mentionOptionsFromAppsResponse,
  mentionOptionsFromConfiguredAgentsResponse,
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
  projectsLiveAgentMentionOptionsFromThreads();
  projectsConfiguredAgentMentionOptionsFromConfig();
  dedupesMentionOptionsByKindAndPath();
}

function projectsFileMentionOptionsFromFuzzySearch(): void {
  const options = mentionOptionsFromFuzzyFiles([
    {
      root: "/workspace",
      path: "packages/ui/src/ForgeApp.tsx",
      file_name: "ForgeApp.tsx",
      score: 91,
    },
  ]);

  assertDeepEqual(
    options,
    [{
      kind: "file",
      name: "ForgeApp.tsx",
      path: "/workspace/packages/ui/src/ForgeApp.tsx",
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
          logoUrl: "https://example.test/figma.png",
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
      iconSmall: "https://example.test/figma.png",
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

function projectsLiveAgentMentionOptionsFromThreads(): void {
  const options = mentionOptionsFromAgentThreads(
    [
      {
        id: "root-thread",
        threadSource: "user",
        preview: "Root chat",
      },
      {
        id: "agent-thread-1",
        threadSource: "subagent",
        agentNickname: "@Explorer",
        agentRole: "researcher",
        cwd: "/workspace",
      },
      {
        id: "agent-thread-2",
        threadSource: "subagent",
        agentNickname: "Critic",
        agentRole: "critic",
      },
    ],
    "expl",
  );

  assertDeepEqual(
    options,
    [{
      kind: "agent",
      name: "explorer",
      displayName: "Explorer",
      description: "researcher",
      scopeLabel: "Live agent",
      path: "agent://agent-thread-1",
      detail: "researcher",
    }],
    "subagent threads should become Desktop-style live agent mentions",
  );
}

function projectsConfiguredAgentMentionOptionsFromConfig(): void {
  const options = mentionOptionsFromConfiguredAgentsResponse(
    {
      config: {
        agents: {
          max_threads: 4,
          researcher: {
            description: "Research docs before implementing.",
            config_file: "./agents/researcher.toml",
            nickname_candidates: ["Hypatia"],
          },
          critic: {
            description: "Review changes.",
          },
        },
      },
    },
    "hyp",
    ["critic"],
  );

  assertDeepEqual(
    options,
    [{
      kind: "agent",
      name: "researcher",
      displayName: "researcher",
      description: "Research docs before implementing.",
      scopeLabel: "Custom agent",
      path: "subagent://researcher",
      detail: "Research docs before implementing.",
    }],
    "config/read agents should become Desktop-style configured agent mentions",
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
