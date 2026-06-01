import { type YuxiEntity } from "../lib/yuxi-client";
import {
  AUTHORITY_LABEL,
  authorityClass,
  entityTags,
  formatEntityDate,
} from "./kb-archive-model";

export function EntityTable({
  items,
  selectedId,
  onSelect,
}: {
  items: YuxiEntity[];
  selectedId: number | null;
  onSelect: (item: YuxiEntity) => void;
}) {
  return (
    <table className="hc-kb-table">
      <thead>
        <tr>
          <th style={{ width: "24%" }}>档案</th>
          <th style={{ width: "34%" }}>可用于匹配的信息</th>
          <th style={{ width: "10%", textAlign: "center" }}>来源</th>
          <th style={{ width: "12%" }}>状态</th>
          <th style={{ width: "12%" }}>更新时间</th>
          <th style={{ textAlign: "right" }}>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const entityId = item.id ?? null;
          return (
            <tr key={item.id ?? item.canonical_name} data-active={entityId != null && selectedId === entityId ? "true" : undefined} onClick={() => onSelect(item)}>
              <td>
                <div className="hc-kb-file-name">{item.canonical_name || `未命名档案 #${item.id ?? "-"}`}</div>
                {item.aliases && item.aliases.length > 0 && (
                  <div className="hc-kb-file-meta">别名 {item.aliases.slice(0, 2).join(" / ")}</div>
                )}
              </td>
              <td>
                <div className="hc-kb-tags">
                  {entityTags(item).map((tag) => <span key={tag} className="hc-kb-tag">{tag}</span>)}
                </div>
              </td>
              <td style={{ fontSize: 12, color: "var(--hc-text-secondary)", textAlign: "center" }}>
                {item.reference_count ?? 0}
              </td>
              <td>
                <span className={`hc-kb-status ${authorityClass(item.authority_status)}`}>
                  {AUTHORITY_LABEL[item.authority_status || ""] || item.authority_status || "未确认"}
                </span>
              </td>
              <td style={{ fontSize: 12, color: "var(--hc-text-secondary)" }}>{formatEntityDate(item.updated_at)}</td>
              <td>
                <div className="hc-kb-row-actions" style={{ justifyContent: "flex-end", opacity: 1 }}>
                  <button type="button" className="hc-kb-topbar-btn" style={{ height: 22, fontSize: 11 }} onClick={(event) => { event.stopPropagation(); onSelect(item); }}>
                    详情
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
