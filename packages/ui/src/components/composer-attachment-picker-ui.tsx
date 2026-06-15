import {
  AtSign,
  FileText,
  ListChecks,
  Paperclip,
  PlugZap,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import {
  type AttachAction,
  type AttachActionId,
  type ComposerMode,
} from "../state/composer-workflow";
import { useForgeIntl } from "./i18n-provider";

function attachIcon(actionId: AttachActionId) {
  switch (actionId) {
    case "filePath":
      return <Paperclip size={15} />;
    case "plan":
      return <ListChecks size={15} />;
    case "goal":
      return <Target size={15} />;
    case "plugins":
      return <PlugZap size={15} />;
    case "mention":
      return <AtSign size={15} />;
    case "localImage":
      return <Paperclip size={15} />;
    case "imageUrl":
      return <Paperclip size={15} />;
    case "skill":
      return <Sparkles size={15} />;
    case "plainText":
      return <FileText size={15} />;
  }
}

interface ComposerAttachMenuProps {
  actions: AttachAction[];
  selectedAction: AttachAction | undefined;
  mode: ComposerMode;
  goalMode: boolean;
  onSelect: (actionId: AttachActionId) => void;
}

export function ComposerAttachMenu({
  actions,
  selectedAction,
  mode,
  goalMode,
  onSelect,
}: ComposerAttachMenuProps) {
  const { formatMessage } = useForgeIntl();
  return (
    <div className="hc-composer-menu attach" role="menu" aria-label={formatMessage({ id: "hc.composer.attach.menuLabel", defaultMessage: "Attach context" })} data-state="open">
      {actions.map((action) => {
        // codex composer "+" menu: Plan mode AND Pursue goal render as toggle
        // switches; they are INDEPENDENT (both can be on) -- plan reflects the
        // composer mode, goal reflects the separate goal-input flag.
        const isModeAction = action.id === "plan" || action.id === "goal";
        const checked = action.id === "plan" ? mode === "plan" : action.id === "goal" ? goalMode : false;
        return (
          <button
            className="hc-composer-menu-row"
            data-active={action.id === selectedAction?.id}
            data-checked={checked}
            key={action.id}
            type="button"
            role={isModeAction ? "switch" : "menuitem"}
            aria-checked={isModeAction ? checked : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void onSelect(action.id)}
          >
            {attachIcon(action.id)}
            <span>
              <strong>{action.title}</strong>
              <small>{action.description}</small>
            </span>
            {isModeAction && (
              <span className="hc-composer-menu-switch" aria-hidden="true">
                <span />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface ComposerAttachInputPanelProps {
  action: AttachAction;
  draft: string;
  error: string | null;
  isTextInput: boolean;
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onShowTypes: () => void;
}

export function ComposerAttachInputPanel({
  action,
  draft,
  error,
  isTextInput,
  inputRef,
  onDraftChange,
  onConfirm,
  onCancel,
  onShowTypes,
}: ComposerAttachInputPanelProps) {
  const { formatMessage } = useForgeIntl();
  return (
    <div className="hc-attachment-input-panel" role="dialog" aria-label={action.title} data-state="open">
      <div className="hc-attachment-input-heading">
        {attachIcon(action.id)}
        <span>
          <strong>{action.title}</strong>
          <small>{action.description}</small>
        </span>
        <button
          type="button"
          aria-label={formatMessage({ id: "hc.composer.attach.cancelAttachment", defaultMessage: "Cancel attachment" })}
          title={formatMessage({ id: "hc.composer.attach.cancel", defaultMessage: "Cancel" })}
          onClick={onCancel}
        >
          <X size={14} />
        </button>
      </div>
      {isTextInput ? (
        <textarea
          ref={(element) => {
            inputRef.current = element;
          }}
          value={draft}
          placeholder={action.placeholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onConfirm();
            }
          }}
        />
      ) : (
        <input
          ref={(element) => {
            inputRef.current = element;
          }}
          value={draft}
          placeholder={action.placeholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onConfirm();
            }
          }}
        />
      )}
      {error && <small className="hc-attachment-input-error">{error}</small>}
      <div className="hc-attachment-input-actions">
        <button
          type="button"
          className="hc-mini-button"
          onClick={onShowTypes}
        >
          {formatMessage({ id: "hc.composer.attach.types", defaultMessage: "Types" })}
        </button>
        <button type="button" className="hc-mini-button accept" onClick={onConfirm}>
          {formatMessage({ id: "hc.composer.attach.add", defaultMessage: "Add" })}
        </button>
      </div>
    </div>
  );
}
