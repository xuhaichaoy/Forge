import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import {
  COMMAND_DESCRIPTORS,
  commandDescriptorDescription,
  commandDescriptorTitle,
  descriptorAcceleratorLabel,
} from "../state/commands";
import {
  commandAccelerators,
  formatAccelerator,
  isMacPlatform,
} from "../state/command-registry";
import type { CommandDescriptor } from "../state/command-registry";
import { resolveKeymapOverride, type KeymapOverrides } from "../state/keymap-overrides";

/*
 * CODEX-REF: keyboard-shortcuts-settings-*.js — inline (non-modal)
 * keyboard shortcuts editor. Replaces the prior HiCodex modal-style
 * KeyCaptureDialog with the same UX Codex Desktop ships:
 *
 *   3-column table — Command | Keybinding | Actions
 *
 *   - Default row state: keybinding shown as a <kbd>, actions = pencil/trash/undo icons.
 *   - Capture state: keybinding column swaps into a readonly <input> that
 *     announces "Press shortcut"; the actions column hides (effectively
 *     colSpan = 2 in Codex). Conflict warning renders inline beneath the
 *     input ("Used by {commandTitle}"). Codex does NOT block commit on
 *     conflict — the user can still finalize the new binding.
 *   - Shift+click on pencil = append-mode (Codex spec). HiCodex's descriptor
 *     schema doesn't expose multi-binding lists yet, so Shift+click currently
 *     behaves the same as regular click (replace). Tracked as future work.
 *   - Esc / blur cancels capture without mutation.
 *
 * The capture surface carries data-codex-shortcut-capture on its root so
 * use-hotkey.ts:18 SHORTCUT_CAPTURE_SELECTOR short-circuits any registered
 * useHotkey listener whose event target falls within the capture sub-tree.
 *
 * Source spec: /tmp/codex-keyboard-row-spec.md (verbatim string + SVG
 * extraction from keyboard-shortcuts-settings-*.js).
 */

const GROUP_TITLE: ReadonlyArray<{ key: string; title: string }> = [
  { key: "thread", title: "Chat" },
  { key: "panels", title: "Panels" },
  { key: "navigation", title: "Navigation" },
  { key: "workspace", title: "Project" },
  { key: "skills", title: "Skills" },
  { key: "configure", title: "Configure" },
  { key: "app", title: "App" },
];

export interface KeyboardShortcutsSettingsPanelProps {
  keymapOverrides: KeymapOverrides;
  onSetShortcut: (commandId: string, accelerator: string | null) => void;
  onResetShortcut: (commandId: string) => void;
}

export function KeyboardShortcutsSettingsPanel({
  keymapOverrides,
  onSetShortcut,
  onResetShortcut,
}: KeyboardShortcutsSettingsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sections = useMemo(() => buildSections(query), [query]);

  // Reset captured value whenever the editing target changes.
  useEffect(() => {
    setCaptured(null);
  }, [editingId]);

  /*
   * CODEX-REF: spec §3 (dual keydown + preventDefault + stopPropagation).
   * Listener attached only while a row is in capture mode. capture: true
   * ensures we win the race against bubble-phase listeners. The
   * data-codex-shortcut-capture marker on the panel root keeps the in-tree
   * useHotkey listeners from firing.
   */
  useEffect(() => {
    if (editingId == null) return;
    const handler = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setEditingId(null);
        setCaptured(null);
        return;
      }
      const accelerator = normalizeKeyEvent(event);
      if (accelerator) {
        // CODEX-REF: spec §11 — commit immediately on final key release.
        // HiCodex commits on the keydown that completes the combo (no keyup
        // wait); simpler and matches user expectations in practice.
        onSetShortcut(editingId, accelerator);
        setEditingId(null);
        setCaptured(null);
      }
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () => {
      document.removeEventListener("keydown", handler, { capture: true });
    };
  }, [editingId, onSetShortcut]);

  // Autofocus the readonly input the instant capture begins, mirroring
  // Codex's `autoFocus` + readonly input pattern (spec §1+§2).
  useEffect(() => {
    if (editingId != null) inputRef.current?.focus();
  }, [editingId]);

  const onClickEdit = useCallback((commandId: string) => {
    setEditingId(commandId);
  }, []);

  const onClickClear = useCallback(
    (commandId: string) => {
      // CODEX-REF: trash icon → mutation type=remove (unbind).
      onSetShortcut(commandId, null);
    },
    [onSetShortcut],
  );

  const onClickReset = useCallback(
    (commandId: string) => {
      // CODEX-REF: undo icon → mutation type=reset (drop override).
      onResetShortcut(commandId);
    },
    [onResetShortcut],
  );

  return (
    <div className="hc-keyboard-settings" data-codex-shortcut-capture>
      <div className="hc-keyboard-settings-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Search shortcuts"
          aria-label="Search keyboard shortcuts"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {sections.length === 0 ? (
        <div className="hc-keyboard-settings-empty">No matching shortcuts</div>
      ) : (
        /*
         * codex keyboard-shortcuts settings: ONE flat table (colgroup + a single column
         * header `Command`/`Keybinding`/`Actions[sr-only]` =
         * settings.keyboardShortcuts.table.command/keybinding/actions) with per-section
         * group-header rows in the tbody — matching Codex's single-table layout (audit-6),
         * not HiCodex's prior per-section tables. NOTE (visual): needs an A/B check against
         * Codex.app per the visual-alignment rule; verified to compile + pass tests headless.
         */
        <table className="hc-keyboard-settings-table">
          <colgroup>
            <col className="hc-keyboard-settings-col-command" />
            <col className="hc-keyboard-settings-col-keybinding" />
            <col className="hc-keyboard-settings-col-actions" />
          </colgroup>
          <thead className="hc-keyboard-settings-thead">
            <tr>
              <th scope="col">Command</th>
              <th scope="col">Keybinding</th>
              <th scope="col"><span className="hc-keyboard-settings-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {sections.flatMap((section) => [
              <tr key={`section-${section.key}`} className="hc-keyboard-settings-section-row">
                <th scope="colgroup" colSpan={3}>{section.title}</th>
              </tr>,
              ...section.descriptors.map((descriptor) => (
                <Row
                  key={descriptor.id}
                  descriptor={descriptor}
                  editing={editingId === descriptor.id}
                  captured={editingId === descriptor.id ? captured : null}
                  hasOverride={resolveKeymapOverride(descriptor.id, keymapOverrides) !== undefined}
                  conflict={editingId === descriptor.id && captured
                    ? findConflict(captured, descriptor.id)
                    : null}
                  inputRef={editingId === descriptor.id ? inputRef : undefined}
                  onEdit={() => onClickEdit(descriptor.id)}
                  onClear={() => onClickClear(descriptor.id)}
                  onReset={() => onClickReset(descriptor.id)}
                  onCancel={() => {
                    setEditingId(null);
                    setCaptured(null);
                  }}
                />
              )),
            ])}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface RowProps {
  descriptor: CommandDescriptor;
  editing: boolean;
  captured: string | null;
  hasOverride: boolean;
  conflict: { id: string; title: string } | null;
  inputRef: React.RefObject<HTMLInputElement | null> | undefined;
  onEdit: () => void;
  onClear: () => void;
  onReset: () => void;
  onCancel: () => void;
}

function Row({
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
}: RowProps) {
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
        /*
         * CODEX-REF: spec — capture state swaps the keybinding column for an
         * input and HIDES the actions column (colSpan=2 in Codex). HiCodex
         * uses colSpan=2 on the input cell to match.
         */
        <td className="hc-keyboard-settings-cell-capture" colSpan={2}>
          <input
            ref={inputRef}
            readOnly
            className="hc-keyboard-settings-capture-input"
            placeholder="Press shortcut"
            value={captured ? formatAccelerator(captured, isMac) : ""}
            onBlur={onCancel}
            aria-label={`Capture new shortcut for ${descriptor.title}`}
          />
          {conflict ? (
            // CODEX-REF: spec §10 — inline "Used by {commandTitle}" warning.
            // Codex shows below the input and does NOT block commit.
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
              {/*
                * CODEX-REF: spec — pencil button enters capture mode. Codex
                * also handles Shift+click as "append" mode; HiCodex doesn't
                * expose multi-binding lists yet (descriptors carry only a
                * single defaultKeybinding) so the modifier is currently a
                * no-op. Tracked as follow-up.
                */}
              <button
                type="button"
                className="hc-keyboard-settings-icon-button"
                aria-label={`Edit shortcut for ${descriptor.title}`}
                onClick={onEdit}
              >
                <Pencil size={14} />
              </button>
              {accelerator ? (
                /*
                 * CODEX-REF: spec — trash button only shown when a binding
                 * exists; clicking unbinds (override → null).
                 */
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
                /*
                 * CODEX-REF: spec — undo (reset) icon only shown when the
                 * row carries a user override; clicking drops the override.
                 */
                <button
                  type="button"
                  className="hc-keyboard-settings-icon-button"
                  aria-label={`Reset shortcut for ${descriptor.title}`}
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

interface Section {
  key: string;
  title: string;
  descriptors: CommandDescriptor[];
}

function buildSections(query: string): Section[] {
  const normalizedQuery = query.trim().toLowerCase();
  const buckets = new Map<string, CommandDescriptor[]>();
  for (const descriptor of COMMAND_DESCRIPTORS) {
    if (!matchesQuery(descriptor, normalizedQuery)) continue;
    const key = descriptor.commandMenuGroupKey ?? descriptor.group;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(descriptor);
    else buckets.set(key, [descriptor]);
  }
  const sections: Section[] = [];
  for (const entry of GROUP_TITLE) {
    const descriptors = buckets.get(entry.key);
    if (descriptors && descriptors.length > 0) {
      sections.push({ key: entry.key, title: entry.title, descriptors });
    }
  }
  for (const [key, descriptors] of buckets.entries()) {
    if (GROUP_TITLE.some((entry) => entry.key === key)) continue;
    sections.push({ key, title: key.charAt(0).toUpperCase() + key.slice(1), descriptors });
  }
  return sections;
}

function matchesQuery(descriptor: CommandDescriptor, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true;
  const accelerator = descriptorAcceleratorLabel(descriptor.id) ?? "";
  const haystack = [
    descriptor.title,
    descriptor.description ?? "",
    descriptor.id,
    accelerator,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

/*
 * CODEX-REF: spec §10 — real-time conflict detection. When a captured
 * accelerator string equals another command's resolved binding, warn but do
 * NOT block commit. Comparison uses the raw accelerator string (e.g.
 * "CmdOrCtrl+K") since both override and default values are stored in that
 * normalized form.
 */
function findConflict(captured: string, editingId: string): { id: string; title: string } | null {
  for (const descriptor of COMMAND_DESCRIPTORS) {
    if (descriptor.id === editingId) continue;
    const existing = commandAccelerators(descriptor.id)[0];
    if (existing && existing === captured) {
      return { id: descriptor.id, title: descriptor.title };
    }
  }
  return null;
}

/*
 * CODEX-REF: spec §4 — KeyboardEvent → accelerator normalizer. Same logic
 * as the prior modal in key-capture-dialog.tsx (now removed) but inlined
 * here because the panel owns the capture surface.
 */
function normalizeKeyEvent(event: KeyboardEvent): string | null {
  const key = event.key;
  if (!key) return null;
  if (key === "Meta" || key === "Control" || key === "Alt" || key === "Shift") return null;
  if (key === "Escape") return null;
  const modifiers: string[] = [];
  if (event.metaKey || event.ctrlKey) modifiers.push("CmdOrCtrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  let token: string;
  if (key.length === 1) {
    token = key.toUpperCase();
  } else {
    token = key;
  }
  if (modifiers.length === 0) {
    // letter key alone is not a useful shortcut; require a modifier
    if (token.length === 1) return null;
  }
  return [...modifiers, token].join("+");
}
