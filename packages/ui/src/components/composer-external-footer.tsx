import { ChevronDown, Cpu, GitBranch, Monitor } from "lucide-react";

export interface ComposerExternalFooterProps {
  branch?: string | null;
  cwd?: string | null;
  model?: string | null;
  reasoningEffort?: unknown;
}

export function ComposerExternalFooter({
  branch,
  cwd,
  model,
  reasoningEffort,
}: ComposerExternalFooterProps) {
  const modelLabel = model ? formatModelFooterLabel(model, reasoningEffort) : "";
  return (
    <div className="hc-composer-external-footer" aria-label="Composer context">
      <div className="hc-composer-external-footer-left">
        <button
          type="button"
          className="hc-composer-footer-chip"
          title={cwd?.trim() || "Work locally"}
        >
          <Monitor size={14} />
          <span>Work locally</span>
          <ChevronDown size={13} />
        </button>
        {branch && (
          <button
            type="button"
            className="hc-composer-footer-chip"
            title={`Branch: ${branch}`}
          >
            <GitBranch size={14} />
            <span>{branch}</span>
            <ChevronDown size={13} />
          </button>
        )}
      </div>
      {modelLabel && (
        <button
          type="button"
          className="hc-composer-footer-chip hc-composer-footer-model"
          title={modelLabel}
        >
          <Cpu size={14} />
          <span>{modelLabel}</span>
          <ChevronDown size={13} />
        </button>
      )}
    </div>
  );
}

function formatModelFooterLabel(model: string, reasoningEffort?: unknown): string {
  const trimmedModel = model.trim();
  const effort = formatReasoningEffort(reasoningEffort);
  return effort ? `${trimmedModel} ${effort}` : trimmedModel;
}

function formatReasoningEffort(value?: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "xhigh" || normalized === "extra_high") return "Extra High";
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return value.trim();
}
