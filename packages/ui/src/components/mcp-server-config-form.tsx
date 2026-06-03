import { Save, Server, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { CommandPanelEntry } from "../state/command-panel";
import { normalizeMcpServerKey } from "../state/mcp-skills-management";
import { useHiCodexIntl } from "./i18n-provider";

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

export interface McpServerConfigFormProps {
  action: McpServerFormAction;
  onClose: () => void;
  onSubmit: (name: string, config: Record<string, unknown>) => void;
}

export function McpServerConfigForm({ action, onClose, onSubmit }: McpServerConfigFormProps) {
  const { formatMessage } = useHiCodexIntl();
  const initialValues = useMemo(() => initialMcpServerConfigFormValues(action), [action]);
  const [values, setValues] = useState<McpServerConfigFormValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setValue<K extends keyof McpServerConfigFormValues>(key: K, value: McpServerConfigFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildMcpServerConfig(values);
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0 || !result.config) return;
    onSubmit(result.name, result.config);
  }

  const isStdio = values.transport === "stdio";
  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-command-panel hc-mcp-tool-form"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label={action.title}
        onKeyDown={(event) => {
          // codex: Radix dialog closes on Escape; match it (the other HiCodex dialogs do).
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Server size={17} />
            <span>{action.title}</span>
          </div>
          <button
            className="hc-icon-button"
            type="button"
            onClick={onClose}
            aria-label={formatMessage({ id: "hc.mcpForm.close", defaultMessage: "Close MCP server form" })}
          >
            <X size={16} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="hc-mcp-tool-form-body">
            <div className="hc-mcp-tool-form-summary">
              {/*
               * Codex Desktop i18n (mcp-settings chunk):
               *   settings.mcp.detail.titleExisting = "Update {name} MCP"
               *   settings.mcp.detail.titleNew      = "Connect to a custom MCP"
               */}
              <strong>
                {action.mode === "edit"
                  ? values.name
                    ? formatMessage(
                        { id: "settings.mcp.detail.titleExisting", defaultMessage: "Update {name} MCP" },
                        { name: values.name },
                      )
                    : formatMessage({ id: "hc.mcpForm.titleUpdateFallback", defaultMessage: "Update MCP" })
                  : formatMessage({ id: "settings.mcp.detail.titleNew", defaultMessage: "Connect to a custom MCP" })}
              </strong>
              <span>
                {formatMessage({
                  id: "hc.mcpForm.savedHint",
                  defaultMessage: "Saved to Codex config.toml under mcp_servers.<name>.",
                })}
              </span>
            </div>
            <div className="hc-mcp-tool-fields">
              <label className="hc-mcp-tool-field" data-error={errors.name ? "true" : "false"}>
                <span className="hc-mcp-tool-field-header">
                  <span>{formatMessage({ id: "settings.mcp.detail.name", defaultMessage: "Name" })}</span>
                  <em>{formatMessage({ id: "hc.mcpForm.normalized", defaultMessage: "Normalized" })}</em>
                </span>
                <input
                  className="hc-mcp-tool-control"
                  placeholder="github"
                  autoFocus
                  value={values.name}
                  onChange={(event) => setValue("name", event.currentTarget.value)}
                />
                {errors.name && <small className="hc-mcp-tool-field-error">{errors.name}</small>}
              </label>

              <label className="hc-mcp-tool-field">
                <span className="hc-mcp-tool-field-header"><span>{formatMessage({ id: "hc.mcpForm.transport", defaultMessage: "Transport" })}</span></span>
                <select
                  className="hc-mcp-tool-control"
                  value={values.transport}
                  onChange={(event) => setValue("transport", event.currentTarget.value as McpServerConfigFormValues["transport"])}
                >
                  {/* codex: settings.mcp.detail.transport.{stdio,http} = "STDIO" / "Streamable HTTP" */}
                  <option value="stdio">{formatMessage({ id: "settings.mcp.detail.transport.stdio", defaultMessage: "STDIO" })}</option>
                  <option value="streamable_http">{formatMessage({ id: "settings.mcp.detail.transport.http", defaultMessage: "Streamable HTTP" })}</option>
                </select>
                {/* codex: settings.mcp.detail.switchTransportNotice — user-visible hint that transport changes require an uninstall first. */}
                <small>
                  {formatMessage({
                    id: "settings.mcp.detail.switchTransportNotice",
                    defaultMessage: "If you would like to switch MCP server type, please uninstall first.",
                  })}
                </small>
              </label>

              {isStdio ? (
                <>
                  {/*
                   * Codex Desktop i18n (mcp-settings chunk, settings.mcp.detail.*):
                   *   command            = "Command to launch"   (placeHolderValue: "openai-dev-mcp serve-sqlite")
                   *   args               = "Arguments"
                   *   cwd                = "Working directory"    (placeHolderValue: "~/code")
                   *   envVars            = "Environment variables"            -> bound to stdio.env  (inputType Record, config.env)
                   *   envVarPassthrough  = "Environment variable passthrough" -> bound to stdio.envVars (inputType Array, config.env_vars)
                   * The Record field (KEY=value -> config.env) is the one Codex labels
                   * "Environment variables"; the Array field (bare names -> config.env_vars)
                   * is "Environment variable passthrough". HiCodex previously had these two
                   * labels swapped relative to their data bindings.
                   */}
                  <TextField
                    error={errors.command}
                    label={formatMessage({ id: "settings.mcp.detail.command", defaultMessage: "Command to launch" })}
                    onChange={(value) => setValue("command", value)}
                    placeholder="openai-dev-mcp serve-sqlite"
                    required
                    value={values.command}
                  />
                  <TextAreaField
                    label={formatMessage({ id: "settings.mcp.detail.args", defaultMessage: "Arguments" })}
                    onChange={(value) => setValue("args", value)}
                    placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/workspace"
                    value={values.args}
                  />
                  <TextField
                    label={formatMessage({ id: "settings.mcp.detail.cwd", defaultMessage: "Working directory" })}
                    onChange={(value) => setValue("cwd", value)}
                    placeholder="~/code"
                    value={values.cwd}
                  />
                  <TextAreaField
                    error={errors.env}
                    label={formatMessage({ id: "settings.mcp.detail.envVars", defaultMessage: "Environment variables" })}
                    onChange={(value) => setValue("env", value)}
                    placeholder="TOKEN=env-value"
                    value={values.env}
                  />
                  <TextAreaField
                    label={formatMessage({ id: "settings.mcp.detail.envVarPassthrough", defaultMessage: "Environment variable passthrough" })}
                    onChange={(value) => setValue("envVars", value)}
                    placeholder="GITHUB_TOKEN"
                    value={values.envVars}
                  />
                </>
              ) : (
                <>
                  <TextField
                    error={errors.url}
                    label={formatMessage({ id: "settings.mcp.detail.http.url", defaultMessage: "URL" })}
                    onChange={(value) => setValue("url", value)}
                    placeholder="https://example.com/mcp"
                    required
                    value={values.url}
                  />
                  <TextField
                    label={formatMessage({ id: "settings.mcp.detail.http.bearerToken", defaultMessage: "Bearer token env var" })}
                    onChange={(value) => setValue("bearerTokenEnvVar", value)}
                    placeholder="LINEAR_API_KEY"
                    value={values.bearerTokenEnvVar}
                  />
                  {/*
                   * Codex Desktop i18n (mcp-settings chunk, settings.mcp.detail.http.*):
                   *   headers     = "Headers"
                   *   envHeaders  = "Headers from environment variables"
                   */}
                  <TextAreaField
                    error={errors.httpHeaders}
                    label={formatMessage({ id: "settings.mcp.detail.http.headers", defaultMessage: "Headers" })}
                    onChange={(value) => setValue("httpHeaders", value)}
                    placeholder="X-Header=value"
                    value={values.httpHeaders}
                  />
                  <TextAreaField
                    error={errors.envHttpHeaders}
                    label={formatMessage({ id: "settings.mcp.detail.http.envHeaders", defaultMessage: "Headers from environment variables" })}
                    onChange={(value) => setValue("envHttpHeaders", value)}
                    placeholder="Authorization=LINEAR_API_KEY"
                    value={values.envHttpHeaders}
                  />
                </>
              )}

              <label className="hc-mcp-tool-field">
                <span className="hc-mcp-tool-checkbox">
                  <input
                    checked={values.enabled}
                    type="checkbox"
                    onChange={(event) => setValue("enabled", event.currentTarget.checked)}
                  />
                  <span>{formatMessage({ id: "hc.mcpForm.enabled", defaultMessage: "Enabled" })}</span>
                </span>
              </label>
              <label className="hc-mcp-tool-field">
                <span className="hc-mcp-tool-checkbox">
                  <input
                    checked={values.required}
                    type="checkbox"
                    onChange={(event) => setValue("required", event.currentTarget.checked)}
                  />
                  <span>{formatMessage({ id: "hc.mcpForm.requiredAtStartup", defaultMessage: "Required at startup" })}</span>
                </span>
              </label>

              <TextAreaField
                label={formatMessage({ id: "hc.mcpForm.enabledTools", defaultMessage: "Enabled tools" })}
                onChange={(value) => setValue("enabledTools", value)}
                placeholder="search&#10;read"
                value={values.enabledTools}
              />
              <TextAreaField
                label={formatMessage({ id: "hc.mcpForm.disabledTools", defaultMessage: "Disabled tools" })}
                onChange={(value) => setValue("disabledTools", value)}
                placeholder="write"
                value={values.disabledTools}
              />
              <TextField
                error={errors.startupTimeoutSec}
                label={formatMessage({ id: "hc.mcpForm.startupTimeoutSec", defaultMessage: "Startup timeout seconds" })}
                onChange={(value) => setValue("startupTimeoutSec", value)}
                placeholder="20"
                value={values.startupTimeoutSec}
              />
              <TextField
                error={errors.startupTimeoutMs}
                label={formatMessage({ id: "hc.mcpForm.startupTimeoutMs", defaultMessage: "Startup timeout milliseconds" })}
                onChange={(value) => setValue("startupTimeoutMs", value)}
                placeholder="20000"
                value={values.startupTimeoutMs}
              />
              <TextField
                error={errors.toolTimeoutSec}
                label={formatMessage({ id: "hc.mcpForm.toolTimeoutSec", defaultMessage: "Tool timeout seconds" })}
                onChange={(value) => setValue("toolTimeoutSec", value)}
                placeholder="90"
                value={values.toolTimeoutSec}
              />
            </div>
          </div>
          <footer className="hc-mcp-tool-form-footer">
            <button className="hc-button" type="button" onClick={onClose}>
              <X size={15} />
              <span>{formatMessage({ id: "common.cancel", defaultMessage: "Cancel" })}</span>
            </button>
            {/* codex: settings.mcp.detail.save = "Save" */}
            <button className="hc-button hc-mcp-tool-submit" type="submit">
              <Save size={15} />
              <span>{formatMessage({ id: "settings.mcp.detail.save", defaultMessage: "Save" })}</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function TextField({
  error,
  label,
  onChange,
  placeholder,
  required,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <label className="hc-mcp-tool-field" data-error={error ? "true" : "false"}>
      <span className="hc-mcp-tool-field-header">
        <span>{label}</span>
        {required && <em>{formatMessage({ id: "hc.mcpForm.required", defaultMessage: "Required" })}</em>}
      </span>
      <input
        className="hc-mcp-tool-control"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error && <small className="hc-mcp-tool-field-error">{error}</small>}
    </label>
  );
}

function TextAreaField({
  error,
  label,
  onChange,
  placeholder,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="hc-mcp-tool-field" data-error={error ? "true" : "false"}>
      <span className="hc-mcp-tool-field-header"><span>{label}</span></span>
      <textarea
        className="hc-mcp-tool-control"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error && <small className="hc-mcp-tool-field-error">{error}</small>}
    </label>
  );
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
