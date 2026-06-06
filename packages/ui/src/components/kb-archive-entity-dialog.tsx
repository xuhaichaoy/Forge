import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  type YuxiEntity,
  type YuxiEntityDetail,
  type YuxiEntityMutationPayload,
  type YuxiEntityType,
  yuxiEntityTypeLabel,
} from "../lib/yuxi-client";
import { AUTHORITY_LABEL } from "./kb-archive-model";

const AUTHORITY_OPTIONS = ["authoritative", "candidate", "unconfirmed", "stale"] as const;

export function EntityEditDialog({
  mode,
  entityType,
  detail,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  entityType: YuxiEntityType;
  detail: YuxiEntityDetail | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: YuxiEntityMutationPayload) => void;
}) {
  const defaults = useMemo(() => ({
    canonicalName: mode === "edit" ? detail?.canonical_name ?? "" : "",
    description: mode === "edit" ? detail?.description ?? "" : "",
    aliases: mode === "edit" ? (detail?.aliases ?? []).join("\n") : "",
    authorityStatus: mode === "edit" ? detail?.authority_status ?? "candidate" : "authoritative",
    attributeDraft: attributeDraftFrom(entityType, mode === "edit" ? detail?.attributes : null),
  }), [detail, entityType, mode]);

  const [canonicalName, setCanonicalName] = useState(defaults.canonicalName);
  const [description, setDescription] = useState(defaults.description);
  const [aliases, setAliases] = useState(defaults.aliases);
  const [authorityStatus, setAuthorityStatus] = useState(defaults.authorityStatus);
  const [attributeDraft, setAttributeDraft] = useState<Record<string, string>>(defaults.attributeDraft);
  const [localError, setLocalError] = useState<string | null>(null);
  const attributeFields = useMemo(() => entityAttributeFields(entityType), [entityType]);

  useEffect(() => {
    setCanonicalName(defaults.canonicalName);
    setDescription(defaults.description);
    setAliases(defaults.aliases);
    setAuthorityStatus(defaults.authorityStatus);
    setAttributeDraft(defaults.attributeDraft);
    setLocalError(null);
  }, [defaults]);

  const title = mode === "create" ? `新建${yuxiEntityTypeLabel(entityType)}档案` : "编辑档案";
  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="hc-thread-dialog-panel hc-kb-dialog hc-kb-dialog--wide" role="dialog" aria-modal="true" aria-label={title}>
        <form onSubmit={(event) => {
          event.preventDefault();
          setLocalError(null);
          onSubmit({
            entity_type: entityType,
            canonical_name: canonicalName.trim(),
            description: description.trim() || null,
            aliases: splitAliases(aliases),
            attributes: buildAttributes(entityType, detail?.attributes, attributeDraft),
            authority_status: authorityStatus,
          });
        }}>
          <header>
            <div>{title}</div>
            <button type="button" aria-label="关闭" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </button>
          </header>
          <div className="hc-thread-dialog-body">
            <label>
              名称
              <input value={canonicalName} onChange={(event) => setCanonicalName(event.target.value)} required />
            </label>
            <label>
              别名
              <textarea value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="一行一个别名" />
            </label>
            <label>
              摘要
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label>
              权威状态
              <select value={authorityStatus} onChange={(event) => setAuthorityStatus(event.target.value)}>
                {AUTHORITY_OPTIONS.map((status) => (
                  <option key={status} value={status}>{AUTHORITY_LABEL[status] ?? status}</option>
                ))}
              </select>
            </label>
            <div className="hc-kb-entity-field-grid">
              {attributeFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    value={attributeDraft[field.key] ?? ""}
                    onChange={(event) => setAttributeDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
            </div>
            {(localError || error) && <div className="hc-kb-inline-alert" data-tone="danger">{localError || error}</div>}
          </div>
          <footer>
            <button type="button" className="hc-kb-topbar-btn" onClick={onClose} disabled={saving}>取消</button>
            <button type="submit" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={saving || !canonicalName.trim()}>
              {saving ? "保存中" : "保存"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export function EntityMergeDialog({
  detail,
  candidates,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  detail: YuxiEntityDetail;
  candidates: YuxiEntity[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (targetId: number, mergeAttributes: boolean) => void;
}) {
  const options = useMemo(
    () => candidates.filter((item) => typeof item.id === "number" && item.id !== detail.id),
    [candidates, detail.id],
  );
  const [targetId, setTargetId] = useState(options[0]?.id ? String(options[0].id) : "");
  const [mergeAttributes, setMergeAttributes] = useState(true);

  useEffect(() => {
    setTargetId(options[0]?.id ? String(options[0].id) : "");
  }, [detail.id, options]);

  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="hc-thread-dialog-panel hc-kb-dialog" role="dialog" aria-modal="true" aria-label="合并档案">
        <form onSubmit={(event) => {
          event.preventDefault();
          const parsed = Number(targetId);
          if (Number.isFinite(parsed)) onSubmit(parsed, mergeAttributes);
        }}>
          <header>
            <div>合并档案</div>
            <button type="button" aria-label="关闭" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </button>
          </header>
          <div className="hc-thread-dialog-body">
            <p>{detail.canonical_name || "未命名档案"}</p>
            <span>选择保留的目标档案，当前档案的引用和别名会迁移过去。</span>
            <label>
              合并到
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)} required>
                {options.length === 0 ? (
                  <option value="">没有同类型档案</option>
                ) : options.map((item) => (
                  <option key={item.id} value={item.id}>{item.canonical_name || "未命名档案"}</option>
                ))}
              </select>
            </label>
            <label className="hc-kb-dialog-checkbox">
              <input type="checkbox" checked={mergeAttributes} onChange={(event) => setMergeAttributes(event.target.checked)} />
              <span>用当前档案补全目标档案缺失字段</span>
            </label>
            {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}
          </div>
          <footer>
            <button type="button" className="hc-kb-topbar-btn" onClick={onClose} disabled={saving}>取消</button>
            <button type="submit" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={saving || !targetId}>
              {saving ? "合并中" : "合并"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function splitAliases(value: string): string[] {
  return value
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

interface EntityAttributeField {
  key: string;
  label: string;
  placeholder?: string;
}

const ENTITY_ATTRIBUTE_FIELDS: Partial<Record<YuxiEntityType, EntityAttributeField[]>> = {
  teacher: [
    { key: "expertise", label: "专长方向", placeholder: "领导力 / AI / 财务管理" },
    { key: "industry", label: "熟悉行业", placeholder: "金融、制造业" },
    { key: "price_range", label: "报价区间", placeholder: "2-3 万 / 天" },
    { key: "region", label: "常驻区域", placeholder: "北京 / 上海" },
    { key: "feedback_score", label: "反馈分", placeholder: "4.8" },
  ],
  course: [
    { key: "topic", label: "课程主题", placeholder: "中高层领导力" },
    { key: "audience", label: "适用人群", placeholder: "高管 / 中层" },
    { key: "hours", label: "标准学时", placeholder: "16h" },
    { key: "format", label: "授课形式", placeholder: "工作坊 / 沙盘" },
    { key: "teachers", label: "可授讲师", placeholder: "王老师、刘老师" },
  ],
  training_requirement: [
    { key: "target_audiences", label: "赋能人群", placeholder: "干部及骨干人才" },
    { key: "available_documents", label: "可用资料", placeholder: "方案.doc、培训计划.pptx" },
    { key: "relation_strengths", label: "关系强度", placeholder: "强 / 中 / 弱" },
    { key: "gaps", label: "缺口", placeholder: "缺少政策案例、课程大纲" },
    { key: "next_steps", label: "下一步建议", placeholder: "补充材料后扩写方案" },
  ],
  case: [
    { key: "industry", label: "客户行业", placeholder: "金融 / 制造业" },
    { key: "customer", label: "客户名称", placeholder: "A 银行" },
    { key: "project_type", label: "项目类型", placeholder: "高管培训" },
    { key: "result", label: "结果证明", placeholder: "复购 / 评分 4.8" },
    { key: "reuse_point", label: "可复用点", placeholder: "同业案例 / 复盘结构" },
  ],
  customer: [
    { key: "industry", label: "所属行业", placeholder: "金融 / 新能源" },
    { key: "level", label: "客户层级", placeholder: "战略 / 重点" },
    { key: "cooperation_status", label: "合作状态", placeholder: "活跃 / 休眠" },
    { key: "region", label: "所在区域", placeholder: "华北 / 华东" },
    { key: "key_needs", label: "核心需求", placeholder: "管理升级 / 协同" },
  ],
};

function entityAttributeFields(type: YuxiEntityType): EntityAttributeField[] {
  return ENTITY_ATTRIBUTE_FIELDS[type] ?? [];
}

function attributeDraftFrom(type: YuxiEntityType, value: Record<string, unknown> | null | undefined): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of entityAttributeFields(type)) {
    draft[field.key] = stringifyAttributeValue(value?.[field.key]);
  }
  return draft;
}

function buildAttributes(
  type: YuxiEntityType,
  previous: Record<string, unknown> | null | undefined,
  draft: Record<string, string>,
): Record<string, unknown> | null {
  const next: Record<string, unknown> = { ...(previous ?? {}) };
  for (const field of entityAttributeFields(type)) {
    const value = draft[field.key]?.trim();
    if (value) next[field.key] = value;
    else delete next[field.key];
  }
  return Object.keys(next).length > 0 ? next : null;
}

function stringifyAttributeValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => stringifyAttributeValue(item)).filter(Boolean).join(" / ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>)
    .map((item) => stringifyAttributeValue(item))
    .filter(Boolean)
    .join(" / ");
  return "";
}
