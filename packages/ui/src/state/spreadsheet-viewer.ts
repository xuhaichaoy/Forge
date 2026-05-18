export interface SpreadsheetFreezePanesView {
  xSplit?: number | null;
  ySplit?: number | null;
  topLeftCell?: string | null;
}

export interface SpreadsheetSheetView {
  name: string;
  index: number;
  selected: boolean;
}

export interface SpreadsheetPreviewViewInput {
  rows: string[][];
  truncated: boolean;
  sheetName?: string | null;
  sheetIndex?: number | null;
  sheetCount?: number | null;
  sheets?: SpreadsheetSheetView[] | null;
  freezePanes?: SpreadsheetFreezePanesView | null;
  maxRows?: number | null;
  maxCols?: number | null;
}

export interface SpreadsheetPreviewViewModel {
  sheetLabel: string;
  sampleLabel: string;
  freezePaneLabel: string | null;
  boundary: string;
  details: string[];
}

export function projectSpreadsheetPreviewView(
  preview: SpreadsheetPreviewViewInput,
): SpreadsheetPreviewViewModel {
  const sheetIndex = normalizedPositiveIndex(preview.sheetIndex);
  const sheetCount = normalizedPositiveCount(preview.sheetCount) ?? normalizedPositiveCount(preview.sheets?.length);
  const sheetName = preview.sheetName?.trim()
    || preview.sheets?.find((sheet) => sheet.selected)?.name?.trim()
    || "Sheet 1";
  const visibleRows = preview.rows.length;
  const visibleCols = Math.max(0, ...preview.rows.map((row) => row.length));
  const maxRows = positiveInteger(preview.maxRows) ?? visibleRows;
  const maxCols = positiveInteger(preview.maxCols) ?? visibleCols;
  const sheetLabel = sheetCount && sheetCount > 1
    ? `${sheetName} (${sheetIndex + 1} of ${sheetCount})`
    : sheetName;
  const freezePaneLabel = formatFreezePanes(preview.freezePanes);
  const details = [
    `Showing ${visibleRows} row(s) x ${visibleCols} column(s)`,
    `Sample limit: ${maxRows} rows x ${maxCols} columns`,
  ];
  if (sheetCount && sheetCount > 1) {
    details.push("Only the selected workbook sheet is rendered in this preview");
  }
  if (freezePaneLabel) details.push(freezePaneLabel);
  if (preview.truncated) details.push("Preview is truncated");

  return {
    sheetLabel,
    sampleLabel: `${visibleRows}x${visibleCols} sample`,
    freezePaneLabel,
    boundary: spreadsheetPreviewBoundary(preview),
    details,
  };
}

export function spreadsheetPreviewBoundary(preview: SpreadsheetPreviewViewInput): string {
  const sheetCount = normalizedPositiveCount(preview.sheetCount) ?? normalizedPositiveCount(preview.sheets?.length);
  const workbookSuffix = sheetCount && sheetCount > 1
    ? " Only one sheet is shown here."
    : "";
  return `Lower-fidelity spreadsheet preview: formulas, formatting, charts, filters, and macros are not rendered.${workbookSuffix} Open externally for the complete workbook.`;
}

function formatFreezePanes(value: SpreadsheetFreezePanesView | null | undefined): string | null {
  if (!value) return null;
  const xSplit = positiveInteger(value.xSplit);
  const ySplit = positiveInteger(value.ySplit);
  if (!xSplit && !ySplit) return null;
  const pieces = [];
  if (ySplit) pieces.push(`${ySplit} frozen row(s)`);
  if (xSplit) pieces.push(`${xSplit} frozen column(s)`);
  const target = value.topLeftCell?.trim();
  return `Freeze panes: ${pieces.join(", ")}${target ? `, starts at ${target}` : ""}`;
}

function normalizedPositiveIndex(value: unknown): number {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, numberValue);
}

function normalizedPositiveCount(value: unknown): number | null {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return numberValue > 0 ? numberValue : null;
}

function positiveInteger(value: unknown): number | null {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return numberValue > 0 ? numberValue : null;
}
