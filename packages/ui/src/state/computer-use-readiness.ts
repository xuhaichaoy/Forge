import {
  isTauriRuntime,
  readComputerUseReadiness,
  type ComputerUseReadiness,
} from "../lib/tauri-host";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import type { CommandPanelEntry, CommandPanelSecondaryAction } from "./command-panel";
import type { McpServerStartupStatus } from "./mcp-skills-management";

export const COMPUTER_USE_MCP_PROBE_TIMEOUT_MS = 45_000;
const COMPUTER_USE_DEFAULT_TOOL_TIMEOUT_SECONDS = 120;

export interface ComputerUseReadinessSnapshot extends ComputerUseReadiness {
  bridgeAvailable: boolean;
  error?: string | null;
}

export function unknownComputerUseReadiness(error?: string | null): ComputerUseReadinessSnapshot {
  return {
    bridgeAvailable: false,
    helperAvailable: false,
    helperAppPath: null,
    helperSignatureValid: null,
    helperSignatureStatus: null,
    mcpClientPath: null,
    mcpConfigPath: null,
    mcpCommand: null,
    mcpCommandPath: null,
    mcpCwd: null,
    mcpConfigTrusted: null,
    mcpConfigStatus: null,
    mcpCommandExecutable: null,
    mcpClientSignatureValid: null,
    mcpClientSignatureStatus: null,
    installerAppPath: null,
    pluginRootPath: null,
    source: null,
    repairSourceAvailable: false,
    repairSourcePath: null,
    repairStatus: "unknown",
    candidates: [],
    screenRecordingStatus: "unknown",
    accessibilityStatus: "unknown",
    appApprovalsStatus: "unknown",
    error: error ?? null,
  };
}

export async function loadComputerUseReadiness(
  codexHome: string | null | undefined,
): Promise<ComputerUseReadinessSnapshot> {
  if (!isTauriRuntime()) {
    return unknownComputerUseReadiness("Tauri host bridge is unavailable in this environment.");
  }
  try {
    return {
      ...await readComputerUseReadiness(codexHome),
      bridgeAvailable: true,
      error: null,
    };
  } catch (error) {
    return unknownComputerUseReadiness(error instanceof Error ? error.message : String(error));
  }
}

export async function loadComputerUseReadinessEntries(
  codexHome: string | null | undefined,
): Promise<CommandPanelEntry[]> {
  return projectComputerUseReadinessEntries(await loadComputerUseReadiness(codexHome), codexHome);
}

export async function loadComputerUseMcpReadinessEntries(
  client: CodexJsonRpcClient,
  startupStatuses: Record<string, McpServerStartupStatus | undefined> | null | undefined,
  context: ComputerUseMcpReadinessContext = {},
): Promise<CommandPanelEntry[]> {
  try {
    const activeThreadId = context.activeThreadId?.trim();
    const status = await client.request<unknown>("mcpServerStatus/list", {
      limit: 50,
      detail: "toolsAndAuthOnly",
      ...(activeThreadId ? { threadId: activeThreadId } : {}),
    }, 120_000);
    return projectComputerUseMcpReadinessEntries(status, startupStatuses, undefined, context);
  } catch (error) {
    return projectComputerUseMcpReadinessEntries(
      null,
      startupStatuses,
      error instanceof Error ? error.message : String(error),
      context,
    );
  }
}

export function projectComputerUseReadinessEntries(
  readiness: ComputerUseReadinessSnapshot,
  codexHome?: string | null,
): CommandPanelEntry[] {
  const mcpCommandExecutable = readiness.mcpCommandExecutable;
  const signatureInvalid = readiness.helperSignatureValid === false || readiness.mcpClientSignatureValid === false;
  const configUntrusted = readiness.mcpConfigTrusted === false;
  const helperAvailable = readiness.helperAvailable === true && mcpCommandExecutable !== false && !signatureInvalid && !configUntrusted;
  const bridgeAvailable = readiness.bridgeAvailable === true;
  const permissionStatus = computerUsePermissionChecklistStatus(readiness);
  const permissionBlockReason = computerUsePermissionBlockReason(readiness);
  const status = signatureInvalid
    ? "signature invalid"
    : configUntrusted
      ? "config untrusted"
      : helperAvailable
        ? permissionBlockReason
          ? "permissions required"
          : permissionStatus === "granted"
            ? "helper available"
            : "permissions not proven"
        : bridgeAvailable ? "setup required" : "unknown";
  const details = [
    `Helper app: ${readiness.helperAppPath || "not found"}`,
    `Helper signature: ${readinessSignatureLabel(readiness.helperSignatureValid, readiness.helperSignatureStatus)}`,
    `MCP client: ${readiness.mcpClientPath || "not found"}`,
    `MCP config: ${readiness.mcpConfigPath || "not found"}`,
    `MCP command: ${readiness.mcpCommand || "not configured"}`,
    `MCP cwd: ${readiness.mcpCwd || "not configured"}`,
    `MCP command path: ${readiness.mcpCommandPath || "not resolved"}`,
    `MCP config trusted: ${readinessBoolLabel(readiness.mcpConfigTrusted)}${readiness.mcpConfigStatus ? ` (${readiness.mcpConfigStatus})` : ""}`,
    `MCP command executable: ${readinessBoolLabel(mcpCommandExecutable)}`,
    `MCP client signature: ${readinessSignatureLabel(readiness.mcpClientSignatureValid, readiness.mcpClientSignatureStatus)}`,
    `Installer: ${readiness.installerAppPath || "not found"}`,
    `Repair status: ${computerUseRepairStatusLabel(readiness.repairStatus)}`,
    `Repair source: ${readiness.repairSourcePath || "not available"}`,
    `Screen Recording: ${readiness.screenRecordingStatus || "unknown"}`,
    `Accessibility: ${readiness.accessibilityStatus || "unknown"}`,
    `App approvals: ${readiness.appApprovalsStatus || "unknown"}`,
    ...(signatureInvalid
      ? ["Code signature failure can make macOS ignore app-group entitlements, so Computer Use MCP tool calls may time out."]
      : []),
    ...(configUntrusted
      ? ["Untrusted MCP config can route Computer Use through the wrong command, cwd, or args, so MCP probing is blocked until the bundled config is repaired."]
      : []),
    ...(permissionBlockReason
      ? [`Known blocker: ${permissionBlockReason}; Computer Use MCP probing is blocked until the permission is granted.`]
      : permissionStatus !== "granted"
        ? ["Permission proof is incomplete; Computer Use GUI control is still not ready."]
        : []),
    ...computerUseReadinessNextSteps(readiness, signatureInvalid),
    "GUI control is not marked ready until helper, MCP command, and required permissions are proven.",
  ];
  if (readiness.error) {
    details.push(`Readiness bridge: ${readiness.error}`);
  }
  const source = readiness.source ? `source: ${readiness.source}` : "native readiness";
  const primaryEntry: CommandPanelEntry = {
    id: "computer-use:native-readiness",
    title: "Native readiness",
    kind: "plugin",
    status,
    meta: readiness.pluginRootPath ? `${source} · ${readiness.pluginRootPath}` : source,
    details,
    secondaryActions: computerUseSetupActions(readiness, codexHome),
  };
  return [
    primaryEntry,
    computerUseRepairSourcesEntry(readiness, codexHome),
    ...computerUseNativeChecklistEntries(readiness, signatureInvalid, helperAvailable, codexHome),
  ];
}

function readinessBoolLabel(value: boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function readinessSignatureLabel(value: boolean | null | undefined, status: string | null | undefined): string {
  const label = value === true ? "valid" : value === false ? "invalid" : "unknown";
  const detail = status?.trim();
  return detail && detail !== label ? `${label} (${detail})` : label;
}

function computerUseReadinessNextSteps(
  readiness: ComputerUseReadinessSnapshot,
  signatureInvalid: boolean,
): string[] {
  if (signatureInvalid) {
    if (readiness.repairSourceAvailable && readiness.repairSourcePath) {
      return [
        "Next step: use the signed-valid local repair source before probing Computer Use MCP again.",
        `Repair source: ${readiness.repairSourcePath}`,
        "Do not rely on macOS permission grants until the helper and MCP client signatures verify as valid.",
      ];
    }
    return [
      "Next step: install or update Codex.app with a signed-valid Computer Use bundle, then restart HiCodex and refresh readiness.",
      "No signed-valid local repair source was found for the current Computer Use cache.",
      "Do not rely on macOS permission grants until the helper and MCP client signatures verify as valid.",
    ];
  }
  const needsPermissions =
    readiness.screenRecordingStatus !== "granted"
    || readiness.accessibilityStatus !== "granted"
    || readiness.appApprovalsStatus !== "granted";
  if (!needsPermissions) return [];
  return [
    "Next step: open the helper or installer, grant Screen Recording and Accessibility, then probe the Computer Use MCP server from an active thread.",
  ];
}

function computerUseRepairSourcesEntry(
  readiness: ComputerUseReadinessSnapshot,
  codexHome: string | null | undefined,
): CommandPanelEntry {
  const candidates = readiness.candidates ?? [];
  const repairStatus = computerUseRepairStatusLabel(readiness.repairStatus);
  const repairActions = computerUseRepairActions(readiness, codexHome);
  return {
    id: "computer-use:repair-sources",
    title: "Repair sources",
    kind: "plugin",
    status: computerUseRepairEntryStatus(readiness),
    meta: candidates.length > 0
      ? `${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`
      : "no candidates",
    details: [
      `Repair status: ${repairStatus}`,
      `Repair source: ${readiness.repairSourcePath || "not available"}`,
      ...(candidates.length > 0
        ? candidates.flatMap((candidate, index) => computerUseCandidateDetails(candidate, index))
        : ["No Computer Use bundle candidates were found."]
      ),
    ],
    secondaryActions: repairActions.length > 0 ? repairActions : undefined,
  };
}

function computerUseRepairEntryStatus(readiness: ComputerUseReadinessSnapshot): string {
  const status = readiness.repairStatus?.trim();
  if (status === "ready") return "ready";
  if (status === "not needed") return "not needed";
  if (status === "not found") return "not found";
  if (status === "no valid signed source") return "not available";
  return readiness.repairSourceAvailable ? "ready" : "unknown";
}

function computerUseRepairStatusLabel(value: string | null | undefined): string {
  return value?.trim() || "unknown";
}

function computerUseCandidateDetails(
  candidate: NonNullable<ComputerUseReadinessSnapshot["candidates"]>[number],
  index: number,
): string[] {
  const prefix = `Candidate ${index + 1}`;
  return [
    `${prefix}: ${candidate.source || "unknown"} · ${candidate.pluginRootPath || "unknown"}`,
    `${prefix} helper: ${candidate.helperAppPath || "not found"} · signature ${readinessSignatureLabel(candidate.helperSignatureValid, candidate.helperSignatureStatus)}`,
    `${prefix} MCP client: ${candidate.mcpClientPath || "not found"} · executable ${readinessBoolLabel(candidate.mcpCommandExecutable)} · signature ${readinessSignatureLabel(candidate.mcpClientSignatureValid, candidate.mcpClientSignatureStatus)}`,
    `${prefix} MCP config trusted: ${readinessBoolLabel(candidate.mcpConfigTrusted)}${candidate.mcpConfigStatus ? ` (${candidate.mcpConfigStatus})` : ""}`,
    `${prefix} installer: ${candidate.installerAppPath || "not found"} · signature ${readinessSignatureLabel(candidate.installerSignatureValid, candidate.installerSignatureStatus)}`,
    `${prefix} repair usable: ${readinessBoolLabel(candidate.usableForRepair)}`,
  ];
}

function computerUseRepairActions(
  readiness: ComputerUseReadinessSnapshot,
  codexHome: string | null | undefined,
): CommandPanelSecondaryAction[] {
  if (!readiness.bridgeAvailable) return [];
  if (!readiness.repairSourceAvailable || readiness.repairStatus !== "ready") return [];
  return [{
    id: "computer-use:repair-bundle",
    label: "Repair Computer Use",
    title: "Repair Computer Use bundle",
    action: { type: "repairComputerUseBundle", title: "Repair Computer Use bundle", codexHome },
  }];
}

function computerUseNativeChecklistEntries(
  readiness: ComputerUseReadinessSnapshot,
  signatureInvalid: boolean,
  helperAvailable: boolean,
  codexHome: string | null | undefined,
): CommandPanelEntry[] {
  const permissionStatus = computerUsePermissionChecklistStatus(readiness);
  const permissionActions = readiness.bridgeAvailable ? computerUsePermissionActions(codexHome) : [];
  return [
    {
      id: "computer-use:helper-signatures",
      title: "Helper and signatures",
      kind: "plugin",
      status: signatureInvalid ? "signature invalid" : helperAvailable ? "available" : "setup required",
      meta: readiness.helperAppPath || readiness.mcpClientPath || "helper not found",
      details: [
        `Helper app: ${readiness.helperAppPath || "not found"}`,
        `Helper signature: ${readinessSignatureLabel(readiness.helperSignatureValid, readiness.helperSignatureStatus)}`,
        `MCP client: ${readiness.mcpClientPath || "not found"}`,
        `MCP client signature: ${readinessSignatureLabel(readiness.mcpClientSignatureValid, readiness.mcpClientSignatureStatus)}`,
        ...(signatureInvalid
          ? ["Signature failure can make Computer Use MCP tool calls time out."]
          : []),
      ],
    },
    {
      id: "computer-use:mcp-command",
      title: "MCP command",
      kind: "plugin",
      status: readiness.mcpCommandExecutable === true
        ? "executable"
        : readiness.mcpCommandExecutable === false
          ? "not executable"
          : "unknown",
      meta: readiness.mcpConfigPath || "MCP config not found",
      details: [
        `MCP config: ${readiness.mcpConfigPath || "not found"}`,
        `MCP command: ${readiness.mcpCommand || "not configured"}`,
        `MCP cwd: ${readiness.mcpCwd || "not configured"}`,
        `MCP command path: ${readiness.mcpCommandPath || "not resolved"}`,
        `MCP config trusted: ${readinessBoolLabel(readiness.mcpConfigTrusted)}${readiness.mcpConfigStatus ? ` (${readiness.mcpConfigStatus})` : ""}`,
        `MCP command executable: ${readinessBoolLabel(readiness.mcpCommandExecutable)}`,
      ],
    },
    {
      id: "computer-use:permissions",
      title: "Permissions and app approvals",
      kind: "plugin",
      status: permissionStatus,
      meta: "macOS native control requirements",
      details: [
        `Screen Recording: ${readiness.screenRecordingStatus || "unknown"}`,
        `Accessibility: ${readiness.accessibilityStatus || "unknown"}`,
        `App approvals: ${readiness.appApprovalsStatus || "unknown"}`,
        "Permission preflight checks the current HiCodex host process; the Computer Use helper and app approvals still need their own proof.",
        permissionStatus === "granted"
          ? "Native permission readiness is proven granted."
          : "Missing native permissions or app approvals can make Computer Use list_apps and GUI-control tool calls time out.",
      ],
      secondaryActions: permissionActions.length > 0 ? permissionActions : undefined,
    },
  ];
}

function computerUsePermissionChecklistStatus(readiness: ComputerUseReadinessSnapshot): string {
  const statuses = [
    readiness.screenRecordingStatus,
    readiness.accessibilityStatus,
    readiness.appApprovalsStatus,
  ].map((value) => value?.trim() || "unknown");
  if (statuses.every((value) => value === "granted")) return "granted";
  if (statuses.some((value) => value === "denied" || value === "not granted" || value === "missing")) {
    return "needs approval";
  }
  return "not proven";
}

function computerUsePermissionBlockReason(readiness: ComputerUseReadinessSnapshot): string | null {
  if (computerUsePermissionStatusBlocksProbe(readiness.screenRecordingStatus)) {
    return "Screen Recording is not granted";
  }
  if (computerUsePermissionStatusBlocksProbe(readiness.accessibilityStatus)) {
    return "Accessibility is not granted";
  }
  return null;
}

function computerUsePermissionStatusBlocksProbe(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "not granted"
    || normalized === "denied"
    || normalized === "missing"
    || normalized === "blocked";
}

function computerUsePermissionActions(
  codexHome: string | null | undefined,
): CommandPanelSecondaryAction[] {
  return [
    {
      id: "computer-use:screen-recording",
      label: "Screen Recording",
      title: "Open Screen Recording settings",
      action: { type: "openComputerUseSetup", title: "Open Screen Recording settings", target: "screenRecording", codexHome },
    },
    {
      id: "computer-use:accessibility",
      label: "Accessibility",
      title: "Open Accessibility settings",
      action: { type: "openComputerUseSetup", title: "Open Accessibility settings", target: "accessibility", codexHome },
    },
  ];
}

export interface ComputerUseMcpReadinessContext {
  activeThreadId?: string | null;
  nativeReadiness?: ComputerUseReadinessSnapshot | null;
}

function computerUseSetupActions(
  readiness: ComputerUseReadinessSnapshot,
  codexHome: string | null | undefined,
): CommandPanelSecondaryAction[] {
  if (!readiness.bridgeAvailable) return [];
  const actions: CommandPanelSecondaryAction[] = [];
  if (readiness.helperAppPath) {
    actions.push({
      id: "computer-use:open-helper",
      label: "Open helper",
      title: "Open Computer Use helper",
      action: { type: "openComputerUseSetup", title: "Open Computer Use helper", target: "helper", codexHome },
    });
  }
  if (readiness.installerAppPath) {
    actions.push({
      id: "computer-use:open-installer",
      label: "Open installer",
      title: "Open Computer Use installer",
      action: { type: "openComputerUseSetup", title: "Open Computer Use installer", target: "installer", codexHome },
    });
  }
  actions.push(
    {
      id: "computer-use:screen-recording",
      label: "Screen Recording",
      title: "Open Screen Recording settings",
      action: { type: "openComputerUseSetup", title: "Open Screen Recording settings", target: "screenRecording", codexHome },
    },
    {
      id: "computer-use:accessibility",
      label: "Accessibility",
      title: "Open Accessibility settings",
      action: { type: "openComputerUseSetup", title: "Open Accessibility settings", target: "accessibility", codexHome },
    },
  );
  return actions;
}

export function projectComputerUseMcpReadinessEntries(
  mcpStatusResult: unknown,
  startupStatuses: Record<string, McpServerStartupStatus | undefined> | null | undefined,
  error?: string | null,
  context: ComputerUseMcpReadinessContext = {},
): CommandPanelEntry[] {
  const server = computerUseMcpServer(mcpStatusResult);
  const startup = startupStatuses?.["computer-use"] ?? startupStatuses?.["mcp:computer-use"];
  if (!server) {
    return [{
      id: "computer-use:mcp-readiness",
      title: "MCP readiness",
      kind: "plugin",
      status: error ? "unknown" : "not found",
      meta: "app-server MCP status",
      details: [
        error
          ? `mcpServerStatus/list failed: ${error}`
          : "mcpServerStatus/list did not report a computer-use server.",
        startup ? `Startup: ${startup.status}` : "Startup: unknown",
        ...(startup?.error ? [`Startup error: ${startup.error}`] : []),
      ],
    }];
  }
  const tools = recordObject(server.tools);
  const toolNames = Object.keys(tools).sort();
  const probeTool = computerUseProbeTool(toolNames);
  const activeThreadId = context.activeThreadId?.trim() || "";
  const authStatus = fieldText(server, "authStatus") || fieldText(server, "status") || "reported";
  const probeBlockReason = computerUseProbeBlockReason(context.nativeReadiness);
  const status = startup?.error
    ? "startup failed"
    : probeBlockReason
      ? "probe blocked"
      : startup?.status || (toolNames.length > 0 ? "available" : authStatus);
  const probeDetails = probeTool
    ? probeBlockReason
      ? [`Probe: ${probeTool} is not exposed because ${probeBlockReason}.`]
      : activeThreadId
      ? [`Probe: ${probeTool} can be called from the active thread.`]
      : [`Probe: ${probeTool} requires an active thread before it can be called.`]
    : ["Probe: no safe Computer Use probe tool reported."];
  const startupDetails = [
    startup ? `Startup: ${startup.status}` : "Startup: unknown",
    ...(startup?.error ? [`Startup error: ${startup.error}`] : []),
  ];
  const timeoutTool = probeTool || "Computer Use MCP tools";
  const timeoutDetails = [
    `Tool timeout: ${computerUseToolTimeoutLabel(server)}.`,
    `Timeout risk: ${timeoutTool} can time out when the helper is not running, helper signatures fail, macOS permissions are missing, app approvals are pending, MCP startup failed, or the helper is waiting on a native prompt.`,
  ];
  return [{
    id: "computer-use:mcp-readiness",
    title: "MCP readiness",
    kind: "plugin",
    status,
    meta: `${toolNames.length} tools · auth ${authStatus}`,
    details: [
      `Server: ${fieldText(server, "name") || "computer-use"}`,
      ...startupDetails,
      ...probeDetails,
      ...timeoutDetails,
      ...toolNames.map((toolName) => {
        const description = fieldText(tools[toolName], "description");
        return description ? `Tool: ${toolName} - ${description}` : `Tool: ${toolName}`;
      }),
    ],
    secondaryActions: probeTool && activeThreadId && !probeBlockReason ? [{
      id: "computer-use:probe-mcp",
      label: "Probe MCP",
      title: "Probe Computer Use MCP",
      action: {
        type: "probeComputerUseMcp",
        title: "Probe Computer Use MCP",
        threadId: activeThreadId,
        server: fieldText(server, "name") || "computer-use",
        tool: probeTool,
        arguments: {},
      },
    }] : undefined,
  }];
}

function computerUseProbeBlockReason(readiness: ComputerUseReadinessSnapshot | null | undefined): string | null {
  if (!readiness) return null;
  if (!readiness.bridgeAvailable) return null;
  if (readiness.helperSignatureValid === false || readiness.mcpClientSignatureValid === false) {
    return "the helper or MCP client signature is invalid";
  }
  if (readiness.helperAvailable === false) {
    return "the Computer Use helper or MCP client is not available";
  }
  if (readiness.mcpConfigTrusted === false) {
    return "the Computer Use MCP config is not trusted";
  }
  if (readiness.mcpCommandExecutable === false) {
    return "the MCP command is not executable";
  }
  const permissionBlockReason = computerUsePermissionBlockReason(readiness);
  if (permissionBlockReason) return permissionBlockReason;
  return null;
}

export function formatComputerUseMcpProbeError(
  server: string,
  tool: string,
  error: string,
): string {
  const message = error.trim() || "Unknown MCP probe failure.";
  if (!isComputerUseMcpTimeoutMessage(message)) return message;
  return `${server}:${tool} timed out. Check the Computer Use helper, helper signatures, Screen Recording, Accessibility, app approvals, and MCP startup or restart state before probing again.`;
}

export function projectComputerUseMcpProbeFailureEntries(
  server: string,
  tool: string,
  error: string,
): CommandPanelEntry[] {
  const message = error.trim() || "Unknown MCP probe failure.";
  const timeoutLike = isComputerUseMcpTimeoutMessage(message);
  return [{
    id: "computer-use:probe-failure",
    title: "Computer Use probe failure",
    kind: "status",
    status: "error",
    meta: `${server}:${tool}`,
    details: [
      `Error: ${message}`,
      ...(timeoutLike
        ? [
            "Timeout: the Computer Use MCP tool did not return before the tool-call deadline.",
            "Most likely causes: helper not running, helper signature failure, missing Screen Recording or Accessibility permission, pending app approval, MCP startup failure, or a native prompt blocking the helper.",
            "Next step: open the Computer Use helper or installer, grant permissions and app approvals, restart MCP or start a new thread, then probe again.",
          ]
        : [
            "Next step: check MCP startup status, native readiness, and the active thread before probing again.",
          ]),
    ],
  }];
}

function isComputerUseMcpTimeoutMessage(message: string): boolean {
  return /timeout|timed out|awaiting tools\/call/i.test(message);
}

function computerUseProbeTool(toolNames: string[]): string | null {
  const normalized = new Map(toolNames.map((toolName) => [normalizeComputerUseKey(toolName), toolName]));
  return normalized.get("listapps")
    ?? normalized.get("listapplications")
    ?? null;
}

function computerUseMcpServer(value: unknown): Record<string, unknown> | null {
  return responseItems(value).find((server) => {
    const name = fieldText(server, "name") || fieldText(server, "id") || fieldText(server, "serverName");
    return normalizeComputerUseKey(name) === "computeruse";
  }) ?? null;
}

function computerUseToolTimeoutLabel(server: Record<string, unknown>): string {
  const configured = numberField(server, "tool_timeout_sec")
    ?? numberField(server, "toolTimeoutSec")
    ?? numberField(server, "toolTimeoutSeconds");
  if (configured !== null) return `${configured}s configured`;
  return `${COMPUTER_USE_DEFAULT_TOOL_TIMEOUT_SECONDS}s default unless mcp_servers.computer-use.tool_timeout_sec is configured`;
}

function responseItems(value: unknown): Record<string, unknown>[] {
  const root = recordObject(value);
  for (const key of ["data", "items", "servers", "content"]) {
    const field = root[key];
    if (Array.isArray(field)) return field.filter(isRecord);
  }
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function recordObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fieldText(value: unknown, key: string): string {
  const field = recordObject(value)[key];
  if (typeof field === "string") return field.trim();
  if (typeof field === "number" || typeof field === "boolean" || typeof field === "bigint") return String(field);
  return "";
}

function numberField(value: unknown, key: string): number | null {
  const field = recordObject(value)[key];
  if (typeof field === "number" && Number.isFinite(field)) return field;
  if (typeof field === "string") {
    const parsed = Number(field.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeComputerUseKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
