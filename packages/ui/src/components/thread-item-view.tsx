import { itemType } from "../state/thread-item-fields";
import { DynamicToolCallThreadItemView } from "./thread-item-dynamic-tool-call";
import { ExecThreadItemView } from "./thread-item-exec";
import { McpToolCallThreadItemView } from "./thread-item-mcp-tool-call";
import {
  AutoReviewThreadItemView,
  McpServerElicitationThreadItemView,
} from "./thread-item-review";
import { TodoListThreadItemView } from "./thread-item-todo";
import type { ThreadItemUnit } from "./thread-item-types";
import { PlanSummaryCard } from "./plan-summary-card";
import type {
  McpAppHostCallHandler,
  ReadMcpResourceHandler,
} from "./tool-activity-detail";

export { DynamicToolCallGroupView, dynamicToolCallLabel } from "./thread-item-dynamic-tool-call";
export { execThreadItemSummaryLabel } from "./thread-item-exec";
export { todoListSummaryLabel } from "./thread-item-todo";
export { autoReviewBody, autoReviewTitle } from "./thread-item-review";

export function ThreadItemView({
  onMcpAppHostCall,
  onReadMcpResource,
  threadId = null,
  unit,
}: {
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  threadId?: string | null;
  unit: ThreadItemUnit;
}) {
  const type = itemType(unit.item);
  if (type === "exec") return <ExecThreadItemView unit={unit} />;
  if (type === "mcp-tool-call") {
    return (
      <McpToolCallThreadItemView
        unit={unit}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    );
  }
  if (type === "mcp-server-elicitation") return <McpServerElicitationThreadItemView unit={unit} />;
  if (type === "todo-list") return <TodoListThreadItemView unit={unit} />;
  if (type === "proposed-plan") {
    return <PlanSummaryCard unit={unit} threadId={threadId} />;
  }
  /*
   * Plan ThreadItem 独立渲染。
   * 协议层 Plan { id, text }（v2/item.rs:236）独立 variant，与 proposed-plan 共用
   * PlanSummaryCard 渲染（plan-summary-card.tsx planSummaryContent 同时支持 text/content）。
   *
   * 注：其余 ThreadItem variant（hookPrompt / enteredReviewMode / exitedReviewMode /
   * contextCompaction / imageView / imageGeneration）按 DEVELOPMENT.md:114-116 规则
   * 不渲染为 standalone row：hook 由 user-message hookStats 字段承担，reasoning 仅
   * thinking-placeholder 渲染，其他由 event-projection 处理为 markdown event 或丢弃。
   */
  if (type === "plan") return <PlanSummaryCard unit={unit} threadId={threadId} />;
  if (type === "automatic-approval-review") return <AutoReviewThreadItemView unit={unit} />;
  return <DynamicToolCallThreadItemView unit={unit} />;
}
