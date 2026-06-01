import { Archive, CheckSquare, Files, Link2, SlidersHorizontal } from "lucide-react";

export type KbLibraryWorkflowTarget = "documents" | "pending" | "archive" | "accuracy" | "integrations";

export function KbLibraryWorkflowStrip({
  active,
  disabled,
  documentCount,
  pendingCount,
  scoringRuleCount,
  sourceSystemCount,
  onOpen,
}: {
  active: KbLibraryWorkflowTarget;
  disabled?: boolean;
  documentCount: number;
  pendingCount: number;
  scoringRuleCount: number;
  sourceSystemCount: number;
  onOpen: (target: KbLibraryWorkflowTarget) => void;
}) {
  const items = [
    {
      id: "documents" as const,
      label: "资料管理",
      value: `${documentCount} 条`,
      detail: "上传、预览、删除",
      icon: Files,
    },
    {
      id: "pending" as const,
      label: "入库问题",
      value: `${pendingCount} 项`,
      detail: "归属、重复、异常",
      icon: CheckSquare,
    },
    {
      id: "archive" as const,
      label: "档案关联",
      value: "查看",
      detail: "讲师、课程、客户",
      icon: Archive,
    },
    {
      id: "accuracy" as const,
      label: "匹配效果",
      value: `${scoringRuleCount} 条`,
      detail: "依据、权重、验证",
      icon: SlidersHorizontal,
    },
    {
      id: "integrations" as const,
      label: "系统来源",
      value: `${sourceSystemCount} 路`,
      detail: "上传、CRM、业务系统",
      icon: Link2,
    },
  ];

  return (
    <div className="hc-kb-workflow-strip" aria-label="当前知识库管理闭环">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="hc-kb-workflow-step"
            data-active={active === item.id ? "true" : undefined}
            disabled={disabled}
            onClick={() => onOpen(item.id)}
          >
            <span className="hc-kb-workflow-step-icon">
              <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="hc-kb-workflow-step-main">
              <strong>{item.label}</strong>
              <em>{item.detail}</em>
            </span>
            <span className="hc-kb-workflow-step-value">{item.value}</span>
          </button>
        );
      })}
    </div>
  );
}
