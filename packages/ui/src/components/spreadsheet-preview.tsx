// CODEX-REF: open-workspace-file-*.js
//   Codex Desktop maps xlsx/xlsm/csv/tsv via
//     var _=new Map([["xlsm","xlsx"],["xlsx","xlsx"],["csv","csv"],["tsv","tsv"]]);
//   to artifactType:"spreadsheet" and renders them through its closed-source
//   .NET WASM Popcorn Workbook viewer (~12MB). Forge deliberately ships a
//   simplified replacement: SheetJS parses the workbook on the renderer side
//   and we emit a plain HTML <table>. No formula recalculation, no charts,
//   no style fidelity -- this is a reduced preview, not a feature-parity port.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

export type SpreadsheetPreviewKind = "xlsx" | "csv" | "tsv";

export interface SpreadsheetPreviewProps {
  /** xlsx/xlsm/csv/tsv binary content (e.g. ArrayBuffer from readBinaryFile). */
  data: ArrayBuffer | Uint8Array;
  /** Suffix-derived parsing hint; mirrors Codex's importKind classification. */
  importKind: SpreadsheetPreviewKind;
  className?: string;
  style?: CSSProperties;
}

interface ParsedWorkbook {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
}

function joinClassName(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}

export function SpreadsheetPreview({
  data,
  importKind,
  className,
  style,
}: SpreadsheetPreviewProps) {
  // CODEX-REF: open-workspace-file-*.js — Codex's xlsx path runs through
  // its WASM XlsxReader; Forge calls SheetJS XLSX.read once and caches the
  // workbook so sheet switching is instantaneous and avoids re-parsing.
  const parsed = useMemo<ParsedWorkbook | null>(() => {
    try {
      const opts: XLSX.ParsingOptions = { type: "array" };
      if (importKind === "csv") {
        opts.raw = false;
      }
      const workbook = XLSX.read(data, opts);
      return { workbook, sheetNames: workbook.SheetNames ?? [] };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[SpreadsheetPreview] parse error:", err);
      return null;
    }
  }, [data, importKind]);

  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);

  useEffect(() => {
    if (parsed && parsed.sheetNames.length > 0) {
      setActiveSheetName(parsed.sheetNames[0] ?? null);
    } else {
      setActiveSheetName(null);
    }
  }, [parsed]);

  // CODEX-REF: open-workspace-file-*.js — Codex's Popcorn renderer
  // builds its own grid; Forge calls SheetJS sheet_to_html, which produces
  // a sanitized, non-editable <table> string. We intentionally skip styles,
  // images, comments, merged-region painting beyond what sheet_to_html emits.
  // FIX: SheetJS sheet_to_html 默认会返回完整 HTML 文档（含 <html>/<head>/
  //   <meta>/<title>/<body>），通过 dangerouslySetInnerHTML 注入到 <div>
  //   后，浏览器解析这些 wrapper 标签会破坏宿主页面的 DOM/布局——具体表现
  //   是聊天主区上方出现一大段不可见的空白（内容存在但被挤下去）。这里只
  //   保留内层 <table>...</table>，丢掉所有外层 wrapper，避免污染。
  //   注意：useMemo 必须放在所有 early return 之前，否则违反 Rules of Hooks。
  const sheet =
    parsed && activeSheetName ? parsed.workbook.Sheets[activeSheetName] : undefined;
  const tableHtml = useMemo(() => {
    if (!sheet) return "";
    const fullHtml = XLSX.utils.sheet_to_html(sheet, {
      id: "hc-spreadsheet-table",
      editable: false,
    });
    const tableMatch = fullHtml.match(/<table[\s\S]*?<\/table>/i);
    return tableMatch ? tableMatch[0] : "";
  }, [sheet]);

  if (!parsed) {
    return (
      <div className={joinClassName("hc-spreadsheet-empty", className)} style={style}>
        Couldn&apos;t parse this spreadsheet
      </div>
    );
  }
  if (!activeSheetName) {
    return (
      <div className={joinClassName("hc-spreadsheet-empty", className)} style={style}>
        This workbook contains no sheets
      </div>
    );
  }

  return (
    <div className={joinClassName("hc-spreadsheet-preview", className)} style={style}>
      {parsed.sheetNames.length > 1 && (
        <div className="hc-spreadsheet-tabs" role="tablist">
          {parsed.sheetNames.map((name) => {
            const isActive = name === activeSheetName;
            return (
              <button
                aria-selected={isActive}
                className={joinClassName(
                  "hc-spreadsheet-tab",
                  isActive && "is-active",
                )}
                key={name}
                onClick={() => setActiveSheetName(name)}
                role="tab"
                type="button"
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <div
        className="hc-spreadsheet-table-wrap"
        // CODEX-REF: open-workspace-file-*.js — sheet_to_html output is
        // a self-contained <table>; SheetJS escapes cell content, so we accept
        // the dangerouslySetInnerHTML here in exchange for not having to write
        // a virtualized grid. Production hardening would render the cells with
        // React directly.
        dangerouslySetInnerHTML={{ __html: tableHtml }}
      />
    </div>
  );
}
