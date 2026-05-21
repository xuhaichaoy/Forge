import {
  Atom,
  Braces,
  Code,
  File as LucideFile,
  FileArchive,
  FileCode,
  FileImage,
  FileText,
  Folder,
  Hash,
  Settings,
  TerminalSquare,
  Type,
} from "lucide-react";
import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  className?: string;
}

export type FileIconKey =
  | "artifactDocument"
  | "build"
  | "code"
  | "cplusplus"
  | "css"
  | "document"
  | "file"
  | "folder"
  | "hashes"
  | "html"
  | "image"
  | "java"
  | "javascript"
  | "json"
  | "notebook"
  | "pdf"
  | "php"
  | "presentation"
  | "python"
  | "react"
  | "rust"
  | "shell"
  | "skill"
  | "spreadsheet"
  | "terminal"
  | "toml"
  | "typescript"
  | "yaml";

type FileIconComponent = (props: IconProps) => ReactNode;

function iconClass(key: FileIconKey, className?: string): string {
  return [`hc-file-icon-${key}`, className].filter(Boolean).join(" ");
}

function makeIcon(
  key: FileIconKey,
  Icon: (props: { size?: number; className?: string }) => ReactNode,
): FileIconComponent {
  return ({ size = 16, className }) => <Icon size={size} className={iconClass(key, className)} />;
}

const ICON_REGISTRY: Record<FileIconKey, FileIconComponent> = {
  artifactDocument: makeIcon("artifactDocument", FileText),
  build: makeIcon("build", Settings),
  code: makeIcon("code", Code),
  cplusplus: makeIcon("cplusplus", FileCode),
  css: makeIcon("css", FileCode),
  document: makeIcon("document", FileText),
  file: makeIcon("file", LucideFile),
  folder: makeIcon("folder", Folder),
  hashes: makeIcon("hashes", Hash),
  html: makeIcon("html", FileCode),
  image: makeIcon("image", FileImage),
  java: makeIcon("java", FileCode),
  javascript: makeIcon("javascript", FileCode),
  json: makeIcon("json", Braces),
  notebook: makeIcon("notebook", FileCode),
  pdf: makeIcon("pdf", FileText),
  php: makeIcon("php", FileCode),
  presentation: makeIcon("presentation", FileText),
  python: makeIcon("python", FileCode),
  react: makeIcon("react", Atom),
  rust: makeIcon("rust", FileCode),
  shell: makeIcon("shell", TerminalSquare),
  skill: makeIcon("skill", FileArchive),
  spreadsheet: makeIcon("spreadsheet", FileText),
  terminal: makeIcon("terminal", TerminalSquare),
  toml: makeIcon("toml", FileText),
  typescript: makeIcon("typescript", Type),
  yaml: makeIcon("yaml", FileText),
};

const FILENAME_TO_KEY: Record<string, FileIconKey> = {
  "skill.md": "skill",
};

const EXTENSION_GROUPS: Array<{ key: FileIconKey; extensions: string[] }> = [
  { key: "typescript", extensions: ["ts"] },
  { key: "react", extensions: ["tsx", "jsx"] },
  { key: "javascript", extensions: ["js", "mjs", "cjs"] },
  { key: "python", extensions: ["py"] },
  { key: "java", extensions: ["java"] },
  { key: "rust", extensions: ["rs"] },
  { key: "php", extensions: ["php"] },
  { key: "css", extensions: ["css", "scss", "less", "sass"] },
  { key: "cplusplus", extensions: ["cpp", "cxx", "cc", "c", "hpp", "hh", "h"] },
  // Haskell (.hs) is not a JS variant — moved out of the `javascript` group
  // into the generic `code` bucket alongside other less-common languages.
  // Caught during the 2026-05-21 review pass.
  { key: "code", extensions: ["rb", "go", "kt", "swift", "m", "mm", "cs", "sql", "hs"] },
  { key: "json", extensions: ["json", "jsonc"] },
  { key: "document", extensions: ["md", "mdx", "markdown", "mkd", "mdown", "xml"] },
  { key: "html", extensions: ["html", "htm"] },
  { key: "yaml", extensions: ["yaml", "yml"] },
  { key: "toml", extensions: ["toml"] },
  { key: "spreadsheet", extensions: ["csv", "tsv", "xls", "xlsm", "xlsx"] },
  { key: "artifactDocument", extensions: ["doc", "docx"] },
  { key: "notebook", extensions: ["ipynb"] },
  { key: "presentation", extensions: ["ppt", "pptx"] },
  { key: "shell", extensions: ["sh", "bash", "zsh", "fish", "ps1"] },
  { key: "terminal", extensions: ["dockerfile"] },
  { key: "document", extensions: ["env", "dotenv", "gitignore", "lock"] },
  { key: "image", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"] },
  { key: "build", extensions: ["build", "bazel", "bzl", "ninja", "gradle", "mk", "makefile"] },
  { key: "hashes", extensions: ["sha", "sha1", "sha256", "md5", "checksum", "sum"] },
  { key: "pdf", extensions: ["pdf"] },
  { key: "folder", extensions: ["zip", "gz", "tgz", "tar"] },
];

const EXTENSION_TO_KEY = new Map<string, FileIconKey>();
for (const { key, extensions } of EXTENSION_GROUPS) {
  for (const ext of extensions) EXTENSION_TO_KEY.set(ext, key);
}

const MIME_PREFIX_MAP: Array<{ prefix: string; key: FileIconKey }> = [
  { prefix: "image/", key: "image" },
  { prefix: "text/", key: "document" },
  { prefix: "application/pdf", key: "pdf" },
  { prefix: "application/zip", key: "folder" },
  { prefix: "application/gzip", key: "folder" },
];

export interface FileIconOptions {
  path?: string | null;
  mime?: string | null;
  matchType?: "directory" | null;
  size?: number;
  className?: string;
}

export function resolveFileIconKey(
  path: string | null | undefined,
  mimeHint?: string | null,
): FileIconKey {
  if (!path && !mimeHint) return "file";

  if (path) {
    if (/[\\/]$/.test(path)) return "folder";

    const fileNameKey = FILENAME_TO_KEY[basenameLower(path)];
    if (fileNameKey) return fileNameKey;

    const ext = extensionLower(path);
    if (ext) {
      const extKey = EXTENSION_TO_KEY.get(ext);
      if (extKey) return extKey;
    }
  }

  const mime = mimeHint ?? (path ? inferMime(path) : null);
  if (mime) {
    const match = MIME_PREFIX_MAP.find((entry) => mime.startsWith(entry.prefix));
    if (match) return match.key;
  }

  return "file";
}

export function fileIconFor(opts: FileIconOptions): ReactNode {
  const { path, mime, matchType, size = 16, className } = opts;
  const key = matchType === "directory" ? "folder" : resolveFileIconKey(path, mime);
  const Component = ICON_REGISTRY[key];
  return <Component size={size} className={className} />;
}

export function fileIconKeyFor(opts: Pick<FileIconOptions, "path" | "mime" | "matchType">): FileIconKey {
  return opts.matchType === "directory" ? "folder" : resolveFileIconKey(opts.path, opts.mime);
}

export function fileIconComponent(key: FileIconKey): FileIconComponent {
  return ICON_REGISTRY[key];
}

function basenameLower(path: string): string {
  const lower = path.toLowerCase();
  const slash = Math.max(lower.lastIndexOf("/"), lower.lastIndexOf("\\"));
  return slash >= 0 ? lower.slice(slash + 1) : lower;
}

function extensionLower(path: string): string | null {
  const base = basenameLower(path);
  const dot = base.lastIndexOf(".");
  if (dot > 0 && dot < base.length - 1) return base.slice(dot + 1);
  if (dot === 0 && base.length > 1) return base.slice(1);
  if (dot === -1) return base;
  return null;
}

function inferMime(path: string): string | null {
  const ext = extensionLower(path);
  switch (ext) {
    case "bmp":
    case "gif":
    case "ico":
    case "jpeg":
    case "jpg":
    case "png":
    case "svg":
    case "webp":
      return `image/${ext === "jpg" ? "jpeg" : ext}`;
    case "css":
      return "text/css";
    case "htm":
    case "html":
      return "text/html";
    case "log":
    case "markdown":
    case "md":
    case "txt":
      return "text/plain";
    case "json":
    case "jsonc":
      return "application/json";
    case "pdf":
      return "application/pdf";
    case "zip":
      return "application/zip";
    case "gz":
    case "tgz":
      return "application/gzip";
    default:
      return null;
  }
}

export const FILE_ICON_KEYS: ReadonlyArray<FileIconKey> = Object.keys(ICON_REGISTRY) as FileIconKey[];
export const FILENAME_SPECIAL_MAP: Readonly<Record<string, FileIconKey>> = FILENAME_TO_KEY;
