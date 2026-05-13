use serde::Serialize;
use std::io::Read;
use std::path::Path;
use std::process::Command;

const MAX_LEGACY_DOC_STREAM_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPreview {
    paragraphs: Vec<String>,
    truncated: bool,
}

impl DocumentPreview {
    pub fn into_plain_text(self) -> String {
        self.paragraphs.join("\n\n")
    }
}

/// Extract a flattened paragraph list from a `.docx` file by unzipping
/// `word/document.xml` and pulling each `<w:t>` text run inside each `<w:p>`.
/// Mirrors `spreadsheet_preview.rs` (xlsx path) in style: we shell out to
/// `unzip -p` for the member read, then walk the XML with simple string
/// scanning so we don't pull a heavy XML/zip dependency just for this preview.
///
/// Codex Desktop renders docx artifacts via its `docx-preview-panel-*.js`
/// bundle (full layout, headings, lists, runs). We render a simpler "plain
/// text by paragraph" preview that's enough to show the document is real and
/// give the user something to read in the side panel while reusing the same
/// surface as the text-preview path.
pub fn read_document_preview(
    path: &Path,
    max_paragraphs: usize,
    max_chars_per_paragraph: usize,
) -> Result<DocumentPreview, String> {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "docx" => read_docx_preview(path, max_paragraphs, max_chars_per_paragraph),
        "doc" => read_doc_preview(path, max_paragraphs, max_chars_per_paragraph),
        _ => Err(format!("unsupported document type: {extension}")),
    }
}

fn read_docx_preview(
    path: &Path,
    max_paragraphs: usize,
    max_chars_per_paragraph: usize,
) -> Result<DocumentPreview, String> {
    let xml = unzip_member_text(path, "word/document.xml")?
        .ok_or_else(|| "failed to read word/document.xml from docx".to_string())?;
    Ok(parse_docx_paragraphs(
        &xml,
        max_paragraphs,
        max_chars_per_paragraph,
    ))
}

fn read_doc_preview(
    path: &Path,
    max_paragraphs: usize,
    max_chars_per_paragraph: usize,
) -> Result<DocumentPreview, String> {
    if let Ok(text) = read_doc_with_textutil(path) {
        if looks_like_plain_document_text(&text) {
            return Ok(parse_plain_text_paragraphs(
                &text,
                max_paragraphs,
                max_chars_per_paragraph,
            ));
        }
    }

    if let Ok(text) = read_doc_word_document_stream(path) {
        if looks_like_plain_document_text(&text) {
            return Ok(parse_plain_text_paragraphs(
                &text,
                max_paragraphs,
                max_chars_per_paragraph,
            ));
        }
    }

    Err("failed to extract doc text".to_string())
}

fn read_doc_with_textutil(path: &Path) -> Result<String, String> {
    let path_text = path.to_string_lossy().to_string();
    let output = Command::new("textutil")
        .args(["-convert", "txt", "-stdout", path_text.as_str()])
        .output()
        .map_err(|error| format!("failed to start textutil: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "failed to extract doc text: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn read_doc_word_document_stream(path: &Path) -> Result<String, String> {
    let mut compound =
        cfb::open(path).map_err(|error| format!("failed to open compound document: {error}"))?;
    let mut stream = compound
        .open_stream("/WordDocument")
        .map_err(|error| format!("failed to open WordDocument stream: {error}"))?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut stream)
        .take(MAX_LEGACY_DOC_STREAM_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read WordDocument stream: {error}"))?;
    if bytes.len() as u64 > MAX_LEGACY_DOC_STREAM_BYTES {
        bytes.truncate(MAX_LEGACY_DOC_STREAM_BYTES as usize);
    }
    let text = extract_utf16le_text_runs(&bytes);
    if text.trim().is_empty() {
        Err("WordDocument stream did not contain readable text".to_string())
    } else {
        Ok(text)
    }
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

fn parse_docx_paragraphs(
    xml: &str,
    max_paragraphs: usize,
    max_chars_per_paragraph: usize,
) -> DocumentPreview {
    let mut paragraphs: Vec<String> = Vec::new();
    let mut truncated = false;
    let mut offset = 0;
    while let Some(relative_start) = xml[offset..].find("<w:p") {
        if paragraphs.len() >= max_paragraphs {
            truncated = true;
            break;
        }
        let start = offset + relative_start;
        // Skip the opening tag (could be `<w:p>` or `<w:p w:rsidR="..."...>`).
        let Some(content_start) = xml[start..].find('>').map(|value| start + value + 1) else {
            break;
        };
        let Some(relative_end) = xml[content_start..].find("</w:p>") else {
            break;
        };
        let end = content_start + relative_end;
        let paragraph_xml = &xml[content_start..end];
        // Tab-runs (`<w:tab/>`) and break-runs (`<w:br/>`) become whitespace so
        // the flattened text stays readable. Ignore all other XML nodes here:
        // paragraph properties (`<w:pPr>`, `<w:rPr>`, style tags, etc.) are not
        // document text and must never leak into the side-panel preview.
        let mut paragraph = String::new();
        let mut tag_offset = 0;
        while let Some(tag_start_relative) = paragraph_xml[tag_offset..].find('<') {
            let tag_start = tag_offset + tag_start_relative;
            let Some(tag_end) = paragraph_xml[tag_start..].find('>').map(|v| tag_start + v) else {
                break;
            };
            let tag = &paragraph_xml[tag_start..=tag_end];
            // `<w:tab` / `<w:br` self-closing → insert separators.
            if tag.starts_with("<w:tab") {
                paragraph.push('\t');
            } else if tag.starts_with("<w:br") {
                paragraph.push('\n');
            } else if tag.starts_with("<w:t") && !tag.starts_with("<w:tab") {
                // Text run open tag — extract until the matching `</w:t>`.
                if let Some(text_close_relative) = paragraph_xml[tag_end + 1..].find("</w:t>") {
                    let text_close = tag_end + 1 + text_close_relative;
                    paragraph.push_str(&xml_decode_entities(
                        &paragraph_xml[tag_end + 1..text_close],
                    ));
                    tag_offset = text_close + "</w:t>".len();
                    continue;
                }
            }
            tag_offset = tag_end + 1;
        }
        let cleaned = paragraph
            .trim_end_matches(|c: char| c == ' ' || c == '\t')
            .to_string();
        let cleaned = if cleaned.chars().count() > max_chars_per_paragraph {
            truncated = true;
            let mut taken = String::new();
            for (index, ch) in cleaned.chars().enumerate() {
                if index >= max_chars_per_paragraph {
                    break;
                }
                taken.push(ch);
            }
            taken.push('…');
            taken
        } else {
            cleaned
        };
        if !cleaned.trim().is_empty() {
            paragraphs.push(cleaned);
        }
        offset = end + "</w:p>".len();
    }
    DocumentPreview {
        paragraphs,
        truncated,
    }
}

fn parse_plain_text_paragraphs(
    text: &str,
    max_paragraphs: usize,
    max_chars_per_paragraph: usize,
) -> DocumentPreview {
    let mut paragraphs: Vec<String> = Vec::new();
    let mut truncated = false;
    for raw in text.lines() {
        if paragraphs.len() >= max_paragraphs {
            truncated = true;
            break;
        }
        let cleaned = raw.trim_end();
        if cleaned.trim().is_empty() {
            continue;
        }
        let paragraph = if cleaned.chars().count() > max_chars_per_paragraph {
            truncated = true;
            let mut taken = String::new();
            for (index, ch) in cleaned.chars().enumerate() {
                if index >= max_chars_per_paragraph {
                    break;
                }
                taken.push(ch);
            }
            taken.push('…');
            taken
        } else {
            cleaned.to_string()
        };
        paragraphs.push(paragraph);
    }
    DocumentPreview {
        paragraphs,
        truncated,
    }
}

fn extract_utf16le_text_runs(bytes: &[u8]) -> String {
    let mut runs: Vec<String> = Vec::new();
    let mut current = String::new();

    for chunk in bytes.chunks_exact(2) {
        let value = u16::from_le_bytes([chunk[0], chunk[1]]);
        let Some(ch) = char::from_u32(u32::from(value)) else {
            flush_text_run(&mut runs, &mut current);
            continue;
        };
        if is_document_text_char(ch) {
            current.push(ch);
            continue;
        }
        flush_text_run(&mut runs, &mut current);
    }
    flush_text_run(&mut runs, &mut current);

    runs.join("\n")
}

fn flush_text_run(runs: &mut Vec<String>, current: &mut String) {
    let normalized = normalize_extracted_text_run(current);
    current.clear();
    if normalized.is_empty() || extracted_text_signal_count(&normalized) < 4 {
        return;
    }
    if is_ole_metadata_text_run(&normalized) {
        return;
    }
    runs.push(normalized);
}

fn normalize_extracted_text_run(value: &str) -> String {
    let normalized = value
        .replace('\u{000b}', "\n")
        .replace('\u{000c}', "\n")
        .replace('\u{00a0}', " ");
    normalized
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn extracted_text_signal_count(value: &str) -> usize {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric() || is_cjk_char(*ch))
        .count()
}

fn looks_like_plain_document_text(value: &str) -> bool {
    let mut total = 0usize;
    let mut printable = 0usize;
    let mut signals = 0usize;
    for ch in value.chars().take(8_000) {
        if ch == '\0' {
            total += 1;
            continue;
        }
        if ch.is_whitespace() {
            total += 1;
            printable += 1;
            continue;
        }
        if !ch.is_control() && ch != '\u{fffd}' {
            total += 1;
            printable += 1;
            if ch.is_alphanumeric() || is_cjk_char(ch) {
                signals += 1;
            }
        } else {
            total += 1;
        }
    }
    total > 0 && signals >= 8 && printable * 100 / total >= 80
}

fn is_document_text_char(ch: char) -> bool {
    if ch == '\t' || ch == '\n' || ch == '\r' {
        return true;
    }
    if ch.is_control() {
        return false;
    }
    ch == ' '
        || ch.is_ascii_graphic()
        || is_cjk_char(ch)
        || matches!(
            ch,
            '，' | '。'
                | '、'
                | '；'
                | '：'
                | '！'
                | '？'
                | '（'
                | '）'
                | '《'
                | '》'
                | '“'
                | '”'
                | '‘'
                | '’'
                | '—'
                | '…'
                | '·'
                | '￥'
                | '％'
                | '＋'
                | '－'
                | '×'
                | '÷'
        )
}

fn is_cjk_char(ch: char) -> bool {
    ('\u{3400}'..='\u{4dbf}').contains(&ch)
        || ('\u{4e00}'..='\u{9fff}').contains(&ch)
        || ('\u{f900}'..='\u{faff}').contains(&ch)
}

fn is_ole_metadata_text_run(value: &str) -> bool {
    matches!(
        value,
        "Root Entry"
            | "SummaryInformation"
            | "DocumentSummaryInformation"
            | "WordDocument"
            | "WpsCustomData"
    )
}

fn xml_decode_entities(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_paragraphs() {
        let xml = r#"<?xml version="1.0"?><w:document><w:body>
            <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
            <w:p><w:r><w:t xml:space="preserve">World, line 2</w:t></w:r></w:p>
        </w:body></w:document>"#;
        let preview = parse_docx_paragraphs(xml, 10, 200);
        assert_eq!(preview.paragraphs.len(), 2);
        assert_eq!(preview.paragraphs[0], "Hello");
        assert_eq!(preview.paragraphs[1], "World, line 2");
        assert!(!preview.truncated);
    }

    #[test]
    fn truncates_long_paragraph() {
        let xml = r#"<w:p><w:r><w:t>abcdefghijklmno</w:t></w:r></w:p>"#;
        let preview = parse_docx_paragraphs(xml, 10, 5);
        assert_eq!(preview.paragraphs.len(), 1);
        assert_eq!(preview.paragraphs[0], "abcde…");
        assert!(preview.truncated);
    }

    #[test]
    fn limits_paragraph_count() {
        let xml = (0..50)
            .map(|i| format!("<w:p><w:r><w:t>p{i}</w:t></w:r></w:p>"))
            .collect::<String>();
        let preview = parse_docx_paragraphs(&xml, 3, 200);
        assert_eq!(preview.paragraphs.len(), 3);
        assert!(preview.truncated);
    }

    #[test]
    fn decodes_xml_entities() {
        let xml = r#"<w:p><w:r><w:t>foo &amp; bar &lt;baz&gt;</w:t></w:r></w:p>"#;
        let preview = parse_docx_paragraphs(xml, 10, 200);
        assert_eq!(preview.paragraphs[0], "foo & bar <baz>");
    }

    #[test]
    fn keeps_tab_and_line_break_runs() {
        let xml = r#"<w:p><w:r><w:t>col1</w:t><w:tab/><w:t>col2</w:t><w:br/><w:t>line2</w:t></w:r></w:p>"#;
        let preview = parse_docx_paragraphs(xml, 10, 200);
        assert_eq!(preview.paragraphs[0], "col1\tcol2\nline2");
    }

    #[test]
    fn ignores_paragraph_and_run_properties() {
        let xml = r#"<w:p>
            <w:pPr><w:autoSpaceDE/><w:autoSpaceDN/><w:rPr><w:rFonts w:eastAsia="仿宋"/></w:rPr></w:pPr>
            <w:r><w:rPr><w:b/></w:rPr><w:t>上海公司AI人才队伍培养建设方案</w:t></w:r>
        </w:p>"#;
        let preview = parse_docx_paragraphs(xml, 10, 200);
        assert_eq!(preview.paragraphs, vec!["上海公司AI人才队伍培养建设方案"]);
    }

    #[test]
    fn joins_document_preview_as_plain_text() {
        let preview = DocumentPreview {
            paragraphs: vec!["one".to_string(), "two".to_string()],
            truncated: false,
        };
        assert_eq!(preview.into_plain_text(), "one\n\ntwo");
    }

    #[test]
    fn extracts_utf16le_text_runs_from_legacy_doc_stream() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&[0x01, 0x02, 0x03, 0x04]);
        for value in "项目方案".encode_utf16() {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes.extend_from_slice(&[0x00, 0x00, 0xff, 0xff]);
        for value in "数据治理与资产管理".encode_utf16() {
            bytes.extend_from_slice(&value.to_le_bytes());
        }

        assert_eq!(
            extract_utf16le_text_runs(&bytes),
            "项目方案\n数据治理与资产管理"
        );
    }

    #[test]
    fn rejects_binary_textutil_output() {
        let binary_like = "Root Entry\0\0\0\u{fffd}\u{fffd}\u{0001}\u{0002}";
        assert!(!looks_like_plain_document_text(binary_like));
    }

    #[test]
    fn parses_plain_text_preview() {
        let preview = parse_plain_text_paragraphs("one\n\n二三四五六\nthree", 2, 3);
        assert_eq!(preview.paragraphs, vec!["one", "二三四…"]);
        assert!(preview.truncated);
    }
}
