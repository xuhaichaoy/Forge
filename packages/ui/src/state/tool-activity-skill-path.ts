export interface DesktopSkillPathInfo {
  skillName: string;
  isSkillDefinitionFile: boolean;
}

const DESKTOP_SKILL_ROOT_SEGMENTS = new Set([".codex", ".agents"]);
const DESKTOP_SKILL_INDIRECT_SEGMENTS = new Set(["_import", ".system"]);
const DESKTOP_SKILLS_SEGMENT = "skills";
const DESKTOP_PLUGINS_SEGMENT = "plugins";
const DESKTOP_PLUGIN_CACHE_SEGMENT = "cache";
const DESKTOP_SKILL_DEFINITION_FILE = "skill.md";

export function parseDesktopSkillPathInfo(path: string): DesktopSkillPathInfo | null {
  const parts = normalizeSearchPathSegments(path).split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parseDesktopCodexSkillPath(parts) ?? parseDesktopPluginSkillPath(parts);
}

function parseDesktopCodexSkillPath(parts: string[]): DesktopSkillPathInfo | null {
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index]?.toLowerCase();
    const next = parts[index + 1]?.toLowerCase();
    if (!current || !DESKTOP_SKILL_ROOT_SEGMENTS.has(current) || next !== DESKTOP_SKILLS_SEGMENT) continue;
    const candidate = parts[index + 2] ?? "";
    const candidateLower = candidate.toLowerCase();
    const usesIndirectSegment = DESKTOP_SKILL_INDIRECT_SEGMENTS.has(candidateLower);
    const skillId = usesIndirectSegment ? parts[index + 3] ?? "" : candidate;
    if (!skillId) continue;
    const relativePathSegments = usesIndirectSegment ? parts.slice(index + 4) : parts.slice(index + 3);
    return desktopSkillPathInfo(skillId, relativePathSegments);
  }
  return null;
}

function parseDesktopPluginSkillPath(parts: string[]): DesktopSkillPathInfo | null {
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index]?.toLowerCase() !== DESKTOP_PLUGINS_SEGMENT) continue;
    const pluginId = desktopPluginIdFromPath(parts, index);
    if (!pluginId) continue;
    const skillsIndex = parts.findIndex((part, partIndex) =>
      partIndex > index && part.toLowerCase() === DESKTOP_SKILLS_SEGMENT
    );
    const skillId = skillsIndex >= 0 ? parts[skillsIndex + 1] ?? "" : "";
    if (!skillId) continue;
    return desktopSkillPathInfo(skillId, parts.slice(skillsIndex + 2));
  }
  return null;
}

function desktopPluginIdFromPath(parts: string[], pluginsIndex: number): string | null {
  const next = parts[pluginsIndex + 1] ?? "";
  if (!next) return null;
  return next.toLowerCase() === DESKTOP_PLUGIN_CACHE_SEGMENT ? parts[pluginsIndex + 3] ?? null : next;
}

function desktopSkillPathInfo(skillId: string, relativePathSegments: string[]): DesktopSkillPathInfo {
  const firstSegment = relativePathSegments[0]?.toLowerCase();
  return {
    skillName: desktopSkillDisplayName(skillId.replaceAll("_", "-")),
    isSkillDefinitionFile: relativePathSegments.length === 1 && firstSegment === DESKTOP_SKILL_DEFINITION_FILE,
  };
}

const DESKTOP_TITLE_INITIALISMS = new Set([
  "GH",
  "IA",
  "MCP",
  "API",
  "CI",
  "CLI",
  "LLM",
  "PDF",
  "PR",
  "UI",
  "URL",
  "SQL",
  "TW",
  "GPU",
  "CPU",
]);
const DESKTOP_TITLE_OVERRIDES = new Map([
  ["openai", "OpenAI"],
  ["openapi", "OpenAPI"],
  ["github", "GitHub"],
  ["pagerduty", "PagerDuty"],
  ["datadog", "DataDog"],
  ["sqlite", "SQLite"],
  ["fastapi", "FastAPI"],
]);
const DESKTOP_LOWER_TITLE_WORDS = new Set(["and", "or", "to", "up", "with"]);

function desktopSkillDisplayName(value: string): string {
  return value.split(":").map((part) => desktopTitleCase(part)).join(": ");
}

function desktopTitleCase(value: string): string {
  return value
    .replace(/[_-]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .map((word, index) => desktopTitleWord(word, index))
    .join(" ");
}

function desktopTitleWord(word: string, index: number): string {
  const initialism = desktopInitialism(word);
  if (initialism) return initialism;
  const lower = word.toLowerCase();
  return DESKTOP_TITLE_OVERRIDES.get(lower)
    ?? (index > 0 && DESKTOP_LOWER_TITLE_WORDS.has(lower) ? lower : upperFirst(lower));
}

function desktopInitialism(word: string): string | null {
  const upper = word.toUpperCase();
  if (DESKTOP_TITLE_INITIALISMS.has(upper)) return upper;
  if (!word.toLowerCase().endsWith("s")) return null;
  const singular = word.slice(0, -1).toUpperCase();
  return DESKTOP_TITLE_INITIALISMS.has(singular) ? `${singular}s` : null;
}

function upperFirst(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function normalizeSearchPathSegments(value: string): string {
  const driveMatch = /^[A-Za-z]:\//u.exec(value);
  const prefix = driveMatch ? driveMatch[0] : value.startsWith("/") ? "/" : "";
  const withoutPrefix = prefix ? value.slice(prefix.length) : value;
  const parts: string[] = [];
  for (const part of withoutPrefix.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${prefix}${parts.join("/")}`;
}
