import { BookOpen, LayoutDashboard, Settings } from "lucide-react";

export type AppNavigationTab = "workbench" | "knowledge" | "remoteTask";

const appNavigationItems: Array<{
  id: Exclude<AppNavigationTab, "remoteTask">;
  label: string;
  Icon: typeof LayoutDashboard;
}> = [
  { id: "workbench", label: "工作台", Icon: LayoutDashboard },
  { id: "knowledge", label: "知识库", Icon: BookOpen },
];

export function AppNavigationRail({
  activeTab,
  onOpenSettings,
  onTabChange,
}: {
  activeTab: AppNavigationTab;
  onOpenSettings?: () => void;
  onTabChange: (tab: AppNavigationTab) => void;
}) {
  return (
    <aside className="hc-app-rail" aria-label="全部项目">
      <div className="hc-app-rail-brand" aria-label="HiCodex">H</div>
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
