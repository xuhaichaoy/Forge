import { useHiCodexIntl } from "./i18n-provider";
import type {
  PendingRequestOptionPicker,
  PendingRequestQuestion,
  PendingRequestSetupContextPicker,
} from "../state/approval-requests";

export function QuestionField({
  question,
  index,
  disabled,
  value,
  onChange,
  onOptionSelect,
  hideHeading = false,
}: {
  question: PendingRequestQuestion;
  index: number;
  disabled: boolean;
  value: string[];
  onChange: (value: string[]) => void;
  onOptionSelect?: (value: string) => void;
  /*
   * CODEX-REF: pending-request-item-panel-*.js - the panel header already
   * shows the question text, so callers can suppress this field heading to
   * avoid a duplicate title.
   */
  hideHeading?: boolean;
}) {
  const { formatMessage } = useHiCodexIntl();
  const currentValue = value[0] ?? "";
  /*
   * CODEX-REF: pending-request-item-panel-*.js - question field modes:
   *   isOther && hasOptions: options plus freeform textarea
   *   isOther && !hasOptions: freeform textarea only
   *   !isOther && hasOptions: options only
   * Selecting an option and typing freeform text are mutually exclusive.
   */
  const isOther = question.isOther === true;
  const selectedOptionValue = question.options.find((option) => option.value === currentValue)?.value;
  const freeformValue = isOther && selectedOptionValue == null ? currentValue : "";
  return (
    <div className="hc-request-question">
      {!hideHeading && (
        <div className="hc-request-question-heading">
          <span>{question.header}</span>
          <small>{question.question}</small>
        </div>
      )}
      {question.kind === "multiSelect" ? (
        <div className="hc-request-options multi">
          {question.options.map((option, optionIndex) => {
            const selected = value.includes(option.value);
            return (
              <label className="hc-request-option-row checkbox" data-selected={selected} key={option.value}>
                <span className="hc-request-option-index">{optionIndex + 1}.</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected}
                  onChange={() => onChange(
                    selected ? value.filter((item) => item !== option.value) : [...value, option.value],
                  )}
                />
                <OptionCopy option={option} />
              </label>
            );
          })}
        </div>
      ) : question.options.length > 0 ? (
        <>
          <div className="hc-request-options" role="radiogroup" aria-label={question.header}>
            {question.options.map((option, optionIndex) => {
              const selected = selectedOptionValue === option.value;
              return (
                <button
                  type="button"
                  className="hc-request-option-row"
                  data-selected={selected}
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  key={option.value}
                  aria-label={option.ariaLabel}
                  onClick={() => {
                    if (onOptionSelect) {
                      onOptionSelect(option.value);
                    } else {
                      onChange([option.value]);
                    }
                  }}
                >
                  <span className="hc-request-option-index">{optionIndex + 1}.</span>
                  <OptionCopy option={option} />
                </button>
              );
            })}
          </div>
          {isOther && (
            /*
             * CODEX-REF: pending-request-item-panel-*.js - when isOther and
             * options exist, append a freeform input. Editing the textarea
             * clears the selected option by replacing the answer value.
             */
            <div className="hc-request-inline-freeform hc-request-other-freeform">
              <textarea
                data-request-other-freeform="true"
                value={freeformValue}
                placeholder={formatMessage({ id: "requestInputPanel.otherPlaceholder", defaultMessage: "No, and tell Codex what to do differently" })}
                rows={1}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value.length > 0 ? [event.target.value] : [])}
              />
            </div>
          )}
        </>
      ) : question.kind === "textarea" ? (
        <div className="hc-request-inline-freeform">
          <span>{index + 1}.</span>
          <textarea
            value={currentValue}
            placeholder={formatMessage({ id: "requestInputPanel.freeFormPlaceholder", defaultMessage: "Type here" })}
            rows={1}
            disabled={disabled}
            onChange={(event) => onChange([event.target.value])}
          />
        </div>
      ) : (
        <div className="hc-request-inline-freeform">
          <span>{index + 1}.</span>
          <input
            type={question.kind === "password" ? "password" : question.kind === "number" ? "number" : "text"}
            value={currentValue}
            placeholder={formatMessage({ id: "requestInputPanel.freeFormPlaceholder", defaultMessage: "Type here" })}
            disabled={disabled}
            onChange={(event) => onChange([event.target.value])}
          />
        </div>
      )}
    </div>
  );
}

export function OptionPickerField({
  optionPicker,
  question,
  disabled,
  value,
  onChange,
  onSubmit,
}: {
  optionPicker: PendingRequestOptionPicker;
  question: PendingRequestQuestion;
  disabled: boolean;
  value: string[];
  onChange: (value: string[]) => void;
  onSubmit: (value: string[]) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const optionValues = new Set(question.options.map((option) => option.value));
  const freeformValue = value.find((item) => !optionValues.has(item)) ?? "";
  const selectedValues = value.filter((item) => optionValues.has(item));
  const currentSelectedValues = optionPicker.allowMultiple ? selectedValues : selectedValues.slice(0, 1);
  const pickerValue = (selected: string[], freeform: string) => (
    freeform.length > 0 ? [...selected, freeform] : selected
  );
  const toggleOption = (optionValue: string) => {
    const selected = selectedValues.includes(optionValue);
    if (optionPicker.allowMultiple) {
      onChange(selected
        ? value.filter((item) => item !== optionValue)
        : [...value.filter((item) => item !== optionValue || !optionValues.has(item)), optionValue]);
      return;
    }
    onChange(pickerValue([optionValue], freeformValue));
  };
  const changeFreeform = (text: string) => {
    onChange(pickerValue(currentSelectedValues, text));
  };
  /*
   * CODEX-REF: pending-request-item-panel-DZ77s3cA.pretty.js `un` -
   * optionPicker is a dedicated form: rounded option pills, an inline
   * freeform input, Skip ghost button, and a primary Submit action.
   */
  return (
    <div className="hc-option-picker">
      <div className="hc-option-picker-options" role={optionPicker.allowMultiple ? "group" : "radiogroup"} aria-label={question.question}>
        {question.options.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className="hc-option-picker-pill"
              role={optionPicker.allowMultiple ? "checkbox" : "radio"}
              aria-checked={selected}
              data-selected={selected || undefined}
              disabled={disabled}
              onClick={() => toggleOption(option.value)}
              title={option.description || undefined}
            >
              {option.label}
            </button>
          );
        })}
        <input
          className="hc-option-picker-freeform"
          data-request-other-freeform="true"
          value={freeformValue}
          placeholder={formatMessage({ id: "optionPickerRequest.freeformPlaceholder", defaultMessage: "Something else" })}
          disabled={disabled}
          onChange={(event) => changeFreeform(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit(pickerValue(currentSelectedValues, event.currentTarget.value));
            }
          }}
        />
      </div>
    </div>
  );
}

export function SetupContextPickerBody({ picker }: { picker: PendingRequestSetupContextPicker }) {
  /*
   * CODEX-REF: pending-request-item-panel-DZ77s3cA.pretty.js `Pn` - setup
   * context picker can always Dismiss, Skip, or Continue with selectedSources.
   * Source selection stays empty until the app/plugin/OAuth/folder host flows
   * exist.
   */
  void picker;
  return null;
}

function OptionCopy({ option }: { option: PendingRequestQuestion["options"][number] }) {
  const codePreview = option.codePreview?.trim() ?? "";
  const codeLayout = codePreview.includes("\n") || codePreview.includes("\r") ? "block" : "inline";
  return (
    <span className="hc-request-option-copy">
      <strong data-has-code={codePreview ? true : undefined} data-code-layout={codePreview ? codeLayout : undefined}>
        <span className="hc-request-option-label-text">{option.label}</span>
        {codePreview && (
          <code className="hc-request-option-code" title={codePreview}>
            {codePreview}
          </code>
        )}
      </strong>
      {/* codex: approval/option rows are a single bold label line. The option
          description is metadata, or a hover tooltip in the optionPicker path,
          and is not rendered as a persistent inline subline. */}
    </span>
  );
}
