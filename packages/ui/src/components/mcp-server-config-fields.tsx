import { useHiCodexIntl } from "./i18n-provider";
import type { McpServerConfigFormValues } from "./mcp-server-config-values";

type McpServerConfigErrors = Record<string, string>;

type McpServerConfigSetValue = <K extends keyof McpServerConfigFormValues>(
  key: K,
  value: McpServerConfigFormValues[K],
) => void;

interface McpServerConfigFieldGroupProps {
  errors: McpServerConfigErrors;
  setValue: McpServerConfigSetValue;
  values: McpServerConfigFormValues;
}

export function McpServerNameField({
  errors,
  setValue,
  values,
}: McpServerConfigFieldGroupProps) {
  const { formatMessage } = useHiCodexIntl();
  return (
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
  );
}

export function McpServerTransportField({
  setValue,
  values,
}: Pick<McpServerConfigFieldGroupProps, "setValue" | "values">) {
  const { formatMessage } = useHiCodexIntl();
  return (
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
  );
}

export function McpServerStdioFields({
  errors,
  setValue,
  values,
}: McpServerConfigFieldGroupProps) {
  const { formatMessage } = useHiCodexIntl();
  return (
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
  );
}

export function McpServerHttpFields({
  errors,
  setValue,
  values,
}: McpServerConfigFieldGroupProps) {
  const { formatMessage } = useHiCodexIntl();
  return (
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
  );
}

export function McpServerAdvancedFields({
  errors,
  setValue,
  values,
}: McpServerConfigFieldGroupProps) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <>
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
    </>
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
