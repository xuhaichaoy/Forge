import {
  buildBusinessSourceRows,
  matchServers,
} from "../src/components/kb-library-integration-view-model";
import type {
  YuxiCategoryMeta,
  YuxiKnowledgeDatabase,
  YuxiMcpServer,
} from "../src/lib/yuxi-client";

export default function runKbLibraryIntegrationViewModelTests(): void {
  buildsRowsFromGovernanceSystemsAndServerState();
  fallsBackToConfiguredServersWhenNoSystemsAreExpected();
  matchesServersByStemNameAndFallsBackToAllServers();
}

function buildsRowsFromGovernanceSystemsAndServerState(): void {
  const category = categoryFixture("lecturer", "讲师库");
  const database: YuxiKnowledgeDatabase = { updated_at: "2026-06-11T08:00:00" };
  const servers: YuxiMcpServer[] = [
    {
      name: "teacher-service",
      description: "讲师后台 MCP",
      tags: ["讲师系统"],
      enabled: true,
      updated_at: "2026-06-12T01:02:00",
    },
    {
      name: "project-service",
      description: "项目系统",
      tags: ["项目"],
      enabled: false,
    },
  ];

  const rows = buildBusinessSourceRows({
    systems: ["讲师系统", "项目系统", "CRM"],
    servers,
    serverTests: { "teacher-service": { success: true } },
    selectedCategory: category,
    selectedDatabase: database,
    pendingTotal: 3,
  });

  assertEqual(rows.length, 3, "expected one row per governed external system");
  assertEqual(rows[0]?.server?.name, "teacher-service", "teacher system should match by stem/tag");
  assertEqual(rows[0]?.status, "ok", "enabled successful server should be ok");
  assertEqual(rows[0]?.statusLabel, "已接入", "enabled successful server label");
  assertEqual(rows[0]?.authorityLabel, "权威来源", "lecturer governance marks teacher backend authoritative");
  assertEqual(rows[0]?.usage, "讲师档案、报价、档期", "teacher source usage");
  assertEqual(rows[0]?.issueLabel, "3 项进入入库问题", "pending issue count should be surfaced");
  assertEqual(rows[0]?.updatedLabel.includes("06/12"), true, "updated label should format UTC timestamp");

  assertEqual(rows[1]?.status, "fail", "disabled matched server should be fail");
  assertEqual(rows[1]?.statusLabel, "已停用", "disabled server status label");
  assertEqual(rows[2]?.status, "pending", "unmatched system should be pending");
  assertEqual(rows[2]?.updatedLabel, "未同步", "unmatched system should show unsynced");
}

function fallsBackToConfiguredServersWhenNoSystemsAreExpected(): void {
  const rows = buildBusinessSourceRows({
    systems: [],
    servers: [
      { name: "CRM", enabled: true },
      { name: "", description: "项目系统", enabled: true },
    ],
    serverTests: {},
    selectedCategory: categoryFixture("customer", "客户与行业库"),
    selectedDatabase: null,
    pendingTotal: 0,
  });

  assertEqual(rows.length, 2, "servers should seed rows when governance systems are absent");
  assertEqual(rows[0]?.name, "CRM", "server name should become row name");
  assertEqual(rows[0]?.usage, "客户、行业、联系人", "CRM source usage");
  assertEqual(rows[1]?.name, "项目系统", "server description should become fallback row name");
  assertEqual(rows[1]?.issueLabel, "冲突进入入库问题", "zero pending count should keep generic issue copy");
}

function matchesServersByStemNameAndFallsBackToAllServers(): void {
  const servers: YuxiMcpServer[] = [
    { name: "teacher", description: "讲师后台" },
    { name: "crm", description: "客户系统" },
  ];

  const matched = matchServers(servers, ["讲师系统"]);
  assertEqual(matched.length, 1, "matching expected system should narrow visible servers");
  assertEqual(matched[0]?.name, "teacher", "stem matching should include the teacher server");

  const fallback = matchServers(servers, ["法务系统"]);
  assertEqual(fallback.length, 2, "no matches should fall back to all configured servers");
}

function categoryFixture(key: string, label: string): YuxiCategoryMeta {
  return {
    key,
    label,
    line: "training_presales",
    kind: "case",
    description: "",
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
