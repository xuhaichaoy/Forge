import {
  yuxiLibraryGovernance,
  type YuxiCategoryMeta,
  type YuxiKnowledgeDatabase,
  type YuxiMcpServer,
  type YuxiMcpServerTestResponse,
} from "../lib/yuxi-client";
import { parseYuxiTimestamp } from "./kb-library-model";

export interface BusinessSourceRow {
  name: string;
  server: YuxiMcpServer | null;
  status: "ok" | "pending" | "fail" | "archive";
  statusLabel: string;
  authorityLabel: string;
  usage: string;
  updatedLabel: string;
  issueLabel: string;
}

export function buildBusinessSourceRows({
  systems,
  servers,
  serverTests,
  selectedCategory,
  selectedDatabase,
  pendingTotal,
}: {
  systems: readonly string[];
  servers: YuxiMcpServer[];
  serverTests: Record<string, YuxiMcpServerTestResponse>;
  selectedCategory: YuxiCategoryMeta;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  pendingTotal: number;
}): BusinessSourceRow[] {
  const names = systems.length > 0
    ? [...systems]
    : servers.map((server) => server.name || server.description || "").filter(Boolean);
  return names.map((name) => {
    const server = findServerForSystem(servers, name);
    const test = server?.name ? serverTests[server.name] : null;
    const enabled = server ? server.enabled !== false : false;
    const status: BusinessSourceRow["status"] = server
      ? !enabled || test?.success === false ? "fail" : "ok"
      : "pending";
    const statusLabel = server
      ? !enabled ? "已停用" : test?.success === false ? "检查失败" : "已接入"
      : "待接入";
    return {
      name,
      server,
      status,
      statusLabel,
      authorityLabel: authorityLabel(name, selectedCategory),
      usage: sourceUsage(name, selectedCategory.label),
      updatedLabel: sourceUpdatedLabel(server, selectedDatabase),
      issueLabel: pendingTotal > 0 ? `${pendingTotal} 项进入入库问题` : "冲突进入入库问题",
    };
  });
}

function findServerForSystem(servers: YuxiMcpServer[], system: string): YuxiMcpServer | null {
  const stem = systemStem(system);
  return servers.find((server) => {
    const haystack = [
      server.name,
      server.description,
      server.transport,
      server.url,
      server.command,
      ...(server.tags ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(system.toLowerCase()) || (stem.length > 0 && haystack.includes(stem));
  }) ?? null;
}

function systemStem(system: string): string {
  return system.toLowerCase().replace(/系统|平台|后台|中心/g, "").trim();
}

function authorityLabel(system: string, category: YuxiCategoryMeta): string {
  const governance = yuxiLibraryGovernance(category.key);
  const rule = governance?.authorityRule ?? "";
  const stem = systemStem(system);
  if (rule.includes(system) || (stem && rule.includes(stem))) return "权威来源";
  if (/讲师|课程|CRM|项目|招标|投标|标书/.test(system)) return "业务来源";
  return "补充来源";
}

function sourceUsage(system: string, fallback: string): string {
  if (/CRM|客户/.test(system)) return "客户、行业、联系人";
  if (/讲师/.test(system)) return "讲师档案、报价、档期";
  if (/课程/.test(system)) return "课程大纲、课时、人群";
  if (/项目/.test(system)) return "项目复盘、案例、反馈";
  if (/招标|投标|标书/.test(system)) return "招标机会、标书、复盘";
  if (/钉钉|企微|飞书/.test(system)) return "通知、审批、业务反馈";
  return `${fallback}相关资料`;
}

function sourceUpdatedLabel(server: YuxiMcpServer | null, database: YuxiKnowledgeDatabase | null): string {
  const value = server?.updated_at || server?.created_at || database?.updated_at || null;
  if (!server) return "未同步";
  if (!value) return "已配置";
  // Yuxi timestamps are UTC and can arrive without a timezone marker.
  const date = parseYuxiTimestamp(value);
  if (!date) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function matchServers(servers: YuxiMcpServer[], expectedSystems: readonly string[]): YuxiMcpServer[] {
  if (servers.length === 0) return [];
  if (expectedSystems.length === 0) return servers;
  const matched = servers.filter((server) => {
    const haystack = [
      server.name,
      server.description,
      server.transport,
      server.url,
      server.command,
      ...(server.tags ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    return expectedSystems.some((system) => haystack.includes(system.toLowerCase().replace(/系统|平台|后台/g, "")) || haystack.includes(system.toLowerCase()));
  });
  return matched.length > 0 ? matched : servers;
}
