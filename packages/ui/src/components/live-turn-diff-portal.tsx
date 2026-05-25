import { TurnDiffBlock } from "./event-unit";

export interface LiveTurnDiffPortalProps {
  diff: string;
  isThreadRunning: boolean;
  hasBlockingRequest: boolean;
  conversationDetailLevel?: "STEPS_COMMANDS" | "STEPS_PROSE";
  onOpenDiff?: (filePath?: string) => void;
}

export function shouldRenderLiveTurnDiffPortal({
  diff,
  isThreadRunning,
  hasBlockingRequest,
  conversationDetailLevel = "STEPS_COMMANDS",
}: Pick<LiveTurnDiffPortalProps, "diff" | "isThreadRunning" | "hasBlockingRequest" | "conversationDetailLevel">): boolean {
  return Boolean(
    isThreadRunning
      && !hasBlockingRequest
      && conversationDetailLevel !== "STEPS_PROSE"
      && diff.trim().length > 0,
  );
}

export function LiveTurnDiffPortal({
  diff,
  isThreadRunning,
  hasBlockingRequest,
  conversationDetailLevel = "STEPS_COMMANDS",
  onOpenDiff,
}: LiveTurnDiffPortalProps) {
  if (!shouldRenderLiveTurnDiffPortal({
    diff,
    isThreadRunning,
    hasBlockingRequest,
    conversationDetailLevel,
  })) {
    return null;
  }

  return (
    <div className="hc-live-turn-diff-portal">
      <TurnDiffBlock
        contentSearchUnitKey="live-turn-diff"
        inProgress
        itemIds="live-turn-diff"
        onOpenDiff={onOpenDiff}
        value={diff.trim()}
      />
    </div>
  );
}
