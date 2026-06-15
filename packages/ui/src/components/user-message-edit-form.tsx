import { useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { useForgeIntl } from "./i18n-provider";
import { focusPromptEditorElement, PromptEditor } from "./prompt-editor";

export function UserEditForm({
  disabled,
  draft,
  errorMessage,
  onCancel,
  onDraftChange,
  onSubmit,
}: {
  disabled: boolean;
  draft: string;
  errorMessage?: string | null;
  onCancel: () => void;
  onDraftChange: (draft: string) => void;
  onSubmit: (message: string) => void | Promise<void>;
}) {
  const { formatMessage } = useForgeIntl();
  const editorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    window.requestAnimationFrame(() => {
      focusPromptEditorElement(editorRef.current);
    });
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    await onSubmit(draft.trim());
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
    return false;
  };

  return (
    <form className="hc-user-edit-form" data-disabled={disabled || undefined} onSubmit={submit}>
      <div className="hc-user-edit-editor">
        <PromptEditor
          ref={editorRef}
          value={draft}
          placeholder={formatMessage({ id: "codex.userMessage.editPlaceholder", defaultMessage: "Edit message" })}
          ariaLabel={formatMessage({ id: "codex.userMessage.editTextareaAriaLabel", defaultMessage: "Edit message" })}
          minHeight="72px"
          onChange={(value) => {
            if (!disabled) onDraftChange(value);
          }}
          onKeyDown={onKeyDown}
          onSubmit={() => {
            if (!disabled) void onSubmit(draft.trim());
          }}
        />
      </div>
      {errorMessage && (
        <div className="hc-user-edit-error" role="alert">{errorMessage}</div>
      )}
      <div className="hc-user-edit-actions">
        <button disabled={disabled} type="button" onClick={onCancel}>{formatMessage({ id: "codex.userMessage.cancelEditMessage", defaultMessage: "Cancel" })}</button>
        <button className="primary" disabled={disabled} type="submit">{formatMessage({ id: "codex.userMessage.sendEditedMessage", defaultMessage: "Send" })}</button>
      </div>
    </form>
  );
}
