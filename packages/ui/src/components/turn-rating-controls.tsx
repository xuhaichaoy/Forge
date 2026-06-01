import { Check, Plus, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type TurnRating = "thumbs_up" | "thumbs_down";

export type TurnRatingEvent =
  | {
      eventKind: "turn_rating";
      threadId: string;
      turnId: string;
      rating: TurnRating;
    }
  | {
      action: "submit_turn_feedback";
      eventKind: "action";
      threadId: string;
      turnId: string;
      metadata: {
        details: string;
        has_artifacts: boolean;
        selected_option: string | null;
      };
    };

export type SubmitTurnRatingEvent = (event: TurnRatingEvent) => void | Promise<void>;

interface FeedbackOption {
  id: string;
  label: string;
}

const NORMAL_FEEDBACK_OPTIONS: Record<TurnRating, FeedbackOption[]> = {
  thumbs_down: [
    { id: "incorrect_or_incomplete", label: "Incorrect or incomplete" },
    { id: "didnt_follow_my_instructions", label: "Didn’t follow my instructions" },
    { id: "off_track_or_wrong_scope", label: "Off track / wrong scope" },
    { id: "lost_context", label: "Lost context" },
    { id: "slow_or_buggy", label: "Slow or buggy" },
    { id: "other", label: "Other" },
  ],
  thumbs_up: [
    { id: "solved_my_task", label: "Solved my task" },
    { id: "followed_my_instructions", label: "Followed my instructions" },
    { id: "good_code_or_output_quality", label: "Good code / output quality" },
    { id: "fast_and_efficient", label: "Fast and efficient" },
    { id: "useful_autonomy", label: "Useful autonomy" },
    { id: "other", label: "Other" },
  ],
};

const ARTIFACT_FEEDBACK_OPTIONS: Record<TurnRating, FeedbackOption[]> = {
  thumbs_down: [
    { id: "wrong_presentation_length", label: "Wrong presentation length" },
    { id: "poor_writing", label: "Poor writing" },
    { id: "poor_style_format_or_visuals", label: "Poor style, format or visuals" },
    { id: "wrong_topics_or_subtopics", label: "Wrong topics or subtopics" },
    { id: "didnt_follow_my_instructions", label: "Didn’t follow my instructions" },
    { id: "didnt_follow_my_template", label: "Didn’t follow my template" },
    { id: "incorrect_content", label: "Incorrect content" },
  ],
  thumbs_up: [
    { id: "good_content", label: "Good content" },
    { id: "good_writing_quality", label: "Good writing quality" },
    { id: "good_style_format_or_visuals", label: "Good style, format or visuals" },
    { id: "followed_my_instructions_well", label: "Followed my instructions well" },
    { id: "generated_quickly", label: "Generated quickly" },
  ],
};

/*
 * CODEX-REF: feedback-form-dialog-JIafVR4J.js — Submit is disabled until an
 * option is chosen. The bundle computes `k = w==null || (t && E.length===0)`
 * where `w` is the selected option id, `t` is `freeformFeedbackRequired`, and
 * `E` is the trimmed details. Codex's turn-rating call site passes
 * `freeformFeedbackRequired:!1` (plan-summary-item-content-n25PWfVz.js), so in
 * practice the gate reduces to "an option must be selected". This helper is
 * exported as a pure mirror so the harness (no-DOM) can guard the rule.
 */
export function turnFeedbackSubmitDisabled(
  selectedOptionId: string | null,
  trimmedDetails: string,
  freeformFeedbackRequired = false,
): boolean {
  return selectedOptionId === null || (freeformFeedbackRequired && trimmedDetails.length === 0);
}

export function TurnRatingControls({
  hasArtifacts = false,
  onSubmit,
  threadId,
  turnId,
}: {
  hasArtifacts?: boolean;
  onSubmit?: SubmitTurnRatingEvent;
  threadId?: string | null;
  turnId?: string | null;
}) {
  const [selectedRating, setSelectedRating] = useState<TurnRating | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  if (!threadId || !turnId || !onSubmit) return null;

  const resetFeedback = () => {
    setDetailsOpen(false);
    setSelectedOptionId(null);
    setDetails("");
  };

  const chooseRating = (rating: TurnRating) => {
    // CODEX-REF: plan-summary-item-content-n25PWfVz.js — `h=e=>{if(d===e){p(null);return}
    // p(e),m.submitCodexAnalyticsEvent?.({eventKind:"turn_rating",...}),ee(u,le,{...})}`.
    // Clicking the already-selected thumb clears the rating (and dismisses the
    // form); clicking a new thumb selects it, emits `turn_rating`, and opens the
    // feedback dialog via the global modal controller.
    if (selectedRating === rating) {
      setSelectedRating(null);
      resetFeedback();
      return;
    }
    setSelectedRating(rating);
    setSelectedOptionId(null);
    setDetails("");
    setDetailsOpen(true);
    void onSubmit({ eventKind: "turn_rating", threadId, turnId, rating });
  };

  const closeFeedback = () => {
    // CODEX-REF: feedback-form-dialog-JIafVR4J.js — closing the dialog
    // (`onOpenChange(false) -> onClose`) only dismisses the form; the chosen
    // thumb stays selected (Codex never clears the rating on dialog close).
    setDetailsOpen(false);
  };

  const options = selectedRating
    ? (hasArtifacts ? ARTIFACT_FEEDBACK_OPTIONS : NORMAL_FEEDBACK_OPTIONS)[selectedRating]
    : [];

  const trimmedDetails = details.trim();
  const submitDisabled = turnFeedbackSubmitDisabled(selectedOptionId, trimmedDetails);

  const submitDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // CODEX-REF: feedback-form-dialog-JIafVR4J.js — `if(e.preventDefault(),
    // w==null||S||k)return;` guards submit on the disabled gate before firing
    // onSubmit. We mirror the no-option guard here.
    if (!selectedRating || submitDisabled) return;
    void onSubmit({
      action: "submit_turn_feedback",
      eventKind: "action",
      threadId,
      turnId,
      metadata: {
        details: trimmedDetails,
        has_artifacts: hasArtifacts,
        selected_option: selectedOptionId,
      },
    });
    // Desktop closes the feedback dialog on a successful submit and keeps the
    // chosen thumb selected; it renders no post-submit confirmation node.
    // Re-verified vs feedback-form-dialog-JIafVR4J.js (`t&&n()`).
    setDetailsOpen(false);
  };

  return (
    <span className="hc-turn-rating-controls">
      <TurnRatingButton
        ariaLabel="Good response"
        onClick={() => chooseRating("thumbs_up")}
        pressed={selectedRating === "thumbs_up"}
        rating="thumbs_up"
      />
      <TurnRatingButton
        ariaLabel="Bad response"
        onClick={() => chooseRating("thumbs_down")}
        pressed={selectedRating === "thumbs_down"}
        rating="thumbs_down"
      />
      {detailsOpen && selectedRating && (
        <TurnFeedbackDialog
          details={details}
          onChangeDetails={setDetails}
          onChooseOption={setSelectedOptionId}
          onClose={closeFeedback}
          onSubmit={submitDetails}
          options={options}
          selectedOptionId={selectedOptionId}
          submitDisabled={submitDisabled}
        />
      )}
    </span>
  );
}

/*
 * CODEX-REF: feedback-form-dialog-JIafVR4J.js — Codex renders turn feedback as
 * a CENTERED GLOBAL MODAL (Radix `DialogPortal` + modal `DialogOverlay` +
 * `DialogContent`, opened through the app's modal controller `ee(...)` in
 * plan-summary-item-content-n25PWfVz.js), NOT an inline anchored popover.
 * HiCodex has no global modal-stack controller, so we mirror the centered
 * overlay with the codebase's established `hc-settings-backdrop` +
 * `hc-thread-dialog-panel` dialog pattern (see thread-action-dialog.tsx /
 * fork-from-older-turn-dialog.tsx), portaled to `document.body` like the other
 * createPortal dialogs (message-unit.tsx image preview).
 *
 * Modal specifics mirrored from the bundle:
 *  - title "Share feedback" (feedbackFormDialog.title)
 *  - options are PILL radio buttons: `role=radio` inside `role=radiogroup`,
 *    `rounded-full`, with a check icon when selected / plus icon otherwise
 *    (NOT <input type=radio>)
 *  - textarea has autoFocus + onKeyDown Cmd/Ctrl+Enter submits
 *    (bundle: `e.key==="Enter"&&e.metaKey && requestSubmit()`; we also accept
 *    ctrlKey so Windows/Linux Ctrl+Enter works — a superset that keeps macOS
 *    Cmd+Enter parity)
 *  - NO Cancel button (the bundle's footer renders only the Submit button)
 *  - Submit is disabled until an option is chosen
 */
function TurnFeedbackDialog({
  details,
  onChangeDetails,
  onChooseOption,
  onClose,
  onSubmit,
  options,
  selectedOptionId,
  submitDisabled,
}: {
  details: string;
  onChangeDetails: (value: string) => void;
  onChooseOption: (optionId: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  options: FeedbackOption[];
  selectedOptionId: string | null;
  submitDisabled: boolean;
}) {
  // Escape dismisses the dialog, matching the Radix modal's default close-on-Escape.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const dialog = (
    <div
      className="hc-settings-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="hc-thread-dialog-panel hc-turn-feedback-dialog"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label="Share feedback"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={onSubmit}>
          <header>
            <div>Share feedback</div>
          </header>
          <div className="hc-thread-dialog-body hc-turn-feedback-body">
            <div className="hc-turn-feedback-options" role="radiogroup" aria-label="Feedback options">
              {options.map((option) => {
                const checked = selectedOptionId === option.id;
                const Icon = checked ? Check : Plus;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    className="hc-turn-feedback-pill"
                    data-checked={checked ? "true" : undefined}
                    onClick={() => onChooseOption(option.id)}
                  >
                    <Icon aria-hidden className="hc-turn-feedback-pill-icon" size={12} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <textarea
              aria-label="Share details (optional)"
              autoFocus
              className="hc-turn-feedback-textarea"
              onChange={(event) => onChangeDetails(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Share details (optional)"
              value={details}
            />
            <span className="hc-turn-rating-legal">
              Your feedback can be used to improve Codex. <a href="https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance" rel="noreferrer" target="_blank">Learn more</a>.
            </span>
          </div>
          <footer>
            <button type="submit" className="hc-mini-button accept" disabled={submitDisabled}>Submit</button>
          </footer>
        </form>
      </section>
    </div>
  );

  // Portal to document.body so the centered modal escapes the inline message
  // row layout, mirroring Codex's DialogPortal. Fall back to inline rendering
  // when there is no document (server-side static markup / tests).
  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}

function TurnRatingButton({
  ariaLabel,
  onClick,
  pressed,
  rating,
}: {
  ariaLabel: string;
  onClick: () => void;
  pressed: boolean;
  rating: TurnRating;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className="hc-turn-rating-button"
      title={ariaLabel}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {/*
        Desktop swaps to a filled thumb glyph when the rating is selected and
        an outline glyph otherwise (plan-summary-item-content-n25PWfVz.js selects
        the icon by selection state, rendered at `icon-xs` = 16px with
        `rotate-180` for thumbs_down). We mirror that via lucide's `fill` prop,
        keeping the `is-down` rotation class for thumbs_down.
      */}
      <ThumbsUp
        aria-hidden
        className={rating === "thumbs_down" ? "is-down" : ""}
        fill={pressed ? "currentColor" : "none"}
        size={16}
      />
    </button>
  );
}
