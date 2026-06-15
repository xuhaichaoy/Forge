import { Check, Plus } from "lucide-react";
import { useEffect } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useForgeIntl } from "./i18n-provider";

export interface TurnFeedbackOption {
  id: string;
  labelId: string;
  label: string;
}

/*
 * CODEX-REF: feedback-form-dialog-JIafVR4J.js - Codex renders turn feedback as
 * a CENTERED GLOBAL MODAL (Radix `DialogPortal` + modal `DialogOverlay` +
 * `DialogContent`, opened through the app's modal controller `ee(...)` in
 * plan-summary-item-content-n25PWfVz.js), NOT an inline anchored popover.
 * Forge has no global modal-stack controller, so we mirror the centered
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
 *    ctrlKey so Windows/Linux Ctrl+Enter works - a superset that keeps macOS
 *    Cmd+Enter parity)
 *  - NO Cancel button (the bundle's footer renders only the Submit button)
 *  - Submit is disabled until an option is chosen
 */
export function TurnFeedbackDialog({
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
  options: TurnFeedbackOption[];
  selectedOptionId: string | null;
  submitDisabled: boolean;
}) {
  const { formatMessage } = useForgeIntl();
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
        aria-label={formatMessage({ id: "feedbackFormDialog.title", defaultMessage: "Share feedback" })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={onSubmit}>
          <header>
            <div>{formatMessage({ id: "feedbackFormDialog.title", defaultMessage: "Share feedback" })}</div>
          </header>
          <div className="hc-thread-dialog-body hc-turn-feedback-body">
            <div className="hc-turn-feedback-options" role="radiogroup" aria-label={formatMessage({ id: "feedbackFormDialog.optionsLabel", defaultMessage: "Feedback options" })}>
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
                    <span>{formatMessage({ id: option.labelId, defaultMessage: option.label })}</span>
                  </button>
                );
              })}
            </div>
            <textarea
              aria-label={formatMessage({ id: "feedbackFormDialog.detailsPlaceholder.optional", defaultMessage: "Share details (optional)" })}
              autoFocus
              className="hc-turn-feedback-textarea"
              onChange={(event) => onChangeDetails(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={formatMessage({ id: "feedbackFormDialog.detailsPlaceholder.optional", defaultMessage: "Share details (optional)" })}
              value={details}
            />
            <span className="hc-turn-rating-legal">
              {renderFeedbackLegalNotice(
                formatMessage({
                  // CODEX-REF plan-summary-item-content-tuRA3zV6.js:
                  //   id:`turnRatingControls.feedbackLegalNotice`,
                  //   defaultMessage:`Your feedback can be used to improve Codex. <link>Learn more</link>.`
                  id: "turnRatingControls.feedbackLegalNotice",
                  defaultMessage: "Your feedback can be used to improve Codex. <link>Learn more</link>.",
                }),
              )}
            </span>
          </div>
          <footer>
            <button type="submit" className="hc-mini-button accept" disabled={submitDisabled}>{formatMessage({ id: "feedbackFormDialog.submit", defaultMessage: "Submit" })}</button>
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

/*
 * Codex renders `turnRatingControls.feedbackLegalNotice` as react-intl rich text
 * with a `<link>` chunk wrapping "Learn more" as an anchor
 * (plan-summary-item-content-tuRA3zV6.js). Forge's formatMessage returns a
 * plain string, so we resolve the single Codex id (which keeps the i18n key
 * aligned and localized) and split on the `<link>...</link>` chunk at render time
 * to inject the same anchor - producing identical visible output without a
 * generic rich-text engine.
 */
function renderFeedbackLegalNotice(message: string): ReactNode {
  const match = /^([\s\S]*?)<link>([\s\S]*?)<\/link>([\s\S]*)$/.exec(message);
  if (!match) return message;
  const [, before, linkText, after] = match;
  return (
    <>
      {before}
      <a
        href="https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance"
        rel="noreferrer"
        target="_blank"
      >
        {linkText}
      </a>
      {after}
    </>
  );
}
