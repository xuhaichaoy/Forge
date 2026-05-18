export function threadIdFromCodexDeepLink(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "codex:") return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
  if ((host === "threads" || host === "thread" || host === "local") && segments[0]) {
    return decodeSegment(segments[0]);
  }
  if (!host && (segments[0] === "threads" || segments[0] === "thread" || segments[0] === "local") && segments[1]) {
    return decodeSegment(segments[1]);
  }
  return null;
}

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded || null;
  } catch {
    return value.trim() || null;
  }
}
