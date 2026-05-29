import { Archive, BookOpen, ClipboardList, LayoutDashboard, Settings, Upload } from "lucide-react";

export type AppNavigationTab = "workbench" | "knowledge" | "ingest" | "archive" | "todo" | "remoteTask";

/**
 * 左侧全局导航 rail 中可见的 tab 列表。
 * `remoteTask` 由程序内部触发（setActiveRemoteTaskId），不作为常规 tab 显示。
 */
const appNavigationItems: Array<{
  id: Exclude<AppNavigationTab, "remoteTask">;
  label: string;
  Icon: typeof LayoutDashboard;
}> = [
  { id: "workbench", label: "工作台",  Icon: LayoutDashboard },
  { id: "knowledge", label: "知识库",  Icon: BookOpen },
  { id: "ingest",    label: "上传",    Icon: Upload },
  { id: "archive",   label: "档案中心", Icon: Archive },
  { id: "todo",      label: "待办",    Icon: ClipboardList },
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
