export interface FileReferenceInput {
  path?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
}

export interface FileReferenceSelection {
  path: string;
  lineStart: number;
  lineEnd: number;
}

export function normalizeFileReference(input: FileReferenceInput): FileReferenceSelection | null {
  const path = input.path?.trim() ?? "";
  if (!path) return null;

  const lineStart = positiveInteger(input.lineStart) ?? 1;
  const rawLineEnd = positiveInteger(input.lineEnd) ?? lineStart;
  const lineEnd = Math.max(lineStart, rawLineEnd);

  return { path, lineStart, lineEnd };
}

export function fileReferenceKey(reference: FileReferenceSelection): string {
  return `${reference.path}:${reference.lineStart}-${reference.lineEnd}`;
}

export function fileReferenceLineLabel(
  reference: Pick<FileReferenceSelection, "lineStart" | "lineEnd">,
): string {
  return reference.lineStart === reference.lineEnd
    ? `Line ${reference.lineStart}`
    : `Lines ${reference.lineStart}-${reference.lineEnd}`;
}

export function fileReferenceDisplayPath(path: string, maxLength = 96): string {
  const normalized = path.trim();
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 4) return normalized.slice(0, maxLength);
  return `...${normalized.slice(-(maxLength - 3))}`;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
