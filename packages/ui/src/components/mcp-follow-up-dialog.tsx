import { MessageSquareText, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import type { McpAppFollowUpSource } from "../state/mcp-app-host";

export type McpFollowUpDialogOptionId =
  | "current-thread"
  | "new-side-chat"
  | "new-thread"
  | "local"
  | "worktree";

export interface McpFollowUpDialogOption {
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  id: McpFollowUpDialogOptionId;
  label: string;
}

export interface McpFollowUpDialogState {
  defaultOptionId?: McpFollowUpDialogOptionId;
  options?: McpFollowUpDialogOption[];
  prompt: string;
  source: McpAppFollowUpSource;
}

export interface McpFollowUpDialogProps {
  request: McpFollowUpDialogState;
  onClose: () => void;
  onSend: (prompt: string, option: McpFollowUpDialogOption) => void | Promise<void>;
}

export const MCP_FOLLOW_UP_LOCAL_DISABLED_REASON =
  "Local follow-up targets are disabled until HiCodex exposes a host thread-creation route.";
export const MCP_FOLLOW_UP_WORKTREE_DISABLED_REASON =
  "Worktree mode is disabled: missing host createPendingWorktree.";

export const DEFAULT_MCP_FOLLOW_UP_OPTION_ID: McpFollowUpDialogOptionId = "current-thread";

export const DEFAULT_MCP_FOLLOW_UP_OPTIONS: readonly McpFollowUpDialogOption[] = [
  {
    id: "current-thread",
    label: "Current thread",
    description: "Send this prompt into the current conversation.",
  },
  {
    id: "new-side-chat",
    label: "New side chat",
    description: "Target a side chat from this thread. The caller receives this selection.",
  },
  {
    id: "new-thread",
    label: "New thread",
    description: "Target a separate thread. The caller receives this selection.",
  },
  {
    id: "local",
    label: "Local",
    description: "Start a local follow-up target.",
    disabled: true,
    disabledReason: MCP_FOLLOW_UP_LOCAL_DISABLED_REASON,
  },
  {
    id: "worktree",
    label: "Worktree",
    description: "Create a worktree follow-up target.",
    disabled: true,
    disabledReason: MCP_FOLLOW_UP_WORKTREE_DISABLED_REASON,
  },
];

export function McpFollowUpDialog({
  request,
  onClose,
  onSend,
}: McpFollowUpDialogProps) {
  const options = useMemo(
    () => normalizeMcpFollowUpOptions(request.options),
    [request.options],
  );
  const defaultOptionId = request.defaultOptionId ?? DEFAULT_MCP_FOLLOW_UP_OPTION_ID;
  const [draft, setDraft] = useState(request.prompt);
  const [selectedOptionId, setSelectedOptionId] = useState<McpFollowUpDialogOptionId>(
    () => initialMcpFollowUpOptionId(options, defaultOptionId),
  );
  const selectedOption = mcpFollowUpOptionById(options, selectedOptionId)
    ?? mcpFollowUpOptionById(options, DEFAULT_MCP_FOLLOW_UP_OPTION_ID)
    ?? options.find((option) => !option.disabled)
    ?? options[0];
  const sourceSummary = mcpFollowUpSourceSummary(request.source);

  useEffect(() => {
    setDraft(request.prompt);
    setSelectedOptionId(initialMcpFollowUpOptionId(options, defaultOptionId));
  }, [defaultOptionId, options, request.prompt]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || !selectedOption || selectedOption.disabled) return;
    void onSend(prompt, selectedOption);
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose();
  }

  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-thread-dialog-panel hc-mcp-follow-up-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Send follow-up?"
        onKeyDown={closeOnEscape}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={submit}>
          <header>
            <div><MessageSquareText size={16} /> Send follow-up from {request.source.server}?</div>
            <button type="button" aria-label="Close" onClick={onClose}><X size={16} /></button>
          </header>
          <div className="hc-thread-dialog-body">
            <span>An MCP app wants to send this prompt.</span>
            <span>{sourceSummary}</span>
            <fieldset className="hc-mcp-follow-up-options">
              <legend>Send to</legend>
              {options.map((option) => {
                const selected = option.id === selectedOption?.id;
                const detail = option.disabled && option.disabledReason
                  ? option.disabledReason
                  : option.description;
                return (
                  <label
                    key={option.id}
                    className="hc-mcp-follow-up-option"
                    data-disabled={option.disabled ? "true" : "false"}
                    data-selected={selected ? "true" : "false"}
                  >
                    <input
                      type="radio"
                      name="mcp-follow-up-target"
                      value={option.id}
                      checked={selected}
                      disabled={option.disabled}
                      onChange={() => setSelectedOptionId(option.id)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{detail}</small>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <label>
              Prompt
              <textarea
                aria-label="Prompt"
                autoFocus
                rows={5}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
          </div>
          <footer>
            <button type="button" className="hc-mini-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="hc-mini-button accept" disabled={!draft.trim() || !selectedOption || selectedOption.disabled}>
              Send
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function mcpFollowUpSourceSummary(source: McpAppFollowUpSource): string {
  return [
    source.threadId ? `Thread ${source.threadId}` : "Current thread",
    `Server ${source.server}`,
    `Tool ${source.tool}`,
  ].join(" · ");
}

export function normalizeMcpFollowUpOptions(
  options: readonly McpFollowUpDialogOption[] | undefined,
): McpFollowUpDialogOption[] {
  return (options ?? DEFAULT_MCP_FOLLOW_UP_OPTIONS).map((option) => {
    if (option.id === "local") {
      return {
        ...option,
        disabled: true,
        disabledReason: option.disabledReason ?? MCP_FOLLOW_UP_LOCAL_DISABLED_REASON,
      };
    }
    if (option.id === "worktree") {
      return {
        ...option,
        disabled: true,
        disabledReason: option.disabledReason ?? MCP_FOLLOW_UP_WORKTREE_DISABLED_REASON,
      };
    }
    return { ...option };
  });
}

export function mcpFollowUpOptionById(
  options: readonly McpFollowUpDialogOption[],
  optionId: McpFollowUpDialogOptionId,
): McpFollowUpDialogOption | null {
  return options.find((option) => option.id === optionId) ?? null;
}

function initialMcpFollowUpOptionId(
  options: readonly McpFollowUpDialogOption[],
  defaultOptionId: McpFollowUpDialogOptionId,
): McpFollowUpDialogOptionId {
  const requested = mcpFollowUpOptionById(options, defaultOptionId);
  if (requested && !requested.disabled) return requested.id;
  return options.find((option) => !option.disabled)?.id ?? DEFAULT_MCP_FOLLOW_UP_OPTION_ID;
}
