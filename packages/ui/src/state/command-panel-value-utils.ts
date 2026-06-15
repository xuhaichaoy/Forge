import type { CommandPanelSecondaryAction } from "./command-panel-types";

export function stringArrayField(value: unknown, key: string): string[] {
  if (!isRecordValue(value)) return [];
  const field = value[key];
  return Array.isArray(field)
    ? field.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

export function recordField(value: unknown, key: string): Record<string, unknown> {
  if (!isRecordValue(value)) return {};
  const field = value[key];
  return isRecordValue(field) ? field : {};
}

export function booleanField(value: unknown, key: string): boolean {
  return isRecordValue(value) && value[key] === true;
}

export function numberField(value: unknown, key: string): number | null {
  if (!isRecordValue(value)) return null;
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

export function cleanSecondaryActions(
  values: Array<CommandPanelSecondaryAction | false | null | undefined>,
): CommandPanelSecondaryAction[] {
  return values.filter((value): value is CommandPanelSecondaryAction => Boolean(value));
}

export function firstLine(value: string): string {
  const line = value.trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > 72 ? `${line.slice(0, 69)}...` : line;
}

export function inferNameFromPath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed || "skill";
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
