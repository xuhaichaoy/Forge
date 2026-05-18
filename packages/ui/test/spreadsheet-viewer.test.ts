import {
  projectSpreadsheetPreviewView,
  spreadsheetPreviewBoundary,
} from "../src/state/spreadsheet-viewer";

export default function runSpreadsheetViewerTests(): void {
  summarizesSheetAndFreezePaneMetadata();
  explainsLowerFidelityBoundaryForMultiSheetWorkbooks();
}

function summarizesSheetAndFreezePaneMetadata(): void {
  const view = projectSpreadsheetPreviewView({
    rows: [["Name", "Total"], ["A", "42"]],
    truncated: false,
    sheetName: "Revenue",
    sheetIndex: 1,
    sheetCount: 3,
    freezePanes: { xSplit: 1, ySplit: 2, topLeftCell: "B3" },
    maxRows: 80,
    maxCols: 24,
  });

  assertEqual(view.sheetLabel, "Revenue (2 of 3)", "sheet label should include workbook position");
  assertEqual(view.sampleLabel, "2x2 sample", "sample label should report visible bounds");
  assertIncludes(view.details, "Sample limit: 80 rows x 24 columns", "sample limit should be explicit");
  assertIncludes(view.details, "Freeze panes: 2 frozen row(s), 1 frozen column(s), starts at B3", "freeze panes should be explicit");
}

function explainsLowerFidelityBoundaryForMultiSheetWorkbooks(): void {
  const boundary = spreadsheetPreviewBoundary({
    rows: [["A"]],
    truncated: true,
    sheetCount: 2,
  });

  assertIncludes(
    [boundary],
    "Lower-fidelity spreadsheet preview",
    "spreadsheet preview should state the fidelity boundary",
  );
  assertIncludes([boundary], "Only one sheet is shown here.", "multi-sheet preview should state sheet boundary");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(values: string[], expected: string, message: string): void {
  if (!values.some((value) => value.includes(expected))) {
    throw new Error(`${message}: expected to include ${JSON.stringify(expected)}, got ${JSON.stringify(values)}`);
  }
}
