import { Save, Server, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useHiCodexIntl } from "./i18n-provider";
import {
  McpServerAdvancedFields,
  McpServerHttpFields,
  McpServerNameField,
  McpServerStdioFields,
  McpServerTransportField,
} from "./mcp-server-config-fields";
import {
  buildMcpServerConfig,
  initialMcpServerConfigFormValues,
  type McpServerConfigFormValues,
  type McpServerFormAction,
} from "./mcp-server-config-values";

export {
  buildMcpServerConfig,
  initialMcpServerConfigFormValues,
} from "./mcp-server-config-values";
export type {
  McpServerConfigFormValues,
  McpServerFormAction,
} from "./mcp-server-config-values";

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
              <McpServerNameField errors={errors} setValue={setValue} values={values} />
              <McpServerTransportField setValue={setValue} values={values} />
              {isStdio ? (
                <McpServerStdioFields errors={errors} setValue={setValue} values={values} />
              ) : (
                <McpServerHttpFields errors={errors} setValue={setValue} values={values} />
              )}
              <McpServerAdvancedFields errors={errors} setValue={setValue} values={values} />
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
