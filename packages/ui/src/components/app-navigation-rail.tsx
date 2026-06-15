import { Archive, BookOpen, ClipboardList, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/use-dismissible-layer";
import type { TeamServiceAuthSession } from "../lib/team-service-auth";
import type { I18nMessageDescriptor } from "../state/i18n";
import { useForgeIntl } from "./i18n-provider";

export type AppNavigationTab = "workbench" | "knowledge" | "ingest" | "archive" | "todo" | "remoteTask";

/**
 * 左侧全局导航 rail 中可见的 tab 列表。
 * `ingest` 旧上传页保留为内部路由；业务上传入口放在知识库当前库工具栏。
 * `remoteTask` 由程序内部触发（setActiveRemoteTaskId），不作为常规 tab 显示。
 */
const appNavigationItems: Array<{
  id: Exclude<AppNavigationTab, "ingest" | "remoteTask">;
  label: I18nMessageDescriptor;
  Icon: typeof LayoutDashboard;
}> = [
  { id: "workbench", label: { id: "sidebarElectron.recentChats", defaultMessage: "Chats" }, Icon: LayoutDashboard },
  { id: "knowledge", label: { id: "hc.nav.knowledge", defaultMessage: "Knowledge Base" }, Icon: BookOpen },
  { id: "archive",   label: { id: "hc.nav.archive", defaultMessage: "Archive Center" }, Icon: Archive },
  { id: "todo",      label: { id: "hc.nav.todo", defaultMessage: "To-dos" }, Icon: ClipboardList },
];

export function AppNavigationRail({
  activeTab,
  onOpenSettings,
  onProductSignOut,
  productAccount,
  onTabChange,
}: {
  activeTab: AppNavigationTab;
  onOpenSettings?: () => void;
  onProductSignOut?: () => void;
  productAccount?: TeamServiceAuthSession | null;
  onTabChange: (tab: AppNavigationTab) => void;
}) {
  const { formatMessage } = useForgeIntl();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  useDismissibleLayer(accountOpen, accountRef, closeAccount);
  const accountLabel = formatMessage({ id: "hc.nav.forgeAccount", defaultMessage: "Forge account" });
  const allProjectsLabel = formatMessage({ id: "hc.nav.allProjects", defaultMessage: "All projects" });
  const settingsLabel = formatMessage({ id: "settings.nav.ariaLabel", defaultMessage: "Settings" });
  const rawUsername = productAccount?.user?.username ?? null;
  const username = rawUsername ?? accountLabel;
  const role = productAccount?.user?.role ?? null;
  const accountInitial = accountInitialFromUsername(rawUsername);

  return (
    <aside className="hc-app-rail" aria-label={allProjectsLabel}>
      <div className="hc-app-rail-account" ref={accountRef}>
        <button
          type="button"
          className="hc-app-rail-brand"
          aria-label={accountLabel}
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          title={accountLabel}
          onClick={() => setAccountOpen((current) => !current)}
        >
          {accountInitial}
        </button>
        {accountOpen && (
          <div className="hc-app-rail-account-menu" role="menu">
            <div className="hc-app-rail-account-card" role="menuitem">
              <span>{accountLabel}</span>
              <strong>{username}</strong>
              {role ? <small>{role}</small> : null}
            </div>
            <button
              type="button"
              className="hc-app-rail-account-action"
              role="menuitem"
              onClick={() => {
                setAccountOpen(false);
                onProductSignOut?.();
              }}
            >
              <LogOut size={14} aria-hidden="true" />
              <span>{formatMessage({ id: "hc.nav.signOutForgeAccount", defaultMessage: "Sign out of Forge account" })}</span>
            </button>
          </div>
        )}
      </div>
      <nav className="hc-app-rail-tabs" aria-label={allProjectsLabel}>
        {appNavigationItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="hc-app-rail-tab"
            data-active={activeTab === id ? "true" : undefined}
            aria-current={activeTab === id ? "page" : undefined}
            onClick={() => onTabChange(id)}
          >
            <Icon size={18} aria-hidden="true" strokeWidth={2.2} />
            <span>{formatMessage(label)}</span>
          </button>
        ))}
      </nav>
      {onOpenSettings && (
        <button
          type="button"
          className="hc-app-rail-settings"
          aria-label={settingsLabel}
          title={settingsLabel}
          onClick={onOpenSettings}
        >
          <Settings size={18} aria-hidden="true" strokeWidth={2.1} />
        </button>
      )}
    </aside>
  );
}

/**
 * 账号头像字母：有真实用户名取首字母，否则（未登录 fallback 文案）固定 "H"。
 * 原实现用 `username === "Forge 账号"` 字符串哨兵判定 fallback；i18n 后文案随
 * locale 变化，哨兵失效，改为直接以"是否有原始用户名"判定。
 */
function accountInitialFromUsername(username: string | null): string {
  const trimmed = username?.trim() ?? "";
  if (!trimmed) return "H";
  return trimmed.slice(0, 1).toUpperCase();
}
