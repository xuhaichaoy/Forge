import { Check, Copy as CopyIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForgeIntl } from "./i18n-provider";
import type { ToolActivityDetailViewModel } from "./tool-activity-detail-view-model";

/*
 * codex: the embedded exec header (`Nv` `he`) labels the block by SHELL TYPE,
 * derived from the command's leading program - `Lv(Av(command))`. `Av` (= `jv` +
 * `Mv`) extracts the first token's basename (after quote-stripping + path split)
 * and maps a known shell executable to its shell type (`x` = the `mm` map); `Lv`
 * maps that type to a display name (`y` = the `hm` map), defaulting to "Shell".
 * So normal commands (git/npm/...) show "Shell"; a bare shell invocation
 * (bash/zsh/pwsh/sh/cmd, incl. `.exe`) shows that shell's name.
 */
const EXEC_SHELL_EXECUTABLES: Record<string, string> = {
  bash: "bash",
  "bash.exe": "bash",
  "git-bash.exe": "bash",
  cmd: "cmd",
  "cmd.exe": "cmd",
  powershell: "powershell",
  "powershell.exe": "powershell",
  pwsh: "powershell",
  "pwsh.exe": "powershell",
  sh: "sh",
  "sh.exe": "sh",
  zsh: "zsh",
  "zsh.exe": "zsh",
};
const EXEC_SHELL_DISPLAY_NAMES: Record<string, string> = {
  bash: "bash",
  cmd: "cmd",
  powershell: "PowerShell",
  sh: "sh",
  zsh: "zsh",
};

function execShellBasename(token: string): string {
  // codex Mv: e.split(/[/\\]/).at(-1) ?? e
  const parts = token.split(/[/\\]/);
  return parts[parts.length - 1] || token;
}

function execShellProgramName(command: string): string | null {
  // codex jv: trim -> unwrap a leading quote -> first whitespace token -> basename
  let t = command.trim();
  if (t.length === 0) return null;
  const quoted = t.match(/^(['"])(.*?)\1/);
  const inner = quoted?.[2];
  if (inner != null) {
    if (quoted![0].length === t.length) {
      t = inner.trim();
    } else {
      return execShellBasename(inner);
    }
  }
  const token = t.match(/^\S+/)?.[0];
  return token == null ? null : execShellBasename(token);
}

function execShellTypeLabel(command: string): string {
  const program = execShellProgramName(command);
  const shellType = program == null ? null : EXEC_SHELL_EXECUTABLES[program.toLowerCase()] ?? null;
  return shellType == null ? "Shell" : EXEC_SHELL_DISPLAY_NAMES[shellType];
}

export function ExecShellDetail({
  detail,
  forceExpanded = false,
}: {
  detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>;
  forceExpanded?: boolean;
}) {
  const { formatMessage } = useForgeIntl();
  const [expanded, setExpanded] = useState(() => initialExecShellExpanded(detail));
  const [copiedTarget, setCopiedTarget] = useState<ExecShellCopyTarget | null>(null);
  /*
   * CODEX-REF: local-conversation-thread-*.js - exec command-line clamp:
   *   useState(null) tracks the expanded command id;
   *   apply `line-clamp-2` until expanded;
   *   one click permanently expands, with no reverse collapse.
   * `forceExpanded` scenario (e.g. file preview panel) expects the command to
   * render fully from the start, so the initial value follows forceExpanded.
   */
  const [commandExpanded, setCommandExpanded] = useState<boolean>(forceExpanded);
  const bodyOpen = forceExpanded || detail.running || expanded;
  const output = detail.output || (!detail.running && detail.footer ? formatMessage({ id: "codex.shell.noOutput", defaultMessage: "No output" }) : "");

  /*
   * Keep running output pinned to the newest line - but ONLY when the user is
   * already at the bottom. codex: local-conversation-thread `Xp` recomputes an
   * at-bottom flag on every scroll (`scrollHeight - scrollTop - clientHeight <=
   * Yp`, Yp=24) and the content-change effect bails when not at bottom, so a
   * manual scroll-up is never yanked back down.
   */
  const outputRef = useRef<HTMLPreElement | null>(null);
  const outputAtBottomRef = useRef<boolean>(true);
  const onOutputScroll = () => {
    const el = outputRef.current;
    if (!el) return;
    outputAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
  };
  useEffect(() => {
    if (!detail.running || !bodyOpen) return;
    const el = outputRef.current;
    if (!el || !outputAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [bodyOpen, detail.output, detail.running]);

  useEffect(() => {
    setExpanded(initialExecShellExpanded(detail));
    setCommandExpanded(forceExpanded);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- 故意以 detail.id 为重置键：仅切换到另一条 exec 时重置展开态，流式输出更新（detail 引用变化）不得回弹
  }, [detail.id, forceExpanded]);

  const copyTarget = (target: ExecShellCopyTarget) => {
    const text = execShellCopyText(detail, target);
    void writeClipboardText(text).then((copied) => {
      if (!copied) return;
      setCopiedTarget(target);
      setTimeout(() => {
        setCopiedTarget((current) => current === target ? null : current);
      }, 1500);
    });
  };

  const commandContent = (
    /*
     * Codex embedded Nv renders one continuous monospace run `$ {command}`, no
     * separate $ span and NO chevron - the command row is not a body disclosure.
     */
    <code>$ {detail.command}</code>
  );

  return (
    <section
      className={`hc-exec-shell ${detail.running ? "is-running" : ""}`}
      data-shell-state={bodyOpen ? "expanded" : "collapsed"}
    >
      {/*
       * Codex Nv embedded card = a flex column `[he, ve, ye]`. For embedded:
       * `he` (the shell-TYPE header below) renders, the full `ve` header bar
       * (shellName + cwd + copy-shell-contents + collapse/expand) is gated to
       * variant==="default" so in-thread cards omit it, and the body `ye` shows
       * UNCONDITIONALLY (`<div className="relative overflow-hidden">{me}</div>`,
       * no collapse). Card-level copy is omitted (Codex exposes only the scoped
       * per-command / per-output copy); the command row's only click affordance
       * is un-clamping its own `line-clamp-2` (F = () => b(D)), NOT a body toggle.
       */}
      {!forceExpanded && (
        /*
         * codex `he` (embedded only): a muted shell-TYPE label row above the
         * command - `Lv(Av(command))`, i.e. "Shell" for normal commands or the
         * shell name (bash/zsh/PowerShell/...) when the command is a bare shell.
         */
        <div className="hc-exec-shell-header">
          <span>{execShellTypeLabel(detail.command)}</span>
        </div>
      )}
      <div className="hc-exec-shell-command-row">
        {!forceExpanded ? (
          <button
            className="hc-exec-shell-command hc-exec-shell-toggle"
            type="button"
            data-command-expanded={commandExpanded || undefined}
            onClick={() => {
              /*
               * Codex `Nv` has F = () => b(D): clicking the command sets y to D
               * once, permanently removing `line-clamp-2`. The command click
               * only unclamps itself; it does not control output/footer visibility.
               */
              setCommandExpanded(true);
            }}
          >
            {commandContent}
          </button>
        ) : (
          <div className="hc-exec-shell-command" data-command-expanded={commandExpanded || undefined}>
            {commandContent}
          </div>
        )}
        <ExecShellCopyButton
          className="hc-exec-shell-command-copy"
          copied={copiedTarget === "command"}
          label={copiedTarget === "command" ? formatMessage({ id: "copyButton.copied", defaultMessage: "Copied" }) : formatMessage({ id: "codex.shell.copyCommand", defaultMessage: "Copy command" })}
          onClick={() => copyTarget("command")}
        />
      </div>
      {/*
       * Codex embedded Nv: the output block `ue` is a sibling of the command row
       * inside `pe = <div className="relative">...</div>` and renders
       * UNCONDITIONALLY (only gated on whether there IS output text - `W = w ? a :
       * l ? "" : E`). It is NOT hidden behind a body toggle, so Forge shows it
       * whenever `output` is present rather than gating on `bodyOpen`.
       */}
      {output && (
        <div className="hc-exec-shell-output-wrap">
          <pre className="hc-exec-shell-output" ref={outputRef} onScroll={onOutputScroll}>
            <code>{output}</code>
          </pre>
          <ExecShellCopyButton
            className="hc-exec-shell-output-copy"
            copied={copiedTarget === "output"}
            label={copiedTarget === "output" ? formatMessage({ id: "copyButton.copied", defaultMessage: "Copied" }) : formatMessage({ id: "codex.shell.copyOutput", defaultMessage: "Copy output" })}
            onClick={() => copyTarget("output")}
          />
        </div>
      )}
      {/* Codex embedded: the footer (zv) is the second child of the card wrapper and always renders. */}
      {renderExecFooter(detail, formatMessage)}
    </section>
  );
}

// codex: local-conversation-thread-*.js - the exec footer labels are localized
// via `execFooter.*` (Success/Stopped/Exit code {code}/unknown). detail.footer
// stays the locale-free English source (the status discriminant below keys off
// it); only the displayed label is localized so non-English UI does not leak
// the English source footer. defaultMessage keeps en-US unchanged.
function localizeExecFooter(footer: string, formatMessage: ReturnType<typeof useForgeIntl>["formatMessage"]): string {
  if (footer === "Success") return formatMessage({ id: "execFooter.success", defaultMessage: "Success" });
  if (footer === "Stopped") return formatMessage({ id: "execFooter.stopped", defaultMessage: "Stopped" });
  if (footer === "Exit code unknown") {
    return formatMessage(
      { id: "execFooter.exitCode", defaultMessage: "Exit code {code}" },
      { code: formatMessage({ id: "execFooter.exitCode.unknown", defaultMessage: "unknown" }) },
    );
  }
  if (footer.startsWith("Exit code ")) {
    return formatMessage(
      { id: "execFooter.exitCode", defaultMessage: "Exit code {code}" },
      { code: footer.slice("Exit code ".length) },
    );
  }
  return footer;
}

/*
 * Derive a compact footer state from the existing exec view model. Newer data
 * can set a structured status; older fixtures still arrive as footer strings.
 */
function renderExecFooter(detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>, formatMessage: ReturnType<typeof useForgeIntl>["formatMessage"]): ReactNode {
  if (detail.running) {
    return <div aria-hidden="true" className="hc-exec-shell-footer" data-exec-status="in-progress" />;
  }
  if (!detail.footer) return null;
  const isSuccess = detail.footer === "Success";
  const isStopped = detail.footer === "Stopped";
  const isExitCodeFailure = detail.footer.startsWith("Exit code ") && detail.footer !== "Exit code unknown";
  const status = isStopped
    ? "interrupted"
    : isSuccess
      ? "success"
      : isExitCodeFailure
        ? "failed"
        : "unknown";
  return (
    <div className="hc-exec-shell-footer" data-exec-status={status}>
      {/* codex `zv` exec footer: only the success branch carries an icon (a check); Stopped/Exit-code are text-only. */}
      {isSuccess && <Check aria-hidden className="hc-exec-footer-icon-success" size={12} />}
      <span>{localizeExecFooter(detail.footer, formatMessage)}</span>
    </div>
  );
}

export type ExecShellCopyTarget = "all" | "command" | "output";

function ExecShellCopyButton({
  className,
  copied,
  label,
  onClick,
}: {
  className: string;
  copied: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`hc-exec-shell-copy-button ${className} ${copied ? "is-copied" : ""}`}
      title={label}
      type="button"
      onClick={onClick}
    >
      {copied ? <Check aria-hidden size={13} /> : <CopyIcon aria-hidden size={13} />}
    </button>
  );
}

export function execShellCopyText(
  detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>,
  target: ExecShellCopyTarget = "all",
): string {
  if (target === "command") return detail.command;
  if (target === "output") return detail.output;
  return [`$ ${detail.command}`, detail.output].filter(Boolean).join("\n");
}

function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return Promise.resolve(false);
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return Promise.resolve(false);
  }
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  );
}

export function initialExecShellExpanded(detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>): boolean {
  return detail.running;
}
