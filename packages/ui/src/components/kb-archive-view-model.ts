import type { YuxiEntity } from "../lib/yuxi-client";
import { resolveTabConfig } from "./kb-archive-model";

export interface ArchiveCategory {
  type: string;
  label: string;
  count: number;
}

export function aggregateArchiveCategories(entities: YuxiEntity[]): ArchiveCategory[] {
  const counts = new Map<string, number>();
  for (const item of entities) {
    const type = (item.entity_type ?? "").trim();
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, label: resolveTabConfig(type).label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

export function applyEntityFilters(
  items: YuxiEntity[],
  authorityFilter: string,
  filters: Record<string, string>,
  config: Array<{ label: string; options: readonly string[] }>,
): YuxiEntity[] {
  let next = authorityFilter === "all"
    ? items
    : items.filter((item) => (item.authority_status || "unconfirmed") === authorityFilter);
  for (const filter of config) {
    const value = filters[filter.label];
    if (!value || filter.label === "排序") continue;
    next = next.filter((item) => entityFilterText(item).includes(value.toLowerCase()));
  }
  const sortValue = filters["排序"];
  return sortValue ? [...next].sort((a, b) => compareEntities(a, b, sortValue)) : next;
}

export function entityFilterText(item: YuxiEntity): string {
  const parts = [
    item.canonical_name,
    item.description,
    ...(item.aliases ?? []),
    JSON.stringify(item.attributes ?? {}),
    JSON.stringify(item.metrics ?? {}),
  ].filter(Boolean);
  return parts.join(" ").toLowerCase();
}

export function compareEntities(a: YuxiEntity, b: YuxiEntity, sortValue: string): number {
  if (sortValue.includes("提及") || sortValue.includes("复用") || sortValue.includes("项目数") || sortValue.includes("采购次数") || sortValue.includes("中标次数") || sortValue.includes("发生次数")) {
    return (b.reference_count ?? 0) - (a.reference_count ?? 0);
  }
  if (sortValue.includes("时间") || sortValue.includes("活跃") || sortValue.includes("触达") || sortValue.includes("更新")) {
    return dateValue(b.updated_at) - dateValue(a.updated_at);
  }
  return String(a.canonical_name ?? "").localeCompare(String(b.canonical_name ?? ""), "zh-CN");
}

export function dateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function parseAttributeDraft(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("请先填写要补充的信息。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("补充信息格式不正确，请按结构化模板填写。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("补充信息需要是一组字段和值。");
  }
  return parsed as Record<string, unknown>;
}
