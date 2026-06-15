import {
  Calendar,
  Check,
  Clock,
  Folder,
  FolderPlus,
  ListFilter,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type {
  SidebarOrganizeMode,
  SidebarSortKey,
} from "../state/sidebar-projection";
import { useForgeIntl } from "./i18n-provider";

type SidebarProjectSectionMenu = "filter" | "add-project";
type SidebarProjectSectionCollapseAction = "collapse-all" | "reopen-previous";

const threadMenuSeparatorClass = "w-full px-row-x py-1";

export function SidebarProjectSection({
  canUseExistingFolder,
  children,
  openSectionMenu,
  organizeMode,
  sectionActionsRef,
  sectionCollapseAction,
  sectionLabel,
  sortKey,
  onChooseOrganizeMode,
  onChooseSortKey,
  onRunSectionCollapseAction,
  onToggleSectionMenu,
  onUseExistingFolder,
}: {
  canUseExistingFolder: boolean;
  children: ReactNode;
  openSectionMenu: SidebarProjectSectionMenu | null;
  organizeMode: SidebarOrganizeMode;
  sectionActionsRef: RefObject<HTMLDivElement | null>;
  sectionCollapseAction: SidebarProjectSectionCollapseAction | null;
  sectionLabel: string;
  sortKey: SidebarSortKey;
  onChooseOrganizeMode: (organizeMode: SidebarOrganizeMode) => void;
  onChooseSortKey: (sortKey: SidebarSortKey) => void;
  onRunSectionCollapseAction: () => void;
  onToggleSectionMenu: (menu: SidebarProjectSectionMenu | null) => void;
  onUseExistingFolder: () => void;
}) {
  const { formatMessage } = useForgeIntl();
  const toggleMenu = (menu: SidebarProjectSectionMenu) => {
    onToggleSectionMenu(openSectionMenu === menu ? null : menu);
  };

  return (
    <>
      <div className={`hc-thread-section-header ${openSectionMenu ? "is-menu-open" : ""}`}>
        {sectionLabel
          ? <div className="hc-thread-section-label">{sectionLabel}</div>
          : <div className="hc-thread-section-label" aria-hidden="true" />}
        <div
          className="hc-thread-section-actions"
          aria-label={formatMessage({ id: "hc.sidebar.section.actions", defaultMessage: "Projects actions" })}
          ref={sectionActionsRef}
        >
          {sectionCollapseAction && (
            <button
              type="button"
              className="hc-sidebar-section-action"
              title={sectionCollapseAction === "collapse-all"
                ? formatMessage({ id: "sidebarElectron.collapseAllGroups", defaultMessage: "Collapse all" })
                : formatMessage({ id: "sidebarElectron.reopenPreviousGroups", defaultMessage: "Reopen previous" })}
              aria-label={sectionCollapseAction === "collapse-all"
                ? formatMessage({ id: "hc.sidebar.section.collapseAllProjects", defaultMessage: "Collapse all projects" })
                : formatMessage({ id: "hc.sidebar.section.reopenPreviousProjects", defaultMessage: "Reopen previous projects" })}
              onClick={onRunSectionCollapseAction}
            >
              {sectionCollapseAction === "collapse-all" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
          <button
            type="button"
            className="hc-sidebar-section-action"
            title={formatMessage({ id: "sidebarElectron.showMenu.trigger", defaultMessage: "Filter sidebar chats" })}
            aria-label={formatMessage({ id: "sidebarElectron.showMenu.trigger", defaultMessage: "Filter sidebar chats" })}
            aria-haspopup="menu"
            aria-expanded={openSectionMenu === "filter"}
            onClick={() => toggleMenu("filter")}
          >
            <ListFilter size={13} />
          </button>
          {openSectionMenu === "filter" && (
            <div className="hc-thread-menu hc-sidebar-section-menu hc-app-popover-menu" role="menu" data-state="open">
              {/* codex app-main groupByMenu: submenuTitle "Organize sidebar",
                  options "By project" (workspace) and "Chronological list" (recency).
                  Forge surfaces only the two organize modes it actually implements;
                  the self-invented "Current workspace first" item had no Codex basis. */}
              <div className="hc-thread-menu-title">{formatMessage({ id: "sidebarElectron.groupByMenu.submenuTitle", defaultMessage: "Organize sidebar" })}</div>
              <button
                type="button"
                className="hc-thread-menu-item"
                role="menuitemradio"
                aria-checked={organizeMode === "project"}
                onClick={() => onChooseOrganizeMode("project")}
              >
                <Folder size={13} />
                <span>{formatMessage({ id: "sidebarElectron.groupByMenu.workspace", defaultMessage: "By project" })}</span>
                {organizeMode === "project" && <Check size={13} className="hc-thread-menu-check" />}
              </button>
              <button
                type="button"
                className="hc-thread-menu-item"
                role="menuitemradio"
                aria-checked={organizeMode === "recent"}
                onClick={() => onChooseOrganizeMode("recent")}
              >
                <Clock size={13} />
                <span>{formatMessage({ id: "sidebarElectron.groupByMenu.recency", defaultMessage: "Chronological list" })}</span>
                {organizeMode === "recent" && <Check size={13} className="hc-thread-menu-check" />}
              </button>
              <div className={threadMenuSeparatorClass}>
                <div className="h-px w-full bg-token-menu-border" />
              </div>
              <div className="hc-thread-menu-title">{formatMessage({ id: "sidebarElectron.sortMenu.title", defaultMessage: "Sort by" })}</div>
              <button
                type="button"
                className="hc-thread-menu-item"
                role="menuitemradio"
                aria-checked={sortKey === "updated_at"}
                onClick={() => onChooseSortKey("updated_at")}
              >
                <Clock size={13} />
                <span>{formatMessage({ id: "hc.sidebar.sort.updated", defaultMessage: "Updated" })}</span>
                {sortKey === "updated_at" && <Check size={13} className="hc-thread-menu-check" />}
              </button>
              <button
                type="button"
                className="hc-thread-menu-item"
                role="menuitemradio"
                aria-checked={sortKey === "created_at"}
                onClick={() => onChooseSortKey("created_at")}
              >
                <Calendar size={13} />
                <span>{formatMessage({ id: "hc.sidebar.sort.created", defaultMessage: "Created" })}</span>
                {sortKey === "created_at" && <Check size={13} className="hc-thread-menu-check" />}
              </button>
            </div>
          )}
          {canUseExistingFolder && (
            <>
              <button
                type="button"
                className="hc-sidebar-section-action"
                title={formatMessage({ id: "sidebarElectron.addGenericWorkspaceRoot", defaultMessage: "Add new project" })}
                aria-label={formatMessage({ id: "sidebarElectron.addGenericWorkspaceRoot", defaultMessage: "Add new project" })}
                aria-haspopup="menu"
                aria-expanded={openSectionMenu === "add-project"}
                onClick={() => toggleMenu("add-project")}
              >
                <FolderPlus size={13} />
              </button>
              {openSectionMenu === "add-project" && (
                <div className="hc-thread-menu hc-sidebar-section-menu hc-app-popover-menu" role="menu" data-state="open">
                  <button
                    type="button"
                    className="hc-thread-menu-item"
                    role="menuitem"
                    onClick={onUseExistingFolder}
                  >
                    <Folder size={13} />
                    <span>{formatMessage({ id: "projectSetup.addProjectMenu.useExistingFolder", defaultMessage: "Use an existing folder" })}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {children}
    </>
  );
}

export function projectSectionCollapseAction(
  groupKeys: string[],
  collapsedGroupKeys: ReadonlySet<string>,
  previouslyExpandedGroupKeys: string[],
): SidebarProjectSectionCollapseAction | null {
  const expanded = groupKeys.filter((key) => !collapsedGroupKeys.has(key));
  if (expanded.length > 1) return "collapse-all";
  const visibleKeys = new Set(groupKeys);
  return expanded.length === 0 && previouslyExpandedGroupKeys.some((key) => visibleKeys.has(key))
    ? "reopen-previous"
    : null;
}
