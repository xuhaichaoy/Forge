const EXTERNAL_LINK_SOURCE_HOSTS: Array<{ appId: string; hostnames: string[] }> = [
  { appId: "google-calendar", hostnames: ["calendar.google.com"] },
  { appId: "google-drive", hostnames: ["docs.google.com", "drive.google.com", "sheets.google.com", "slides.google.com"] },
  { appId: "figma", hostnames: ["figma.com"] },
  { appId: "github", hostnames: ["github.com"] },
  { appId: "linear", hostnames: ["linear.app"] },
  { appId: "gmail", hostnames: ["mail.google.com"] },
  { appId: "notion", hostnames: ["notion.so"] },
  { appId: "slack", hostnames: ["slack.com"] },
];

const URL_LIKE_PROMPT_PATH = /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|www\.|mailto:|tel:)/;

export function externalLinkSourceAppId(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hostname = url.hostname.toLowerCase();
  for (const source of EXTERNAL_LINK_SOURCE_HOSTS) {
    if (source.hostnames.some((candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`))) {
      return source.appId;
    }
  }
  return null;
}

export function isUrlLikePromptPath(path: string): boolean {
  return URL_LIKE_PROMPT_PATH.test(path);
}

export function isAgentMentionPath(path: string): boolean {
  return /^(?:agent|subagent):\/\//i.test(path) || /(?:^|[?&#])(?:conversationId|conversation_id|threadId)=/i.test(path);
}

export function conversationIdFromAgentPath(path: string): string {
  try {
    const url = new URL(path);
    const fromQuery = url.searchParams.get("conversationId")
      ?? url.searchParams.get("conversation_id")
      ?? url.searchParams.get("threadId");
    if (fromQuery) return fromQuery;
    if (/^(?:agent|subagent):$/i.test(url.protocol)) {
      const pathId = url.pathname.replace(/^\/+/, "").split("/", 1)[0] ?? "";
      return url.hostname || pathId;
    }
  } catch {
    const queryId = path.match(/(?:^|[?&#])(?:conversationId|conversation_id|threadId)=([^&#]+)/i)?.[1];
    if (queryId) return decodeURIComponent(queryId);
  }
  return "";
}

export function inferMentionNameFromPath(path: string): string {
  if (/^(?:app|plugin|agent):\/\//i.test(path)) return path.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/, 1)[0] ?? "";
  const normalized = path.replace(/\/+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.at(-1)?.toLowerCase() === "skill.md" && parts.length >= 2) return parts.at(-2) ?? "";
  return parts.at(-1) ?? normalized;
}

export function unescapePromptPath(value: string): string {
  const unwrapped = value.startsWith("<") && value.endsWith(">") && value.length >= 2
    ? value.slice(1, -1).replace(/\\>/g, ">")
    : value;
  return unwrapped.replace(/\\([\\)])/g, "$1");
}

export function escapePromptPath(value: string): string {
  if (/[\s()<>]/.test(value)) {
    return `<${value.replace(/\\/g, "\\\\").replace(/>/g, "\\>")}>`;
  }
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}
