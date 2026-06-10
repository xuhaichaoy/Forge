import { Archive, BookOpen, ClipboardList, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/use-dismissible-layer";
import type { TeamServiceAuthSession } from "../lib/team-service-auth";

export type AppNavigationTab = "workbench" | "knowledge" | "ingest" | "archive" | "todo" | "remoteTask";

/**
 * 左侧全局导航 rail 中可见的 tab 列表。
 * `ingest` 旧上传页保留为内部路由；业务上传入口放在知识库当前库工具栏。
 * `remoteTask` 由程序内部触发（setActiveRemoteTaskId），不作为常规 tab 显示。
 */
const appNavigationItems: Array<{
  id: Exclude<AppNavigationTab, "ingest" | "remoteTask">;
  label: string;
  Icon: typeof LayoutDashboard;
}> = [
  { id: "workbench", label: "对话",  Icon: LayoutDashboard },
  { id: "knowledge", label: "知识库",  Icon: BookOpen },
  { id: "archive",   label: "档案中心", Icon: Archive },
  { id: "todo",      label: "待办",    Icon: ClipboardList },
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
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  useDismissibleLayer(accountOpen, accountRef, closeAccount);
  const username = productAccount?.user?.username ?? "Forge 账号";
  const role = productAccount?.user?.role ?? null;
  const accountInitial = accountInitialFromUsername(username);

  return (
    <aside className="hc-app-rail" aria-label="全部项目">
      <div className="hc-app-rail-account" ref={accountRef}>
        <button
          type="button"
          className="hc-app-rail-brand"
          aria-label="Forge 账号"
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          title="Forge 账号"
          onClick={() => setAccountOpen((current) => !current)}
        >
          {accountInitial}
        </button>
        {accountOpen && (
          <div className="hc-app-rail-account-menu" role="menu">
            <div className="hc-app-rail-account-card" role="menuitem">
              <span>Forge 账号</span>
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
              <span>退出 Forge 账号</span>
            </button>
          </div>
        )}
      </div>
      <nav className="hc-app-rail-tabs" aria-label="全部项目">
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
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {onOpenSettings && (
        <button
          type="button"
          className="hc-app-rail-settings"
          aria-label="设置"
          title="设置"
          onClick={onOpenSettings}
        >
          <Settings size={18} aria-hidden="true" strokeWidth={2.1} />
        </button>
      )}
    </aside>
  );
}

function accountInitialFromUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed || trimmed === "Forge 账号") return "H";
  return trimmed.slice(0, 1).toUpperCase();
}
