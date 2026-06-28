export interface UserMessageCommentAttachmentPreview {
  key: string;
  body: string;
  designTweakChanges: UserMessageDesignTweakChange[];
  designTweak: boolean;
  browserElementPreview: UserMessageBrowserElementPreview | null;
  contentPreviewText: string;
  artifactRangeLabel: string;
  kind: "annotation" | "comment";
  label: string;
  lineRange: string;
  origin: string;
  previewAlt: string;
  previewSrc: string;
  reference: UserMessageCommentAttachmentReference | null;
  side: "left" | "right" | null;
}

export interface UserMessageDesignTweakChange {
  property: string;
  previousValue: string;
  nextValue: string;
}

export interface UserMessageBrowserElementPreview {
  tagName: string;
  immediateText: string;
}

export interface UserMessageCommentAttachmentReference {
  path: string;
  lineStart: number;
  lineEnd?: number;
}

export function userMessageCommentAttachmentPreviews(item: Record<string, unknown>): UserMessageCommentAttachmentPreview[] {
  const attachments = readArrayField(item, "commentAttachments")
    ?? readArrayField(item, "comments")
    ?? [];
  return attachments
    .map(commentAttachmentPreview)
    .filter((preview): preview is UserMessageCommentAttachmentPreview => preview !== null);
}

export function userMessageCommentAttachmentCount(item: Record<string, unknown>): number {
  return userMessageCommentAttachmentPreviews(item).length;
}

function commentAttachmentPreview(value: unknown, index: number): UserMessageCommentAttachmentPreview | null {
  const record = recordValue(value);
  if (!record) return null;
  const origin = stringValue(record.origin) || stringValue(record.type);
  const path = commentAttachmentRawPath(record);
  const referencePath = commentAttachmentReferencePath(record, path, origin);
  const rawLineRange = firstString(
    record.lineRange,
    nestedString(record, ["position", "lineRange"]),
    nestedString(record, ["comment", "lineRange"]),
    nestedString(record, ["comment", "position", "lineRange"]),
  );
  const rawSide = firstString(
    record.side,
    nestedString(record, ["position", "side"]),
    nestedString(record, ["comment", "side"]),
    nestedString(record, ["comment", "position", "side"]),
  );
  const side = rawSide === "left" || rawSide === "right" ? rawSide : null;
  const parsedLineRange = lineRangeLines(rawLineRange, side);
  const lineStart = firstPositiveInteger(
    record.lineStart,
    record.line,
    record.startLine,
    nestedValue(record, ["position", "lineStart"]),
    nestedValue(record, ["position", "line"]),
    nestedValue(record, ["position", "startLine"]),
    nestedValue(record, ["comment", "lineStart"]),
    nestedValue(record, ["comment", "position", "lineStart"]),
  )
    ?? parsedLineRange?.lineStart
    ?? 1;
  const lineEnd = firstPositiveInteger(
    record.lineEnd,
    record.endLine,
    nestedValue(record, ["position", "lineEnd"]),
    nestedValue(record, ["position", "endLine"]),
    nestedValue(record, ["comment", "lineEnd"]),
    nestedValue(record, ["comment", "position", "lineEnd"]),
  )
    ?? parsedLineRange?.lineEnd
    ?? lineStart;
  const reference = referencePath ? { path: referencePath, lineStart, lineEnd: Math.max(lineStart, lineEnd) } : null;
  const lineRange = rawLineRange || lineRangeLabel(reference);
  const label = attachmentLabel(record, reference, origin, path);
  const previewSrc = firstString(
    nestedString(record, ["artifactAnnotationContentPreview", "src"]),
    nestedString(record, ["pdfAnnotationContentPreview", "src"]),
    localArtifactContentPreviewImageSrc(record),
    nestedString(record, ["localBrowserScreenshot", "dataUrl"]),
    nestedString(record, ["localPdfScreenshot", "dataUrl"]),
  );
  const body = firstString(
    record.body,
    nestedString(record, ["comment", "body"]),
    nestedString(record, ["comment", "text"]),
    record.comment,
    record.text,
    record.message,
    nestedString(record, ["localBrowserDesignChange", "group", "comment"]),
  );
  return {
    key: `${path || origin || "comment"}:${lineRange || "unknown"}:${index}`,
    body,
    designTweakChanges: designTweakChanges(record),
    designTweak: record.designTweak === true || record.localBrowserDesignChange != null,
    browserElementPreview: browserElementPreview(record),
    contentPreviewText: contentPreviewText(record),
    artifactRangeLabel: stringValue(record.artifactAnnotationRangeLabel),
    kind: commentAttachmentKind(record),
    label,
    lineRange,
    origin,
    previewAlt: firstString(
      nestedString(record, ["artifactAnnotationContentPreview", "alt"]),
      nestedString(record, ["pdfAnnotationContentPreview", "alt"]),
      nestedString(record, ["localArtifactAnnotationMetadata", "contentPreview", "alt"]),
    ),
    previewSrc,
    reference,
    side,
  };
}

function commentAttachmentRawPath(record: Record<string, unknown>): string {
  return firstString(
    record.path,
    record.filePath,
    nestedString(record, ["position", "path"]),
    nestedString(record, ["comment", "path"]),
    nestedString(record, ["comment", "filePath"]),
    nestedString(record, ["comment", "position", "path"]),
  );
}

function commentAttachmentReferencePath(
  record: Record<string, unknown>,
  rawPath: string,
  origin: string,
): string {
  const explicitAnnotationPath = firstString(
    record.artifactAnnotationFilePath,
    record.pdfAnnotationFilePath,
  );
  if (explicitAnnotationPath) return explicitAnnotationPath;
  const explicitFilePath = firstString(
    record.filePath,
    nestedString(record, ["comment", "filePath"]),
    nestedString(record, ["comment", "position", "filePath"]),
  );
  if (explicitFilePath) return explicitFilePath;
  if (!rawPath || isCommentAttachmentPseudoPath(rawPath)) return "";
  if (origin === "browser") return "";
  return rawPath;
}

function lineRangeLines(
  lineRange: string,
  side: "left" | "right" | null,
): { lineStart: number; lineEnd: number } | null {
  if (!lineRange) return null;
  const sideMarker = side === "left" ? "L" : side === "right" ? "R" : "[LR]";
  const sideMatch = lineRange.match(new RegExp(`${sideMarker}(\\d+)(?:-(?:${sideMarker})?(\\d+))?`));
  const numericMatch = sideMatch ?? lineRange.match(/^(\d+)(?:-(\d+))?$/);
  if (!numericMatch) return null;
  const lineStart = Number(numericMatch[1]);
  const lineEnd = Number(numericMatch[2] ?? numericMatch[1]);
  if (!Number.isInteger(lineStart) || lineStart <= 0) return null;
  if (!Number.isInteger(lineEnd) || lineEnd <= 0) return { lineStart, lineEnd: lineStart };
  return { lineStart, lineEnd: Math.max(lineStart, lineEnd) };
}

function commentAttachmentKind(record: Record<string, unknown>): "annotation" | "comment" {
  return record.origin === "diff" ? "comment" : "annotation";
}

function attachmentLabel(
  record: Record<string, unknown>,
  reference: UserMessageCommentAttachmentReference | null,
  origin: string,
  rawPath: string,
): string {
  const displayPath = commentAttachmentDisplayPath(record, rawPath || reference?.path || "");
  if (reference) {
    return displayPath || reference.path;
  }
  const kind = browserAnnotationKind(record);
  if (kind.includes("text")) return "Selected text";
  if (isAttachedBrowserRegion(record, rawPath)) return "Selected region attached";
  if (record.localBrowserDesignChange != null) return "Design tweak";
  const browserLabel = firstString(
    record.browserTargetLabel,
    displayPath,
    record.browserTargetImmediateText,
    record.browserTargetTagName,
  );
  if (browserLabel) return browserLabel;
  if (kind.includes("element") || origin === "browser") return "Selected page element";
  return displayPath || origin || "Comment";
}

function browserElementPreview(record: Record<string, unknown>): UserMessageBrowserElementPreview | null {
  const tagName = firstString(
    record.browserTargetTagName,
    nestedString(record, ["browserElementPreview", "tagName"]),
    browserTagNameFromTargetPath(record),
  );
  if (!tagName) return null;
  return {
    tagName,
    immediateText: firstString(
      record.browserTargetImmediateText,
      nestedString(record, ["browserElementPreview", "immediateText"]),
      nestedString(record, ["localBrowserContext", "targetImmediateText"]),
    ),
  };
}

function contentPreviewText(record: Record<string, unknown>): string {
  const artifactPreviewType = nestedString(record, ["artifactAnnotationContentPreview", "type"]);
  const pdfPreviewType = nestedString(record, ["pdfAnnotationContentPreview", "type"]);
  if (artifactPreviewType === "text") return nestedString(record, ["artifactAnnotationContentPreview", "text"]);
  if (pdfPreviewType === "text") return nestedString(record, ["pdfAnnotationContentPreview", "text"]);
  const localArtifactPreviewType = nestedString(record, ["localArtifactAnnotationMetadata", "contentPreview", "type"]);
  if (localArtifactPreviewType === "text") {
    return nestedString(record, ["localArtifactAnnotationMetadata", "contentPreview", "text"]);
  }
  const artifactTargetType = nestedString(record, ["localArtifactAnnotationMetadata", "target", "type"]);
  if (artifactTargetType === "document-element-selection") {
    return firstString(
      nestedString(record, ["localArtifactAnnotationMetadata", "target", "selectedText"]),
      nestedString(record, ["localArtifactAnnotationMetadata", "target", "nearbyText"]),
    );
  }
  const pdfCommentKind = nestedString(record, ["localPdfCommentMetadata", "kind"]);
  if (pdfCommentKind === "region") {
    return firstString(
      nestedString(record, ["localPdfCommentMetadata", "selectedText"]),
      nestedString(record, ["localPdfCommentMetadata", "nearbyText"]),
    );
  }
  return "";
}

function designTweakChanges(record: Record<string, unknown>): UserMessageDesignTweakChange[] {
  const direct = designTweakChangeArray(record.designTweakChanges);
  if (direct.length > 0) return direct;
  const grouped = designTweakChangeArray(nestedValue(record, ["localBrowserDesignChange", "group", "changes"]));
  if (grouped.length > 0) return grouped;
  return localBrowserDesignTweakChanges(record);
}

function designTweakChangeArray(value: unknown): UserMessageDesignTweakChange[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = recordValue(entry);
      if (!record) return null;
      const property = firstString(record.property, record.name);
      const previousValue = firstString(record.previousValue, record.before);
      const nextValue = firstString(record.nextValue, record.after);
      if (!property || (!previousValue && !nextValue)) return null;
      return { property, previousValue, nextValue };
    })
    .filter((entry): entry is UserMessageDesignTweakChange => entry !== null);
}

function lineRangeLabel(reference: UserMessageCommentAttachmentReference | null): string {
  if (!reference) return "";
  return reference.lineEnd && reference.lineEnd !== reference.lineStart
    ? `${reference.lineStart}-${reference.lineEnd}`
    : `${reference.lineStart}`;
}

function commentAttachmentDisplayPath(record: Record<string, unknown>, rawPath: string): string {
  return cleanCommentAttachmentPathLabel(firstString(
    record.pathLabel,
    nestedString(record, ["position", "pathLabel"]),
    nestedString(record, ["comment", "pathLabel"]),
    nestedString(record, ["comment", "position", "pathLabel"]),
    rawPath,
  ));
}

function cleanCommentAttachmentPathLabel(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("browser:")) return trimmed.slice("browser:".length).trim();
  if (trimmed.startsWith("pdf:")) return trimmed.slice("pdf:".length).trim();
  if (trimmed.startsWith("artifact:")) return trimmed.slice("artifact:".length).trim();
  return trimmed;
}

function isCommentAttachmentPseudoPath(path: string): boolean {
  const trimmed = path.trim();
  return trimmed.startsWith("browser:")
    || trimmed.startsWith("pdf:")
    || trimmed.startsWith("artifact:");
}

function browserAnnotationKind(record: Record<string, unknown>): string {
  return firstString(
    record.browserAnnotationKind,
    nestedString(record, ["localBrowserCommentMetadata", "kind"]),
  ).toLowerCase();
}

function isAttachedBrowserRegion(record: Record<string, unknown>, rawPath: string): boolean {
  const label = cleanCommentAttachmentPathLabel(rawPath).toLowerCase();
  return record.attachedBrowserRegion === true
    || browserAnnotationKind(record).includes("region")
    || label === "selected browser region";
}

function browserTagNameFromTargetPath(record: Record<string, unknown>): string {
  const targetPath = nestedString(record, ["localBrowserContext", "targetPath"]).trim();
  if (!targetPath) return "";
  const tagName = targetPath.split(">").at(-1)?.trim() ?? "";
  return /^[a-z][\w-]*$/i.test(tagName) ? tagName : "";
}

function localArtifactContentPreviewImageSrc(record: Record<string, unknown>): string {
  return nestedString(record, ["localArtifactAnnotationMetadata", "contentPreview", "type"]) === "image"
    ? nestedString(record, ["localArtifactAnnotationMetadata", "contentPreview", "src"])
    : "";
}

function localBrowserDesignTweakChanges(record: Record<string, unknown>): UserMessageDesignTweakChange[] {
  const group = recordValue(nestedValue(record, ["localBrowserDesignChange", "group"]));
  if (!group) return [];
  const changes: UserMessageDesignTweakChange[] = [];
  const textChange = recordValue(group.text);
  if (textChange) {
    const previousValue = stringValue(textChange.previousValue);
    const nextValue = stringValue(textChange.value);
    if (previousValue !== nextValue) changes.push({ property: "text", previousValue, nextValue });
  }
  const declarations = Array.isArray(group.declarations) ? group.declarations : [];
  for (const entry of declarations) {
    const declaration = recordValue(entry);
    if (!declaration) continue;
    const property = stringValue(declaration.property);
    const previousValue = stringValue(declaration.previousValue);
    const nextValue = stringValue(declaration.value);
    if (property && previousValue !== nextValue) changes.push({ property, previousValue, nextValue });
  }
  return changes;
}

function readArrayField(record: Record<string, unknown>, key: string): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function nestedString(record: Record<string, unknown>, path: readonly string[]): string {
  return stringValue(nestedValue(record, path));
}

function nestedValue(record: Record<string, unknown>, path: readonly string[]): unknown {
  let value: unknown = record;
  for (const key of path) {
    const next = recordValue(value);
    if (!next) return undefined;
    value = next[key];
  }
  return value;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const string = stringValue(value).trim();
    if (string) return string;
  }
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstPositiveInteger(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  }
  return null;
}
