import { Play, Server, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { CommandPanelEntry } from "../state/command-panel";
import {
  buildMcpToolArguments,
  emptyMcpToolArgumentValues,
  type McpToolArgumentField,
  type McpToolArgumentValues,
} from "../state/mcp-tool-arguments";

type McpToolFormAction = Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openMcpToolForm" }>;

export interface McpToolCallFormProps {
  action: McpToolFormAction;
  onClose: () => void;
  onSubmit: (argumentsValue: Record<string, unknown>) => void;
}

export function McpToolCallForm({ action, onClose, onSubmit }: McpToolCallFormProps) {
  const initialValues = useMemo(() => emptyMcpToolArgumentValues(action.fields), [action.fields]);
  const [values, setValues] = useState<McpToolArgumentValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function updateField(name: string, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildMcpToolArguments(action.fields, values);
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0) return;
    onSubmit(result.arguments);
  }

  return (
    <div className="hc-settings-backdrop">
      <section className="hc-command-panel hc-mcp-tool-form">
        <header>
          <div>
            <Server size={17} />
            <span>{action.title}</span>
          </div>
          <button className="hc-icon-button" type="button" onClick={onClose} aria-label="Close MCP tool form">
            <X size={16} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="hc-mcp-tool-form-body">
            <div className="hc-mcp-tool-form-summary">
              <strong>{action.server}:{action.tool}</strong>
              {action.description && <span>{action.description}</span>}
            </div>
            <div className="hc-mcp-tool-fields">
              {action.fields.map((field) => (
                <McpToolArgumentControl
                  error={errors[field.name]}
                  field={field}
                  key={field.name}
                  onChange={updateField}
                  value={values[field.name] ?? (field.input === "checkbox" ? false : "")}
                />
              ))}
            </div>
          </div>
          <footer className="hc-mcp-tool-form-footer">
            <button className="hc-button" type="button" onClick={onClose}>
              <X size={15} />
              <span>Cancel</span>
            </button>
            <button className="hc-button hc-mcp-tool-submit" type="submit">
              <Play size={15} />
              <span>Call tool</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function McpToolArgumentControl({
  error,
  field,
  onChange,
  value,
}: {
  error?: string;
  field: McpToolArgumentField;
  onChange: (name: string, value: string | boolean) => void;
  value: string | boolean;
}) {
  return (
    <label className="hc-mcp-tool-field" data-error={error ? "true" : "false"}>
      <span className="hc-mcp-tool-field-header">
        <span>{field.label}</span>
        {field.required && <em>Required</em>}
      </span>
      {field.description && <small>{field.description}</small>}
      {field.input === "checkbox" ? (
        <span className="hc-mcp-tool-checkbox">
          <input
            checked={value === true}
            type="checkbox"
            onChange={(event) => onChange(field.name, event.currentTarget.checked)}
          />
          <span>{field.name}</span>
        </span>
      ) : field.input === "select" ? (
        <select
          className="hc-mcp-tool-control"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(field.name, event.currentTarget.value)}
        >
          <option value="">Select</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : field.input === "textarea" ? (
        <textarea
          className="hc-mcp-tool-control"
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(field.name, event.currentTarget.value)}
        />
      ) : (
        <input
          className="hc-mcp-tool-control"
          inputMode={field.input === "number" ? "decimal" : undefined}
          placeholder={field.placeholder}
          type={field.input === "number" ? "number" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(field.name, event.currentTarget.value)}
        />
      )}
      {error && <small className="hc-mcp-tool-field-error">{error}</small>}
    </label>
  );
}
