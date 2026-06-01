import { useEffect, useMemo, useState } from "react";
import { Save, Upload } from "lucide-react";
import {
  yuxiBusinessLineLabel,
  yuxiLibraryGovernance,
  type YuxiCategoryMeta,
  type YuxiKnowledgeDatabase,
} from "../lib/yuxi-client";
import { type LibraryGovernanceDraft } from "./kb-library-model";

export function KbLibraryStoragePanel({
  selectedCategory,
  selectedDatabase,
  onUpload,
  onSaveGovernance,
  governanceSaving,
}: {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  onUpload?: () => void;
  onSaveGovernance: (database: YuxiKnowledgeDatabase | null, draft: LibraryGovernanceDraft) => void;
  governanceSaving?: boolean;
}) {
  const governanceDraft = useMemo(
    () => makeGovernanceDraft(selectedDatabase, selectedCategory),
    [selectedCategory, selectedDatabase],
  );
  const [draft, setDraft] = useState<LibraryGovernanceDraft>(governanceDraft);

  useEffect(() => {
    setDraft(governanceDraft);
  }, [governanceDraft]);

  if (!selectedCategory) {
    return (
      <section className="hc-kb-management-panel" aria-label="知识库设置">
        <div className="hc-kb-empty">
          <div className="hc-kb-empty-content">
            <div className="hc-kb-empty-title">先在左侧选择知识库</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hc-kb-management-panel" aria-label="知识库设置">
      <div className="hc-kb-panel-head">
        <div>
          <div className="hc-kb-section-title">{selectedDatabase?.name || selectedCategory.label} · 知识库设置</div>
          <div className="hc-kb-section-subtitle">
            {yuxiBusinessLineLabel(selectedCategory.line)} · {selectedDatabase?.db_id ? "已启用" : "首次上传时自动创建资料库"}
          </div>
        </div>
      </div>

      {!selectedDatabase?.db_id && (
        <div className="hc-kb-governance-start">
          <div>
            <strong>{selectedCategory.label}还没有资料库</strong>
            <p>可以先保存入库策略，也可以直接上传资料；系统会创建资料库，并按这里的策略完成解析、提取档案和入库。</p>
          </div>
          {onUpload && (
            <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" onClick={onUpload}>
              <Upload size={13} strokeWidth={2.2} aria-hidden="true" />
              上传资料
            </button>
          )}
        </div>
      )}

      <BusinessSummary
        database={selectedDatabase}
        category={selectedCategory}
        draft={draft}
      />

      <section className="hc-kb-admin-section hc-kb-admin-section--wide">
        <div className="hc-kb-admin-section-head">
          <strong>这个库怎么用</strong>
          <button
            type="button"
            className="hc-kb-topbar-btn hc-kb-topbar-btn--primary"
            disabled={governanceSaving}
            onClick={() => onSaveGovernance(selectedDatabase, draft)}
          >
            <Save size={13} strokeWidth={2.2} aria-hidden="true" />
            {governanceSaving ? "保存中" : "保存设置"}
          </button>
        </div>
        <div className="hc-kb-simple-settings">
          <GovernanceField
            label="资料范围"
            value={draft.citationScope}
            onChange={(value) => setDraft((prev) => ({ ...prev, citationScope: value }))}
          />
          <GovernanceField
            label="负责人"
            value={draft.ownerRole}
            onChange={(value) => setDraft((prev) => ({ ...prev, ownerRole: value }))}
          />
          <GovernanceField
            label="什么时候更新"
            value={draft.updateRule}
            onChange={(value) => setDraft((prev) => ({ ...prev, updateRule: value }))}
          />
          <GovernanceField
            label="数据来源"
            value={draft.externalSystems.join("、")}
            onChange={(value) => setDraft((prev) => ({ ...prev, externalSystems: splitList(value) }))}
          />
        </div>
      </section>

      <section className="hc-kb-admin-section hc-kb-admin-section--wide">
        <div className="hc-kb-admin-section-head">
          <strong>上传后怎么处理</strong>
          <span>业务只需要决定正常资料是否自动入库，异常会统一进入入库问题。</span>
        </div>
        <div className="hc-kb-simple-policy-list">
          <SimpleSettingRow
            title="正常资料"
            description="上传后自动读取正文和表格，提取摘要、标签和档案关系。"
            value={draft.intakeMode}
            options={[
              { value: "auto", label: "自动入库" },
              { value: "review_first", label: "先人工看" },
            ]}
            onChange={(value) => setDraft((prev) => ({ ...prev, intakeMode: value as LibraryGovernanceDraft["intakeMode"] }))}
          />
          <SimpleSettingRow
            title="重复资料"
            description="同名或内容重复时，不直接覆盖已有资料。"
            value={draft.duplicateMode}
            options={[
              { value: "review", label: "进入入库问题" },
              { value: "archive_exact", label: "完全重复不入库" },
            ]}
            onChange={(value) => setDraft((prev) => ({ ...prev, duplicateMode: value as LibraryGovernanceDraft["duplicateMode"] }))}
          />
          <SimpleSettingRow
            title="档案关联"
            description="从资料里识别讲师、课程、客户、项目等档案。"
            value={draft.entityMode}
            options={[
              { value: "auto_align", label: "自动关联" },
              { value: "review_all", label: "逐条确认" },
            ]}
            onChange={(value) => setDraft((prev) => ({ ...prev, entityMode: value as LibraryGovernanceDraft["entityMode"] }))}
          />
        </div>
        <SimpleFlow />
      </section>

      <section className="hc-kb-admin-section hc-kb-admin-section--wide">
        <div className="hc-kb-admin-section-head">
          <strong>怎么保证匹配准确</strong>
          <span>不是只看关键词，会同时看标签、档案关系、业务规则和来源证据。</span>
        </div>
        <div className="hc-kb-match-explain-grid">
          <MatchExplainCard
            title="先限定范围"
            value={selectedDatabase?.name || selectedCategory.label}
            description="只在当前业务线和当前知识库内优先匹配，避免串库。"
          />
          <MatchExplainCard
            title="再看档案关系"
            value={draft.entityMode === "auto_align" ? "自动关联" : "人工确认"}
            description="讲师、课程、客户、项目等关系会参与推荐和排序。"
          />
          <MatchExplainCard
            title="保留来源证据"
            value="可追溯"
            description="命中的文件、片段和原文位置会跟随结果展示。"
          />
          <MatchExplainCard
            title="低把握不乱用"
            value={draft.confidenceMode === "strict" ? "严格" : "均衡"}
            description="重复、冲突、缺字段或低把握内容进入入库问题。"
          />
        </div>
        <SimpleSettingRow
          title="匹配严格度"
          description="均衡适合日常检索，严格适合投标响应、报价和资质类资料。"
          value={draft.confidenceMode}
          options={[
            { value: "balanced", label: "均衡" },
            { value: "strict", label: "严格" },
          ]}
          onChange={(value) => setDraft((prev) => ({ ...prev, confidenceMode: value as LibraryGovernanceDraft["confidenceMode"] }))}
        />
        <SignalChips title="主要匹配依据" values={draft.matchSignals} />
        <SignalChips title="质量要求" values={draft.qualityMetrics} />
      </section>

      <details className="hc-kb-advanced-settings">
        <summary>更多设置</summary>
        <div className="hc-kb-governance-form">
          <GovernanceField
            label="权威判断"
            value={draft.authorityRule}
            onChange={(value) => setDraft((prev) => ({ ...prev, authorityRule: value }))}
            wide
          />
          <GovernanceField
            label="质量要求"
            value={draft.qualityMetrics.join("、")}
            onChange={(value) => setDraft((prev) => ({ ...prev, qualityMetrics: splitList(value) }))}
            wide
          />
          <GovernanceField
            label="上传校验项"
            value={draft.uploadChecklist.join("、")}
            onChange={(value) => setDraft((prev) => ({ ...prev, uploadChecklist: splitList(value) }))}
            wide
          />
          <GovernanceField
            label="匹配依据"
            value={draft.matchSignals.join("、")}
            onChange={(value) => setDraft((prev) => ({ ...prev, matchSignals: splitList(value) }))}
            wide
          />
        </div>
      </details>
    </section>
  );
}

function BusinessSummary({
  database,
  category,
  draft,
}: {
  database: YuxiKnowledgeDatabase | null;
  category: YuxiCategoryMeta;
  draft: LibraryGovernanceDraft;
}) {
  const cards = [
    {
      title: "放什么资料",
      value: draft.citationScope || category.label,
      meta: draft.citationScope || database?.description || category.description,
    },
    {
      title: "上传后",
      value: intakeModeLabel(draft.intakeMode),
      meta: "能识别清楚就入库，重复或冲突进入入库问题",
    },
    {
      title: "档案",
      value: draft.entityMode === "auto_align" ? "自动关联" : "人工确认",
      meta: "识别出的对象会进入档案中心，后续检索会引用这些关系",
    },
  ];
  return (
    <div className="hc-kb-governance-summary" aria-label="当前知识库设置摘要">
      {cards.map((card) => (
        <div key={card.title} className="hc-kb-governance-card">
          <span>{card.title}</span>
          <strong>{card.value}</strong>
          <em>{card.meta}</em>
        </div>
      ))}
    </div>
  );
}

function SimpleSettingRow({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="hc-kb-simple-policy-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="hc-kb-simple-choice" role="group" aria-label={title}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="hc-kb-simple-choice-btn"
            data-active={value === option.value ? "true" : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SimpleFlow() {
  const steps = ["上传", "读取内容", "提取档案", "确认问题", "入库检索"];
  return (
    <div className="hc-kb-simple-flow" aria-label="上传后处理流程">
      {steps.map((step, index) => (
        <span key={step}>{index + 1}. {step}</span>
      ))}
    </div>
  );
}

function MatchExplainCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="hc-kb-match-explain-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <em>{description}</em>
    </div>
  );
}

function SignalChips({ title, values }: { title: string; values: string[] }) {
  const displayValues = values.length > 0 ? values : ["当前库范围", "档案关系", "来源证据"];
  return (
    <div className="hc-kb-signal-row">
      <span>{title}</span>
      <div className="hc-kb-tags">
        {displayValues.slice(0, 8).map((value) => (
          <span key={value} className="hc-kb-tag">{value}</span>
        ))}
      </div>
    </div>
  );
}

function GovernanceField({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className="hc-kb-governance-field" data-wide={wide ? "true" : undefined}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function makeGovernanceDraft(
  database: YuxiKnowledgeDatabase | null,
  category: YuxiCategoryMeta | null,
): LibraryGovernanceDraft {
  const fromDb = parseGovernance(database?.share_config);
  const fallback = yuxiLibraryGovernance(category?.key);
  return {
    ownerRole: fromDb.ownerRole || fallback?.ownerRole || "",
    updateRule: fromDb.updateRule || fallback?.updateRule || "",
    authorityRule: fromDb.authorityRule || fallback?.authorityRule || "",
    citationScope: fromDb.citationScope || fallback?.citationScope || "",
    intakeMode: intakeModeValue(fromDb.intakeMode),
    duplicateMode: duplicateModeValue(fromDb.duplicateMode),
    entityMode: entityModeValue(fromDb.entityMode),
    confidenceMode: confidenceModeValue(fromDb.confidenceMode),
    qualityMetrics: fromDb.qualityMetrics.length > 0 ? fromDb.qualityMetrics : [...(fallback?.qualityMetrics ?? [])],
    externalSystems: fromDb.externalSystems.length > 0 ? fromDb.externalSystems : [...(fallback?.externalSystems ?? [])],
    uploadChecklist: fromDb.uploadChecklist.length > 0 ? fromDb.uploadChecklist : [...(fallback?.uploadChecklist ?? [])],
    matchSignals: fromDb.matchSignals.length > 0 ? fromDb.matchSignals : [...(fallback?.matchSignals ?? [])],
  };
}

function parseGovernance(shareConfig: Record<string, unknown> | null | undefined): LibraryGovernanceDraft {
  const record = shareConfig?.hicodex_governance;
  if (!record || typeof record !== "object") {
    return emptyGovernanceDraft();
  }
  const data = record as Record<string, unknown>;
  return {
    ownerRole: stringValue(data.ownerRole),
    updateRule: stringValue(data.updateRule),
    authorityRule: stringValue(data.authorityRule),
    citationScope: stringValue(data.citationScope),
    intakeMode: intakeModeValue(data.intakeMode),
    duplicateMode: duplicateModeValue(data.duplicateMode),
    entityMode: entityModeValue(data.entityMode),
    confidenceMode: confidenceModeValue(data.confidenceMode),
    qualityMetrics: stringListValue(data.qualityMetrics),
    externalSystems: stringListValue(data.externalSystems),
    uploadChecklist: stringListValue(data.uploadChecklist),
    matchSignals: stringListValue(data.matchSignals),
  };
}

function emptyGovernanceDraft(): LibraryGovernanceDraft {
  return {
    ownerRole: "",
    updateRule: "",
    authorityRule: "",
    citationScope: "",
    intakeMode: "auto",
    duplicateMode: "review",
    entityMode: "auto_align",
    confidenceMode: "balanced",
    qualityMetrics: [],
    externalSystems: [],
    uploadChecklist: [],
    matchSignals: [],
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringListValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function intakeModeValue(value: unknown): LibraryGovernanceDraft["intakeMode"] {
  return value === "review_first" ? "review_first" : "auto";
}

function duplicateModeValue(value: unknown): LibraryGovernanceDraft["duplicateMode"] {
  return value === "archive_exact" ? "archive_exact" : "review";
}

function entityModeValue(value: unknown): LibraryGovernanceDraft["entityMode"] {
  return value === "review_all" ? "review_all" : "auto_align";
}

function confidenceModeValue(value: unknown): LibraryGovernanceDraft["confidenceMode"] {
  return value === "strict" ? "strict" : "balanced";
}

function intakeModeLabel(value: LibraryGovernanceDraft["intakeMode"]): string {
  return value === "review_first" ? "先人工处理" : "自动入库";
}

function splitList(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
