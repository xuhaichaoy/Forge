import {
  AtSign,
  Bot,
  Bug,
  Cpu,
  FileText,
  GitBranch,
  ListChecks,
  Loader2,
  Paperclip,
  PlugZap,
  Server,
  Settings as SettingsIcon,
  Slash,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import { useHiCodexIntl } from "./i18n-provider";
import {
  type AttachAction,
  type AttachActionId,
  type ComposerMentionMarker,
  type ComposerMentionOption,
  type ComposerMode,
  type SlashCommand,
} from "../state/composer-workflow";

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
 * codex: at-mention-list-with-sources-*.js — section order
 * (Live agents / Custom agents / Skills / Apps / Plugins / Files). HiCodex
 * does not distinguish Live vs Custom agents, so they collapse into one
 * "Agents" section; the rest mirrors Codex.
 */
/*
 * codex at-mention-list-GuqX2GsW.js — the @ list has no standalone "Apps"
 * section: app results are grouped under "Plugins" (atMentionList.appPlugins).
 * `composer.skillMentionList.app` ("App", singular) belongs to the $ skill
 * list, not here. So HiCodex folds the `app` kind into the Plugins section and
 * keeps the Codex `atMentionList.*` ids. Each section can match several kinds.
 */
const MENTION_SECTION_ORDER: ReadonlyArray<{ kinds: ReadonlyArray<NonNullable<ComposerMentionOption["kind"]>>; title: string; i18nId: string }> = [
  { kinds: ["agent"], title: "Agents", i18nId: "composer.atMentionList.agents" },
  { kinds: ["skill"], title: "Skills", i18nId: "composer.atMentionList.skills" },
  { kinds: ["plugin", "app"], title: "Plugins", i18nId: "composer.atMentionList.plugins" },
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

function attachIcon(actionId: AttachActionId) {
  switch (actionId) {
    case "filePath":
      return <Paperclip size={15} />;
    case "plan":
      return <ListChecks size={15} />;
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

// ---------------------------------------------------------------------------
// Attach context menu
// ---------------------------------------------------------------------------

interface ComposerAttachMenuProps {
  actions: AttachAction[];
  selectedAction: AttachAction | undefined;
  mode: ComposerMode;
  onSelect: (actionId: AttachActionId) => void;
}

export function ComposerAttachMenu({
  actions,
  selectedAction,
  mode,
  onSelect,
}: ComposerAttachMenuProps) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div className="hc-composer-menu attach" role="menu" aria-label={formatMessage({ id: "hc.composer.attach.menuLabel", defaultMessage: "Attach context" })} data-state="open">
      {actions.map((action) => {
        const isPlanAction = action.id === "plan";
        const checked = isPlanAction && mode === "plan";
        return (
          <button
            className="hc-composer-menu-row"
            data-active={action.id === selectedAction?.id}
            data-checked={checked}
            key={action.id}
            type="button"
            role={isPlanAction ? "switch" : "menuitem"}
            aria-checked={isPlanAction ? checked : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void onSelect(action.id)}
          >
            {attachIcon(action.id)}
            <span>
              <strong>{action.title}</strong>
              <small>{action.description}</small>
            </span>
            {isPlanAction && (
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

// ---------------------------------------------------------------------------
// Attach input panel (custom text / image-url / etc.)
// ---------------------------------------------------------------------------

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
  const { formatMessage } = useHiCodexIntl();
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
