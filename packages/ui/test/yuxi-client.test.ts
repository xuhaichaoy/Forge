import { normalizeYuxiKnowledgeDatabase } from "../src/lib/yuxi-client";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export function mapsKnowledgeRouterKbIdToExistingDbIdField(): void {
  const database = normalizeYuxiKnowledgeDatabase({
    kb_id: "kb_123",
    database_name: "方案素材库",
    description: "proposal",
  });
  assert(database.db_id === "kb_123", "kb_id should be surfaced as db_id");
  assert(database.name === "方案素材库", "database_name should be surfaced as name");
}

export function preservesExistingDbIdWhenKbIdIsMissing(): void {
  const database = normalizeYuxiKnowledgeDatabase({
    db_id: "db_legacy",
    name: "旧知识库",
  });
  assert(database.db_id === "db_legacy", "legacy db_id should stay available");
  assert(database.name === "旧知识库", "existing name should stay available");
}
