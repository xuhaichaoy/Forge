import type { YuxiEntity, YuxiEntityReference } from "../lib/yuxi-client";

export type EntityTab =
  | "teacher"
  | "course"
  | "case"
  | "customer"
  | "bid_project"
  | "bid_requirement"
  | "bid_risk"
  | "bid_competitor"
  | "bid_template";

export interface TabConfig {
  id: EntityTab;
  label: string;
  searchPlaceholder: string;
  hints: readonly string[];
  filters: Array<{ label: string; options: readonly string[] }>;
}

export const ENTITY_TABS: TabConfig[] = [
  {
    id: "teacher",
    label: "讲师",
    searchPlaceholder: "搜索讲师姓名、专长或行业…",
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
    searchPlaceholder: "搜索课程名称或方向…",
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
    searchPlaceholder: "搜索案例名称或行业…",
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
  {
    id: "bid_project",
    label: "投标项目",
    searchPlaceholder: "搜索项目、采购人、投标阶段或复盘关系…",
    hints: ["近一年中标项目", "政府采购项目", "金融行业投标复盘"],
    filters: [
      { label: "项目状态", options: ["在投", "已中标", "未中标", "已归档"] },
      { label: "行业", options: ["金融", "制造业", "政企", "能源"] },
      { label: "排序", options: ["截止时间", "得分", "更新时间"] },
    ],
  },
  {
    id: "bid_requirement",
    label: "招标要求",
    searchPlaceholder: "搜索资格条件、评分条款、交付范围或响应要求…",
    hints: ["资格条件类似的项目", "评分占比高的条款", "必须响应要求"],
    filters: [
      { label: "要求类型", options: ["资格", "商务", "技术", "服务", "价格"] },
      { label: "风险等级", options: ["高", "中", "低"] },
      { label: "排序", options: ["权重", "风险", "更新时间"] },
    ],
  },
  {
    id: "bid_risk",
    label: "废标风险",
    searchPlaceholder: "搜索废标原因、格式风险、资质风险或价格风险…",
    hints: ["盖章风险", "报价异常", "资格证明缺失"],
    filters: [
      { label: "风险类型", options: ["格式", "资质", "报价", "技术响应", "递交"] },
      { label: "严重程度", options: ["一票否决", "高", "中", "低"] },
      { label: "排序", options: ["严重程度", "发生次数", "更新时间"] },
    ],
  },
  {
    id: "bid_competitor",
    label: "竞品",
    searchPlaceholder: "搜索竞品、报价、技术路线或中标记录…",
    hints: ["同类竞品报价", "近一年中标对手", "低价竞争记录"],
    filters: [
      { label: "竞品类型", options: ["培训机构", "咨询公司", "集成商", "其他"] },
      { label: "行业", options: ["金融", "制造业", "政企", "能源"] },
      { label: "排序", options: ["中标次数", "报价", "更新时间"] },
    ],
  },
  {
    id: "bid_template",
    label: "标书模板",
    searchPlaceholder: "搜索模板、章节、格式要求或通用应答…",
    hints: ["主标模板", "商务响应章节", "技术方案通用段落"],
    filters: [
      { label: "模板类型", options: ["主标", "商务", "技术", "报价", "附件"] },
      { label: "适用范围", options: ["通用", "金融", "政企", "制造业"] },
      { label: "排序", options: ["版本", "复用次数", "更新时间"] },
    ],
  },
];

export const AUTHORITY_LABEL: Record<string, string> = {
  authoritative: "已确认",
  candidate: "待核对",
  stale: "已过期",
  unconfirmed: "未确认",
};

/**
 * 实体类型英文 key → 中文名映射（仅"翻译类型名"，不是写死业务库）。
 * 档案中心左侧分类是从 Yuxi 真实实体的 entity_type 动态聚合出来的，
 * 这里只负责把英文 key 显示成中文；映射里没有的未知类型回退到 ENTITY_TABS 的 label，
 * 再回退到 key 本身（见 resolveTabConfig / entityTypeLabel）。
 */
export const ENTITY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ENTITY_TABS.map((tab) => [tab.id, tab.label]),
);

/**
 * 把任意 entity_type（可能是 ENTITY_TABS 之外的未知类型）解析成一份 TabConfig。
 * 已知类型直接复用 ENTITY_TABS 的配置；未知类型回退到一份通用配置，
 * label 优先取传入的 fallbackLabel（Yuxi 返回的标签），否则用 key 本身。
 */
export function resolveTabConfig(type: string, fallbackLabel?: string | null): TabConfig {
  const known = ENTITY_TABS.find((tab) => tab.id === type);
  if (known) return known;
  const label = (fallbackLabel && fallbackLabel.trim()) || ENTITY_TYPE_LABELS[type] || type;
  return {
    id: type as EntityTab,
    label,
    searchPlaceholder: `搜索${label}…`,
    hints: [],
    filters: [],
  };
}

export function entityTags(item: YuxiEntity): string[] {
  const tags: string[] = [];
  if (item.description) tags.push(trimTag(item.description));
  const attrs = item.attributes ?? {};
  for (const value of Object.values(attrs)) {
    if (tags.length >= 4) break;
    if (typeof value === "string" && value.trim()) tags.push(trimTag(businessValueLabel(value)));
    if (Array.isArray(value)) {
      for (const part of value) {
        if (tags.length >= 4) break;
        if (typeof part === "string" && part.trim()) tags.push(trimTag(businessValueLabel(part)));
      }
    }
  }
  return tags.length > 0 ? tags : ["暂无摘要"];
}

export function authorityClass(status: string | null | undefined): string {
  if (status === "authoritative") return "hc-kb-status--ok";
  if (status === "stale") return "hc-kb-status--archive";
  return "hc-kb-status--pending";
}

export function formatEntityDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function attributeEntries(value: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!value) return [];
  return Object.entries(value)
    .map(([key, raw]) => [businessFieldLabel(key), stringifyEntityValue(raw)] as [string, string])
    .filter(([, text]) => text.length > 0)
    .slice(0, 12);
}

export function businessFieldLabel(key: string | null | undefined): string {
  if (!key) return "信息";
  const normalized = key.trim();
  const lower = normalized.toLowerCase();
  const map: Record<string, string> = {
    aliases: "别名",
    audience: "适用人群",
    duration: "课时",
    teacher: "讲师",
    scale: "规模",
    result: "结果",
    level: "层级",
    score: "得分",
    type: "类型",
    weight: "权重",
    scope: "适用范围",
    severity: "严重程度",
    specialty: "专长",
    specialties: "专长",
    expertise: "专长",
    expertises: "专长",
    domain: "领域",
    domains: "领域",
    industry: "行业",
    industries: "行业",
    quote: "报价",
    quotation: "报价",
    price: "报价",
    fee: "报价",
    organization: "机构",
    institution: "机构",
    org: "机构",
    data_source: "数据来源",
    source: "数据来源",
    cooperation_status: "合作状态",
    status: "状态",
    course: "课程",
    courses: "课程",
    region: "区域",
    location: "区域",
    project_name: "项目",
    purchaser: "采购方",
    deadline: "截止时间",
    refreshed_at: "刷新时间",
    distinct_files: "来源文件",
    recent_30d_count: "近 30 天引用",
    referenced_count: "累计引用",
    last_referenced_at: "最近引用",
    authority_status: "确认状态",
  };
  return map[lower] || normalized.replace(/_/g, " ");
}

export function referenceTitle(ref: YuxiEntityReference): string {
  return ref.file_meta?.filename || ref.file_id || "来源文件";
}

export function referenceSubtitle(ref: YuxiEntityReference): string {
  const relation = relationLabel(ref.relation);
  return relation ? `${relation} · 来源资料` : "来源资料";
}

function stringifyEntityValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return businessValueLabel(value.trim());
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => stringifyEntityValue(item)).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => {
        const text = stringifyEntityValue(raw);
        return text ? `${businessFieldLabel(key)}：${text}` : "";
      })
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ");
  }
  return "";
}

function businessValueLabel(value: string): string {
  const map: Record<string, string> = {
    active: "活跃",
    inactive: "停用",
    authoritative: "已确认",
    candidate: "待核对",
    stale: "已过期",
    unconfirmed: "未确认",
  };
  return map[value.toLowerCase()] || value;
}

function relationLabel(value: string | null | undefined): string {
  if (!value) return "";
  const map: Record<string, string> = {
    mention: "提到",
    mentions: "提到",
    source: "来源",
    extracted_from: "提取自",
    evidence: "证据",
    related: "关联",
  };
  return map[value.toLowerCase()] || "";
}

function trimTag(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 16 ? `${compact.slice(0, 16)}...` : compact;
}
