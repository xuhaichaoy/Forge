// Thread title derivation: explicit name/preview → first user prompt
// projection → short id fallback (mechanical extraction from
// thread-workflow.ts — logic moved verbatim). DAG note: imports only the
// thread-workflow-shared leaf.
import type { Thread } from "@forge/codex-protocol";
import { trimmedStringField } from "./thread-workflow-shared";

export function threadTitle(thread: Thread, items?: ReadonlyArray<unknown> | null): string {
  const explicit = trimmedStringField(thread, "name") || trimmedStringField(thread, "preview");
  if (explicit) {
    // The backend may store the first prompt's raw text as the thread name/preview,
    // where @/$ mentions are serialized as `[label](<path>)` links. Collapse them to
    // their label (e.g. `$拆标`) so the title reads like the message instead of leaking
    // raw markdown + an absolute path. No-op for hand-typed names (no `](`), so manual
    // renames via renameThread() are unaffected.
    const preview = titlePreviewFromPromptText(explicit).replace(/\s+/g, " ").trim();
    return preview || explicit;
  }
  // Codex Desktop's `local-conversation-thread-*.js` derives an unnamed thread's
  // header label from the first user message in the turn — `Wd` walks
  // `thread.turns[0].items` and takes the first `userMessage` text. Falling back
  // straight to `shortId(thread.id)` (e.g. "019e072a...f40e") looks like a debug
  // string compared with Desktop, so do the same first-prompt projection here.
  const fromItems = firstUserMessagePreviewFromItems(items ?? null);
  if (fromItems) return fromItems;
  const fromTurns = firstUserMessagePreviewFromTurns(thread);
  if (fromTurns) return fromTurns;
  return shortId(thread.id);
}

function firstUserMessagePreviewFromItems(items: ReadonlyArray<unknown> | null): string {
  if (!items) return "";
  for (const candidate of items) {
    const preview = userMessagePreview(candidate);
    if (preview) return preview;
  }
  return "";
}

function firstUserMessagePreviewFromTurns(thread: Thread): string {
  const turns = (thread as { turns?: ReadonlyArray<{ items?: unknown[] }> }).turns;
  if (!Array.isArray(turns)) return "";
  for (const turn of turns) {
    const turnItems = Array.isArray(turn?.items) ? turn.items : [];
    const preview = firstUserMessagePreviewFromItems(turnItems);
    if (preview) return preview;
  }
  return "";
}

function userMessagePreview(candidate: unknown): string {
  if (!candidate || typeof candidate !== "object") return "";
  const record = candidate as Record<string, unknown>;
  if (record.type !== "userMessage") return "";
  const content = Array.isArray(record.content) ? record.content : [];
  const buffer: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const partRecord = part as Record<string, unknown>;
    if (partRecord.type === "text" && typeof partRecord.text === "string") {
      buffer.push(partRecord.text);
    }
  }
  const merged = titlePreviewFromPromptText(buffer.join("\n")).replace(/\s+/g, " ").trim();
  if (!merged) return "";
  return merged.length > 60 ? `${merged.slice(0, 60).trimEnd()}…` : merged;
}

// Thread titles are derived from the raw user-message text, where @/$ mentions and
// file references are serialized as markdown links `[label](<path>)` (the renderer
// turns these into chips — see user-message-content.ts FILE_LINK_RE). Collapse them
// to just their label (e.g. `$imagegen`) so the title reads like the message instead
// of leaking raw markdown + an absolute path.
function titlePreviewFromPromptText(text: string): string {
  if (!text.includes("](")) return text;
  return text.replace(
    /\[([^[\]\n]+)\]\((?:<[^>\n]+>|[^)\s\n]+)\)/g,
    (_whole: string, label: string) => label.trim(),
  );
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}
