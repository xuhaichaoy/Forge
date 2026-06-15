import { useForgeIntl } from "./i18n-provider";
import { useMeasuredTextCollapse } from "../hooks/use-measured-text-collapse";

export function CommandPreview({ text }: { text: string }) {
  const { formatMessage } = useForgeIntl();
  const { ref, state, toggle } = useMeasuredTextCollapse<HTMLSpanElement>(3);
  const isExpanded = state === "expanded";
  const isCollapsed = state === "collapsed";
  const showToggle = state !== "uncollapsible";
  return (
    <div className="hc-request-command-preview" data-expanded={isExpanded}>
      <div className="hc-request-command-preview-content">
        <span
          ref={ref}
          className="hc-request-command-preview-text"
          data-collapsed={isCollapsed}
        >
          {text}
        </span>
      </div>
      {showToggle && (
        <div className="hc-request-command-preview-footer">
          <button
            type="button"
            className="hc-request-command-preview-toggle"
            onClick={toggle}
          >
            {isExpanded
              ? formatMessage({ id: "composer.mcpToolCallApproval.toolParam.collapse", defaultMessage: "Collapse" })
              : formatMessage({ id: "composer.mcpToolCallApproval.toolParam.expand", defaultMessage: "Expand" })}
          </button>
        </div>
      )}
    </div>
  );
}

function bashShellScriptText(command: readonly unknown[]): string | null {
  if (command.length !== 3) return null;
  const head = command[0];
  const flag = command[1];
  const body = command[2];
  if (typeof head !== "string" || typeof flag !== "string" || typeof body !== "string") return null;
  if (!/^(bash|sh|zsh)$/.test(head)) return null;
  if (!/^-l?c$/.test(flag)) return null;
  return body;
}

export function commandPreviewText(params: unknown): string {
  const command = params && typeof params === "object"
    ? (params as Record<string, unknown>).command ?? (params as Record<string, unknown>).cmd
    : null;
  if (Array.isArray(command)) {
    const shellScript = bashShellScriptText(command);
    if (shellScript !== null) return shellScript;
    return command.map((part) => String(part)).join(" ");
  }
  return typeof command === "string" && command.trim().length > 0 ? command : "command";
}

export function looksLikeCommandOrPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(?:\/|\.\/|\.\.\/|~\/|[A-Za-z]:[\\/])/.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return true;
  const [first = ""] = trimmed.split(/\s+/);
  if (COMMON_SHELL_COMMANDS.has(first)) return true;
  if (/^(?:[./~\w-]+\/)+[\w.-]+$/.test(first)) return true;
  return /^[\w.-]+\.(?:[cm]?[jt]sx?|json|md|css|scss|html|rs|go|py|rb|php|java|kt|swift|toml|ya?ml|lock|sh|zsh|bash|sql|txt)$/.test(first);
}

const COMMON_SHELL_COMMANDS = new Set([
  "awk",
  "bun",
  "cargo",
  "cat",
  "chmod",
  "chown",
  "cmake",
  "cp",
  "curl",
  "deno",
  "docker",
  "find",
  "git",
  "go",
  "grep",
  "jq",
  "ls",
  "make",
  "mkdir",
  "mv",
  "node",
  "npm",
  "npx",
  "open",
  "osascript",
  "pnpm",
  "python",
  "python3",
  "rg",
  "rm",
  "rustc",
  "sed",
  "tar",
  "tsc",
  "unzip",
  "vite",
  "yarn",
  "zip",
]);
