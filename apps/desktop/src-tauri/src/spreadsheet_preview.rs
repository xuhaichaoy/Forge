use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadsheetPreview {
    rows: Vec<Vec<String>>,
    truncated: bool,
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
            max_rows,
            max_cols,
        )),
        "tsv" => Ok(parse_delimited_preview(
            &fs::read_to_string(path)
                .map_err(|error| format!("failed to read spreadsheet text: {error}"))?,
            '\t',
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
    SpreadsheetPreview { rows, truncated }
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
    let sheet_path =
        xlsx_first_sheet_path(path).unwrap_or_else(|| "xl/worksheets/sheet1.xml".to_string());
    let sheet_xml = unzip_member_text(path, &sheet_path)?
        .ok_or_else(|| format!("failed to read worksheet from xlsx: {sheet_path}"))?;
    Ok(parse_xlsx_sheet_preview(
        &sheet_xml,
        &shared_strings,
        max_rows,
        max_cols,
    ))
}

fn xlsx_first_sheet_path(path: &Path) -> Option<String> {
    let workbook = unzip_member_text(path, "xl/workbook.xml").ok().flatten()?;
    let rel_id = first_sheet_relationship_id(&workbook)?;
    let rels = unzip_member_text(path, "xl/_rels/workbook.xml.rels")
        .ok()
        .flatten()?;
    let target = relationship_target(&rels, &rel_id)?;
    Some(normalize_xlsx_target_path(&target))
}

fn unzip_member_text(path: &Path, member: &str) -> Result<Option<String>, String> {
    let path_text = path.to_string_lossy().to_string();
    let output = Command::new("unzip")
        .args(["-p", path_text.as_str(), member])
        .output()
        .map_err(|error| format!("failed to start unzip: {error}"))?;
    if !output.status.success() || output.stdout.is_empty() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&output.stdout).to_string()))
}

fn first_sheet_relationship_id(workbook_xml: &str) -> Option<String> {
    let start = workbook_xml.find("<sheet ")?;
    let tag_end = workbook_xml[start..].find('>')? + start;
    let attrs = xml_attributes(&workbook_xml[start..=tag_end]);
    attrs
        .get("r:id")
        .or_else(|| attrs.get("id"))
        .map(ToOwned::to_owned)
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
    SpreadsheetPreview { rows, truncated }
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
