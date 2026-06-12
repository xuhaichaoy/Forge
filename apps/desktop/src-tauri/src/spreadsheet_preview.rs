use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadsheetPreview {
    rows: Vec<Vec<String>>,
    truncated: bool,
    sheet_name: Option<String>,
    sheet_index: usize,
    sheet_count: usize,
    sheets: Vec<SpreadsheetSheet>,
    freeze_panes: Option<SpreadsheetFreezePanes>,
    max_rows: usize,
    max_cols: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadsheetSheet {
    name: String,
    index: usize,
    selected: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadsheetFreezePanes {
    x_split: Option<u32>,
    y_split: Option<u32>,
    top_left_cell: Option<String>,
}

#[derive(Debug, Clone)]
struct XlsxWorkbookSheet {
    name: String,
    rel_id: String,
}

pub fn read_spreadsheet_preview(
    path: &Path,
    max_rows: usize,
    max_cols: usize,
) -> Result<SpreadsheetPreview, String> {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "csv" => Ok(parse_delimited_preview(
            &fs::read_to_string(path)
                .map_err(|error| format!("failed to read spreadsheet text: {error}"))?,
            ',',
            "CSV",
            max_rows,
            max_cols,
        )),
        "tsv" => Ok(parse_delimited_preview(
            &fs::read_to_string(path)
                .map_err(|error| format!("failed to read spreadsheet text: {error}"))?,
            '\t',
            "TSV",
            max_rows,
            max_cols,
        )),
        "xlsx" => read_xlsx_preview(path, max_rows, max_cols),
        _ => Err(format!("unsupported spreadsheet type: {extension}")),
    }
}

fn parse_delimited_preview(
    text: &str,
    delimiter: char,
    sheet_name: &str,
    max_rows: usize,
    max_cols: usize,
) -> SpreadsheetPreview {
    let mut rows = Vec::new();
    let mut truncated = false;
    for line in text.lines() {
        if rows.len() >= max_rows {
            truncated = true;
            break;
        }
        let mut row = parse_delimited_line(line, delimiter);
        if row.len() > max_cols {
            row.truncate(max_cols);
            truncated = true;
        }
        rows.push(row);
    }
    SpreadsheetPreview {
        rows,
        truncated,
        sheet_name: Some(sheet_name.to_string()),
        sheet_index: 0,
        sheet_count: 1,
        sheets: vec![SpreadsheetSheet {
            name: sheet_name.to_string(),
            index: 0,
            selected: true,
        }],
        freeze_panes: None,
        max_rows,
        max_cols,
    }
}

fn parse_delimited_line(line: &str, delimiter: char) -> Vec<String> {
    let mut cells = Vec::new();
    let mut current = String::new();
    let mut chars = line.chars().peekable();
    let mut in_quotes = false;
    while let Some(ch) = chars.next() {
        if ch == '"' {
            if in_quotes && chars.peek() == Some(&'"') {
                current.push('"');
                chars.next();
            } else {
                in_quotes = !in_quotes;
            }
            continue;
        }
        if ch == delimiter && !in_quotes {
            cells.push(current.trim().to_string());
            current.clear();
            continue;
        }
        current.push(ch);
    }
    cells.push(current.trim().to_string());
    cells
}

fn read_xlsx_preview(
    path: &Path,
    max_rows: usize,
    max_cols: usize,
) -> Result<SpreadsheetPreview, String> {
    let shared_strings = unzip_member_text(path, "xl/sharedStrings.xml")
        .ok()
        .flatten()
        .map(|xml| parse_shared_strings(&xml))
        .unwrap_or_default();
    let workbook_sheets = xlsx_workbook_sheets(path).unwrap_or_default();
    let selected_sheet = workbook_sheets.first().cloned();
    let sheet_path = selected_sheet
        .as_ref()
        .and_then(|sheet| xlsx_sheet_path_for_relationship(path, &sheet.rel_id))
        .unwrap_or_else(|| "xl/worksheets/sheet1.xml".to_string());
    let sheet_xml = unzip_member_text(path, &sheet_path)?
        .ok_or_else(|| format!("failed to read worksheet from xlsx: {sheet_path}"))?;
    let mut preview = parse_xlsx_sheet_preview(&sheet_xml, &shared_strings, max_rows, max_cols);
    let sheet_count = workbook_sheets.len().max(1);
    let sheet_name = selected_sheet
        .as_ref()
        .map(|sheet| sheet.name.clone())
        .unwrap_or_else(|| "Sheet 1".to_string());
    preview.sheet_name = Some(sheet_name.clone());
    preview.sheet_index = 0;
    preview.sheet_count = sheet_count;
    preview.sheets = if workbook_sheets.is_empty() {
        vec![SpreadsheetSheet {
            name: sheet_name,
            index: 0,
            selected: true,
        }]
    } else {
        workbook_sheets
            .iter()
            .enumerate()
            .map(|(index, sheet)| SpreadsheetSheet {
                name: sheet.name.clone(),
                index,
                selected: index == 0,
            })
            .collect()
    };
    preview.freeze_panes = parse_xlsx_freeze_panes(&sheet_xml);
    Ok(preview)
}

fn xlsx_workbook_sheets(path: &Path) -> Option<Vec<XlsxWorkbookSheet>> {
    let workbook = unzip_member_text(path, "xl/workbook.xml").ok().flatten()?;
    Some(parse_workbook_sheets(&workbook))
}

fn xlsx_sheet_path_for_relationship(path: &Path, rel_id: &str) -> Option<String> {
    let rels = unzip_member_text(path, "xl/_rels/workbook.xml.rels")
        .ok()
        .flatten()?;
    let target = relationship_target(&rels, rel_id)?;
    Some(normalize_xlsx_target_path(&target))
}

fn unzip_member_text(path: &Path, member: &str) -> Result<Option<String>, String> {
    let path_text = path.to_string_lossy().to_string();
    let output = crate::new_command("unzip")
        .args(["-p", path_text.as_str(), member])
        .output()
        .map_err(|error| format!("failed to start unzip: {error}"))?;
    if !output.status.success() || output.stdout.is_empty() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&output.stdout).to_string()))
}

fn parse_workbook_sheets(workbook_xml: &str) -> Vec<XlsxWorkbookSheet> {
    let mut sheets = Vec::new();
    let mut offset = 0;
    while let Some(relative_start) = workbook_xml[offset..].find("<sheet ") {
        let start = offset + relative_start;
        let Some(tag_end) = workbook_xml[start..].find('>').map(|value| start + value) else {
            break;
        };
        let attrs = xml_attributes(&workbook_xml[start..=tag_end]);
        let rel_id = attrs.get("r:id").or_else(|| attrs.get("id")).cloned();
        if let Some(rel_id) = rel_id {
            sheets.push(XlsxWorkbookSheet {
                name: attrs
                    .get("name")
                    .filter(|name| !name.trim().is_empty())
                    .cloned()
                    .unwrap_or_else(|| format!("Sheet {}", sheets.len() + 1)),
                rel_id,
            });
        }
        offset = tag_end + 1;
    }
    sheets
}

fn relationship_target(rels_xml: &str, rel_id: &str) -> Option<String> {
    let mut offset = 0;
    while let Some(relative_start) = rels_xml[offset..].find("<Relationship") {
        let start = offset + relative_start;
        let tag_end = rels_xml[start..].find('>')? + start;
        let attrs = xml_attributes(&rels_xml[start..=tag_end]);
        if attrs.get("Id").map(String::as_str) == Some(rel_id) {
            return attrs.get("Target").map(ToOwned::to_owned);
        }
        offset = tag_end + 1;
    }
    None
}

fn normalize_xlsx_target_path(target: &str) -> String {
    let trimmed = target.trim_start_matches('/');
    if trimmed.starts_with("xl/") {
        trimmed.to_string()
    } else {
        format!("xl/{trimmed}")
    }
}

fn parse_xlsx_freeze_panes(sheet_xml: &str) -> Option<SpreadsheetFreezePanes> {
    let start = sheet_xml.find("<pane")?;
    let tag_end = sheet_xml[start..].find('>').map(|value| start + value)?;
    let attrs = xml_attributes(&sheet_xml[start..=tag_end]);
    let state = attrs.get("state").map(String::as_str).unwrap_or_default();
    let x_split = attrs.get("xSplit").and_then(|value| parse_u32ish(value));
    let y_split = attrs.get("ySplit").and_then(|value| parse_u32ish(value));
    if state != "frozen" && state != "frozenSplit" && x_split.is_none() && y_split.is_none() {
        return None;
    }
    Some(SpreadsheetFreezePanes {
        x_split,
        y_split,
        top_left_cell: attrs
            .get("topLeftCell")
            .filter(|value| !value.trim().is_empty())
            .cloned(),
    })
}

fn parse_u32ish(value: &str) -> Option<u32> {
    value
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|number| number.is_finite() && *number > 0.0)
        .map(|number| number.floor() as u32)
}

fn parse_shared_strings(xml: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut offset = 0;
    while let Some(relative_start) = xml[offset..].find("<si") {
        let start = offset + relative_start;
        let Some(content_start) = xml[start..].find('>').map(|value| start + value + 1) else {
            break;
        };
        let Some(relative_end) = xml[content_start..].find("</si>") else {
            break;
        };
        let end = content_start + relative_end;
        values.push(xml_text_values(&xml[content_start..end]).join(""));
        offset = end + "</si>".len();
    }
    values
}

fn parse_xlsx_sheet_preview(
    xml: &str,
    shared_strings: &[String],
    max_rows: usize,
    max_cols: usize,
) -> SpreadsheetPreview {
    let mut rows = Vec::new();
    let mut truncated = false;
    let mut offset = 0;
    while let Some(relative_start) = xml[offset..].find("<row") {
        if rows.len() >= max_rows {
            truncated = true;
            break;
        }
        let start = offset + relative_start;
        let Some(content_start) = xml[start..].find('>').map(|value| start + value + 1) else {
            break;
        };
        let Some(relative_end) = xml[content_start..].find("</row>") else {
            break;
        };
        let end = content_start + relative_end;
        let (row, row_truncated) =
            parse_xlsx_row(&xml[content_start..end], shared_strings, max_cols);
        truncated = truncated || row_truncated;
        if row.iter().any(|cell| !cell.is_empty()) {
            rows.push(row);
        }
        offset = end + "</row>".len();
    }
    SpreadsheetPreview {
        rows,
        truncated,
        sheet_name: None,
        sheet_index: 0,
        sheet_count: 1,
        sheets: Vec::new(),
        freeze_panes: parse_xlsx_freeze_panes(xml),
        max_rows,
        max_cols,
    }
}

fn parse_xlsx_row(
    row_xml: &str,
    shared_strings: &[String],
    max_cols: usize,
) -> (Vec<String>, bool) {
    let mut cells = Vec::new();
    let mut truncated = false;
    let mut offset = 0;
    while let Some(relative_start) = row_xml[offset..].find("<c") {
        let start = offset + relative_start;
        let Some(tag_end) = row_xml[start..].find('>').map(|value| start + value) else {
            break;
        };
        let attrs = xml_attributes(&row_xml[start..=tag_end]);
        let col = attrs
            .get("r")
            .and_then(|reference| xlsx_column_index(reference))
            .unwrap_or(cells.len());
        if col >= max_cols {
            truncated = true;
            offset = tag_end + 1;
            continue;
        }
        let Some(relative_end) = row_xml[tag_end + 1..].find("</c>") else {
            break;
        };
        let content_start = tag_end + 1;
        let end = content_start + relative_end;
        if cells.len() <= col {
            cells.resize(col + 1, String::new());
        }
        cells[col] = xlsx_cell_value(&row_xml[content_start..end], attrs.get("t"), shared_strings);
        offset = end + "</c>".len();
    }
    if cells.len() > max_cols {
        cells.truncate(max_cols);
        truncated = true;
    }
    (cells, truncated)
}

fn xlsx_cell_value(
    cell_xml: &str,
    cell_type: Option<&String>,
    shared_strings: &[String],
) -> String {
    if cell_type.map(String::as_str) == Some("inlineStr") {
        return xml_text_values(cell_xml).join("");
    }
    let value = xml_first_text(cell_xml, "v").unwrap_or_default();
    if cell_type.map(String::as_str) == Some("s") {
        return value
            .trim()
            .parse::<usize>()
            .ok()
            .and_then(|index| shared_strings.get(index).cloned())
            .unwrap_or_default();
    }
    xml_decode_entities(value.trim())
}

fn xml_first_text(xml: &str, tag: &str) -> Option<String> {
    let open_prefix = format!("<{tag}");
    let start = xml.find(&open_prefix)?;
    let content_start = xml[start..].find('>')? + start + 1;
    let close = format!("</{tag}>");
    let end = xml[content_start..].find(&close)? + content_start;
    Some(xml_decode_entities(&xml[content_start..end]))
}

fn xml_text_values(xml: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut offset = 0;
    while let Some(relative_start) = xml[offset..].find("<t") {
        let start = offset + relative_start;
        let Some(content_start) = xml[start..].find('>').map(|value| start + value + 1) else {
            break;
        };
        let Some(relative_end) = xml[content_start..].find("</t>") else {
            break;
        };
        let end = content_start + relative_end;
        values.push(xml_decode_entities(&xml[content_start..end]));
        offset = end + "</t>".len();
    }
    values
}

fn xml_attributes(tag: &str) -> HashMap<String, String> {
    let mut attrs = HashMap::new();
    let bytes = tag.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        let key_start = index;
        while index < bytes.len() {
            let ch = bytes[index];
            if ch == b'=' || ch.is_ascii_whitespace() || ch == b'>' || ch == b'/' {
                break;
            }
            index += 1;
        }
        if index >= bytes.len() || bytes[index] != b'=' {
            index += 1;
            continue;
        }
        let key = &tag[key_start..index];
        index += 1;
        if index >= bytes.len() || (bytes[index] != b'"' && bytes[index] != b'\'') {
            continue;
        }
        let quote = bytes[index];
        index += 1;
        let value_start = index;
        while index < bytes.len() && bytes[index] != quote {
            index += 1;
        }
        if index <= bytes.len() {
            attrs.insert(
                key.to_string(),
                xml_decode_entities(&tag[value_start..index]),
            );
        }
        index += 1;
    }
    attrs
}

fn xml_decode_entities(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn xlsx_column_index(reference: &str) -> Option<usize> {
    let mut value = 0usize;
    let mut seen = false;
    for ch in reference.chars() {
        if !ch.is_ascii_alphabetic() {
            break;
        }
        seen = true;
        value = value * 26 + (ch.to_ascii_uppercase() as u8 - b'A' + 1) as usize;
    }
    seen.then_some(value.saturating_sub(1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delimited_preview_reports_bounds_and_sheet() {
        let preview = parse_delimited_preview("a,b,c\n1,2,3\n4,5,6", ',', "CSV", 2, 2);
        assert_eq!(preview.rows, vec![vec!["a", "b"], vec!["1", "2"]]);
        assert!(preview.truncated);
        assert_eq!(preview.sheet_name.as_deref(), Some("CSV"));
        assert_eq!(preview.sheet_count, 1);
        assert_eq!(preview.max_rows, 2);
        assert_eq!(preview.max_cols, 2);
    }

    #[test]
    fn parses_workbook_sheets() {
        let workbook = r#"
          <workbook>
            <sheets>
              <sheet name="Revenue" sheetId="1" r:id="rId1"/>
              <sheet name="Costs &amp; Ops" sheetId="2" r:id="rId2"/>
            </sheets>
          </workbook>
        "#;
        let sheets = parse_workbook_sheets(workbook);
        assert_eq!(sheets.len(), 2);
        assert_eq!(sheets[0].name, "Revenue");
        assert_eq!(sheets[0].rel_id, "rId1");
        assert_eq!(sheets[1].name, "Costs & Ops");
    }

    #[test]
    fn parses_freeze_panes_metadata() {
        let sheet = r#"
          <worksheet>
            <sheetViews>
              <sheetView workbookViewId="0">
                <pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"/>
              </sheetView>
            </sheetViews>
          </worksheet>
        "#;
        let freeze = parse_xlsx_freeze_panes(sheet).expect("freeze panes");
        assert_eq!(freeze.x_split, Some(1));
        assert_eq!(freeze.y_split, Some(2));
        assert_eq!(freeze.top_left_cell.as_deref(), Some("B3"));
    }

    #[test]
    fn xlsx_sheet_preview_keeps_freeze_and_limits() {
        let xml = r#"
          <worksheet>
            <sheetViews><sheetView><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews>
            <sheetData>
              <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>2</v></c></row>
              <row r="2"><c r="A2"><v>3</v></c><c r="B2"><v>4</v></c></row>
            </sheetData>
          </worksheet>
        "#;
        let preview = parse_xlsx_sheet_preview(xml, &["Name".to_string()], 10, 1);
        assert_eq!(preview.rows, vec![vec!["Name"], vec!["3"]]);
        assert!(preview.truncated);
        assert_eq!(preview.max_rows, 10);
        assert_eq!(preview.max_cols, 1);
        assert_eq!(preview.freeze_panes.unwrap().y_split, Some(1));
    }
}
