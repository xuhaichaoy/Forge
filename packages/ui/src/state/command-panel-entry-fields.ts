/*
 * Shared unknown-payload field readers for command-panel entry projection.
 * Moved verbatim out of state/command-panel.ts; consumed by the mcp/skill/
 * plugin/app entry modules and by the root aggregator.
 */

export function textDetails(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 8);
}

export function responseItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  if (Array.isArray(value.data)) return value.data.filter(isRecord);
  return [];
}

export function arrayField(value: unknown, key: string): Record<string, unknown>[] {
  if (!isRecord(value)) return [];
  const field = value[key];
  return Array.isArray(field) ? field.filter(isRecord) : [];
}

export function fieldText(value: unknown, key: string): string {
  if (!isRecord(value)) return "";
  const field = value[key];
  if (typeof field === "string") return field.trim();
  if (typeof field === "number" || typeof field === "boolean" || typeof field === "bigint") return String(field);
  return "";
}

export function cleanList(values: Array<string | false | null | undefined>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
