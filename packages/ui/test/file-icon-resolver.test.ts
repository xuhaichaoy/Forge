import { fileIconKeyFor } from "../src/lib/file-icon";
import { resolveFileIcon } from "../src/lib/file-icon-resolver";

export default function runFileIconResolverTests(): void {
  resolvesWorkspaceTreeFamiliesFromDesktopMap();
  keepsSharedFileIconMapAlignedWithDesktop();
}

function resolvesWorkspaceTreeFamiliesFromDesktopMap(): void {
  assertEqual(resolveFileIcon("src", true), "folder", "collapsed directories should use the folder family");
  assertEqual(resolveFileIcon("src", true, true), "folder-open", "expanded directories should keep the open folder family");
  assertEqual(resolveFileIcon("app.ts", false), "typescript", "TypeScript files should use Desktop's typescript family");
  assertEqual(resolveFileIcon("Component.tsx", false), "react", "TSX files should use Desktop's react family");
  assertEqual(resolveFileIcon("Dockerfile", false), "terminal", "extension-less Dockerfile should use Desktop's terminal family");
  assertEqual(resolveFileIcon("CHECKSUM.sha256", false), "hashes", "hash files should use Desktop's hashes family");
  assertEqual(resolveFileIcon("notebook.ipynb", false), "notebook", "Jupyter notebooks should use Desktop's notebook family");
  assertEqual(resolveFileIcon("skill.md", false), "skill", "special Desktop skill.md filename should win over extension");
}

function keepsSharedFileIconMapAlignedWithDesktop(): void {
  assertEqual(fileIconKeyFor({ path: "guide.mdx" }), "document", "Markdown variants should use Desktop's document family");
  assertEqual(fileIconKeyFor({ path: "data.xlsx" }), "spreadsheet", "spreadsheets should use Desktop's spreadsheet family");
  assertEqual(fileIconKeyFor({ path: "slides.pptx" }), "presentation", "presentations should use Desktop's presentation family");
  assertEqual(fileIconKeyFor({ path: "archive.tgz" }), "folder", "archives should use Desktop's folder family");
  assertEqual(fileIconKeyFor({ path: "main.hs" }), "javascript", "Desktop maps .hs to the javascript icon family");
  assertEqual(fileIconKeyFor({ path: "photo", mime: "image/png" }), "image", "MIME image hints should use Desktop's image family");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
