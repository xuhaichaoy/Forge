import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { KbPageShell } from "./kb-page-shell";
import {
  listYuxiPendingQueue,
  type YuxiPendingItem,
  type YuxiPendingQueue,
} from "../lib/yuxi-client";

type TodoStatus = "duplicate" | "pick" | "classify" | "error";
type TodoSource = "upload" | "ai-id" | "ai-cat" | "doc-err";

interface TodoItem {
  id: string;
  title: string;
  source: TodoSource;
  reason: string;
  status: TodoStatus;
  actionLabel: string;
}

const SOURCE_LABEL: Record<TodoSource, string> = {
  upload: "资料上传",
  "ai-id": "AI 识别",
  "ai-cat": "AI 分类",
  "doc-err": "文档异常",
};

const STATUS_LABEL: Record<TodoStatus, string> = {
  duplicate: "重复待确认",
  pick: "待选择",
  classify: "待分类",
  error: "读不出内容",
};

const STATUS_CSS: Record<TodoStatus, string> = {
  duplicate: "hc-kb-status--pending",
  pick: "hc-kb-status--pending",
  classify: "hc-kb-status--pending",
  error: "hc-kb-status--fail",
};

export function KbTodoView() {
  const [queues, setQueues] = useState<Record<YuxiPendingQueue, YuxiPendingItem[]>>({
    classify: [],
    entity: [],
    dup: [],
    force: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [classify, entity, dup, force] = await Promise.all([
        listYuxiPendingQueue("classify", { scope: "mine" }),
        listYuxiPendingQueue("entity", { scope: "mine" }),
        listYuxiPendingQueue("dup", { scope: "mine" }),
        listYuxiPendingQueue("force", { scope: "mine" }),
      ]);
      setQueues({
        classify: classify.items ?? [],
        entity: entity.items ?? [],
        dup: dup.items ?? [],
        force: force.items ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  const items = useMemo(() => projectTodos(queues), [queues]);
  const pendingCount = items.length;

  return (
    <KbPageShell
      title="待办中心"
      ariaLabel="待办中心"
      actions={
        <>
          <span className="hc-kb-topbar-stats">
            <strong style={{ color: "#854d0e" }}>{pendingCount}</strong>
            <span style={{ marginLeft: 4 }}>条待处理</span>
          </span>
          <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadTodos()} disabled={loading}>
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            {loading ? "刷新中" : "刷新"}
          </button>
        </>
      }
    >
      {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}
      <div className="hc-kb-table-wrap">
        {items.length === 0 ? (
          <div className="hc-kb-empty">
            <div className="hc-kb-empty-content">
              <div className="hc-kb-empty-title">{loading ? "正在读取待办" : "暂无待处理事项"}</div>
              <div className="hc-kb-empty-subtitle">来自资料上传、分类确认、重复版本和实体对齐的事项会显示在这里。</div>
            </div>
          </div>
        ) : (
          <table className="hc-kb-table">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>事项</th>
                <th style={{ width: "12%" }}>来源</th>
                <th style={{ width: "36%" }}>处理原因</th>
                <th style={{ width: "12%" }}>状态</th>
                <th style={{ textAlign: "right" }}>入口</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="hc-kb-file-name" style={{ fontWeight: 560 }}>{item.title}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: "var(--hc-text-secondary)" }}>
                      {SOURCE_LABEL[item.source]}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--hc-text-secondary)", lineHeight: 1.5 }}>
                    {item.reason}
                  </td>
                  <td>
                    <span className={`hc-kb-status ${STATUS_CSS[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </td>
                  <td>
                    <div className="hc-kb-row-actions" style={{ justifyContent: "flex-end", opacity: 1 }}>
                      <button type="button" className="hc-kb-topbar-btn" style={{ height: 24, fontSize: 11 }}>
                        {item.actionLabel}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </KbPageShell>
  );
}

function projectTodos(queues: Record<YuxiPendingQueue, YuxiPendingItem[]>): TodoItem[] {
  return [
    ...queues.dup.map((item) => ({
      id: `dup:${item.id}`,
      title: `「${item.filename || "上传资料"}」和库里已有版本相似`,
      source: "upload" as const,
      reason: typeof item.similarity === "number"
        ? `相似度 ${Math.round(item.similarity * 100)}%，需要选择替换、保留副本或归档。`
        : "命中重复或相似版本，需要人工确认处理方式。",
      status: "duplicate" as const,
      actionLabel: "对比一下",
    })),
    ...queues.entity.map((item) => ({
      id: `entity:${item.id}`,
      title: `「${item.extracted_text || "抽取实体"}」需要确认`,
      source: "ai-id" as const,
      reason: item.candidate_entity_type ? `候选实体类型：${item.candidate_entity_type}` : "AI 抽取到实体关系，需要选择现有档案或创建新档案。",
      status: "pick" as const,
      actionLabel: "去选实体",
    })),
    ...queues.classify.map((item) => ({
      id: `classify:${item.id}`,
      title: `「${item.filename || "资料"}」该放到哪个库？`,
      source: "ai-cat" as const,
      reason: classifyReason(item),
      status: "classify" as const,
      actionLabel: "去选分类",
    })),
    ...queues.force.map((item) => ({
      id: `force:${item.id}`,
      title: `「${item.filename || "资料"}」需要手动处理`,
      source: "doc-err" as const,
      reason: item.failure_reason || "后端无法自动分类或解析，需要人工指派知识库。",
      status: "error" as const,
      actionLabel: "手动处理",
    })),
  ];
}

function classifyReason(item: YuxiPendingItem): string {
  const top = item.candidates?.[0];
  if (!top) return "AI 分类置信度不足，需要人工确认目标知识库。";
  const label = top.label || top.category || "候选分类";
  const score = typeof top.score === "number" ? `，置信度 ${Math.round(top.score * 100)}%` : "";
  return `AI 建议放入「${label}」${score}。`;
}
