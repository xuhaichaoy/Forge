/*
 * Knowledge-base search bug: a projectless "new chat" thread has no real
 * workspace, so a cited source file (e.g. a Yuxi KB document) is NOT a local
 * file. Rendering it as an end-resource file card resolves to a non-existent
 * `cwd/<basename>` ("无法加载此预览 / file does not exist"). assistantEndResourcesForTurn
 * must also avoid promoting bare source filenames in real workspaces because
 * knowledge-base provenance is not a local artifact path.
 */
import { assistantEndResourcesForTurn } from "../src/state/assistant-end-resources";
import type { ThreadItem } from "../src/state/render-group-types";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const CITATION = "来源文件：【F:docs/report.docx†L1-L50】";

export function realWorkspaceKeepsCitedSourceFileCard(): void {
  const resources = assistantEndResourcesForTurn({
    items: [] as ThreadItem[],
    assistantText: CITATION,
    cwd: "/work/app",
  });
  const files = resources.filter((resource) => resource.type === "file");
  assert(files.length === 1, `real workspace keeps the cited file card, got ${files.length}`);
  const first = files[0];
  assert(first?.type === "file" && first.path === "docs/report.docx", "card path is the cited doc");
}

export function realWorkspaceDropsBareKnowledgeSourceFilenameCard(): void {
  const resources = assistantEndResourcesForTurn({
    items: [] as ThreadItem[],
    assistantText: "来源文件：【F:福建在线《智能体应用实战》项目方案-按模板生成.docx†L1-L50】",
    cwd: "/work/app",
  });
  const files = resources.filter((resource) => resource.type === "file");
  assert(files.length === 0, `bare KB source filename should not become a file card, got ${files.length}`);
}

export function realWorkspaceDropsBareKnowledgeSourceMarkdownLinkCard(): void {
  const resources = assistantEndResourcesForTurn({
    items: [] as ThreadItem[],
    assistantText: "[福建在线《智能体应用实战》项目方案-按模板生成.docx](福建在线《智能体应用实战》项目方案-按模板生成.docx)",
    cwd: "/work/app",
  });
  const files = resources.filter((resource) => resource.type === "file");
  assert(files.length === 0, `bare KB source markdown link should not become a file card, got ${files.length}`);
}

export function projectlessThreadDropsCitedSourceFileCard(): void {
  const resources = assistantEndResourcesForTurn({
    items: [] as ThreadItem[],
    assistantText: CITATION,
    cwd: "/Users/me/Documents/Codex/2026-06-08/new-chat-7",
  });
  const files = resources.filter((resource) => resource.type === "file");
  assert(files.length === 0, `projectless thread drops the cited source-file card, got ${files.length}`);
}

export function projectlessThreadKeepsExplicitLocalArtifactMarkdownLink(): void {
  const resources = assistantEndResourcesForTurn({
    items: [] as ThreadItem[],
    assistantText: "已生成 [报告](/Users/me/Documents/Codex/2026-06-08/new-chat-7/report.xlsx)。",
    cwd: "/Users/me/Documents/Codex/2026-06-08/new-chat-7",
  });
  const files = resources.filter((resource) => resource.type === "file");
  assert(files.length === 1, `projectless thread keeps explicit local artifact link, got ${files.length}`);
  const first = files[0];
  assert(
    first?.type === "file" && first.path.endsWith("/report.xlsx"),
    "projectless explicit artifact path is preserved",
  );
}

export function projectlessThreadStillKeepsHttpWebsiteResource(): void {
  // Only local-file cards are suppressed; a single web preview URL still surfaces.
  const resources = assistantEndResourcesForTurn({
    items: [] as ThreadItem[],
    assistantText: "See http://localhost:3000/ for the running app.",
    cwd: "/Users/me/Documents/Codex/2026-06-08/new-chat-7",
  });
  assert(
    resources.some((resource) => resource.type === "website"),
    "projectless thread still surfaces a website resource",
  );
}
