// Workspace developer-instruction discovery (AGENTS.md / CLAUDE.md walk-up)
// and the projectless cwd/workspace predicates (mechanical extraction from
// thread-workflow.ts — logic moved verbatim). DAG note: imports only the
// thread-workflow-shared leaf.
import { isTauriRuntime, readFileMetadata, readTextFile } from "../lib/tauri-host";
import type { ThreadContextDefaults } from "./codex-ui-types";
import {
  normalizedCwd,
  type WorkspaceDeveloperInstructionReader,
  type WorkspacePathExistsReader,
} from "./thread-workflow-shared";

const WORKSPACE_DEVELOPER_INSTRUCTIONS_MAX_BYTES = 120_000;
const WORKSPACE_DEVELOPER_INSTRUCTIONS_MAX_DEPTH = 12;
const AGENTS_DEVELOPER_INSTRUCTION_FILENAMES = ["AGENTS.override.md", "AGENTS.md"] as const;
const WORKSPACE_EXTRA_DEVELOPER_INSTRUCTION_FILENAMES = ["CLAUDE.md"] as const;
const DEFAULT_PROJECT_ROOT_MARKERS = [".git"] as const;

export interface ReadWorkspaceDeveloperInstructionsOptions {
  codexHome?: string | null;
  readFile?: WorkspaceDeveloperInstructionReader;
  pathExists?: WorkspacePathExistsReader;
  isRuntimeAvailable?: () => boolean;
  maxBytes?: number;
  projectRootMarkers?: readonly string[];
}

export async function readWorkspaceDeveloperInstructions(
  workspace: string,
  options: ReadWorkspaceDeveloperInstructionsOptions = {},
): Promise<string | null> {
  const cwd = normalizedCwd(workspace);
  if (!cwd) return null;
  const runtimeAvailable = options.isRuntimeAvailable ?? isTauriRuntime;
  if (!runtimeAvailable()) return null;
  const reader = options.readFile ?? readTextFile;
  const pathExists = options.pathExists ?? pathExistsByMetadata;
  const maxBytes = options.maxBytes ?? WORKSPACE_DEVELOPER_INSTRUCTIONS_MAX_BYTES;
  const sources: Array<{ path: string; text: string }> = [];
  const codexHome = normalizedCwd(options.codexHome ?? "");
  if (codexHome) {
    sources.push(...await readDeveloperInstructionSourcesInDir(codexHome, reader, maxBytes, false));
  }
  const dirs = await workspaceDeveloperInstructionDirs(cwd, {
    pathExists,
    projectRootMarkers: options.projectRootMarkers ?? DEFAULT_PROJECT_ROOT_MARKERS,
  });
  for (const dir of dirs) {
    sources.push(...await readDeveloperInstructionSourcesInDir(dir, reader, maxBytes, true));
  }
  return formatWorkspaceDeveloperInstructions(sources);
}

export function withWorkspaceDeveloperInstructions(
  context: ThreadContextDefaults | null | undefined,
  workspaceInstructions: string | null | undefined,
): ThreadContextDefaults | null {
  const trimmedWorkspaceInstructions = workspaceInstructions?.trim() ?? "";
  if (!trimmedWorkspaceInstructions) return context ?? null;
  const existingDeveloperInstructions = context?.developerInstructions?.trim() ?? "";
  return {
    ...context,
    developerInstructions: existingDeveloperInstructions
      ? `${existingDeveloperInstructions}\n\n${trimmedWorkspaceInstructions}`
      : trimmedWorkspaceInstructions,
  };
}

/**
 * codex `qf` (src-*.js): the projectless system prompt the desktop shell injects via
 * developerInstructions when a thread has no workspace. The codex app-server has no
 * `workspaceKind`/projectless concept, so Forge must build this client-side too.
 * With split directories (the default), deliverables go to `outputDirectory` and
 * scratch to `work/`; the prompt steers the agent away from writing to $HOME.
 */
export function projectlessThreadInstructions(
  cwd: string,
  outputDirectory?: string | null,
): string {
  const trimmedOutput = outputDirectory?.trim() ?? "";
  const split = trimmedOutput.length > 0 && trimmedOutput !== cwd;
  const deliverables = split ? trimmedOutput : cwd;
  return [
    "### Projectless Chat",
    "This projectless thread starts in a generated directory under the user's Documents/Codex folder.",
    "Prefer answering inline in chat unless using local files would make the result more useful.",
    ...(split
      ? [
          `Use work/ for intermediate files, scratch analysis, scripts, drafts, and temporary assets. Use ${deliverables} only for user-facing deliverables that should appear as outputs.`,
          `When referring to saved deliverables in the final response, link only files from ${deliverables}.`,
        ]
      : [
          `When using local files for this projectless thread, write scratch files, drafts, generated assets, and other outputs under ${deliverables}.`,
        ]),
    "Do not write directly in the home directory unless the user explicitly asks.",
  ].join("\n");
}

/**
 * codex `app-server-manager-signals` projectless-cwd matcher (verbatim `cm`): a
 * generated projectless working directory ends with
 * `…/Documents/Codex/<YYYY-MM-DD>-<slug>` (legacy flat) or
 * `…/Documents/Codex/<YYYY-MM-DD>/<slug>` (current nested), where the slug is
 * `[a-z0-9][a-z0-9-]*`. Anchored + case-sensitive so the host-created `outputs/`/
 * `work/` sub-directories and any real project under Documents/Codex are NOT matched.
 */
const PROJECTLESS_THREAD_CWD_RE =
  /^(.*(?:^|[\\/])Documents[\\/]+Codex)[\\/]+(?:\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*|\d{4}-\d{2}-\d{2}[\\/]+[a-z0-9][a-z0-9-]*)[\\/]*$/;

/**
 * True when a cwd is a generated projectless working directory (codex `lm`). The
 * app-server protocol omits `workspaceKind`, so Forge infers projectless-ness from
 * the cwd via codex's own matcher. Used both for sidebar grouping and (below) so the
 * composer treats a workspace that has been synced to a projectless thread's cwd as
 * projectless rather than a real project.
 */
export function isProjectlessThreadCwd(cwd: string | null | undefined): boolean {
  const trimmed = cwd?.trim() ?? "";
  if (!trimmed) return false;
  return PROJECTLESS_THREAD_CWD_RE.test(trimmed);
}

/**
 * A thread is "projectless" (codex) when no project/workspace has been selected.
 * codex's composer predicate (`projectless-thread-*.js`: `n(e)=e.length===0||e.length===1&&e[0]==='~'`)
 * tests the workspace-roots array for empty OR a single literal `~` sentinel — it
 * NEVER compares the cwd to the resolved home path. Forge models the unselected
 * workspace as the empty string (its native "no workspace" idiom: `normalizedCwd`
 * maps "" → null, the wire-level projectless signal). A real path — even one that
 * equals $HOME — is an explicitly-chosen project, so it is NOT projectless and is
 * used as the turn cwd. Additionally, because Forge's `workspace` state syncs to
 * the ACTIVE thread's cwd, a workspace that has been set to a *generated* projectless
 * cwd (`~/Documents/Codex/<date>/<slug>`) must also count as projectless — otherwise
 * that generated dir would leak into the project picker/chip as a fake "project".
 */
export function isProjectlessWorkspace(workspace: string | null | undefined): boolean {
  const trimmed = workspace?.trim() ?? "";
  return trimmed.length === 0 || trimmed === "~" || isProjectlessThreadCwd(trimmed);
}

async function workspaceDeveloperInstructionDirs(
  workspace: string,
  options: { pathExists: WorkspacePathExistsReader; projectRootMarkers: readonly string[] },
): Promise<string[]> {
  const dirs: string[] = [];
  let current: string | null = stripTrailingPathSeparators(workspace);
  let depth = 0;
  while (current && depth < WORKSPACE_DEVELOPER_INSTRUCTIONS_MAX_DEPTH) {
    dirs.push(current);
    if (await hasProjectRootMarker(current, options.pathExists, options.projectRootMarkers)) break;
    const parent = parentPath(current);
    if (!parent || parent === current) break;
    current = parent;
    depth += 1;
  }
  dirs.reverse();
  return dirs;
}

async function hasProjectRootMarker(
  dir: string,
  pathExists: WorkspacePathExistsReader,
  projectRootMarkers: readonly string[],
): Promise<boolean> {
  for (const marker of projectRootMarkers) {
    if (await pathExists(joinPath(dir, marker))) return true;
  }
  return false;
}

async function pathExistsByMetadata(path: string): Promise<boolean> {
  try {
    await readFileMetadata(path);
    return true;
  } catch {
    return false;
  }
}

async function readDeveloperInstructionSourcesInDir(
  dir: string,
  reader: WorkspaceDeveloperInstructionReader,
  maxBytes: number,
  includeExtraFiles: boolean,
): Promise<Array<{ path: string; text: string }>> {
  const sources: Array<{ path: string; text: string }> = [];
  const agentsSource = await readFirstDeveloperInstructionSource(
    dir,
    AGENTS_DEVELOPER_INSTRUCTION_FILENAMES,
    reader,
    maxBytes,
  );
  if (agentsSource?.text.trim()) sources.push({ path: agentsSource.path, text: agentsSource.text.trim() });
  if (!includeExtraFiles) return sources;
  for (const fileName of WORKSPACE_EXTRA_DEVELOPER_INSTRUCTION_FILENAMES) {
    const source = await readDeveloperInstructionSource(joinPath(dir, fileName), reader, maxBytes);
    if (source?.text.trim()) sources.push({ path: source.path, text: source.text.trim() });
  }
  return sources;
}

async function readFirstDeveloperInstructionSource(
  dir: string,
  fileNames: readonly string[],
  reader: WorkspaceDeveloperInstructionReader,
  maxBytes: number,
): Promise<{ path: string; text: string } | null> {
  for (const fileName of fileNames) {
    const source = await readDeveloperInstructionSource(joinPath(dir, fileName), reader, maxBytes);
    if (source) return source;
  }
  return null;
}

async function readDeveloperInstructionSource(
  path: string,
  reader: WorkspaceDeveloperInstructionReader,
  maxBytes: number,
): Promise<{ path: string; text: string } | null> {
  try {
    return { path, text: await reader(path, maxBytes) };
  } catch {
    // Missing AGENTS.md / CLAUDE.md files are normal; keep scanning.
    return null;
  }
}

function formatWorkspaceDeveloperInstructions(sources: Array<{ path: string; text: string }>): string | null {
  if (sources.length === 0) return null;
  return [
    "Workspace developer instructions:",
    ...sources.map((source) => `Instructions from ${source.path}:\n${source.text.trim()}`),
  ].join("\n\n");
}

function stripTrailingPathSeparators(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "/") return "/";
  if (/^[A-Za-z]:[\\/]?$/.test(trimmed)) return trimmed.slice(0, 2);
  return trimmed.replace(/[\\/]+$/, "");
}

function parentPath(path: string): string | null {
  const normalized = stripTrailingPathSeparators(path);
  if (!normalized || normalized === "/") return null;
  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separatorIndex < 0) return null;
  if (separatorIndex === 0) return "/";
  if (separatorIndex === 2 && /^[A-Za-z]:/.test(normalized)) return normalized.slice(0, 2);
  return normalized.slice(0, separatorIndex);
}

function joinPath(dir: string, fileName: string): string {
  const normalized = stripTrailingPathSeparators(dir);
  if (!normalized || normalized === "/") return `/${fileName}`;
  return `${normalized}/${fileName}`;
}
