/*
 * codex: local-conversation-thread-*.js automationRow — humanizes a
 * raw RRULE string into "every Monday at 9am" / "every weekday" style text.
 * Falls back to the original string when parsing fails so the section row
 * still shows something meaningful (e.g. when the schedule arrives as a cron
 * expression that `rrule` cannot parse, or when app-server already returned
 * pre-humanized text).
 */
import { rrulestr } from "rrule";

// codex: rrule humanizer — accepts the raw scheduling string from app-server
// and returns a humanized English label, mirroring Desktop's automation rail
// summary. Returns null for empty/missing input so callers can omit the
// `rruleSummary` field entirely. Any parse error (cron, free-form text,
// truncated RRULE) yields the original trimmed string so the row still shows
// the unmodified schedule rather than a confusing empty cell.
export function humanizeRrule(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    // codex: rrulestr accepts both bare RRULE bodies ("FREQ=WEEKLY;...") and
    // the iCal-prefixed form ("RRULE:FREQ=...") used by some app-server
    // builds; either path lands on the same `toText()` formatter.
    const rule = rrulestr(trimmed);
    const text = rule.toText();
    if (typeof text === "string" && text.trim().length > 0) return text;
    return trimmed;
  } catch {
    // codex: cron expressions and already-humanized strings throw inside
    // rrulestr's parser. Falling back to the raw value preserves whatever
    // app-server provided instead of dropping the row's schedule label.
    return trimmed;
  }
}
