import type { ReactNode } from "react";
import { startTopbarWindowDrag } from "../lib/window-drag";

/**
 * 资料管理系列视图（知识库 / 上传 / 档案中心）的公共页面骨架。
 *
 * 包含：
 * - `<main>` 容器（`hc-main hc-kb-main`）
 * - 顶部 `hc-topbar`：左侧标题 + 右侧可选操作按钮组
 * - `children` 区域（视图主体内容）
 *
 * 操作按钮统一使用 `hc-kb-topbar-btn` / `hc-kb-topbar-btn--primary` 类，
 * 样式定义在 `styles/kb-views.css`。
 */
export function KbPageShell({
  title,
  actions,
  children,
  ariaLabel,
}: {
  /** 顶栏标题文字 */
  title: string;
  /** 顶栏右侧操作区，传入 `<button>` 元素即可 */
  actions?: ReactNode;
  children: ReactNode;
  /** 无障碍 aria-label，默认取 title */
  ariaLabel?: string;
}) {
  return (
    <main className="hc-main hc-kb-main" aria-label={ariaLabel ?? title}>
      <header className="hc-topbar" data-tauri-drag-region onMouseDown={startTopbarWindowDrag}>
        <div className="hc-topbar-main" data-tauri-drag-region>
          <div className="hc-top-title" data-tauri-drag-region>{title}</div>
        </div>
        <div className="hc-topbar-actions" data-tauri-drag-region>
          {actions}
        </div>
      </header>
      {children}
    </main>
  );
}

/**
 * 视图内容为空时的占位状态。
 * 配合 `KbPageShell` 使用，撑满剩余高度并居中展示。
 */
export function KbEmptyState({
  icon,
  title,
  subtitle,
}: {
  /** 可选图标节点，建议传 lucide-react 图标（size=28） */
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="hc-kb-empty">
      <div className="hc-kb-empty-content">
        {icon != null && (
          <div className="hc-kb-empty-icon" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="hc-kb-empty-title">{title}</div>
        {subtitle != null && (
          <div className="hc-kb-empty-subtitle">{subtitle}</div>
        )}
      </div>
    </section>
  );
}
