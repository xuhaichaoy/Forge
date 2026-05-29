import { ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

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
    { id: "didnt_follow_my_instructions", label: "Didn't follow my instructions" },
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
    { id: "didnt_follow_my_instructions", label: "Didn't follow my instructions" },
    { id: "didnt_follow_my_template", label: "Didn't follow my template" },
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

  const chooseRating = (rating: TurnRating) => {
    if (selectedRating === rating) {
      setSelectedRating(null);
      setDetailsOpen(false);
      setSelectedOptionId(null);
      setDetails("");
      return;
    }
    setSelectedRating(rating);
    setDetailsOpen(true);
    setSelectedOptionId(null);
    setDetails("");
    void onSubmit({ eventKind: "turn_rating", threadId, turnId, rating });
  };

  const options = selectedRating
    ? (hasArtifacts ? ARTIFACT_FEEDBACK_OPTIONS : NORMAL_FEEDBACK_OPTIONS)[selectedRating]
    : [];

  const submitDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRating) return;
    void onSubmit({
      action: "submit_turn_feedback",
      eventKind: "action",
      threadId,
      turnId,
      metadata: {
        details: details.trim(),
        has_artifacts: hasArtifacts,
        selected_option: selectedOptionId,
      },
    });
    // Desktop closes the feedback popover on submit and keeps the chosen thumb
    // selected; it renders no post-submit confirmation node (no such string in
    // plan-summary-item-content-*.js). Re-verified vs Codex Desktop v26.519.81530.
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
        <span className="hc-turn-rating-popover" role="dialog" aria-label="Turn feedback">
          <form onSubmit={submitDetails}>
            <span className="hc-turn-rating-options">
              {options.map((option) => (
                <label key={option.id}>
                  <input
                    checked={selectedOptionId === option.id}
                    name={`turn-feedback-${threadId}-${turnId}`}
                    onChange={() => setSelectedOptionId(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </span>
            <textarea
              aria-label="Feedback details"
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Add details"
              rows={3}
              value={details}
            />
            <span className="hc-turn-rating-legal">
              Your feedback can be used to improve Codex. <a href="https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance" rel="noreferrer" target="_blank">Learn more</a>.
            </span>
            <span className="hc-turn-rating-popover-actions">
              <button type="button" onClick={() => setDetailsOpen(false)}>Cancel</button>
              <button type="submit">Submit</button>
            </span>
          </form>
        </span>
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
        an outline glyph otherwise (plan-summary-item-content-*.js selects the
        icon by selection state, rendered at `icon-xs` with `rotate-180` for
        thumbs_down). We mirror that via lucide's `fill` prop, keeping the
        `is-down` rotation class for thumbs_down.
      */}
      <ThumbsUp
        aria-hidden
        className={rating === "thumbs_down" ? "is-down" : ""}
        fill={pressed ? "currentColor" : "none"}
        size={13}
      />
    </button>
  );
}
