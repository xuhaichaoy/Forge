import type { MarkdownBlock, MarkdownTableAlign } from "./conversation-markdown-engine";

type MarkdownBlockBoundaryPredicate = (line: string, nextLine?: string) => boolean;

export function parseMarkdownTable(
  lines: string[],
  index: number,
  isBlockBoundary: MarkdownBlockBoundaryPredicate,
): { block: MarkdownBlock; nextIndex: number } | null {
  const headerLine = lines[index] ?? "";
  const separatorLine = lines[index + 1] ?? "";
  if (!headerLine.includes("|") || !isTableSeparatorRow(separatorLine)) return null;
  const headers = splitTableRow(headerLine);
  if (headers.length === 0) return null;
  const aligns = normalizeTableAligns(tableSeparatorAligns(separatorLine), headers.length);

  const rows: string[][] = [];
  let nextIndex = index + 2;
  while (nextIndex < lines.length) {
    const rowLine = lines[nextIndex] ?? "";
    if (rowLine.trim().length === 0 || !rowLine.includes("|") || isBlockBoundary(rowLine, lines[nextIndex + 1] ?? "")) {
      break;
    }
    rows.push(normalizeTableRow(splitTableRow(rowLine), headers.length));
    nextIndex += 1;
  }

  return {
    block: aligns.some((align) => align != null)
      ? { kind: "table", headers, rows, aligns }
      : { kind: "table", headers, rows },
    nextIndex,
  };
}

export function isTableSeparatorRow(line: string): boolean {
  if (!line.includes("|")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, "")));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index] ?? "";
    if (char !== "|") {
      cell += char;
      continue;
    }
    if (isEscapedMarkdownIndex(trimmed, index)) {
      cell = cell.endsWith("\\") ? cell.slice(0, -1) : cell;
      cell += "|";
      continue;
    }
    cells.push(cell);
    cell = "";
  }
  cells.push(cell);
  if (cells[0]?.trim() === "") cells.shift();
  if (cells.at(-1)?.trim() === "") cells.pop();
  return cells.map((cell) => cell.trim());
}

export function normalizeTableRow(cells: string[], width: number): string[] {
  const normalized = cells.slice(0, width);
  while (normalized.length < width) normalized.push("");
  return normalized;
}

function tableSeparatorAligns(line: string): MarkdownTableAlign[] {
  return splitTableRow(line).map((cell) => {
    const compact = cell.replace(/\s+/g, "");
    if (/^:-+:$/.test(compact)) return "center";
    if (/^-+:$/.test(compact)) return "right";
    if (/^:-+$/.test(compact)) return "left";
    return null;
  });
}

function normalizeTableAligns(aligns: MarkdownTableAlign[], width: number): MarkdownTableAlign[] {
  const normalized = aligns.slice(0, width);
  while (normalized.length < width) normalized.push(null);
  return normalized;
}

function isEscapedMarkdownIndex(text: string, index: number): boolean {
  let slashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && text[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }
  return slashCount % 2 === 1;
}
