import { AlertCircle, Archive, Clock3, Files, Link2, SearchCheck, Settings2, SlidersHorizontal } from "lucide-react";

export type KbLibraryWorkspaceTab =
  | "documents"
  | "pending"
  | "storage"
  | "archive"
  | "accuracy"
  | "integrations"
  | "tasks";

type TabDef = { value: KbLibraryWorkspaceTab; label: string; icon: typeof Files };

/** 主区视图：找（资料 / 档案）+ 理（待处理）。日常 90% 的操作都在这一行。 */
const PRIMARY_TABS: TabDef[] = [
  { value: "documents", label: "资料", icon: Files },
  { value: "archive", label: "档案", icon: Archive },
  { value: "pending", label: "待处理", icon: AlertCircle },
];

/** 管理（⚙）：偶尔才碰的配置与诊断，默认收起在「管理」后面。 */
const MANAGE_TABS: TabDef[] = [
  { value: "storage", label: "设置", icon: Settings2 },
  { value: "integrations", label: "来源系统", icon: Link2 },
  { value: "tasks", label: "处理记录", icon: Clock3 },
  { value: "accuracy", label: "匹配效果", icon: SearchCheck },
];

const MANAGE_VALUES: KbLibraryWorkspaceTab[] = MANAGE_TABS.map((tab) => tab.value);

export function KbLibraryWorkspaceTabs({
  active,
  onSelect,
  disabledManagement,
  counts,
}: {
  active: KbLibraryWorkspaceTab;
  onSelect: (tab: KbLibraryWorkspaceTab) => void;
  disabledManagement?: boolean;
  counts?: Partial<Record<KbLibraryWorkspaceTab, number>>;
}) {
  const manageActive = MANAGE_VALUES.includes(active);
  return (
    <div className="hc-kb-workspace-bar">
      <div className="hc-kb-workspace-tabs" role="tablist" aria-label="知识库视图">
        {PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const disabled = disabledManagement && tab.value !== "documents";
          const count = counts?.[tab.value];
          // 资料/档案显示总量（含 0）；待处理为 0 时不打扰，不显示徽标。
          const showCount =
            typeof count === "number" && (tab.value !== "pending" || count > 0);
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              className="hc-kb-workspace-tab"
              data-active={active === tab.value ? "true" : undefined}
              disabled={disabled}
              onClick={() => onSelect(tab.value)}
            >
              <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
              {tab.label}
              {showCount && (
                <span className="hc-kb-workspace-tab-count">{count}</span>
              )}
            </button>
          );
        })}
        <span className="hc-kb-workspace-spacer" aria-hidden="true" />
        <button
          type="button"
          className="hc-kb-workspace-gear"
          data-active={manageActive ? "true" : undefined}
          disabled={disabledManagement}
          aria-expanded={manageActive}
          aria-label="知识库管理"
          onClick={() => onSelect(manageActive ? "documents" : "storage")}
        >
          <SlidersHorizontal size={13} strokeWidth={2.2} aria-hidden="true" />
          管理
        </button>
      </div>
      {manageActive && (
        <div className="hc-kb-workspace-subtabs" role="tablist" aria-label="知识库管理">
          {MANAGE_TABS.map((tab) => {
            const Icon = tab.icon;
            const count = counts?.[tab.value];
            const showCount = typeof count === "number" && count > 0;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                className="hc-kb-workspace-subtab"
                data-active={active === tab.value ? "true" : undefined}
                onClick={() => onSelect(tab.value)}
              >
                <Icon size={12.5} strokeWidth={2.2} aria-hidden="true" />
                {tab.label}
                {showCount && (
                  <span className="hc-kb-workspace-tab-count">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
