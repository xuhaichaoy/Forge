import { ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { useHiCodexIntl } from "./i18n-provider";
import {
  TurnFeedbackDialog,
  type TurnFeedbackOption,
} from "./turn-feedback-dialog";

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

const NORMAL_FEEDBACK_OPTIONS: Record<TurnRating, TurnFeedbackOption[]> = {
  thumbs_down: [
    { id: "incorrect_or_incomplete", labelId: "turnRatingControls.feedback.incorrectOrIncomplete", label: "Incorrect or incomplete" },
    { id: "didnt_follow_my_instructions", labelId: "turnRatingControls.artifactFeedback.didntFollowMyInstructions", label: "Didn’t follow my instructions" },
    { id: "off_track_or_wrong_scope", labelId: "turnRatingControls.feedback.offTrackOrWrongScope", label: "Off track / wrong scope" },
    { id: "lost_context", labelId: "turnRatingControls.feedback.lostContext", label: "Lost context" },
    { id: "slow_or_buggy", labelId: "turnRatingControls.feedback.slowOrBuggy", label: "Slow or buggy" },
    { id: "other", labelId: "turnRatingControls.feedback.other", label: "Other" },
  ],
  thumbs_up: [
    { id: "solved_my_task", labelId: "turnRatingControls.feedback.solvedMyTask", label: "Solved my task" },
    { id: "followed_my_instructions", labelId: "turnRatingControls.feedback.followedMyInstructions", label: "Followed my instructions" },
    { id: "good_code_or_output_quality", labelId: "turnRatingControls.feedback.goodCodeOrOutputQuality", label: "Good code / output quality" },
    { id: "fast_and_efficient", labelId: "turnRatingControls.feedback.fastAndEfficient", label: "Fast and efficient" },
    { id: "useful_autonomy", labelId: "turnRatingControls.feedback.usefulAutonomy", label: "Useful autonomy" },
    { id: "other", labelId: "turnRatingControls.feedback.other", label: "Other" },
  ],
};

const ARTIFACT_FEEDBACK_OPTIONS: Record<TurnRating, TurnFeedbackOption[]> = {
  thumbs_down: [
    { id: "wrong_presentation_length", labelId: "turnRatingControls.artifactFeedback.wrongPresentationLength", label: "Wrong presentation length" },
    { id: "poor_writing", labelId: "turnRatingControls.artifactFeedback.poorWriting", label: "Poor writing" },
    { id: "poor_style_format_or_visuals", labelId: "turnRatingControls.artifactFeedback.poorStyleFormatOrVisuals", label: "Poor style, format or visuals" },
    { id: "wrong_topics_or_subtopics", labelId: "turnRatingControls.artifactFeedback.wrongTopicsOrSubtopics", label: "Wrong topics or subtopics" },
    { id: "didnt_follow_my_instructions", labelId: "turnRatingControls.artifactFeedback.didntFollowMyInstructions", label: "Didn’t follow my instructions" },
    { id: "didnt_follow_my_template", labelId: "turnRatingControls.artifactFeedback.didntFollowMyTemplate", label: "Didn’t follow my template" },
    { id: "incorrect_content", labelId: "turnRatingControls.artifactFeedback.incorrectContent", label: "Incorrect content" },
  ],
  thumbs_up: [
    { id: "good_content", labelId: "turnRatingControls.artifactFeedback.goodContent", label: "Good content" },
    { id: "good_writing_quality", labelId: "turnRatingControls.artifactFeedback.goodWritingQuality", label: "Good writing quality" },
    { id: "good_style_format_or_visuals", labelId: "turnRatingControls.artifactFeedback.goodStyleFormatOrVisuals", label: "Good style, format or visuals" },
    { id: "followed_my_instructions_well", labelId: "turnRatingControls.artifactFeedback.followedMyInstructionsWell", label: "Followed my instructions well" },
    { id: "generated_quickly", labelId: "turnRatingControls.artifactFeedback.generatedQuickly", label: "Generated quickly" },
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
  const { formatMessage } = useHiCodexIntl();
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
        ariaLabel={formatMessage({ id: "assistantMessageContent.thumbsUp", defaultMessage: "Good response" })}
        onClick={() => chooseRating("thumbs_up")}
        pressed={selectedRating === "thumbs_up"}
        rating="thumbs_up"
      />
      <TurnRatingButton
        ariaLabel={formatMessage({ id: "assistantMessageContent.thumbsDown", defaultMessage: "Bad response" })}
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
        HiCodex divergence: rendered at 12px (smaller than Codex's icon-xs 16px)
        per product preference, matching the other message action-row icons.
      */}
      <ThumbsUp
        aria-hidden
        className={rating === "thumbs_down" ? "is-down" : ""}
        fill={pressed ? "currentColor" : "none"}
        size={12}
      />
    </button>
  );
}

export function turnFeedbackUploadClassification(event: TurnRatingEvent): string {
  if (event.eventKind === "turn_rating") {
    return event.rating === "thumbs_up" ? "good_result" : "bad_result";
  }
  return "other";
}

export function turnFeedbackUploadReason(event: TurnRatingEvent): string {
  if (event.eventKind === "turn_rating") return event.rating;
  const selectedOption = event.metadata.selected_option ?? "none";
  const details = event.metadata.details.trim();
  return details ? `option=${selectedOption}\n\n${details}` : `option=${selectedOption}`;
}

export function turnFeedbackUploadTags(event: TurnRatingEvent): Record<string, string> {
  const baseTags = {
    source: "hicodex_turn_rating",
    event_kind: event.eventKind,
    turn_id: event.turnId,
  };
  if (event.eventKind === "turn_rating") {
    return {
      ...baseTags,
      rating: event.rating,
    };
  }
  return {
    ...baseTags,
    action: event.action,
    has_artifacts: event.metadata.has_artifacts ? "true" : "false",
    selected_option: event.metadata.selected_option ?? "none",
  };
}
