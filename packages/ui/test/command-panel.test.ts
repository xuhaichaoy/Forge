import {
  createCommandPanelState,
  projectCommandPanelEntries,
  projectMcpServerEntries,
  projectPluginEntries,
} from "../src/state/command-panel";

type CommandPanelEntry = {
  id: string;
  title: string;
  kind: string;
  status?: string;
  meta?: string;
  details?: string[];
};

export default function runCommandPanelTests(): void {
  projectsMcpServerNamesToolsAndAuthStatus();
  projectsSkillsHooksAppsAndPluginsAsCommandEntries();
  flattensPluginListMarketplaces();
  createsEmptyLoadingAndErrorPanelStates();
  keepsDetailsHumanReadableWithoutRawJson();
}

function projectsMcpServerNamesToolsAndAuthStatus(): void {
  const entries: CommandPanelEntry[] = projectMcpServerEntries({
    data: [
      {
        name: "github",
        tools: {
          list_prs: { description: "List pull requests" },
          get_issue: { description: "Read issue details" },
        },
        authStatus: "authenticated",
      },
      {
        name: "filesystem",
        tools: {
          read_file: {},
        },
        auth: { status: "unauthenticated" },
      },
      {
        name: "memory",
        tools: {},
        authMode: "oauth",
      },
    ],
  });

  assertDeepEqual(
    entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      status: entry.status,
      meta: entry.meta,
      details: entry.details,
    })),
    [
      {
        id: "mcp:github",
        title: "github",
        kind: "mcpServer",
        status: "authenticated",
        meta: "2 tools",
        details: ["list_prs - List pull requests", "get_issue - Read issue details"],
      },
      {
        id: "mcp:filesystem",
        title: "filesystem",
        kind: "mcpServer",
        status: "unauthenticated",
        meta: "1 tool",
        details: ["read_file"],
      },
      {
        id: "mcp:memory",
        title: "memory",
        kind: "mcpServer",
        status: "oauth",
        meta: "No tools",
        details: [],
      },
    ],
    "MCP server projection should expose server names, tool counts, tool details, and auth status",
  );
}

function projectsSkillsHooksAppsAndPluginsAsCommandEntries(): void {
  const entries: CommandPanelEntry[] = projectCommandPanelEntries({
    skills: {
      data: [
        { name: "code-review", path: "/Users/example/.codex/skills/code-review/SKILL.md" },
        { name: "imagegen", path: "/Users/example/.codex/skills/imagegen/SKILL.md" },
      ],
    },
    hooks: {
      data: [
        { key: "pre-command", eventName: "PreCommand" },
        { key: "post-response", eventName: "PostResponse" },
      ],
    },
    apps: {
      data: [
        { name: "figma", title: "Figma" },
        { name: "gmail", title: "Gmail" },
      ],
    },
    plugins: {
      marketplaces: [
        {
          name: "OpenAI",
          plugins: [
            { id: "browser-use", name: "Browser Use" },
            { id: "computer-use", name: "Computer Use" },
          ],
        },
      ],
    },
  });

  assertDeepEqual(
    entries.map((entry) => ({ id: entry.id, title: entry.title, kind: entry.kind, meta: entry.meta })),
    [
      {
        id: "skill:code-review",
        title: "code-review",
        kind: "skill",
        meta: "/Users/example/.codex/skills/code-review/SKILL.md",
      },
      {
        id: "skill:imagegen",
        title: "imagegen",
        kind: "skill",
        meta: "/Users/example/.codex/skills/imagegen/SKILL.md",
      },
      { id: "hook:pre-command", title: "pre-command", kind: "hook", meta: "PreCommand" },
      { id: "hook:post-response", title: "post-response", kind: "hook", meta: "PostResponse" },
      { id: "app:figma", title: "Figma", kind: "app", meta: "figma" },
      { id: "app:gmail", title: "Gmail", kind: "app", meta: "gmail" },
      { id: "plugin:browser-use", title: "Browser Use", kind: "plugin", meta: "OpenAI" },
      { id: "plugin:computer-use", title: "Computer Use", kind: "plugin", meta: "OpenAI" },
    ],
    "command panel projection should combine skills, hooks, apps, and plugins in stable command order",
  );
}

function flattensPluginListMarketplaces(): void {
  const entries: CommandPanelEntry[] = projectPluginEntries({
    marketplaces: [
      {
        name: "OpenAI",
        plugins: [
          { id: "browser-use", name: "Browser Use" },
          { id: "documents", name: "Documents" },
        ],
      },
      {
        name: "Local",
        plugins: [
          { id: "custom-workflow", name: "Custom Workflow" },
        ],
      },
      {
        name: "Empty marketplace",
        plugins: [],
      },
    ],
  });

  assertDeepEqual(
    entries.map((entry) => ({ id: entry.id, title: entry.title, kind: entry.kind, meta: entry.meta })),
    [
      { id: "plugin:browser-use", title: "Browser Use", kind: "plugin", meta: "OpenAI" },
      { id: "plugin:documents", title: "Documents", kind: "plugin", meta: "OpenAI" },
      { id: "plugin:custom-workflow", title: "Custom Workflow", kind: "plugin", meta: "Local" },
    ],
    "plugin/list projection should flatten marketplaces[].plugins and keep marketplace names as metadata",
  );
}

function createsEmptyLoadingAndErrorPanelStates(): void {
  assertDeepEqual(
    createCommandPanelState("mcp", { status: "loading", entries: [] }),
    {
      panel: "mcp",
      status: "loading",
      title: "MCP servers",
      entries: [],
      message: "Loading MCP servers...",
    },
    "loading panel state should preserve panel identity and expose a loading message",
  );

  assertDeepEqual(
    createCommandPanelState("plugins", { status: "ready", entries: [] }),
    {
      panel: "plugins",
      status: "empty",
      title: "Plugins",
      entries: [],
      message: "No plugins found.",
    },
    "ready panel state with no entries should become empty",
  );

  assertDeepEqual(
    createCommandPanelState("skills", {
      status: "error",
      entries: [],
      error: "skills/list failed",
    }),
    {
      panel: "skills",
      status: "error",
      title: "Skills",
      entries: [],
      message: "skills/list failed",
    },
    "error panel state should surface the request error without dropping panel context",
  );
}

function keepsDetailsHumanReadableWithoutRawJson(): void {
  const entries: CommandPanelEntry[] = projectCommandPanelEntries({
    mcp: {
      data: [
        {
          name: "github",
          tools: {
            list_prs: {
              description: "List pull requests",
              inputSchema: {
                type: "object",
                properties: {
                  token: { type: "string" },
                },
              },
            },
          },
          auth: {
            status: "authenticated",
            raw: {
              access_token: "secret-token",
            },
          },
        },
      ],
    },
    skills: {
      data: [
        {
          name: "planner",
          path: "/skills/planner/SKILL.md",
          raw: { nested: { should: "not render as JSON" } },
        },
      ],
    },
    hooks: {
      data: [
        {
          key: "pre-command",
          eventName: "PreCommand",
          config: { command: "npm test" },
        },
      ],
    },
    apps: {
      data: [
        {
          name: "gmail",
          title: "Gmail",
          auth: { token: "secret-token" },
        },
      ],
    },
    plugins: {
      marketplaces: [
        {
          name: "OpenAI",
          plugins: [
            {
              id: "browser-use",
              name: "Browser Use",
              manifest: { permissions: ["browser"] },
            },
          ],
        },
      ],
    },
  });

  const renderedText = collectEntryText(entries);

  assertIncludes(renderedText, "github", "human-readable MCP server name should remain visible");
  assertIncludes(renderedText, "list_prs - List pull requests", "human-readable MCP tool details should remain visible");
  assertIncludes(renderedText, "planner", "human-readable skill name should remain visible");
  assertNotIncludes(renderedText, "{\"", "entry detail text should not contain raw JSON object strings");
  assertNotIncludes(renderedText, "\":", "entry detail text should not contain JSON key/value separators");
  assertNotIncludes(renderedText, "secret-token", "entry detail text should not leak raw auth payload values");
}

function collectEntryText(entries: Array<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const entry of entries) {
    for (const value of Object.values(entry)) {
      if (typeof value === "string") {
        parts.push(value);
      } else if (Array.isArray(value)) {
        parts.push(...value.filter((item): item is string => typeof item === "string"));
      }
    }
  }
  return parts.join("\n");
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(actual: string, expected: string, message: string): void {
  if (actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} not to include ${JSON.stringify(expected)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
