export type ComposerMentionMarker = "@" | "$";

export interface ComposerMentionTrigger {
  marker: ComposerMentionMarker;
  query: string;
  from: number;
  to: number;
}

export function findActiveMentionTrigger(input: string): ComposerMentionTrigger | null {
  const cursor = input.length;
  const lineStart = input.lastIndexOf("\n", cursor - 1) + 1;
  const linePrefix = input.slice(lineStart, cursor);
  return findMarkerMentionTrigger({
    marker: "@",
    linePrefix,
    lineStart,
    cursor,
    pattern: /(^|\s)(@[^@]*)$/,
  }) ?? findMarkerMentionTrigger({
    marker: "$",
    linePrefix,
    lineStart,
    cursor,
    pattern: /(^|\s)(\$[^$]*)$/,
  });
}

function findMarkerMentionTrigger(input: {
  marker: ComposerMentionMarker;
  linePrefix: string;
  lineStart: number;
  cursor: number;
  pattern: RegExp;
}): ComposerMentionTrigger | null {
  const match = input.linePrefix.match(input.pattern);
  if (!match || match.index == null) return null;
  const matchedText = match[0] ?? "";
  const markerOffset = matchedText.lastIndexOf(input.marker);
  if (markerOffset < 0) return null;
  const from = input.lineStart + match.index + markerOffset;
  const query = matchedText.slice(markerOffset + input.marker.length);
  if (query.length > 120) return null;
  return { marker: input.marker, query, from, to: input.cursor };
}

export function removeMentionTriggerText(input: string, trigger: ComposerMentionTrigger): string {
  if (trigger.from < 0 || trigger.to < trigger.from || trigger.to > input.length) return input;
  const prefix = input.slice(0, trigger.from);
  const suffix = input.slice(trigger.to);
  return suffix ? `${prefix}${suffix}` : prefix.trimEnd();
}
