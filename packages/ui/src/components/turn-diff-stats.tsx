import { useForgeIntl } from "./i18n-provider";

export function TurnDiffStats({ added, removed }: { added: number; removed: number }) {
  const { formatMessage } = useForgeIntl();
  return (
    <span
      className="hc-turn-diff-stats"
      aria-label={formatMessage(
        { id: "hc.diffStats.linesAddedRemoved", defaultMessage: "{added} lines added, {removed} lines removed" },
        { added, removed },
      )}
    >
      <span className="hc-turn-diff-added">+{added}</span>
      <span className="hc-turn-diff-removed">-{removed}</span>
    </span>
  );
}
