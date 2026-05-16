import {
  createCommandPanelState,
  projectCommandPanelEntries,
  projectMcpResourceReadResultEntries,
  projectMcpServerEntries,
  projectMcpToolCallResultEntries,
  projectPluginEntries,
  projectRequiredAppEntries,
  projectSkillFileReadResultEntries,
} from "../src/state/command-panel";
import {
  buildMcpToolArguments,
  emptyMcpToolArgumentValues,
  projectMcpToolArgumentFields,
} from "../src/state/mcp-tool-arguments";

type CommandPanelEntry = {
  id: string;
  title: string;
  kind: string;
  status?: string;
  meta?: string;
  details?: string[];
  disabled?: boolean;
  action?: unknown;
  secondaryActions?: Array<{ id: string; label: string; title?: string; tone?: string; action: unknown }>;
};

export default function runCommandPanelTests(): void {
  projectsMcpServerNamesToolsAndAuthStatus();
  projectsMcpResourcesTemplatesAndReadResults();
  projectsSkillsHooksAppsAndPluginsAsCommandEntries();
  projectsDesktopSkillMetadataAndErrors();
  projectsSkillSourceReadResults();
  avoidsDuplicatingDesktopSkillPromptReferences();
  flattensPluginListMarketplaces();
  mergesConnectorAppsIntoPluginProjection();
  projectsRequiredAppsAfterPluginInstall();
  projectsAndBuildsMcpToolArguments();
  projectsCollaborationModesAsCommandEntries();
  createsEmptyLoadingAndErrorPanelStates();
  keepsDetailsHumanReadableWithoutRawJson();
}

function projectsDesktopSkillMetadataAndErrors(): void {
  const entries: CommandPanelEntry[] = projectCommandPanelEntries({
    skills: {
      data: [{
        cwd: "/workspace",
        skills: [{
          name: "team:review",
          description: "Fallback description",
          shortDescription: "Fallback short description",
          path: "/workspace/.codex/skills/review/SKILL.md",
          scope: "repo",
          enabled: false,
          interface: {
            displayName: "Review",
            shortDescription: "Review local changes.",
            defaultPrompt: "Review the current diff and report bugs.\nUse concise findings.",
          },
          dependencies: {
            tools: [{ type: "mcp", value: "github" }],
          },
        }],
        errors: [{ path: "/workspace/.codex/skills/bad/SKILL.md", message: "Invalid frontmatter" }],
      }],
    },
  });

  assertDeepEqual(
    entries,
    [
      {
        id: "skill:team:review",
        title: "Review",
        kind: "skill",
        status: "disabled",
        meta: "Repo · /workspace/.codex/skills/review/SKILL.md",
        details: [
          "Review local changes.",
          "Default prompt: Review the current diff and report bugs.",
          "Tools: github",
          "Path: /workspace/.codex/skills/review/SKILL.md",
          "CWD: /workspace",
        ],
        disabled: true,
        action: {
          type: "attachSkill",
          name: "team:review",
          path: "/workspace/.codex/skills/review/SKILL.md",
          promptText: "Review the current diff and report bugs.\nUse concise findings. [$team:review](/workspace/.codex/skills/review/SKILL.md) ",
        },
        secondaryActions: [
          {
            id: "skill:/workspace/.codex/skills/review/SKILL.md:read",
            label: "View",
            title: "View Review source",
            action: {
              type: "readSkillFile",
              title: "View Review",
              path: "/workspace/.codex/skills/review/SKILL.md",
            },
          },
          {
            id: "skill:team:review:enable",
            label: "Enable",
            title: "Enable Review",
            tone: "success",
            action: {
              type: "writeSkillConfig",
              title: "Enable Review",
              name: "team:review",
              path: "/workspace/.codex/skills/review/SKILL.md",
              enabled: true,
            },
          },
        ],
      },
      {
        id: "skill-error:/workspace/.codex/skills/bad/SKILL.md",
        title: "SKILL.md",
        kind: "skill",
        status: "error",
        meta: "/workspace/.codex/skills/bad/SKILL.md",
        details: ["Invalid frontmatter"],
        disabled: true,
      },
    ],
    "skill projection should follow Desktop displayName, scope, default prompt, dependencies, and load errors",
  );
}

function projectsSkillSourceReadResults(): void {
  assertDeepEqual(
    projectSkillFileReadResultEntries("/workspace/.codex/skills/review/SKILL.md", "# Review\nUse concise findings."),
    [
      {
        id: "skill-file:/workspace/.codex/skills/review/SKILL.md",
        title: "SKILL.md",
        kind: "status",
        status: "read",
        meta: "/workspace/.codex/skills/review/SKILL.md",
        details: ["# Review", "Use concise findings."],
      },
    ],
    "skill source reads should be projected as readable command panel rows",
  );
}

function avoidsDuplicatingDesktopSkillPromptReferences(): void {
  const path = "/workspace/.codex/skills/review/SKILL.md";
  const entries: CommandPanelEntry[] = projectCommandPanelEntries({
    skills: {
      data: [{
        name: "team:review",
        path,
        interface: {
          defaultPrompt: `Review this change with [$team:review](${path})`,
        },
      }],
    },
  });

  assertDeepEqual(
    entries[0]?.action,
    {
      type: "attachSkill",
      name: "team:review",
      path,
      promptText: `Review this change with [$team:review](${path}) `,
    },
    "skill prompt text should preserve an existing Desktop skill reference instead of appending a duplicate",
  );
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
        id: "mcp-tool:github:list_prs",
        title: "list_prs",
        kind: "mcpTool",
        status: "callable",
        meta: "github:list_prs",
        details: ["List pull requests", "Click to call with empty arguments."],
      },
      {
        id: "mcp-tool:github:get_issue",
        title: "get_issue",
        kind: "mcpTool",
        status: "callable",
        meta: "github:get_issue",
        details: ["Read issue details", "Click to call with empty arguments."],
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
        id: "mcp-tool:filesystem:read_file",
        title: "read_file",
        kind: "mcpTool",
        status: "callable",
        meta: "filesystem:read_file",
        details: ["Click to call with empty arguments."],
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
  assertDeepEqual(
    entries.find((entry) => entry.id === "mcp-tool:github:list_prs")?.action,
    { type: "callMcpTool", server: "github", tool: "list_prs", arguments: {} },
    "MCP tool rows without required arguments should be directly callable",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "mcp:memory")?.secondaryActions?.map((action) => ({
      label: action.label,
      action: action.action,
    })),
    [
      {
        label: "Authenticate",
        action: { type: "loginMcpServer", server: "memory", title: "Authenticate memory" },
      },
      {
        label: "Reload",
        action: { type: "reloadMcpServers", title: "Reload MCP config" },
      },
    ],
    "OAuth-capable MCP servers should expose authenticate plus reload actions",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "mcp:github")?.secondaryActions?.some((action) =>
      action.action && typeof action.action === "object" && "type" in action.action && action.action.type === "openMcpServerForm"
    ),
    false,
    "raw MCP inventory projection should not expose config mutation actions before the management layer adds Desktop-safe config context",
  );
  const requiredEntries: CommandPanelEntry[] = projectMcpServerEntries({
    data: [{
      name: "github",
      tools: {
        get_issue: {
          description: "Read issue details",
          inputSchema: { type: "object", required: ["owner", "repo"] },
        },
      },
      authStatus: "authenticated",
    }],
  });
  assertDeepEqual(
    requiredEntries.find((entry) => entry.id === "mcp-tool:github:get_issue"),
    {
      id: "mcp-tool:github:get_issue",
      title: "get_issue",
      kind: "mcpTool",
      status: "needs input",
      meta: "github:get_issue",
      details: ["Read issue details", "Required: owner, repo", "Click to enter arguments."],
      action: {
        type: "openMcpToolForm",
        server: "github",
        tool: "get_issue",
        title: "get_issue",
        description: "Read issue details",
        fields: [
          {
            name: "owner",
            label: "Owner",
            required: true,
            kind: "string",
            input: "text",
            description: undefined,
            placeholder: undefined,
            options: undefined,
            defaultValue: undefined,
          },
          {
            name: "repo",
            label: "Repo",
            required: true,
            kind: "string",
            input: "text",
            description: undefined,
            placeholder: undefined,
            options: undefined,
            defaultValue: undefined,
          },
        ],
      },
    },
    "MCP tools with required arguments should open an argument form instead of being disabled",
  );
  assertDeepEqual(
    projectMcpToolCallResultEntries("github", "list_prs", {
      content: [{ type: "text", text: "PR #1\nPR #2" }],
      structuredContent: { count: 2 },
    }),
    [
      {
        id: "mcp-result:github:list_prs:content:0",
        title: "Text result 1",
        kind: "status",
        status: "completed",
        meta: "github:list_prs",
        details: ["PR #1", "PR #2"],
      },
      {
        id: "mcp-result:github:list_prs:structured",
        title: "Structured content",
        kind: "status",
        status: "completed",
        meta: "github:list_prs",
        details: ["{", "  \"count\": 2", "}"],
      },
    ],
    "MCP tool call results should be projected into readable command panel rows",
  );
}

function projectsMcpResourcesTemplatesAndReadResults(): void {
  const entries: CommandPanelEntry[] = projectMcpServerEntries({
    data: [{
      name: "filesystem",
      tools: {},
      resources: [{
        name: "README",
        uri: "file:///workspace/README.md",
        mimeType: "text/markdown",
        size: 42,
        description: "Project readme",
      }],
      resourceTemplates: [{
        name: "File",
        uriTemplate: "file:///{path}",
        mimeType: "text/plain",
        description: "Read a file by path",
      }],
      authStatus: "authenticated",
    }],
  });

  assertDeepEqual(
    entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      status: entry.status,
      meta: entry.meta,
      details: entry.details,
      disabled: entry.disabled,
      action: entry.action,
    })),
    [
      {
        id: "mcp:filesystem",
        title: "filesystem",
        kind: "mcpServer",
        status: "authenticated",
        meta: "No tools · 1 resource · 1 template",
        details: [
          "Resource: README - file:///workspace/README.md",
          "Template: File - file:///{path}",
        ],
        disabled: undefined,
        action: undefined,
      },
      {
        id: "mcp-resource:filesystem:file:///workspace/README.md",
        title: "README",
        kind: "mcpResource",
        status: "resource",
        meta: "filesystem · text/markdown",
        details: ["Project readme", "URI: file:///workspace/README.md", "Size: 42 bytes"],
        disabled: undefined,
        action: {
          type: "readMcpResource",
          server: "filesystem",
          uri: "file:///workspace/README.md",
          title: "README",
        },
      },
      {
        id: "mcp-resource-template:filesystem:file:///{path}",
        title: "File",
        kind: "mcpResourceTemplate",
        status: "template",
        meta: "filesystem · text/plain",
        details: ["Read a file by path", "Template: file:///{path}"],
        disabled: true,
        action: undefined,
      },
    ],
    "MCP full detail projection should expose resources and resource templates",
  );

  assertDeepEqual(
    projectMcpResourceReadResultEntries("filesystem", "file:///workspace/README.md", {
      contents: [{
        uri: "file:///workspace/README.md",
        mimeType: "text/markdown",
        text: "# README\nHello",
      }],
    }),
    [
      {
        id: "mcp-resource-result:filesystem:file:///workspace/README.md:0",
        title: "Resource content 1",
        kind: "status",
        status: "read",
        meta: "filesystem · text/markdown",
        details: ["URI: file:///workspace/README.md", "MIME: text/markdown", "# README", "Hello"],
      },
    ],
    "MCP resource read results should render text content without raw JSON",
  );
}

function projectsAndBuildsMcpToolArguments(): void {
  const fields = projectMcpToolArgumentFields({
    inputSchema: {
      type: "object",
      required: ["owner", "limit", "metadata"],
      properties: {
        owner: { type: "string", title: "Owner", description: "Repository owner" },
        limit: { type: "integer", default: 10 },
        includeClosed: { type: "boolean" },
        state: { enum: ["open", "closed"], default: "open" },
        metadata: { type: "object" },
      },
    },
  });

  assertDeepEqual(
    fields.map((field) => ({
      name: field.name,
      label: field.label,
      required: field.required,
      kind: field.kind,
      input: field.input,
      description: field.description,
      placeholder: field.placeholder,
      options: field.options?.map((option) => ({ label: option.label, value: option.value, raw: option.raw })),
      defaultValue: field.defaultValue,
    })),
    [
      {
        name: "owner",
        label: "Owner",
        required: true,
        kind: "string",
        input: "text",
        description: "Repository owner",
        placeholder: undefined,
        options: undefined,
        defaultValue: undefined,
      },
      {
        name: "limit",
        label: "Limit",
        required: true,
        kind: "integer",
        input: "number",
        description: undefined,
        placeholder: "0",
        options: undefined,
        defaultValue: "10",
      },
      {
        name: "includeClosed",
        label: "Include Closed",
        required: false,
        kind: "boolean",
        input: "checkbox",
        description: undefined,
        placeholder: undefined,
        options: undefined,
        defaultValue: undefined,
      },
      {
        name: "state",
        label: "State",
        required: false,
        kind: "string",
        input: "select",
        description: undefined,
        placeholder: undefined,
        options: [
          { label: "open", value: "0", raw: "open" },
          { label: "closed", value: "1", raw: "closed" },
        ],
        defaultValue: "0",
      },
      {
        name: "metadata",
        label: "Metadata",
        required: true,
        kind: "json",
        input: "textarea",
        description: undefined,
        placeholder: "{}",
        options: undefined,
        defaultValue: undefined,
      },
    ],
    "MCP input schemas should project to typed argument fields",
  );

  const values = emptyMcpToolArgumentValues(fields);
  values.owner = "openai";
  values.limit = "25";
  values.includeClosed = true;
  values.metadata = "{\"label\":\"bug\"}";
  assertDeepEqual(
    buildMcpToolArguments(fields, values),
    {
      arguments: {
        owner: "openai",
        limit: 25,
        includeClosed: true,
        state: "open",
        metadata: { label: "bug" },
      },
      errors: {},
    },
    "MCP form values should build the mcpServer/tool/call arguments payload",
  );

  values.limit = "2.5";
  values.metadata = "{bad";
  assertDeepEqual(
    buildMcpToolArguments(fields, values),
    {
      arguments: {
        owner: "openai",
        includeClosed: true,
        state: "open",
      },
      errors: {
        limit: "Enter an integer",
        metadata: "Enter valid JSON",
      },
    },
    "MCP form validation should block invalid integers and JSON before calling app-server",
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
  assertDeepEqual(
    entries.find((entry) => entry.id === "skill:code-review")?.action,
    {
      type: "attachSkill",
      name: "code-review",
      path: "/Users/example/.codex/skills/code-review/SKILL.md",
      promptText: "[$code-review](/Users/example/.codex/skills/code-review/SKILL.md) ",
    },
    "skill entries should insert the selected skill prompt reference into the next message",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "app:figma")?.action,
    {
      type: "attachApp",
      name: "figma",
      path: "app://figma",
      promptText: "[$figma](app://figma) ",
    },
    "app entries should insert the selected app prompt reference into the next message",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "plugin:browser-use")?.action,
    {
      type: "attachPlugin",
      name: "Browser",
      path: "plugin://browser-use",
      promptText: "[@Browser](plugin://browser-use) ",
    },
    "plugin entries should insert the selected plugin prompt reference into the next message",
  );

  const appActions: CommandPanelEntry[] = projectCommandPanelEntries({
    apps: {
      data: [{
        id: "gmail",
        name: "gmail",
        title: "Gmail",
        description: "Read mail",
        isAccessible: false,
        isEnabled: false,
        installUrl: "https://chatgpt.com/connectors/gmail",
        needsAuth: true,
      }],
    },
  });
  assertDeepEqual(
    appActions[0]?.secondaryActions?.map((action) => ({ label: action.label, action: action.action })),
    [
      {
        label: "Enable",
        action: { type: "writeAppConfig", title: "Enable Gmail", appId: "gmail", enabled: true },
      },
      {
        label: "Connect",
        action: {
          type: "connectRequiredApp",
          title: "Connect Gmail",
          appId: "gmail",
          appName: "Gmail",
          installUrl: "https://chatgpt.com/connectors/gmail",
        },
      },
    ],
    "app rows should expose enable and browser setup actions when app/list metadata provides them",
  );
  assertDeepEqual(
    {
      status: appActions[0]?.status,
      details: appActions[0]?.details,
    },
    {
      status: "disabled",
      details: [
        "Read mail",
        "Enabled: no",
        "Accessible: no",
        "Auth: ChatGPT connector authorization required",
        "Install: browser setup URL available",
      ],
    },
    "app rows should project enabled, accessibility, auth, and installUrl state without implying a native app OAuth RPC",
  );

  const protocolLimitedApp = projectCommandPanelEntries({
    apps: {
      data: [{
        id: "drive",
        name: "drive",
        title: "Drive",
        isAccessible: false,
        isEnabled: true,
        needsAuth: true,
      }],
    },
  })[0];
  assertDeepEqual(
    {
      status: protocolLimitedApp?.status,
      disabled: protocolLimitedApp?.disabled,
      secondaryActions: protocolLimitedApp?.secondaryActions?.map((action) => ({ label: action.label, action: action.action })),
      details: protocolLimitedApp?.details?.slice(-2),
    },
    {
      status: "protocol-limited",
      disabled: true,
      secondaryActions: [{
        label: "Disable",
        action: { type: "writeAppConfig", title: "Disable Drive", appId: "drive", enabled: false },
      }],
      details: [
        "Install: no browser setup URL returned",
        "Protocol-limited: app-server returned app/list metadata only; no native connector OAuth method or browser setup URL is available.",
      ],
    },
    "app rows without installUrl should clearly show protocol-limited connector auth",
  );
}

function projectsCollaborationModesAsCommandEntries(): void {
  const entries: CommandPanelEntry[] = projectCommandPanelEntries({
    collaboration: {
      data: [
        { name: "Plan", mode: "plan", model: null, reasoning_effort: "medium" },
        { name: "Default", mode: "default", model: null, reasoning_effort: null },
      ],
    },
  });

  assertDeepEqual(
    entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      meta: entry.meta,
      details: entry.details,
    })),
    [
      {
        id: "collaboration:Plan",
        title: "Plan",
        kind: "collaborationMode",
        meta: "plan",
        details: ["Reasoning: medium"],
      },
      {
        id: "collaboration:Default",
        title: "Default",
        kind: "collaborationMode",
        meta: "default",
        details: [],
      },
    ],
    "collaborationMode/list projection should expose mode names and preset settings",
  );
}

function flattensPluginListMarketplaces(): void {
  const entries: CommandPanelEntry[] = projectPluginEntries({
    marketplaces: [
      {
        name: "OpenAI",
        plugins: [
          {
            id: "browser-use",
            name: "browser-use",
            installed: true,
            enabled: true,
            interface: { displayName: "Browser Use", defaultPrompt: ["Open the page."] },
          },
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
  assertDeepEqual(
    entries.find((entry) => entry.id === "plugin:browser-use")?.details,
    ["Default prompt: Open the page."],
    "plugin/list projection should surface Desktop plugin default prompt metadata without raw JSON",
  );

  const installable = projectPluginEntries({
    marketplaces: [{
      name: "Local",
      path: "/workspace/.agents/plugins/marketplace.json",
      plugins: [{
        id: "custom-plugin",
        name: "custom-plugin",
        installed: false,
        enabled: false,
        installPolicy: "AVAILABLE",
        availability: "AVAILABLE",
      }],
    }],
  });
  assertDeepEqual(
    installable[0]?.secondaryActions?.map((action) => ({ label: action.label, action: action.action })),
    [{
      label: "Install",
      action: {
        type: "installPlugin",
        title: "Install custom-plugin",
        pluginId: "custom-plugin",
        pluginName: "custom-plugin",
        marketplaceName: "Local",
        marketplacePath: "/workspace/.agents/plugins/marketplace.json",
      },
    }],
    "installable plugin rows should call plugin/install with marketplace path and plugin name",
  );

  const installed = projectPluginEntries({
    marketplaces: [{
      name: "Local",
      plugins: [{
        id: "custom-plugin",
        name: "custom-plugin",
        installed: true,
        enabled: false,
        installPolicy: "AVAILABLE",
        availability: "AVAILABLE",
      }],
    }],
  });
  assertDeepEqual(
    installed[0]?.secondaryActions?.map((action) => ({ label: action.label, action: action.action })),
    [
      {
        label: "Enable",
        action: { type: "writePluginConfig", title: "Enable custom-plugin", pluginId: "custom-plugin", enabled: true },
      },
      {
        label: "Uninstall",
        action: { type: "uninstallPlugin", title: "Uninstall custom-plugin", pluginId: "custom-plugin" },
      },
    ],
    "installed plugin rows should expose enable and uninstall actions",
  );
}

function mergesConnectorAppsIntoPluginProjection(): void {
  const entries = projectPluginEntries(
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
    {
      apps: {
        data: [{
          id: "gmail-app",
          name: "Gmail",
          isAccessible: false,
          isEnabled: false,
          pluginDisplayNames: ["Gmail"],
        }],
      },
    },
  );

  assertDeepEqual(
    {
      status: entries[0]?.status,
      disabled: entries[0]?.disabled,
      details: entries[0]?.details,
      secondaryActions: entries[0]?.secondaryActions?.map((action) => ({ label: action.label, action: action.action })),
    },
    {
      status: "app disabled",
      disabled: true,
      details: [
        "Connector app: Gmail",
        "Connector enabled: no",
        "Connector accessible: no",
        "Auth: not accessible according to app/list",
        "Install: no browser setup URL returned",
        "Protocol-limited: app-server returned app/list metadata only; no native connector OAuth method or browser setup URL is available.",
      ],
      secondaryActions: [{
        label: "Enable",
        action: { type: "writeAppConfig", title: "Enable Gmail", appId: "gmail-app", enabled: true },
      }],
    },
    "connector-backed plugin installed/enabled state should follow app/list accessibility and enablement",
  );
}

function projectsRequiredAppsAfterPluginInstall(): void {
  const entries = projectRequiredAppEntries([{
    id: "gmail",
    name: "Gmail",
    description: "Read mail",
    installUrl: "https://chatgpt.com/connectors/gmail",
    needsAuth: true,
  }]);

  assertDeepEqual(
    entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      details: entry.details,
      action: entry.action,
      secondaryActions: entry.secondaryActions?.map((action) => ({ label: action.label, action: action.action })),
    })),
    [{
      id: "required-app:gmail",
      status: "auth required",
      details: [
        "Read mail",
        "Auth: ChatGPT connector authorization required",
        "Install: browser setup URL available",
      ],
      action: {
        type: "connectRequiredApp",
        title: "Connect Gmail",
        appId: "gmail",
        appName: "Gmail",
        installUrl: "https://chatgpt.com/connectors/gmail",
      },
      secondaryActions: [{
        label: "Connect",
        action: {
          type: "connectRequiredApp",
          title: "Connect Gmail",
          appId: "gmail",
          appName: "Gmail",
          installUrl: "https://chatgpt.com/connectors/gmail",
        },
      }],
    }],
    "plugin install appsNeedingAuth should project a required-apps connect panel state",
  );

  const limited = projectRequiredAppEntries([{
    id: "drive",
    name: "Drive",
    needsAuth: true,
  }]);
  assertDeepEqual(
    {
      status: limited[0]?.status,
      disabled: limited[0]?.disabled,
      action: limited[0]?.action,
      secondaryActions: limited[0]?.secondaryActions,
      details: limited[0]?.details,
    },
    {
      status: "protocol-limited",
      disabled: true,
      action: undefined,
      secondaryActions: undefined,
      details: [
        "Auth: ChatGPT connector authorization required",
        "Protocol-limited: app-server returned app/list metadata only; no native connector OAuth method or browser setup URL is available.",
      ],
    },
    "required app rows without installUrl should not pretend a native OAuth connector action exists",
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
