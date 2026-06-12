import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import {
  commandDescriptorDescription,
  commandDescriptorTitle,
  descriptorAcceleratorLabel,
} from "../state/commands";
import {
  formatAccelerator,
  isMacPlatform,
} from "../state/command-registry";
import type { CommandDescriptor } from "../state/command-registry";
import { useHiCodexIntl } from "./i18n-provider";

export interface KeyboardShortcutRowProps {
  descriptor: CommandDescriptor;
  editing: boolean;
  captured: string | null;
  hasOverride: boolean;
  conflict: { id: string; title: string } | null;
  inputRef: RefObject<HTMLInputElement | null> | undefined;
  onEdit: () => void;
  onClear: () => void;
  onReset: () => void;
  onCancel: () => void;
}

export function KeyboardShortcutRow({
  descriptor,
  editing,
  captured,
  hasOverride,
  conflict,
  inputRef,
  onEdit,
  onClear,
  onReset,
  onCancel,
}: KeyboardShortcutRowProps) {
  const { formatMessage } = useHiCodexIntl();
  const accelerator = descriptorAcceleratorLabel(descriptor.id);
  const isMac = isMacPlatform();
  return (
    <tr className="hc-keyboard-settings-row" data-editing={editing}>
      <td className="hc-keyboard-settings-cell-command">
        <div className="hc-keyboard-settings-command-title">{commandDescriptorTitle(descriptor)}</div>
        {commandDescriptorDescription(descriptor) ? (
          <div className="hc-keyboard-settings-command-desc">{commandDescriptorDescription(descriptor)}</div>
        ) : null}
      </td>
      {editing ? (
        <td className="hc-keyboard-settings-cell-capture" colSpan={2}>
          <input
            ref={inputRef}
            readOnly
            className="hc-keyboard-settings-capture-input"
            placeholder={formatMessage({ id: "settings.keyboardShortcuts.capturePrompt", defaultMessage: "Press shortcut" })}
            value={captured ? formatAccelerator(captured, isMac) : ""}
            onBlur={onCancel}
            aria-label={`Capture new shortcut for ${descriptor.title}`}
          />
          {conflict ? (
            <div className="hc-keyboard-settings-conflict" role="status">
              Used by {conflict.title}
            </div>
          ) : null}
        </td>
      ) : (
        <>
          <td className="hc-keyboard-settings-cell-keybinding">
            {accelerator ? (
              <kbd className="hc-keyboard-settings-kbd">{accelerator}</kbd>
            ) : (
              <span className="hc-keyboard-settings-kbd hc-keyboard-settings-kbd--empty">—</span>
            )}
          </td>
          <td className="hc-keyboard-settings-cell-actions">
            <div className="hc-keyboard-settings-actions">
              <button
                type="button"
                className="hc-keyboard-settings-icon-button"
                aria-label={`Edit shortcut for ${descriptor.title}`}
                onClick={onEdit}
              >
                <Pencil size={14} />
              </button>
              {accelerator ? (
                <button
                  type="button"
                  className="hc-keyboard-settings-icon-button"
                  aria-label={`Remove shortcut for ${descriptor.title}`}
                  onClick={onClear}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
              {hasOverride ? (
                <button
                  type="button"
                  className="hc-keyboard-settings-icon-button"
                  aria-label={formatMessage({ id: "settings.keyboardShortcuts.resetAriaLabel", defaultMessage: "Reset shortcut for {commandTitle}" }, { commandTitle: descriptor.title })}
                  onClick={onReset}
                >
                  <RotateCcw size={14} />
                </button>
              ) : null}
            </div>
          </td>
        </>
      )}
    </tr>
  );
}
