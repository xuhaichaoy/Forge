import { ArrowRight, FileText } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useForgeIntl } from "./i18n-provider";
import { TurnDiffFilesSection, TurnDiffStats } from "./turn-diff-files-section";
import { TurnDiffSimplePreview } from "./turn-diff-simple-preview";
import {
  formatTurnDiffFileCount,
  formatTurnDiffFilesChanged,
  splitDiffByFile,
  turnDiffViewModel,
  type TurnDiffFileViewModel,
} from "./turn-diff-view-model";

/**
 * Undo / Reapply patch 回调 — 由 `ForgeApp.handlePatchAction` 接线，调用
 * Tauri `host_apply_patch_action` 执行 git apply / --reverse，并在失败时把
 * `PatchActionResult` 投给 `<UnifiedDiffFailureDialog/>`。
 *
 * Prop 仍声明为可选，方便 Storybook / 单测以静态 fixture 渲染 TurnDiffBlock
 * 而不必拽起整个 Tauri stack；运行时 ForgeApp 必传，按钮可见且可点击。
 * 双击/重复点击保护：ForgeApp 用 `useRef` 同步锁 + 全局 `patchActionInFlight`
 * disable 所有 Undo/Reapply 按钮（避免并发 git apply）。
 */
export type PatchAction = "undo" | "reapply";
export type PatchActionState = { action: PatchAction; diff: string } | null;

const TURN_DIFF_PREVIEW_DELAY_MS = 800;
const TURN_DIFF_PREVIEW_SKIP_DELAY_WINDOW_MS = 300;
const TURN_DIFF_INLINE_RENDER_CUTOFF = 5000;
let lastTurnDiffPreviewOpenAt = 0;

export function TurnDiffBlock({
  contentSearchUnitKey,
  inProgress,
  itemIds,
  onOpenDiff,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
  value,
}: {
  contentSearchUnitKey?: string;
  inProgress: boolean;
  itemIds?: string;
  /**
   * codex: local-conversation-thread `Fv` Review button + `wa(o, { path })`
   * deep-link. When a path is supplied the host should open the diff scoped to
   * that file (single-file review).
   */
  onOpenDiff?: (filePath?: string) => void;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  /**
   * Global in-flight flag — disables ALL Undo/Reapply buttons while any patch
   * action is running. Backstops the synchronous `useRef` lock in ForgeApp;
   * the button-level `disabled` is the user-visible guarantee that prevents
   * double-click before any git apply runs.
   */
  patchActionInFlight?: boolean;
  value: string;
}) {
  const { formatMessage } = useForgeIntl();
  const model = turnDiffViewModel(value);
  if (!model.hasChanges) return null;

  /*
   * Undo / Reapply toggles against the last patch action for this diff. The
   * callback is optional for fixture-only renderers; ForgeApp wires it to
   * the Tauri `host_apply_patch_action` command at runtime.
   */
  const patchActionForThisDiff =
    patchActionState && patchActionState.diff === value
      ? patchActionState.action === "undo"
        ? "reapply"
        : "undo"
      : "undo";

  const singleFileName = model.fileCount === 1 && model.files.length === 1 ? model.files[0]!.path : null;
  const titleLabel = formatTurnDiffFileCount(model.fileCount, singleFileName, formatMessage);
  const singleFileDetailsLabel =
    singleFileName == null ? null : formatMessage({ id: "hc.unifiedDiff.details", defaultMessage: "Details" });

  if (inProgress) {
    const progressTitleLabel = formatTurnDiffFilesChanged(model.fileCount, formatMessage);
    return (
      <article
        className="hc-tool-block activity hc-turn-diff-progress"
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
      >
        <div className="hc-turn-diff-progress-row">
          <div className="hc-turn-diff-progress-summary">
            <span className="hc-turn-diff-progress-title">{progressTitleLabel}</span>
            <TurnDiffStats added={model.linesAdded} removed={model.linesRemoved} />
          </div>
          <div className="hc-turn-diff-spacer" />
          {onOpenDiff && (
            <button
              className="hc-turn-diff-review"
              type="button"
              onClick={() => onOpenDiff()}
              title={formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
              aria-label={formatMessage({
                id: "codex.unifiedDiff.reviewChangedFiles",
                defaultMessage: "Review changed files",
              })}
            >
              {/*
               * Codex Desktop i18n (local-conversation-thread-*.js), build 26.602:
               *   codex.unifiedDiff.reviewChanges       = "Review" (button label; desc:
               *     "Button label to view and follow changes in the diff for a Codex task")
               *   codex.unifiedDiff.viewDiffTooltip     = "Review" (narrow-width label + title)
               *   codex.unifiedDiff.reviewChangedFiles  = "Review changed files" (aria-label)
               *   codex.unifiedDiff.reviewChangesHover  = "Review changes" (hover/header subtitle)
               * The bundle renders a single "Review" label; Forge keeps a responsive
               * full/short split that resolves to the same "Review" text at any width.
               */}
              <span className="hc-turn-diff-review-full">
                {formatMessage({ id: "codex.unifiedDiff.reviewChanges", defaultMessage: "Review" })}
              </span>
              <span className="hc-turn-diff-review-short">
                {formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
              </span>
            </button>
          )}
        </div>
      </article>
    );
  }

  const handleHeaderReview = () => onOpenDiff?.(singleFileName ?? undefined);
  const preview = turnDiffPreviewData(model.files, value);

  const card = (
    <article
      className="hc-tool-block hc-turn-diff"
      data-content-search-unit-key={contentSearchUnitKey}
      data-item-ids={itemIds}
    >
      {/*
       * codex: `Pv` `group/turn-diff-header` wrapper. The whole header is
       * covered by `Iv`, an invisible button that triggers Review on click.
       * Inner buttons stop propagation so Undo/Reapply still work.
       */}
      <div className="hc-turn-diff-header hc-turn-diff-header--with-hover">
        {onOpenDiff && (
          // codex: `Iv` — absolute overlay button covering the entire header.
          <button
            type="button"
            className="hc-turn-diff-header-overlay"
            aria-label={formatMessage({
              id: "codex.unifiedDiff.reviewChangedFiles",
              defaultMessage: "Review changed files",
            })}
            onClick={handleHeaderReview}
          />
        )}
        {/* codex: `Pv` 60px header icon — file glyph inside rounded square */}
        <span className="hc-turn-diff-header-icon" aria-hidden="true">
          <FileText size={18} />
        </span>
        <div className="hc-turn-diff-header-text">
          <span className="hc-turn-diff-title">{titleLabel}</span>
          {/*
           * codex: default subtitle = DiffStats; on hover/focus it is replaced
           * by the reviewChangesHover label ("Review changes") followed by a
           * separate arrow icon — the arrow is an icon element, not a glyph
           * baked into the string. Re-verified vs Codex Desktop v26.519.81530.
           */}
          <span className="hc-turn-diff-subtitle turn-diff-default-subtitle">
            <TurnDiffStats added={model.linesAdded} removed={model.linesRemoved} />
          </span>
          <span className="hc-turn-diff-subtitle turn-diff-hover-subtitle" aria-hidden="true">
            {formatMessage({ id: "codex.unifiedDiff.reviewChangesHover", defaultMessage: "Review changes" })}
            <ArrowRight aria-hidden className="hc-turn-diff-review-arrow" size={12} />
          </span>
        </div>
        <div className="hc-turn-diff-spacer" />
        {/*
         * `onPatchAction` is always provided by `ForgeApp.tsx` at runtime
         * (wired to the Tauri `host_apply_patch_action` command); the prop
         * stays optional so fixture-only renderers (tests / Storybook) can
         * skip the toolbar.
         */}
        {onPatchAction && (
          <button
            className="hc-turn-diff-patch-action"
            /*
             * Codex Desktop i18n: revertChangesTooltip = "Undo", reapplyChangesTooltip = "Reapply"
             * (local-conversation-thread-*.js). Forge tooltips align to single-word
             * Codex values; aria-label adds verb context for screen readers.
             */
            title={
              patchActionForThisDiff === "undo"
                ? formatMessage({ id: "codex.unifiedDiff.revertChangesTooltip", defaultMessage: "Undo" })
                : formatMessage({ id: "codex.unifiedDiff.reapplyChangesTooltip", defaultMessage: "Reapply" })
            }
            aria-label={
              patchActionForThisDiff === "undo"
                ? formatMessage({ id: "hc.unifiedDiff.undoThisPatch", defaultMessage: "Undo this patch" })
                : formatMessage({ id: "hc.unifiedDiff.reapplyThisPatch", defaultMessage: "Reapply this patch" })
            }
            type="button"
            disabled={patchActionInFlight}
            onClick={(event) => {
              // codex: `Pv` inner buttons stopPropagation so the `Iv` overlay
              // does not also trigger Review.
              event.stopPropagation();
              // codex: `ln(o, {eventName:"codex_undo_clicked", metadata:{source:"turn_diff"}})`
              if (patchActionForThisDiff === "undo" && typeof console !== "undefined") {
                console.info("codex_undo_clicked", { source: "turn_diff" });
              }
              onPatchAction(patchActionForThisDiff, value);
            }}
          >
            {patchActionForThisDiff === "undo"
              ? formatMessage({ id: "codex.unifiedDiff.revertChangesTooltip", defaultMessage: "Undo" })
              : formatMessage({ id: "codex.unifiedDiff.reapplyChangesTooltip", defaultMessage: "Reapply" })}
          </button>
        )}
        {onOpenDiff && (
          <button
            className="hc-turn-diff-review"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleHeaderReview();
            }}
          >
            {/*
             * codex: the completed-card trailing button shows the single
             * viewDiffTooltip label "Review" (not "Review changes"); the
             * "Review changes" wording lives only on the hover subtitle above.
             * Re-verified vs Codex Desktop v26.519.81530.
             */}
            <span className="hc-turn-diff-review-full">
              {formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
            </span>
            <span className="hc-turn-diff-review-short">
              {formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
            </span>
          </button>
        )}
      </div>

      <TurnDiffFilesSection
        files={model.files}
        onOpenDiff={onOpenDiff}
        singleFileDetailsLabel={singleFileDetailsLabel}
        value={value}
      />
    </article>
  );

  return preview && onOpenDiff ? (
    <TurnDiffPreviewTooltip
      preview={preview}
      onOpen={() => onOpenDiff(preview.path)}
    >
      {card}
    </TurnDiffPreviewTooltip>
  ) : card;
}

interface TurnDiffPreviewData {
  diff: string;
  linesAdded: number;
  linesRemoved: number;
  path: string;
}

function turnDiffPreviewData(files: TurnDiffFileViewModel[], diff: string): TurnDiffPreviewData | null {
  if (files.length !== 1) return null;
  const file = files[0];
  if (!file || isTurnDiffFileTooLargeToRender(file)) return null;
  const fileDiff = splitDiffByFile(diff).get(file.path) ?? diff;
  if (!fileDiff.trim()) return null;
  return {
    diff: fileDiff,
    linesAdded: file.linesAdded,
    linesRemoved: file.linesRemoved,
    path: file.path,
  };
}

function isTurnDiffFileTooLargeToRender(file: TurnDiffFileViewModel): boolean {
  return Math.max(file.renderedLineEstimate, file.linesAdded + file.linesRemoved) > TURN_DIFF_INLINE_RENDER_CUTOFF;
}

function TurnDiffPreviewTooltip({
  children,
  onOpen,
  preview,
}: {
  children: ReactNode;
  onOpen: () => void;
  preview: TurnDiffPreviewData;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const clearTimers = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const previewElement = previewRef.current;
    if (!trigger || !previewElement || typeof window === "undefined") return;
    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const availableWidth = Math.max(0, viewportWidth - 16);
    const desktopMaxWidth = Math.max(0, Math.min(triggerRect.width - 64, availableWidth));
    const width = desktopMaxWidth > 0 ? desktopMaxWidth : Math.min(triggerRect.width, availableWidth);
    const previewRect = previewElement.getBoundingClientRect();
    let top = triggerRect.top - previewRect.height;
    if (top < 8) top = Math.min(triggerRect.bottom, Math.max(8, viewportHeight - previewRect.height - 8));
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - width / 2;
    const left = Math.max(8, Math.min(centeredLeft, viewportWidth - width - 8));
    setPosition({ left, top, width });
  }, []);

  const scheduleOpen = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(closeTimerRef.current);
    window.clearTimeout(openTimerRef.current);
    const app = triggerRef.current?.closest<HTMLElement>(".hc-app[data-theme]");
    const appTheme = app?.dataset.theme === "dark" ? "dark" : app?.dataset.theme === "light" ? "light" : null;
    setTheme(appTheme);
    const now = Date.now();
    const delay = now - lastTurnDiffPreviewOpenAt < TURN_DIFF_PREVIEW_SKIP_DELAY_WINDOW_MS
      ? 0
      : TURN_DIFF_PREVIEW_DELAY_MS;
    if (delay === 0) {
      lastTurnDiffPreviewOpenAt = now;
      setOpen(true);
      return;
    }
    openTimerRef.current = window.setTimeout(() => {
      lastTurnDiffPreviewOpenAt = Date.now();
      setOpen(true);
    }, delay);
  }, []);

  const cancelClose = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(closeTimerRef.current);
  }, []);

  const scheduleClose = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setPosition(null);
    }, 80);
  }, []);

  const handleTriggerBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && previewRef.current?.contains(nextTarget)) return;
    scheduleClose();
  };

  useEffect(() => () => clearTimers(), [clearTimers]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    if (typeof window === "undefined") return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, preview.diff, updatePosition]);

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  return (
    <div
      ref={triggerRef}
      className="hc-turn-diff-preview-trigger"
      onFocus={scheduleOpen}
      onBlur={handleTriggerBlur}
      onPointerEnter={scheduleOpen}
      onPointerLeave={scheduleClose}
    >
      {children}
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={previewRef}
          className="hc-turn-diff-preview-positioner"
          data-theme={theme ?? undefined}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          style={{
            left: position?.left ?? -9999,
            top: position?.top ?? -9999,
            visibility: position == null ? "hidden" : undefined,
            width: position?.width ?? undefined,
          }}
        >
          <div
            className="hc-turn-diff-preview-surface"
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={handlePreviewKeyDown}
          >
            <div className="hc-turn-diff-preview-header">
              <span className="hc-turn-diff-preview-path">{preview.path}</span>
              <TurnDiffStats added={preview.linesAdded} removed={preview.linesRemoved} />
            </div>
            <div className="hc-turn-diff-preview-body" data-testid="diff-preview-scroll">
              <TurnDiffSimplePreview diff={preview.diff} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
