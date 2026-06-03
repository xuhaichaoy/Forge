/*
 * codex: keyboard-shortcuts-settings-*.js + keyboard-shortcuts-search-input-*.js
 *
 * Codex Desktop ships a Settings → Keyboard Shortcuts page that lists every
 * command from `electron-menu-shortcuts-*.js` together with its
 * platform-specific accelerator. HiCodex mirrors the same surface but as a
 * standalone modal because HiCodex's settings panel is a smaller dialog.
 *
 * The list is grouped by `commandMenuGroupKey` (thread / panels / navigation /
 * workspace / configure / app) and supports a substring filter on
 * title / description / accelerator.
 */
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  COMMAND_DESCRIPTORS,
  commandDescriptorDescription,
  commandDescriptorTitle,
  descriptorAcceleratorLabel,
} from "../state/commands";
import type { CommandDescriptor } from "../state/command-registry";
import { useHiCodexIntl } from "./i18n-provider";

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/*
 * codex: keyboard-shortcuts-settings-*.js — Codex groups commands under
 * the same taxonomy as the command menu. HiCodex reuses the descriptor's
 * `commandMenuGroupKey` so the list mirrors the command palette taxonomy.
 */
const GROUP_TITLE: ReadonlyArray<{ key: string; titleId: string; title: string }> = [
  { key: "general", titleId: "keyboardShortcutsDialog.section.general", title: "General" },
  { key: "thread", titleId: "keyboardShortcutsDialog.section.thread", title: "Chat" },
  { key: "panels", titleId: "keyboardShortcutsDialog.section.panels", title: "Panels" },
  { key: "navigation", titleId: "keyboardShortcutsDialog.section.navigation", title: "Navigation" },
  { key: "workspace", titleId: "keyboardShortcutsDialog.section.workspace", title: "Project" },
  { key: "skills", titleId: "keyboardShortcutsDialog.section.skills", title: "Skills" },
  { key: "configure", titleId: "keyboardShortcutsDialog.section.configure", title: "Configure" },
  { key: "app", titleId: "keyboardShortcutsDialog.section.app", title: "App" },
];

interface Section {
  key: string;
  titleId?: string;
  title: string;
  descriptors: CommandDescriptor[];
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  const { formatMessage } = useHiCodexIntl();
  const [query, setQuery] = useState("");

  // codex: keyboard-shortcuts-search-input-*.js — substring filter on
  // title / description / accelerator label (case-insensitive).
  const sections = useMemo(() => buildSections(query), [query]);

  if (!open) return null;

  return (
    <div
      className="hc-settings-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="hc-keyboard-shortcuts-dialog"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label={formatMessage({ id: "keyboardShortcutsDialog.title", defaultMessage: "Keyboard shortcuts" })}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <header className="hc-keyboard-shortcuts-header">
          <div className="hc-keyboard-shortcuts-title">
            {formatMessage({ id: "keyboardShortcutsDialog.title", defaultMessage: "Keyboard shortcuts" })}
          </div>
          <button
            type="button"
            className="hc-keyboard-shortcuts-close"
            aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="hc-keyboard-shortcuts-search">
          <Search size={14} aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            placeholder={formatMessage({ id: "settings.keyboardShortcuts.search.placeholder", defaultMessage: "Search shortcuts" })}
            aria-label={formatMessage({ id: "settings.keyboardShortcuts.search.ariaLabel", defaultMessage: "Search keyboard shortcuts" })}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="hc-keyboard-shortcuts-body">
          {sections.length === 0 ? (
            <div className="hc-keyboard-shortcuts-empty">
              {query.trim().length > 0
                ? formatMessage({ id: "keyboardShortcutsDialog.noMatches", defaultMessage: "No matching shortcuts" })
                : formatMessage({ id: "keyboardShortcutsDialog.empty", defaultMessage: "No active shortcuts" })}
            </div>
          ) : (
            sections.map((section) => (
              <section className="hc-keyboard-shortcuts-section" key={section.key}>
                <h3 className="hc-keyboard-shortcuts-section-title">
                  {section.titleId
                    ? formatMessage({ id: section.titleId, defaultMessage: section.title })
                    : section.title}
                </h3>
                <ul className="hc-keyboard-shortcuts-list">
                  {section.descriptors.map((descriptor) => {
                    const accelerator = descriptorAcceleratorLabel(descriptor.id);
                    return (
                      <li className="hc-keyboard-shortcuts-row" key={descriptor.id}>
                        <div className="hc-keyboard-shortcuts-row-text">
                          <span className="hc-keyboard-shortcuts-row-title">{commandDescriptorTitle(descriptor)}</span>
                          {commandDescriptorDescription(descriptor) ? (
                            <span className="hc-keyboard-shortcuts-row-desc">
                              {commandDescriptorDescription(descriptor)}
                            </span>
                          ) : null}
                        </div>
                        {accelerator ? (
                          <kbd className="hc-keyboard-shortcuts-row-kbd">{accelerator}</kbd>
                        ) : (
                          <span className="hc-keyboard-shortcuts-row-kbd hc-keyboard-shortcuts-row-kbd--empty">
                            —
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/*
 * codex: keyboard-shortcuts-settings-*.js — groups commands by
 * `commandMenuGroupKey` (falling back to `group`). Within each section the
 * order follows the registration order in COMMAND_DESCRIPTORS so the list
 * matches the menu.
 */
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
      sections.push({ key: entry.key, titleId: entry.titleId, title: entry.title, descriptors });
    }
  }
  // Any descriptor whose group is not in GROUP_TITLE falls into an "Other" bucket.
  for (const [key, descriptors] of buckets.entries()) {
    if (GROUP_TITLE.some((entry) => entry.key === key)) continue;
    sections.push({ key, title: capitalize(key), descriptors });
  }
  return sections;
}

function matchesQuery(descriptor: CommandDescriptor, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true;
  const accelerator = descriptorAcceleratorLabel(descriptor.id) ?? "";
  const haystack = [
    commandDescriptorTitle(descriptor),
    commandDescriptorDescription(descriptor) ?? "",
    descriptor.id,
    accelerator,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
