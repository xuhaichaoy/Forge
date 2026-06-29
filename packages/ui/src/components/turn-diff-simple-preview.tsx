type TurnDiffSimpleRow =
  | {
      id: string;
      kind: "context" | "addition" | "deletion";
      lineNumber: number;
      marker: " " | "+" | "-";
      text: string;
    }
  | {
      id: string;
      kind: "separator";
    }
  | {
      id: string;
      kind: "no-newline";
      text: string;
    };

const HUNK_HEADER_RE = /^@@ -(?<oldStart>\d+)(?:,\d+)? \+(?<newStart>\d+)(?:,\d+)? @@/u;

export function TurnDiffSimplePreview({ diff }: { diff: string }) {
  const rows = parseTurnDiffSimpleRows(diff);
  return (
    <pre
      className="hc-turn-diff-simple-preview composer-diff-simple-line"
      data-background=""
      data-diff=""
      data-diff-type="single"
      data-overflow="scroll"
    >
      <code className="hc-turn-diff-simple-preview-code" data-code="" data-unified="">
        {rows.map((row, index) => renderTurnDiffSimpleRow(row, index))}
      </code>
    </pre>
  );
}

export function parseTurnDiffSimpleRows(diff: string): TurnDiffSimpleRow[] {
  const rows: TurnDiffSimpleRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let hunkIndex = 0;
  let inHunk = false;

  for (const [lineIndex, line] of diff.split("\n").entries()) {
    const hunk = HUNK_HEADER_RE.exec(line);
    if (hunk?.groups) {
      if (hunkIndex > 0) rows.push({ id: `separator-${lineIndex}`, kind: "separator" });
      oldLine = Number.parseInt(hunk.groups.oldStart ?? "0", 10);
      newLine = Number.parseInt(hunk.groups.newStart ?? "0", 10);
      hunkIndex += 1;
      inHunk = true;
      continue;
    }

    if (!inHunk || isUnifiedDiffMetadataLine(line)) continue;

    if (line.startsWith("\\ No newline")) {
      rows.push({ id: `no-newline-${lineIndex}`, kind: "no-newline", text: line.slice(2) });
      continue;
    }

    if (line.startsWith("+")) {
      rows.push({
        id: `addition-${lineIndex}`,
        kind: "addition",
        lineNumber: newLine,
        marker: "+",
        text: line.slice(1),
      });
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      rows.push({
        id: `deletion-${lineIndex}`,
        kind: "deletion",
        lineNumber: oldLine,
        marker: "-",
        text: line.slice(1),
      });
      oldLine += 1;
      continue;
    }

    const text = line.startsWith(" ") ? line.slice(1) : line;
    rows.push({
      id: `context-${lineIndex}`,
      kind: "context",
      lineNumber: newLine,
      marker: " ",
      text,
    });
    oldLine += 1;
    newLine += 1;
  }

  return rows;
}

function renderTurnDiffSimpleRow(row: TurnDiffSimpleRow, index: number) {
  if (row.kind === "separator") {
    return (
      <span className="hc-turn-diff-simple-row" data-separator-row="" key={row.id}>
        <span className="hc-turn-diff-simple-number" data-separator="simple" />
        <span className="hc-turn-diff-simple-line" data-separator="simple" />
      </span>
    );
  }

  if (row.kind === "no-newline") {
    return (
      <span className="hc-turn-diff-simple-row" key={row.id}>
        <span className="hc-turn-diff-simple-number" data-gutter-buffer="annotation" />
        <span className="hc-turn-diff-simple-line" data-no-newline="" data-line-index={index}>
          {row.text}
        </span>
      </span>
    );
  }

  const lineType = row.kind === "addition"
    ? "change-addition"
    : row.kind === "deletion"
      ? "change-deletion"
      : "context";

  return (
    <span className="hc-turn-diff-simple-row" key={row.id}>
      <span
        className="hc-turn-diff-simple-number"
        data-column-number={row.lineNumber}
        data-line-index={index}
        data-line-type={lineType}
      >
        <span data-line-number-content="">{row.lineNumber}</span>
      </span>
      <span
        className="hc-turn-diff-simple-line"
        data-line={row.lineNumber}
        data-line-index={index}
        data-line-type={lineType}
      >
        <span className="hc-turn-diff-simple-marker" aria-hidden="true">{row.marker}</span>
        {row.text}
      </span>
    </span>
  );
}

function isUnifiedDiffMetadataLine(line: string): boolean {
  return line.startsWith("diff --git ")
    || line.startsWith("index ")
    || line.startsWith("new file mode ")
    || line.startsWith("deleted file mode ")
    || line.startsWith("old mode ")
    || line.startsWith("new mode ")
    || line.startsWith("similarity index ")
    || line.startsWith("dissimilarity index ")
    || line.startsWith("rename from ")
    || line.startsWith("rename to ")
    || line.startsWith("--- ")
    || line.startsWith("+++ ");
}
