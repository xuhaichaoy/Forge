import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, Tag, X } from "lucide-react";
import {
  downloadYuxiKnowledgeDocument,
  listYuxiLibraryDocuments,
  readYuxiConnectionConfig,
  searchYuxiLibrary,
  type YuxiBusinessLine,
  type YuxiLibraryDocument,
  type YuxiSearchGroup,
  YUXI_CATEGORIES,
  yuxiBusinessLineLabel,
  yuxiCategoryMeta,
} from "../lib/yuxi-client";
import { KbYuxiConnectionControl } from "./kb-page-shell";

type BizLine = "all" | YuxiBusinessLine;

interface FileRow {
  id: string;
  name: string;
  ext: "DOC" | "PDF" | "PPT" | "XLS" | "MD" | "TXT";
  date: string;
  source: string;
  categories: Array<{ label: string; kind: "instructor" | "course" | "case" | "customer" | "proposal" | "bid" }>;
  bizLine: BizLine;
  raw: YuxiLibraryDocument;
}

const SEARCH_HINTS = [
  "金融行业讲师",
  "近期赢标案例",
  "含 PPT 的方案模板",
  "新能源行业案例",
] as const;

const INDUSTRIES = ["金融 / 银行", "证券 / 保险", "消费品 / 零售", "制造业", "新能源", "互联网"];
const PERIODS = ["近 3 个月", "近 1 年", "1-2 年", "2+ 年"];

function FileIcon({ ext }: { ext: FileRow["ext"] }) {
  const cls = {
    DOC: "hc-kb-file-icon--doc",
    PDF: "hc-kb-file-icon--pdf",
    PPT: "hc-kb-file-icon--ppt",
    XLS: "hc-kb-file-icon--xls",
    MD: "hc-kb-file-icon--md",
    TXT: "hc-kb-file-icon--txt",
  }[ext];
  return <span className={`hc-kb-file-icon ${cls}`}>{ext}</span>;
}

export function KbLibraryView() {
  const [bizLine, setBizLine] = useState<BizLine>("all");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [activeIndustry, setActiveIndustry] = useState<string>("all");
  const [activePeriod, setActivePeriod] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<YuxiLibraryDocument[]>([]);
  const [allDocuments, setAllDocuments] = useState<YuxiLibraryDocument[]>([]);
  const [searchGroups, setSearchGroups] = useState<YuxiSearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const businessLine = bizLine === "all" ? null : bizLine;
  const category = activeCat === "all" ? null : activeCat;
  const searchText = searchQuery.trim();
  const currentCats = YUXI_CATEGORIES.filter((cat) => cat.line === (bizLine === "bidding" ? "bidding" : "training_presales"));

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allPromise = listYuxiLibraryDocuments({ limit: 500 });
      if (searchText) {
        const [all, filtered] = await Promise.all([
          allPromise,
          searchYuxiLibrary({ query: searchText, businessLine, category, maxKbs: 16 }),
        ]);
        setAllDocuments(all.items ?? []);
        setDocuments([]);
        setSearchGroups(filtered.groups ?? []);
        setLastUpdatedAt(Date.now());
        return;
      }
      const [all, filtered] = await Promise.all([
        allPromise,
        listYuxiLibraryDocuments({ businessLine, category, limit: 500 }),
      ]);
      setAllDocuments(all.items ?? []);
      setDocuments(filtered.items ?? []);
      setSearchGroups([]);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDocuments([]);
      setSearchGroups([]);
    } finally {
      setLoading(false);
    }
  }, [businessLine, category, searchText]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const rows = useMemo(() => documents.map(toFileRow), [documents]);
  const totalCount = allDocuments.length;
  const presalesCount = allDocuments.filter((file) => file.business_line === "training_presales").length;
  const bidCount = allDocuments.filter((file) => file.business_line === "bidding").length;
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of allDocuments) {
      if (!file.category) continue;
      counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
    }
    return counts;
  }, [allDocuments]);

  const handleDownload = useCallback(async (file: FileRow) => {
    setError(null);
    try {
      const blob = await downloadYuxiKnowledgeDocument(file.raw);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const connection = readYuxiConnectionConfig();
  const updatedLabel = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <main className="hc-main hc-kb-main" aria-label="知识库浏览">
      <header className="hc-topbar">
        <div className="hc-topbar-main">
          <span className="hc-kb-topbar-stats">
            <strong>{totalCount} 条资料</strong>
            {updatedLabel && <span className="hc-kb-topbar-stats-badge">已同步 {updatedLabel}</span>}
          </span>
        </div>
        <div className="hc-topbar-actions">
          <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadDocuments()} disabled={loading} aria-label="同步平台数据">
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            {loading ? "同步中" : "同步数据"}
          </button>
          <KbYuxiConnectionControl />
        </div>
      </header>

      <div className="hc-kb-body">
        <aside className="hc-kb-filters" aria-label="筛选条件">
          <div className="hc-kb-filter-section">
            <div className="hc-kb-filter-label">业务线</div>
            {([
              { id: "all", label: "全部", count: totalCount },
              { id: "training_presales", label: "售前", count: presalesCount },
              { id: "bidding", label: "投标", count: bidCount },
            ] as const).map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                className="hc-kb-filter-opt"
                data-active={bizLine === id ? "true" : undefined}
                onClick={() => { setBizLine(id); setActiveCat("all"); }}
              >
                {label}
                <span className="hc-kb-filter-opt-count">{count}</span>
              </button>
            ))}
          </div>

          <div className="hc-kb-filter-section">
            <div className="hc-kb-filter-label">分类</div>
            <button type="button" className="hc-kb-filter-opt" data-active={activeCat === "all" ? "true" : undefined} onClick={() => setActiveCat("all")}>
              全部分类
            </button>
            {currentCats.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className="hc-kb-filter-opt"
                data-active={activeCat === key ? "true" : undefined}
                onClick={() => setActiveCat(key)}
              >
                {label}
                <span className="hc-kb-filter-opt-count">{categoryCounts.get(key) ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="hc-kb-filter-section">
            <div className="hc-kb-filter-label">行业</div>
            <button type="button" className="hc-kb-filter-opt" data-active={activeIndustry === "all" ? "true" : undefined} onClick={() => setActiveIndustry("all")}>
              全部行业
            </button>
            {INDUSTRIES.map((ind) => (
              <button key={ind} type="button" className="hc-kb-filter-opt" data-active={activeIndustry === ind ? "true" : undefined} onClick={() => setActiveIndustry(ind)}>
                {ind}
              </button>
            ))}
          </div>

          <div className="hc-kb-filter-section">
            <div className="hc-kb-filter-label">时效</div>
            <button type="button" className="hc-kb-filter-opt" data-active={activePeriod === "all" ? "true" : undefined} onClick={() => setActivePeriod("all")}>
              全部
            </button>
            {PERIODS.map((p) => (
              <button key={p} type="button" className="hc-kb-filter-opt" data-active={activePeriod === p ? "true" : undefined} onClick={() => setActivePeriod(p)}>
                {p}
              </button>
            ))}
          </div>
        </aside>

        <div className="hc-kb-results-area">
          <div className="hc-kb-search-section">
            <div className="hc-kb-search-wrap">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                className="hc-kb-search hc-kb-search--prominent"
                placeholder="自然语言检索：讲师资料、案例、方案、招标…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="搜索知识库"
              />
              {searchQuery && (
                <button type="button" className="hc-kb-search-clear" onClick={() => setSearchQuery("")} aria-label="清除搜索">
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
            {!searchQuery && (
              <div className="hc-kb-search-hints">
                <span className="hc-kb-search-hint-label">试试：</span>
                {SEARCH_HINTS.map((hint) => (
                  <button key={hint} type="button" className="hc-kb-search-hint-chip" onClick={() => setSearchQuery(hint)}>
                    {hint}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <div className="hc-kb-inline-alert" data-tone="danger">
                {error} · 当前地址 {connection.baseUrl}
              </div>
            )}
          </div>

          <div className="hc-kb-line-tabs" role="tablist" aria-label="业务线">
            {([
              { id: "all", label: "全部", count: totalCount },
              { id: "training_presales", label: "售前", count: presalesCount },
              { id: "bidding", label: "投标", count: bidCount },
            ] as const).map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="hc-kb-line-tab"
                data-active={bizLine === id ? "true" : undefined}
                aria-selected={bizLine === id}
                onClick={() => { setBizLine(id); setActiveCat("all"); }}
              >
                {label}
                <span className="hc-kb-line-tab-count">{count}</span>
              </button>
            ))}
          </div>

          {bizLine !== "all" && (
            <div className="hc-kb-cat-tabs" role="tablist" aria-label="分类">
              <button type="button" role="tab" className="hc-kb-cat-tab" data-active={activeCat === "all" ? "true" : undefined} aria-selected={activeCat === "all"} onClick={() => setActiveCat("all")}>
                全部
              </button>
              {currentCats.map(({ key, label }) => (
                <button key={key} type="button" role="tab" className="hc-kb-cat-tab" data-active={activeCat === key ? "true" : undefined} aria-selected={activeCat === key} onClick={() => setActiveCat(key)}>
                  {label}
                  <span className="hc-kb-cat-tab-count">{categoryCounts.get(key) ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          <div className="hc-kb-table-wrap">
            {searchText ? (
              <SearchResultsTable groups={searchGroups} loading={loading} />
            ) : rows.length === 0 ? (
              <div className="hc-kb-empty">
                <div className="hc-kb-empty-content">
                  <div className="hc-kb-empty-title">{loading ? "正在读取知识库" : "暂无匹配资料"}</div>
                  <div className="hc-kb-empty-subtitle">{loading ? "正在连接 Yuxi 后端。" : "尝试调整筛选条件或同步数据。"}</div>
                </div>
              </div>
            ) : (
              <table className="hc-kb-table">
                <thead>
                  <tr>
                    <th style={{ width: "36%" }}>原文件 / 资料</th>
                    <th style={{ width: "28%" }}>分类 · 相关对象</th>
                    <th style={{ width: "12%" }}>来源</th>
                    <th style={{ width: "10%", textAlign: "right" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
                          <FileIcon ext={file.ext} />
                          <div>
                            <div className="hc-kb-file-name">{file.name}</div>
                            <div className="hc-kb-file-meta">{file.date}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="hc-kb-tags">
                          {file.categories.map((cat) => (
                            <span key={cat.label} className={`hc-kb-tag hc-kb-tag--${cat.kind}`}>
                              {cat.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="hc-kb-tag">{file.source}</span>
                      </td>
                      <td>
                        <div className="hc-kb-row-actions" style={{ justifyContent: "flex-end" }}>
                          <button type="button" className="hc-kb-row-btn" title="下载原文件" aria-label={`下载 ${file.name}`} onClick={() => void handleDownload(file)}>
                            <Download size={13} strokeWidth={2.2} aria-hidden="true" />
                          </button>
                          <button type="button" className="hc-kb-row-btn" title="改分类" aria-label={`更改 ${file.name} 的分类`}>
                            <Tag size={13} strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SearchResultsTable({ groups, loading }: { groups: YuxiSearchGroup[]; loading: boolean }) {
  const rows = groups.flatMap((group) => (group.results ?? []).map((result, index) => ({
    id: `${group.business_line ?? "line"}:${group.category ?? "cat"}:${result.db_id ?? index}`,
    kbName: result.kb_name || result.db_id || "知识库",
    category: group.label || yuxiCategoryMeta(group.category)?.label || group.category || "未分类",
    businessLine: yuxiBusinessLineLabel(group.business_line),
    result: summarizeSearchResult(result.result),
  })));
  if (rows.length === 0) {
    return (
      <div className="hc-kb-empty">
        <div className="hc-kb-empty-content">
          <div className="hc-kb-empty-title">{loading ? "正在检索知识库" : "暂无检索结果"}</div>
          <div className="hc-kb-empty-subtitle">{loading ? "正在连接 Yuxi 检索接口。" : "换一个关键词或放宽筛选条件。"}</div>
        </div>
      </div>
    );
  }
  return (
    <table className="hc-kb-table">
      <thead>
        <tr>
          <th style={{ width: "22%" }}>知识库</th>
          <th style={{ width: "18%" }}>分类</th>
          <th>检索结果</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <div className="hc-kb-file-name">{row.kbName}</div>
              <div className="hc-kb-file-meta">{row.businessLine}</div>
            </td>
            <td><span className="hc-kb-tag">{row.category}</span></td>
            <td style={{ fontSize: 12, color: "var(--hc-text-secondary)", lineHeight: 1.5 }}>{row.result}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function toFileRow(file: YuxiLibraryDocument): FileRow {
  const meta = yuxiCategoryMeta(file.category);
  const name = file.filename || file.file_id || "未命名资料";
  return {
    id: `${file.db_id ?? "db"}:${file.file_id ?? name}`,
    name,
    ext: fileExt(name, file.file_type),
    date: formatDate(file.created_at),
    source: file.kb_name || "Yuxi",
    bizLine: file.business_line === "training_presales" || file.business_line === "bidding" ? file.business_line : "all",
    categories: [
      meta ? { label: meta.label, kind: meta.kind } : { label: file.category || "未分类", kind: "proposal" },
      file.kb_name ? { label: file.kb_name, kind: "proposal" } : null,
    ].filter((item): item is FileRow["categories"][number] => item != null),
    raw: file,
  };
}

function fileExt(filename: string, fileType: string | null | undefined): FileRow["ext"] {
  const suffix = (fileType || filename.split(".").pop() || "").toLowerCase();
  if (["doc", "docx"].includes(suffix)) return "DOC";
  if (suffix === "pdf") return "PDF";
  if (["ppt", "pptx"].includes(suffix)) return "PPT";
  if (["xls", "xlsx", "csv"].includes(suffix)) return "XLS";
  if (["md", "markdown"].includes(suffix)) return "MD";
  return "TXT";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "未记录时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function summarizeSearchResult(value: unknown): string {
  if (typeof value === "string") return trimLong(value);
  if (Array.isArray(value)) {
    return trimLong(value.map((item) => summarizeSearchResult(item)).filter(Boolean).join("\n"));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "answer", "summary", "chunk"]) {
      if (typeof record[key] === "string") return trimLong(record[key]);
    }
    return trimLong(JSON.stringify(value));
  }
  return "无文本摘要";
}

function trimLong(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 420 ? `${compact.slice(0, 420)}...` : compact;
}
