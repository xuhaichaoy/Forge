// codex: local-conversation-thread-*.js — PR status widget.
// Standalone row that mirrors the `gh-cli-status-*` children Codex Desktop
// renders in the Environment section (row 4). It is intentionally self-
// contained so the right-rail integration can be wired in a follow-up turn
// without churning conversation-chrome / right-rail.tsx yet.
//
// Lifecycle: on mount + every `cwd` change the component calls
// `ghPrStatus(cwd)`. When `pr` resolves to null (no PR, gh missing, not a git
// repo, IPC failure) the component returns null so the caller can decide
// whether to fill the row with placeholder content. When `pr` is populated we
// render a single row: PR icon + `{title} #{number}` + status badge. The
// status badge mirrors Codex's color scheme:
//   - isDraft → Draft (gray)
//   - state === "MERGED" → Merged (purple)
//   - state === "CLOSED" → Closed (red)
//   - otherwise → Open (green)
import { GitPullRequest } from "lucide-react";
import { useEffect, useState } from "react";
import { ghPrStatus, isTauriRuntime, type GhPrInfo } from "../lib/tauri-host";

export interface PrStatusRowProps {
  /** Workspace cwd passed straight to `gh pr status`. Empty/null → row hides. */
  cwd?: string | null;
  /**
   * Row click handler. Codex Desktop opens the PR URL on click; the caller is
   * expected to wire this to `openExternalUrl(pr.url)` (kept indirect so this
   * component doesn't pull in the host bridge directly inside the click path).
   */
  onClick?: (pr: GhPrInfo) => void;
}

// codex: PR-status widget status badge — Codex Desktop encodes badge tone in the
// class name; Forge mirrors with `data-tone` for CSS targetability and a stable test hook.
type BadgeTone = "draft" | "merged" | "closed" | "open";

interface BadgeProjection {
  tone: BadgeTone;
  label: string;
}

function projectBadge(pr: GhPrInfo): BadgeProjection {
  if (pr.isDraft) return { tone: "draft", label: "Draft" };
  const state = pr.state?.toUpperCase?.() ?? "";
  if (state === "MERGED") return { tone: "merged", label: "Merged" };
  if (state === "CLOSED") return { tone: "closed", label: "Closed" };
  return { tone: "open", label: "Open" };
}

export function PrStatusRow({ cwd, onClick }: PrStatusRowProps) {
  const trimmedCwd = typeof cwd === "string" ? cwd.trim() : "";
  const [pr, setPr] = useState<GhPrInfo | null>(null);

  // codex: PR-status widget `pullRequestStatus` query — Codex Desktop drives this
  // via react-query; Forge uses a plain effect with a cancellation flag so we
  // don't have to pull a new dependency into the host bridge.
  useEffect(() => {
    if (!trimmedCwd) {
      setPr(null);
      return;
    }
    // SSR / non-Tauri (web preview) → render nothing rather than crash IPC.
    if (!isTauriRuntime()) {
      setPr(null);
      return;
    }
    let cancelled = false;
    ghPrStatus(trimmedCwd)
      .then((response) => {
        if (cancelled) return;
        setPr(response.pr ?? null);
      })
      .catch(() => {
        // codex: PR-status widget — gh missing / no repo / network → silently hide the row.
        // We intentionally swallow the error so the right-rail keeps rendering.
        if (cancelled) return;
        setPr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [trimmedCwd]);

  if (!pr) return null;

  const badge = projectBadge(pr);
  const handleClick = (): void => {
    onClick?.(pr);
  };

  return (
    <button
      type="button"
      className="hc-pr-status-row"
      data-pr-state={pr.state}
      data-pr-is-draft={pr.isDraft ? "true" : "false"}
      onClick={handleClick}
      title={pr.url}
    >
      <span className="hc-pr-status-row-icon" aria-hidden="true">
        <GitPullRequest size={14} />
      </span>
      <span className="hc-pr-status-row-title">
        <span className="hc-pr-status-row-title-text">{pr.title}</span>
        <span className="hc-pr-status-row-number"> #{pr.number}</span>
      </span>
      <span className="hc-pr-status-badge" data-tone={badge.tone}>
        {badge.label}
      </span>
    </button>
  );
}

// codex: PR-status widget status badge — exported for unit-test sanity; callers
// should not rely on this for runtime decisions (status text is in the component output).
export const __testing = { projectBadge };
