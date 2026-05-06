import { Loader2, Pause, Send } from "lucide-react";

export type ComposerMode = "send" | "steer" | "stop";

export interface ComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  mode: ComposerMode;
  connecting: boolean;
  activeTurnId: string | null;
  onSend: () => void;
  onInterrupt: () => void;
}

export function Composer({
  input,
  onInputChange,
  mode,
  connecting,
  activeTurnId,
  onSend,
  onInterrupt,
}: ComposerProps) {
  const canInterrupt = mode !== "send" && Boolean(activeTurnId);

  return (
    <form
      className="hc-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "stop") {
          onInterrupt();
          return;
        }
        onSend();
      }}
    >
      <textarea
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        placeholder="Ask Codex to inspect, edit, run, or explain this workspace"
        onKeyDown={(event) => {
          if (event.key === "Escape" && canInterrupt) {
            event.preventDefault();
            onInterrupt();
            return;
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <button
        className="hc-send-button"
        type="submit"
        title={mode === "stop" ? "Stop" : mode === "steer" ? "Steer" : "Send"}
        disabled={connecting || (mode !== "stop" && !input.trim()) || (mode === "stop" && !activeTurnId)}
        data-mode={mode}
      >
        {connecting ? <Loader2 className="hc-spin" size={16} /> : mode === "stop" ? <Pause size={16} /> : <Send size={16} />}
      </button>
    </form>
  );
}
