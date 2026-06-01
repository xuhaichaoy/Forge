import { useState, type ReactNode } from "react";
import { Settings2, X } from "lucide-react";
import {
  readYuxiConnectionConfig,
  writeYuxiConnectionConfig,
  type YuxiConnectionConfig,
} from "../lib/yuxi-client";
import { isYuxiMockEnabled, setYuxiMockState } from "../lib/yuxi-mock";

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
      <header className="hc-topbar">
        <div className="hc-topbar-main">
          <div className="hc-top-title">{title}</div>
        </div>
        <div className="hc-topbar-actions">
          {actions}
          <KbYuxiConnectionControl />
        </div>
      </header>
      {children}
    </main>
  );
}

export function KbYuxiConnectionControl() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<YuxiConnectionConfig>(() => readYuxiConnectionConfig());
  const [mock, setMock] = useState<boolean>(() => isYuxiMockEnabled(readYuxiConnectionConfig()));
  const save = () => {
    writeYuxiConnectionConfig(draft);
    setYuxiMockState(mock);
    setOpen(false);
    if (typeof window !== "undefined") window.location.reload();
  };
  return (
    <div className="hc-kb-connection">
      <button
        type="button"
        className="hc-kb-topbar-btn"
        aria-label="系统连接设置"
        title="系统连接设置"
        onClick={() => {
          const config = readYuxiConnectionConfig();
          setDraft(config);
          setMock(isYuxiMockEnabled(config));
          setOpen((value) => !value);
        }}
      >
        <Settings2 size={13} strokeWidth={2.2} aria-hidden="true" />
        系统
      </button>
      {open && (
        <div className="hc-kb-connection-popover" role="dialog" aria-label="系统连接设置">
          <div className="hc-kb-connection-header">
            <span>来源系统连接</span>
            <button type="button" className="hc-kb-row-btn" aria-label="关闭" onClick={() => setOpen(false)}>
              <X size={13} aria-hidden="true" />
            </button>
          </div>
          <label className="hc-kb-connection-field">
            <span>系统地址</span>
            <input
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              placeholder="http://127.0.0.1:5050"
            />
          </label>
          <label className="hc-kb-connection-field">
            <span>访问凭证</span>
            <input
              value={draft.token}
              onChange={(event) => setDraft({ ...draft, token: event.target.value })}
              type="password"
              placeholder="yxkey_..."
            />
          </label>
          <label
            className="hc-kb-connection-field"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <span>演示数据（内置示例）</span>
            <input
              type="checkbox"
              checked={mock}
              onChange={(event) => setMock(event.target.checked)}
              style={{ width: 16, height: 16 }}
            />
          </label>
          <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "var(--hc-text-secondary)", lineHeight: 1.5 }}>
            {mock ? "正在使用内置示例数据，无需后端。" : "连接真实来源系统，关闭示例数据。"}保存后会刷新页面生效。
          </p>
          <div className="hc-kb-connection-actions">
            <button type="button" className="hc-kb-topbar-btn" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" onClick={save}>保存</button>
          </div>
        </div>
      )}
    </div>
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
