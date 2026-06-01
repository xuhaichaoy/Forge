import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TurnRatingControls,
  turnFeedbackSubmitDisabled,
} from "../src/components/turn-rating-controls";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export default function runTurnRatingControlsTests(): void {
  disablesSubmitUntilAnOptionIsChosen();
  rendersBothThumbsWithoutAnOpenFeedbackModal();
  rendersNothingWithoutAThreadTurnOrSubmitter();
}

// CODEX-REF: feedback-form-dialog-JIafVR4J.js — Submit stays disabled until an
// option is selected (`k=w==null||(t&&E.length===0)`). Codex's turn-rating call
// site passes `freeformFeedbackRequired:!1`, so without an option the form must
// not submit regardless of textarea contents.
function disablesSubmitUntilAnOptionIsChosen(): void {
  assert(
    turnFeedbackSubmitDisabled(null, "") === true,
    "submit should be disabled when no option is selected and details are empty",
  );
  assert(
    turnFeedbackSubmitDisabled(null, "has details") === true,
    "submit should stay disabled when no option is selected even if details are typed (freeform optional)",
  );
  assert(
    turnFeedbackSubmitDisabled("incorrect_or_incomplete", "") === false,
    "submit should enable as soon as an option is selected (details optional)",
  );
  assert(
    turnFeedbackSubmitDisabled(null, "", true) === true,
    "submit should be disabled when freeform feedback is required and details are empty",
  );
  assert(
    turnFeedbackSubmitDisabled("other", "", true) === true,
    "submit should be disabled when freeform is required, an option is chosen, but details are empty",
  );
  assert(
    turnFeedbackSubmitDisabled("other", "why", true) === false,
    "submit should enable when freeform is required and both an option and details are present",
  );
}

// The feedback form is a modal that only opens after a thumb is chosen; the
// initial render exposes only the two rating buttons and must NOT render the
// "Share feedback" dialog (guards against the modal regressing to always-open
// or back to an inline popover that renders eagerly).
function rendersBothThumbsWithoutAnOpenFeedbackModal(): void {
  const html = renderToStaticMarkup(
    createElement(TurnRatingControls, {
      threadId: "thread-rating",
      turnId: "turn-rating",
      hasArtifacts: false,
      onSubmit: () => undefined,
    }),
  );

  assert(html.includes('aria-label="Good response"'), "thumbs-up rating button should render");
  assert(html.includes('aria-label="Bad response"'), "thumbs-down rating button should render");
  assert(
    !html.includes("Share feedback"),
    "the feedback modal title must not render before a thumb is chosen",
  );
  assert(
    !html.includes('role="radiogroup"'),
    "the feedback options radiogroup must not render before a thumb is chosen",
  );
  assert(
    !html.includes("hc-settings-backdrop"),
    "the centered modal backdrop must not render before a thumb is chosen",
  );
}

// Mirrors the component's early return: without a thread id, turn id, or submit
// callback there is nothing to rate, so the controls render nothing.
function rendersNothingWithoutAThreadTurnOrSubmitter(): void {
  const html = renderToStaticMarkup(
    createElement(TurnRatingControls, {
      threadId: null,
      turnId: "turn-rating",
      onSubmit: () => undefined,
    }),
  );
  assert(html === "", "controls should render nothing when no thread id is available");
}
