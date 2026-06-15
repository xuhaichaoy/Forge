import type { PendingServerRequest } from "../state/codex-reducer";
import { useForgeIntl } from "./i18n-provider";
import { ApprovalCard } from "./pending-request-approval-card";

export type { PendingRequestDetail } from "../state/approval-requests";
export {
  pendingRequestOptionArrowSelection,
  pendingRequestOptionSelectionAction,
  pendingRequestOptionShortcut,
  pendingRequestShouldSubmitOnEnter,
} from "./pending-request-keyboard";
export { commandPreviewText, looksLikeCommandOrPath } from "./pending-request-command-preview";
export type { ApprovalCardProps } from "./pending-request-approval-card";

export interface PendingRequestStackProps {
  pendingRequests: PendingServerRequest[];
  requestActors?: Record<string, string>;
  onRespond: (request: PendingServerRequest, accepted: boolean, answers?: Record<string, string[]>) => void | Promise<void>;
  onLog?: (text: string, level?: "info" | "warn" | "error") => void;
}

export function PendingRequestStack({
  pendingRequests,
  requestActors = {},
  onRespond,
  onLog,
}: PendingRequestStackProps) {
  const { formatMessage } = useForgeIntl();
  return (
    <section
      className="hc-pending-stack"
      aria-label={formatMessage({ id: "hc.pendingRequest.regionLabel", defaultMessage: "Pending requests" })}
    >
      {pendingRequests.map((request) => (
        <ApprovalCard
          actorLabel={requestActors[String(request.id)]}
          key={String(request.id)}
          request={request}
          onRespond={onRespond}
          onLog={onLog}
        />
      ))}
    </section>
  );
}
