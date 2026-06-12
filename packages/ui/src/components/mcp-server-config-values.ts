import type { CommandPanelEntry } from "../state/command-panel";
import { normalizeMcpServerKey } from "../state/mcp-skills-management";

export type McpServerFormAction = Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openMcpServerForm" }>;
type ExtendedMcpServerFormAction = McpServerFormAction & {
  existingServers?: string[];
  serverConfig?: Record<string, unknown>;
};

export interface McpServerConfigFormValues {
  args: string;
  baseConfig?: Record<string, unknown>;
  bearerTokenEnvVar: string;
  command: string;
  currentKey?: string;
  cwd: string;
  enabled: boolean;
  disabledTools: string;
  env: string;
  envVars: string;
  envHttpHeaders: string;
  existingServers: string[];
  enabledTools: string;
  httpHeaders: string;
  name: string;
  required: boolean;
  startupTimeoutMs: string;
  startupTimeoutSec: string;
  toolTimeoutSec: string;
  transport: "stdio" | "streamable_http";
  url: string;
}

export function initialMcpServerConfigFormValues(action: McpServerFormAction): McpServerConfigFormValues {
  const extended = action as ExtendedMcpServerFormAction;
  const config = recordObject(extended.serverConfig);
  const isHttp = "url" in config;
  return {
    args: linesFromArray(config.args),
    baseConfig: Object.keys(config).length > 0 ? cloneRecord(config) : undefined,
    bearerTokenEnvVar: stringField(config, "bearer_token_env_var"),
    command: stringField(config, "command"),
    currentKey: action.server,
    cwd: stringField(config, "cwd"),
    disabledTools: linesFromArray(config.disabled_tools),
    enabled: config.enabled !== false,
    enabledTools: linesFromArray(config.enabled_tools),
    env: keyValueLinesFromRecord(config.env),
    envVars: linesFromArray(config.env_vars),
    envHttpHeaders: keyValueLinesFromRecord(config.env_http_headers),
    existingServers: extended.existingServers ?? [],
    httpHeaders: keyValueLinesFromRecord(config.http_headers),
    name: action.server ?? "",
    required: config.required === true,
    startupTimeoutMs: numberField(config, "startup_timeout_ms"),
    startupTimeoutSec: numberField(config, "startup_timeout_sec"),
    toolTimeoutSec: numberField(config, "tool_timeout_sec"),
    transport: isHttp ? "streamable_http" : "stdio",
    url: stringField(config, "url"),
  };
}

export function buildMcpServerConfig(values: McpServerConfigFormValues): {
  config: Record<string, unknown> | null;
  errors: Record<string, string>;
  name: string;
} {
  const name = normalizeMcpServerKey(values.name, values.existingServers, values.currentKey);
  const errors: Record<string, string> = {};
  const config = cloneRecord(values.baseConfig ?? {});
  config.enabled = values.enabled;
  if (values.required) config.required = true;
  else delete config.required;
  setOptionalArray(config, "enabled_tools", nonEmptyLines(values.enabledTools));
  setOptionalArray(config, "disabled_tools", nonEmptyLines(values.disabledTools));
  setOptionalInteger(config, "startup_timeout_sec", values.startupTimeoutSec, errors);
  setOptionalInteger(config, "startup_timeout_ms", values.startupTimeoutMs, errors);
  setOptionalInteger(config, "tool_timeout_sec", values.toolTimeoutSec, errors);
  if (Object.keys(errors).length > 0) return { config: null, errors, name };

  if (values.transport === "stdio") {
    const command = values.command.trim();
    if (!command) errors.command = "Enter a command";
    const env = parseKeyValueLines(values.env, "env", errors);
    if (Object.keys(errors).length > 0) return { config: null, errors, name };
    delete config.url;
    delete config.bearer_token_env_var;
    delete config.http_headers;
    delete config.env_http_headers;
    config.command = command;
    setOptionalArray(config, "args", nonEmptyLines(values.args));
    setOptionalString(config, "cwd", values.cwd);
    setOptionalRecord(config, "env", env);
    setOptionalArray(config, "env_vars", nonEmptyLines(values.envVars));
    return { config, errors, name };
  }

  const url = values.url.trim();
  if (!url) errors.url = "Enter an MCP HTTP URL";
  const httpHeaders = parseKeyValueLines(values.httpHeaders, "httpHeaders", errors);
  const envHttpHeaders = parseKeyValueLines(values.envHttpHeaders, "envHttpHeaders", errors);
  if (Object.keys(errors).length > 0) return { config: null, errors, name };
  delete config.command;
  delete config.args;
  delete config.cwd;
  delete config.env;
  delete config.env_vars;
  config.url = url;
  setOptionalString(config, "bearer_token_env_var", values.bearerTokenEnvVar);
  setOptionalRecord(config, "http_headers", httpHeaders);
  setOptionalRecord(config, "env_http_headers", envHttpHeaders);
  return { config, errors, name };
}

function parseKeyValueLines(
  value: string,
  field: string,
  errors: Record<string, string>,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const line of nonEmptyLines(value)) {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      errors[field] = "Use KEY=value, one per line";
      return undefined;
    }
    const key = line.slice(0, separator).trim();
    const fieldValue = line.slice(separator + 1).trim();
    if (!key) {
      errors[field] = "Use KEY=value, one per line";
      return undefined;
    }
    result[key] = fieldValue;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function nonEmptyLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function setOptionalArray(config: Record<string, unknown>, key: string, value: string[]): void {
  if (value.length > 0) config[key] = value;
  else delete config[key];
}

function setOptionalRecord(config: Record<string, unknown>, key: string, value: Record<string, string> | undefined): void {
  if (value && Object.keys(value).length > 0) config[key] = value;
  else delete config[key];
}

function setOptionalString(config: Record<string, unknown>, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed.length > 0) config[key] = trimmed;
  else delete config[key];
}

function setOptionalInteger(
  config: Record<string, unknown>,
  key: string,
  value: string,
  errors: Record<string, string>,
): void {
  const trimmed = value.trim();
  if (!trimmed) {
    delete config[key];
    return;
  }
  if (!/^\d+$/u.test(trimmed)) {
    errors[key === "startup_timeout_sec"
      ? "startupTimeoutSec"
      : key === "startup_timeout_ms"
        ? "startupTimeoutMs"
        : "toolTimeoutSec"] = "Enter a whole number";
    return;
  }
  config[key] = Number(trimmed);
}

function linesFromArray(value: unknown): string {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
}

function keyValueLinesFromRecord(value: unknown): string {
  return Object.entries(recordObject(value))
    .filter(([, entry]) => typeof entry === "string")
    .map(([key, entry]) => `${key}=${entry}`)
    .join("\n");
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function numberField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]));
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => cloneJsonValue(entry));
  if (value && typeof value === "object") return cloneRecord(value as Record<string, unknown>);
  return value;
}
