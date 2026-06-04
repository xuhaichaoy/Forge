import { Loader2 } from "lucide-react";

import { useHiCodexIntl } from "./i18n-provider";

/*
 * Pre-conversation loading shell, lifted verbatim out of HiCodexApp. Shows a
 * status row ("Starting chat..." / "Connecting runtime..." / "Runtime offline")
 * with a spinner while the runtime connects or a chat starts; renders null once
 * connected and idle. Props are explicit booleans with no closure capture.
 */
export function PreConversationLoadingShell({
  connected,
  connecting,
  startingConversation,
}: {
  connected: boolean;
  connecting: boolean;
  startingConversation: boolean;
}) {
  const { formatMessage } = useHiCodexIntl();
  const appName = formatMessage({ id: "hc.app.name", defaultMessage: "HiCodex" });
  const label = startingConversation
    ? "Starting chat..."
    : connecting
      ? "Connecting runtime..."
      : !connected
        ? "Runtime offline"
        : null;
  if (!label) return null;
  return (
    <div className="hc-preconversation-shell" role="status" aria-live="polite" aria-label={`${appName}: ${label}`}>
      <div className="hc-preconversation-logo">
        <Loader2 className={startingConversation || connecting ? "hc-spin" : undefined} size={18} />
      </div>
      <span>{label}</span>
    </div>
  );
}
