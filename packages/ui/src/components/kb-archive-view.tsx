import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { KbPageShell } from "./kb-page-shell";
import {
  listYuxiEntities,
  type YuxiEntity,
  type YuxiEntityType,
  yuxiEntityTypeLabel,
} from "../lib/yuxi-client";

type EntityTab = "teacher" | "course" | "case" | "customer";

interface TabConfig {
  id: EntityTab;
  label: string;
  searchPlaceholder: string;
  hints: readonly string[];
  filters: Array<{ label: string; options: readonly string[] }>;
}

const TABS: TabConfig[] = [
  {
    id: "teacher",
    label: "讲师",
    searchPlaceholder: "搜索讲师、可授课程、服务客户或项目关系…",
    hints: ["王老师讲过的课", "金融行业讲师", "报价 <= 3 万", "有制造业经验的讲师"],
    filters: [
      { label: "专长领域", options: ["AI", "领导力", "财务管理", "消费品营销"] },
      { label: "常驻区域", options: ["华北", "华东", "华南", "华中"] },
      { label: "报价区间", options: ["<= 2 万", "2-3 万", "3 万+"] },
      { label: "排序", options: ["被提及次数", "反馈分", "最近活跃"] },
    ],
  },
  {
    id: "course",
    label: "课程",
    searchPlaceholder: "搜索课程、可授讲师、采购客户或历史项目…",
    hints: ["金融领导力课程可授讲师", "某客户采购过的课程", ">= 4.5 分课程"],
    filters: [
      { label: "课程类别", options: ["领导力", "AI / 数字化", "营销", "财务"] },
      { label: "目标人群", options: ["高管", "中层", "基层"] },
      { label: "学时", options: ["<= 8h", "8-16h", "16h+"] },
      { label: "排序", options: ["被提及次数", "反馈分", "采购次数"] },
    ],
  },
  {
    id: "case",
    label: "案例",
    searchPlaceholder: "搜索案例、关联客户、参与讲师或复用方案…",
    hints: ["金融客户历史高管培训", "同行业复盘案例", "近一年赢标案例"],
    filters: [
      { label: "行业", options: ["金融", "制造业", "互联网", "新能源"] },
      { label: "项目类型", options: ["高管培训", "中层培训", "专项"] },
      { label: "结案时间", options: ["近 3 月", "近 1 年", "1 年+"] },
      { label: "排序", options: ["被提及次数", "反馈分", "结案时间"] },
    ],
  },
  {
    id: "customer",
    label: "客户",
    searchPlaceholder: "搜索客户、历史项目、采购课程或服务讲师…",
    hints: ["金融客户采购过的课程", "采购过高管培训的客户", "复购客户项目"],
    filters: [
      { label: "行业", options: ["金融", "制造业", "互联网", "新能源"] },
      { label: "客户层级", options: ["战略", "重点", "普通"] },
      { label: "合作状态", options: ["活跃", "休眠", "流失风险"] },
      { label: "排序", options: ["项目数", "合同额", "最近触达"] },
    ],
  },
];

const AUTHORITY_LABEL: Record<string, string> = {
  authoritative: "权威",
  candidate: "候选",
  stale: "过期",
  unconfirmed: "未确认",
};

export function KbArchiveView() {
  const [activeTab, setActiveTab] = useState<EntityTab>("teacher");
  const [queries, setQueries] = useState<Record<EntityTab, string>>({
    teacher: "",
    course: "",
    case: "",
    customer: "",
  });
  const [items, setItems] = useState<YuxiEntity[]>([]);
  const [counts, setCounts] = useState<Record<EntityTab, number>>({
    teacher: 0,
    course: 0,
    case: 0,
    customer: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tab = TABS.find((item) => item.id === activeTab)!;
  const query = queries[activeTab];
  const setQuery = (value: string) => setQueries((prev) => ({ ...prev, [activeTab]: value }));

  const loadEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [current, teacher, course, caseItems, customer] = await Promise.all([
        listYuxiEntities({ type: activeTab as YuxiEntityType, query: query.trim() || null, limit: 80 }),
        listYuxiEntities({ type: "teacher", limit: 1 }),
        listYuxiEntities({ type: "course", limit: 1 }),
        listYuxiEntities({ type: "case", limit: 1 }),
        listYuxiEntities({ type: "customer", limit: 1 }),
      ]);
      setItems(current.items ?? []);
      setCounts({
        teacher: teacher.total ?? 0,
        course: course.total ?? 0,
        case: caseItems.total ?? 0,
        customer: customer.total ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, query]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  const pendingCount = useMemo(() => items.filter((item) => item.authority_status !== "authoritative").length, [items]);

  return (
    <KbPageShell
      title="档案中心"
      ariaLabel="实体档案管理"
      actions={
        <>
          <div className="hc-kb-topbar-stats">
            <strong>{counts.teacher.toLocaleString()}</strong> 讲师 ·{" "}
            <strong>{counts.course.toLocaleString()}</strong> 课程 ·{" "}
            <strong>{counts.case.toLocaleString()}</strong> 案例 ·{" "}
            <strong>{counts.customer.toLocaleString()}</strong> 客户
            {pendingCount > 0 && (
              <span className="hc-kb-topbar-stats-badge" style={{ background: "#fef9c3", color: "#854d0e" }}>
                {pendingCount} 条待确认
              </span>
            )}
          </div>
          <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadEntities()} disabled={loading}>
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            {loading ? "刷新中" : "刷新"}
          </button>
        </>
      }
    >
      <div className="hc-kb-line-tabs" role="tablist" aria-label="实体类型">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="hc-kb-line-tab"
            data-active={activeTab === id ? "true" : undefined}
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            {label}
            <span className="hc-kb-line-tab-count">{counts[id].toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="hc-kb-archive-content">
        <div className="hc-kb-search-section">
          <div className="hc-kb-search-wrap">
            <Search size={14} aria-hidden="true" />
            <input
              key={activeTab}
              type="search"
              className="hc-kb-search hc-kb-search--prominent"
              placeholder={tab.searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={`搜索${tab.label}`}
            />
            {query && (
              <button type="button" className="hc-kb-search-clear" onClick={() => setQuery("")} aria-label="清除搜索">
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>
          {!query && (
            <div className="hc-kb-search-hints">
              <span className="hc-kb-search-hint-label">试试：</span>
              {tab.hints.map((hint) => (
                <button key={hint} type="button" className="hc-kb-search-hint-chip" onClick={() => setQuery(hint)}>
                  {hint}
                </button>
              ))}
            </div>
          )}
          {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}
        </div>

        <div className="hc-kb-entity-filters">
          {tab.filters.map(({ label, options }) => (
            <select key={label} className="hc-kb-entity-filter" aria-label={label}>
              <option>{label}</option>
              {options.map((option) => <option key={option}>{option}</option>)}
            </select>
          ))}
        </div>

        <div className="hc-kb-table-wrap">
          {items.length === 0 ? (
            <div className="hc-kb-empty">
              <div className="hc-kb-empty-content">
                <div className="hc-kb-empty-title">{loading ? "正在读取档案" : "暂无实体档案"}</div>
                <div className="hc-kb-empty-subtitle">实体抽取和对齐完成后会出现在当前分类下。</div>
              </div>
            </div>
          ) : (
            <EntityTable items={items} />
          )}
        </div>
      </div>
    </KbPageShell>
  );
}

function EntityTable({ items }: { items: YuxiEntity[] }) {
  return (
    <table className="hc-kb-table">
      <thead>
        <tr>
          <th style={{ width: "22%" }}>档案</th>
          <th style={{ width: "30%" }}>摘要 / 标签</th>
          <th style={{ width: "10%", textAlign: "center" }}>引用</th>
          <th style={{ width: "12%" }}>状态</th>
          <th style={{ width: "14%" }}>更新时间</th>
          <th style={{ textAlign: "right" }}>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id ?? item.canonical_name}>
            <td>
              <div className="hc-kb-file-name">{item.canonical_name || `实体 #${item.id ?? "-"}`}</div>
              <div className="hc-kb-file-meta">
                {yuxiEntityTypeLabel(item.entity_type)}
                {item.aliases && item.aliases.length > 0 ? ` · ${item.aliases.slice(0, 2).join(" / ")}` : ""}
              </div>
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
            <td style={{ fontSize: 12, color: "var(--hc-text-secondary)" }}>{formatDate(item.updated_at)}</td>
            <td>
              <div className="hc-kb-row-actions" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="hc-kb-topbar-btn" style={{ height: 22, fontSize: 11 }}>
                  查看档案
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function entityTags(item: YuxiEntity): string[] {
  const tags: string[] = [];
  if (item.description) tags.push(trimTag(item.description));
  const attrs = item.attributes ?? {};
  for (const value of Object.values(attrs)) {
    if (tags.length >= 4) break;
    if (typeof value === "string" && value.trim()) tags.push(trimTag(value));
    if (Array.isArray(value)) {
      for (const part of value) {
        if (tags.length >= 4) break;
        if (typeof part === "string" && part.trim()) tags.push(trimTag(part));
      }
    }
  }
  return tags.length > 0 ? tags : ["暂无摘要"];
}

function trimTag(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 16 ? `${compact.slice(0, 16)}...` : compact;
}

function authorityClass(status: string | null | undefined): string {
  if (status === "authoritative") return "hc-kb-status--ok";
  if (status === "stale") return "hc-kb-status--archive";
  return "hc-kb-status--pending";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}
