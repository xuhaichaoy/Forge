import {
  Bot,
  Bug,
  Cpu,
  FileText,
  GitBranch,
  ListChecks,
  Loader2,
  PlugZap,
  Server,
  Settings as SettingsIcon,
  Slash,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { RefObject } from "react";
import { useHiCodexIntl } from "./i18n-provider";
import {
  type ComposerMentionMarker,
  type ComposerMentionOption,
  type SlashCommand,
} from "../state/composer-workflow";
export {
  ComposerAttachInputPanel,
  ComposerAttachMenu,
} from "./composer-attachment-picker-ui";

/*
 * codex: composer-*.js — the slash / @-mention / attach popovers are pure
 * presentational, fully-controlled child surfaces. State (open data, selected
 * row, picker draft) lives in the parent `Composer`; these components only
 * render the rows and forward `onSelect` / keyboard-visible refs. The aria
 * markers (`role="listbox"`/`"menu"`/`"dialog"`, `data-state="open"`) and the
 * `hc-composer-menu*` classes are preserved exactly so the focus-routing
 * selectors in `HiCodexApp.tsx::focusComposerFromPlainTextKey` keep matching.
 */

// ---------------------------------------------------------------------------
// Mention sectioning + option presentation (shared with the parent Composer).
// ---------------------------------------------------------------------------

type MentionPickerStatus = "closed" | "idle" | "loading" | "ready" | "error";

/*
 * codex: at-mention-list-CX3nvds1.js (26.602) — the @ list is assembled by a
 * pure concatenation `Pe([{sections:[agents]},{sections:S},skills,files])` where
 * S = [mcp-servers?, plugins]. So the section order is Agents → [MCP servers] →
 * Plugins → Skills → Files (Plugins BEFORE Skills). HiCodex collapses Live/Custom
 * agents into one "Agents" section and has no standalone "Apps" section (the `app`
 * kind folds into Plugins, keeping the Codex `atMentionList.*` ids). HiCodex lacks
 * the MCP-servers @ section (no `mcpServer` mention kind); for the sections it does
 * render, the order matches the bundle: Agents → Plugins → Skills → Files. Each
 * section can match several kinds.
 */
const MENTION_SECTION_ORDER: ReadonlyArray<{ kinds: ReadonlyArray<NonNullable<ComposerMentionOption["kind"]>>; title: string; i18nId: string }> = [
  { kinds: ["agent"], title: "Agents", i18nId: "composer.atMentionList.agents" },
  { kinds: ["plugin", "app"], title: "Plugins", i18nId: "composer.atMentionList.plugins" },
  { kinds: ["skill"], title: "Skills", i18nId: "composer.atMentionList.skills" },
  { kinds: ["file"], title: "Files", i18nId: "composer.atMentionList.files" },
];

export interface MentionSection {
  kind: NonNullable<ComposerMentionOption["kind"]>;
  title: string;
  i18nId: string;
  options: ComposerMentionOption[];
}

const MENTION_SECTION_KINDS: ReadonlySet<string> = new Set(
  MENTION_SECTION_ORDER.flatMap((entry) => entry.kinds),
);

/* Reorder options so that section-grouped layout still drives a contiguous
 * flat array (keyboard nav uses `mentionPicker.activeIndex` against this list).
 * Within each section the original score-based ordering is preserved. Options
 * without a recognized kind are appended at the end, kept ungrouped. */
export function groupedMentionOptions(options: ComposerMentionOption[]): ComposerMentionOption[] {
  if (options.length === 0) return options;
  const ungrouped: ComposerMentionOption[] = [];
  const recognized: ComposerMentionOption[] = [];
  for (const option of options) {
    if (option.kind && MENTION_SECTION_KINDS.has(option.kind)) recognized.push(option);
    else ungrouped.push(option);
  }
  const ordered: ComposerMentionOption[] = [];
  for (const entry of MENTION_SECTION_ORDER) {
    for (const option of recognized) {
      if (option.kind && entry.kinds.includes(option.kind)) ordered.push(option);
    }
  }
  ordered.push(...ungrouped);
  return ordered;
}

export function mentionSectionsFromOptions(options: ComposerMentionOption[]): MentionSection[] {
  if (options.length === 0) return [];
  const sections: MentionSection[] = [];
  for (const entry of MENTION_SECTION_ORDER) {
    const filtered = options.filter((option) => option.kind != null && entry.kinds.includes(option.kind));
    if (filtered.length > 0) {
      sections.push({ kind: entry.kinds[0]!, title: entry.title, i18nId: entry.i18nId, options: filtered });
    }
  }
  return sections;
}

export function mentionOptionName(option: ComposerMentionOption): string {
  const name = option.name.trim();
  if (name) return name;
  const normalized = option.path.replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "file";
}

export function mentionOptionDisplayName(option: ComposerMentionOption): string {
  return option.displayName?.trim() || option.name || mentionOptionName(option);
}

function mentionOptionDetail(option: ComposerMentionOption): string {
  return option.description?.trim() || option.detail || option.path;
}

function mentionOptionScope(option: ComposerMentionOption): string {
  return option.scopeLabel?.trim() || mentionOptionPrefix(option);
}

function mentionOptionKey(option: ComposerMentionOption): string {
  return `${option.kind ?? "file"}:${option.path}`;
}

function mentionOptionIcon(option: ComposerMentionOption) {
  if ((option.kind === "app" || option.kind === "plugin") && option.iconSmall?.trim()) {
    return <img className="hc-composer-menu-entry-icon" alt="" src={option.iconSmall.trim()} draggable={false} />;
  }
  if (option.kind === "skill") return <Sparkles size={15} />;
  if (option.kind === "app") return <PlugZap size={15} />;
  if (option.kind === "plugin") return <PlugZap size={15} />;
  return <FileText size={15} />;
}

function mentionOptionPrefix(option: ComposerMentionOption): string {
  return option.kind === "skill" || option.kind === "app" ? "$" : "@";
}

/*
 * codex slash-command-item-Cubjf4gi.js — every slash row renders a real
 * LeftIcon (icon-xs), not a text glyph built from the command's first letter.
 * HiCodex has no per-command icon registry, so we map by category and fall
 * back to a generic slash icon — replacing the old "/m" / "/r" pseudo-glyph.
 */
function slashCommandIcon(command: Pick<SlashCommand, "category">) {
  switch (command.category) {
    case "model":
      return <Cpu size={16} />;
    case "thread":
      return <ListChecks size={16} />;
    case "workspace":
      return <GitBranch size={16} />;
    case "tools":
      return <Wrench size={16} />;
    case "mcp":
      return <Server size={16} />;
    case "team":
      return <Bot size={16} />;
    case "settings":
      return <SettingsIcon size={16} />;
    case "debug":
      return <Bug size={16} />;
    default:
      return <Slash size={16} />;
  }
}

// ---------------------------------------------------------------------------
// Slash command menu
// ---------------------------------------------------------------------------

interface ComposerSlashMenuProps {
  commands: SlashCommand[];
  selectedCommand: SlashCommand | null;
  onSelect: (command: SlashCommand) => void;
  menuRef: RefObject<HTMLDivElement | null>;
  activeRowRef: RefObject<HTMLButtonElement | null>;
}

export function ComposerSlashMenu({
  commands,
  selectedCommand,
  onSelect,
  menuRef,
  activeRowRef,
}: ComposerSlashMenuProps) {
  const { formatMessage } = useHiCodexIntl();
  return (
    /*
     * `data-state="open"` mirrors the Radix-style marker the
     * focus-routing selector expects. HiCodex's
     * `HiCodexApp.tsx::focusComposerFromPlainTextKey` (and the
     * upstream Codex Desktop equivalent in `composer-*.js`)
     * queries `[role="listbox"][data-state="open"]` — and the
     * `dialog`/`menu` variants below — to suppress type-to-focus
     * while a popover is mounted. Each popover here is rendered
     * only while open, so the marker can be hard-coded.
     */
    <div ref={menuRef} className="hc-composer-menu" role="listbox" aria-label={formatMessage({ id: "composer.slashCommands.dialogTitle", defaultMessage: "Slash commands" })} data-state="open">
      {commands.map((command) => {
        const active = command.id === selectedCommand?.id;
        return (
          <button
            ref={active ? activeRowRef : undefined}
            className="hc-composer-menu-row"
            data-active={active}
            key={command.id}
            role="option"
            aria-selected={active}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command)}
          >
            <span className="hc-command-icon">{slashCommandIcon(command)}</span>
            <span>
              <strong>/{command.id}</strong>
              <small>{command.description}</small>
            </span>
            {/*
             * codex slash-command-item-Cubjf4gi.js — the right slot is
             * an optional secondary text (arg hint), not the internal
             * routing channel. We surface inlineArgs when present and
             * drop the `supported` (direct/panel/pending…) badge, which
             * is an implementation detail Codex never shows the user.
             */}
            {command.inlineArgs && <em className="hc-command-args">{command.inlineArgs}</em>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// @-mention menu
// ---------------------------------------------------------------------------

interface ComposerMentionMenuProps {
  sections: MentionSection[];
  options: ComposerMentionOption[];
  selectedOption: ComposerMentionOption | null;
  status: MentionPickerStatus;
  marker: ComposerMentionMarker | null | undefined;
  error: string | null;
  menuLabel: string;
  onSelect: (option: ComposerMentionOption) => void;
}

export function ComposerMentionMenu({
  sections,
  options,
  selectedOption,
  status,
  marker,
  error,
  menuLabel,
  onSelect,
}: ComposerMentionMenuProps) {
  const { formatMessage } = useHiCodexIntl();
  const selectedKey = selectedOption ? mentionOptionKey(selectedOption) : "";
  return (
    <div className="hc-composer-menu mention" role="listbox" aria-label={menuLabel} data-state="open">
      {/*
       * codex: at-mention-list-with-sources-*.js —
       * sectioned layout. Each section header is rendered above the
       * rows that belong to it (Codex `r({sections})`). The flat
       * keyboard index still works because `mentionOptions` is in
       * section-render order.
       */}
      {sections.length === 0 && options.length > 0 && (
        <div className="hc-composer-menu-section-label">{menuLabel}</div>
      )}
      {sections.map((section) => (
        <div key={section.kind} className="hc-composer-menu-section">
          <div className="hc-composer-menu-section-label">{formatMessage({ id: section.i18nId, defaultMessage: section.title })}</div>
          {section.options.map((option) => (
            <button
              className="hc-composer-menu-row"
              data-active={mentionOptionKey(option) === selectedKey}
              key={mentionOptionKey(option)}
              type="button"
              role="option"
              aria-selected={mentionOptionKey(option) === selectedKey}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(option)}
            >
              {mentionOptionIcon(option)}
              <span>
                <strong>{mentionOptionDisplayName(option)}</strong>
                <small>{mentionOptionDetail(option)}</small>
              </span>
              <em>{mentionOptionScope(option)}</em>
            </button>
          ))}
        </div>
      ))}
      {/*
       * codex at-mention-list-GuqX2GsW.js — the @ list uses
       * atMentionList.emptyQuery / .loading / .noResults. The $ (skill)
       * branch keeps skillMentionList.* (already correct).
       */}
      {status === "idle" && (
        <div className="hc-composer-menu-empty">{formatMessage({ id: "composer.atMentionList.emptyQuery", defaultMessage: "Type to search for files" })}</div>
      )}
      {status === "loading" && options.length === 0 && (
        <div className="hc-composer-menu-empty">
          <Loader2 className="hc-spin" size={13} />
          {marker === "$"
            ? formatMessage({ id: "composer.skillMentionList.loading", defaultMessage: "Loading skills and apps…" })
            : formatMessage({ id: "composer.atMentionList.loading", defaultMessage: "Searching files…" })}
        </div>
      )}
      {status === "ready" && options.length === 0 && (
        <div className="hc-composer-menu-empty">
          {marker === "$"
            ? formatMessage({ id: "composer.skillMentionList.noResults", defaultMessage: "No skills or apps found" })
            : formatMessage({ id: "composer.atMentionList.noResults", defaultMessage: "No results" })}
        </div>
      )}
      {status === "error" && (
        <div className="hc-composer-menu-empty">{error || formatMessage({ id: "hc.composer.mention.searchFailed", defaultMessage: "Unable to search mentions" })}</div>
      )}
    </div>
  );
}
