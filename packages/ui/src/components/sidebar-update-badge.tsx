import type { I18nMessageDescriptor, I18nValues } from "../state/i18n";

type SidebarMessageFormatter = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;

export interface SidebarUpdateAvailable {
  version: string;
  progress?: number | null;
  error?: string | null;
}

export interface SidebarUpdateBadgeProps {
  formatMessage: SidebarMessageFormatter;
  onApplyUpdate?: () => void | Promise<void>;
  updateAvailable: SidebarUpdateAvailable | null | undefined;
}

export function SidebarUpdateBadge({
  formatMessage,
  onApplyUpdate,
  updateAvailable,
}: SidebarUpdateBadgeProps) {
  if (!updateAvailable) return null;
  const downloading = typeof updateAvailable.progress === "number";
  const pct = downloading ? Math.round((updateAvailable.progress ?? 0) * 100) : null;
  const label = updateAvailable.error
    ? formatMessage({ id: "hc.sidebar.update.failed", defaultMessage: "Update failed" })
    : downloading
      ? formatMessage({ id: "hc.sidebar.update.downloading", defaultMessage: "Updating {pct}%" }, { pct })
      : formatMessage({ id: "hc.sidebar.update.available", defaultMessage: "Update v{version}" }, { version: updateAvailable.version });
  return (
    <button
      type="button"
      className="hc-sidebar-update-badge"
      title={updateAvailable.error ?? formatMessage({ id: "hc.sidebar.update.installTooltip", defaultMessage: "Install v{version} and restart" }, { version: updateAvailable.version })}
      disabled={downloading}
      onClick={() => { void onApplyUpdate?.(); }}
    >
      <span className="hc-sidebar-update-dot" aria-hidden />
      <span className="hc-sidebar-update-label">{label}</span>
    </button>
  );
}
