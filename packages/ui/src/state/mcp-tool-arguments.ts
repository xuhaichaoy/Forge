export type McpToolArgumentFieldKind = "string" | "number" | "integer" | "boolean" | "json";
export type McpToolArgumentFieldInput = "text" | "number" | "checkbox" | "textarea" | "select";
export type McpToolArgumentValue = string | boolean;
export type McpToolArgumentValues = Record<string, McpToolArgumentValue>;

export interface McpToolArgumentOption {
  label: string;
  value: string;
  raw: unknown;
}

export interface McpToolArgumentField {
  name: string;
  label: string;
  required: boolean;
  kind: McpToolArgumentFieldKind;
  input: McpToolArgumentFieldInput;
  description?: string;
  placeholder?: string;
  options?: McpToolArgumentOption[];
  defaultValue?: McpToolArgumentValue;
}

export interface McpToolArgumentBuildResult {
  arguments: Record<string, unknown>;
  errors: Record<string, string>;
}

export function projectMcpToolArgumentFields(tool: unknown): McpToolArgumentField[] {
  const schema = mcpToolInputSchema(tool);
  const required = new Set(mcpToolRequiredArguments(tool));
  const properties = recordField(schema, "properties");
  const fields = Object.entries(properties).map(([name, property]) => (
    mcpToolArgumentField(name, property, required.has(name))
  ));

  for (const name of required) {
    if (fields.some((field) => field.name === name)) continue;
    fields.push(mcpToolArgumentField(name, {}, true));
  }
  return fields;
}

export function mcpToolRequiredArguments(tool: unknown): string[] {
  const schema = mcpToolInputSchema(tool);
  const required = schema.required;
  return Array.isArray(required)
    ? required.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function emptyMcpToolArgumentValues(fields: McpToolArgumentField[]): McpToolArgumentValues {
  const values: McpToolArgumentValues = {};
  for (const field of fields) {
    values[field.name] = field.defaultValue ?? (field.input === "checkbox" ? false : "");
  }
  return values;
}

export function buildMcpToolArguments(
  fields: McpToolArgumentField[],
  values: McpToolArgumentValues,
): McpToolArgumentBuildResult {
  const args: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = values[field.name];
    if (field.input === "checkbox") {
      if (field.required || value === true) args[field.name] = value === true;
      continue;
    }

    const text = typeof value === "string" ? value : "";
    if (field.input === "select") {
      if (!text) {
        if (field.required) errors[field.name] = "Required";
        continue;
      }
      const option = field.options?.find((item) => item.value === text);
      if (!option) {
        errors[field.name] = "Choose a valid option";
        continue;
      }
      args[field.name] = option.raw;
      continue;
    }

    if (!text.trim()) {
      if (field.required) errors[field.name] = "Required";
      continue;
    }

    if (field.kind === "string") {
      args[field.name] = text;
    } else if (field.kind === "number" || field.kind === "integer") {
      const numberValue = Number(text);
      if (!Number.isFinite(numberValue)) {
        errors[field.name] = "Enter a number";
      } else if (field.kind === "integer" && !Number.isInteger(numberValue)) {
        errors[field.name] = "Enter an integer";
      } else {
        args[field.name] = numberValue;
      }
    } else if (field.kind === "json") {
      try {
        args[field.name] = JSON.parse(text);
      } catch {
        errors[field.name] = "Enter valid JSON";
      }
    }
  }

  return { arguments: args, errors };
}

function mcpToolInputSchema(tool: unknown): Record<string, unknown> {
  if (!isRecord(tool)) return {};
  const schema = tool.inputSchema ?? tool.input_schema;
  return isRecord(schema) ? schema : {};
}

function mcpToolArgumentField(name: string, schemaValue: unknown, required: boolean): McpToolArgumentField {
  const schema = isRecord(schemaValue) ? schemaValue : {};
  const kind = fieldKind(schema);
  const options = fieldOptions(schema);
  const input = options.length > 0 ? "select" : fieldInput(kind);
  const defaultValue = fieldDefaultValue(schema.default, kind, options, input);
  return {
    name,
    label: fieldText(schema, "title") || humanizeArgumentName(name),
    required,
    kind,
    input,
    description: fieldText(schema, "description") || undefined,
    placeholder: fieldPlaceholder(kind),
    options: options.length > 0 ? options : undefined,
    defaultValue,
  };
}

function fieldKind(schema: Record<string, unknown>): McpToolArgumentFieldKind {
  const type = schemaType(schema);
  if (type === "number") return "number";
  if (type === "integer") return "integer";
  if (type === "boolean") return "boolean";
  if (type === "array" || type === "object") return "json";
  return "string";
}

function fieldInput(kind: McpToolArgumentFieldKind): McpToolArgumentFieldInput {
  if (kind === "boolean") return "checkbox";
  if (kind === "json") return "textarea";
  if (kind === "number" || kind === "integer") return "number";
  return "text";
}

function fieldPlaceholder(kind: McpToolArgumentFieldKind): string | undefined {
  if (kind === "json") return "{}";
  if (kind === "number" || kind === "integer") return "0";
  return undefined;
}

function fieldDefaultValue(
  value: unknown,
  kind: McpToolArgumentFieldKind,
  options: McpToolArgumentOption[],
  input: McpToolArgumentFieldInput,
): McpToolArgumentValue | undefined {
  if (input === "select") {
    return options.find((option) => deepEqual(option.raw, value))?.value;
  }
  if (kind === "boolean") return typeof value === "boolean" ? value : undefined;
  if (value === undefined) return undefined;
  if (kind === "json") return JSON.stringify(value, null, 2);
  if (kind === "number" || kind === "integer") return typeof value === "number" ? String(value) : undefined;
  return typeof value === "string" ? value : undefined;
}

function fieldOptions(schema: Record<string, unknown>): McpToolArgumentOption[] {
  if (Array.isArray(schema.enum)) return schema.enum.map((value, index) => optionFromRawValue(value, index));
  const variants = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : [];
  return variants.flatMap((variant, index) => {
    if (!isRecord(variant)) return [];
    if (Object.prototype.hasOwnProperty.call(variant, "const")) {
      return [optionFromRawValue(variant.const, index, fieldText(variant, "title"))];
    }
    if (Array.isArray(variant.enum) && variant.enum.length === 1) {
      return [optionFromRawValue(variant.enum[0], index, fieldText(variant, "title"))];
    }
    return [];
  });
}

function optionFromRawValue(value: unknown, index: number, title = ""): McpToolArgumentOption {
  return {
    label: title || optionLabel(value),
    value: String(index),
    raw: value,
  };
}

function optionLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
}

function schemaType(schema: Record<string, unknown>): string {
  const type = schema.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type)) {
    return type.find((item): item is string => typeof item === "string" && item !== "null") ?? "";
  }
  return "";
}

function humanizeArgumentName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || name;
}

function recordField(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const field = value[key];
  return isRecord(field) ? field : {};
}

function fieldText(value: unknown, key: string): string {
  if (!isRecord(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
