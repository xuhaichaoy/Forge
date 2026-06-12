import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Gauge, LogOut, Settings, X } from "lucide-react";
import { useDismissibleLayer } from "../hooks/use-dismissible-layer";
import {
  projectAccountMenuItems,
  type AccountMenuItem,
  type AccountViewModel,
} from "../state/account-state";
import {
  compactWindowLabel,
  type RateLimitCompactSummary,
} from "../state/rate-limit-summary";
import { useHiCodexIntl } from "./i18n-provider";

export function SidebarAccountSummary({
  accountView,
  resolvedUiTheme,
  onSignOut,
  onOpenSettings,
}: {
  accountView: AccountViewModel;
  resolvedUiTheme: "light" | "dark";
  onSignOut: () => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissibleLayer(open, layerRef, close);
  const { formatMessage } = useHiCodexIntl();
  const title = [
    accountView.email,
    accountView.authLabel,
    accountView.planLabel,
    accountView.quotaLabel,
    accountView.quotaDetail,
    accountView.error,
  ].filter(Boolean).join("\n");
  const items = projectAccountMenuItems(accountView);
  const actionItems = items.filter((item) => item.action);
  const infoItems = items.filter((item) => !item.action);
  const runMenuItem = (item: AccountMenuItem) => {
    if (item.action === "account/signOut") {
      if (item.disabled) return;
      // codex profile-dropdown: "Log out" opens a confirmation dialog instead of
      // signing out immediately (logOutConfirmation.*). Close the menu, ask first.
      setOpen(false);
      setConfirmingSignOut(true);
    }
  };
  const confirmSignOut = useCallback(() => {
    setConfirmingSignOut(false);
    onSignOut();
  }, [onSignOut]);
  const cancelSignOut = useCallback(() => setConfirmingSignOut(false), []);
  return (
    <div
      className="hc-sidebar-account"
      data-quota-tone={accountView.quotaTone}
      title={title || undefined}
      ref={layerRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="hc-sidebar-account-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="hc-sidebar-account-avatar" aria-hidden="true">
          {accountView.avatarInitials}
        </span>
        {/* codex profileFooter `lp`: avatar + "Settings" label (codex.profileFooter.signedInFallback);
            the account name / plan / usage live in the dropdown below, not inline. */}
        <span className="hc-sidebar-account-label">{formatMessage({ id: "codex.profileFooter.signedInFallback", defaultMessage: "Settings" })}</span>
      </button>
      {open && (
        <div className="hc-sidebar-account-menu" role="menu" data-state="open">
          {/* codex profile dropdown exposes Settings here (the footer no longer has a
              standalone Settings row); sign-out stays in `items` below. */}
          <button
            className="hc-sidebar-account-menu-item"
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); onOpenSettings(); }}
          >
            <Settings size={14} aria-hidden="true" />
            <span>{formatMessage({ id: "hc.sidebar.settings", defaultMessage: "Settings" })}</span>
          </button>
          {infoItems.map((item) => (
            <div
              className="hc-sidebar-account-menu-item"
              data-tone={item.tone}
              key={item.id}
              role="menuitem"
            >
              <span>{item.label}</span>
              {item.value && <strong>{item.value}</strong>}
            </div>
          ))}
          {accountView.rateLimitSummary && (
            <SidebarRateLimitSummary summary={accountView.rateLimitSummary} />
          )}
          {actionItems.map((item) => (
            <button
              key={item.id}
              className="hc-sidebar-account-menu-item"
              data-tone={item.tone}
              disabled={item.disabled}
              role="menuitem"
              type="button"
              onClick={() => runMenuItem(item)}
            >
              <LogOut size={14} aria-hidden="true" />
              <span>{item.label}</span>
              {item.value && <small>{item.value}</small>}
            </button>
          ))}
        </div>
      )}
      {confirmingSignOut && createPortal(
        <LogOutConfirmDialog
          resolvedUiTheme={resolvedUiTheme}
          onCancel={cancelSignOut}
          onConfirm={confirmSignOut}
        />,
        document.body,
      )}
    </div>
  );
}

/*
 * codex profile-dropdown logOutConfirmation dialog. Clean-room confirmation
 * gate shown before signing out (Codex pops the same Log out? / "You'll need to
 * sign in again…" / Log out · Cancel dialog). Reuses HiCodex's existing
 * settings-backdrop + thread-dialog-panel chrome and i18n ids that mirror
 * codex.profileDropdown.logOutConfirmation.*.
 */
function LogOutConfirmDialog({
  resolvedUiTheme,
  onCancel,
  onConfirm,
}: {
  resolvedUiTheme: "light" | "dark";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const title = formatMessage({ id: "codex.profileDropdown.logOutConfirmation.title", defaultMessage: "Log out?" });
  return (
    <div className="hc-settings-backdrop hc-log-out-confirm-backdrop" data-theme={resolvedUiTheme} role="presentation" onMouseDown={onCancel}>
      <section
        className="hc-thread-dialog-panel hc-log-out-confirm-dialog"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <header>
          <div><LogOut size={16} /> {title}</div>
          <button type="button" aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })} onClick={onCancel}><X size={16} /></button>
        </header>
        <div className="hc-thread-dialog-body">
          <span>{formatMessage({ id: "codex.profileDropdown.logOutConfirmation.subtitle", defaultMessage: "You’ll need to sign in again to keep using Codex" })}</span>
        </div>
        <footer>
          <button type="button" className="hc-mini-button ghost" onClick={onCancel}>{formatMessage({ id: "codex.profileDropdown.logOutConfirmation.cancel", defaultMessage: "Cancel" })}</button>
          <button type="button" className="hc-mini-button decline" autoFocus onClick={onConfirm}>
            {formatMessage({ id: "codex.profileDropdown.logOutConfirmation.confirm", defaultMessage: "Log out" })}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SidebarRateLimitSummary({ summary }: { summary: RateLimitCompactSummary }) {
  return (
    <div className="hc-sidebar-rate-limit-summary" role="group" aria-label={summary.heading}>
      <div className="hc-sidebar-rate-limit-summary-heading">
        <Gauge size={14} aria-hidden="true" />
        <span>{summary.heading}</span>
        {summary.remainingText && <small>{summary.remainingText}</small>}
      </div>
      <div className="hc-sidebar-rate-limit-summary-rows">
        {summary.sections.map((section) => (
          <div className="hc-sidebar-rate-limit-section" key={section.id}>
            {section.label && <div className="hc-sidebar-rate-limit-section-label">{section.label}</div>}
            {section.windows.map((window) => (
              <div className="hc-sidebar-rate-limit-row" key={`${section.id}:${window.id}`}>
                <span className="hc-sidebar-rate-limit-window">{compactWindowLabel(window.label)}</span>
                <span className="hc-sidebar-rate-limit-remaining">{window.remainingText}</span>
                {window.resetText && <small>{window.resetText}</small>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
