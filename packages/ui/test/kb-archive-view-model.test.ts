import type { YuxiEntity } from "../src/lib/yuxi-client";
import {
  aggregateArchiveCategories,
  applyEntityFilters,
  compareEntities,
  dateValue,
  entityFilterText,
  parseAttributeDraft,
} from "../src/components/kb-archive-view-model";

export default function runKbArchiveViewModelTests(): void {
  aggregatesCategoriesFromRealEntityTypes();
  filtersEntitiesByAuthorityAndSearchableText();
  sortsEntitiesByArchiveSortLabels();
  parsesAttributeDraftDefensively();
}

function aggregatesCategoriesFromRealEntityTypes(): void {
  assertDeepEqual(
    aggregateArchiveCategories([
      entity({ entity_type: "teacher" }),
      entity({ entity_type: "course" }),
      entity({ entity_type: " teacher " }),
      entity({ entity_type: "" }),
      entity({ entity_type: null }),
    ]),
    [
      { type: "teacher", label: "讲师", count: 2 },
      { type: "course", label: "课程", count: 1 },
    ],
    "categories should count trimmed real entity types and skip blanks",
  );
}

function filtersEntitiesByAuthorityAndSearchableText(): void {
  const items = [
    entity({
      id: 1,
      authority_status: "candidate",
      canonical_name: "AI Leadership",
      description: "banking program",
      aliases: ["Finance course"],
      attributes: { industry: "金融" },
      metrics: { score: 4.8 },
      reference_count: 2,
    }),
    entity({
      id: 2,
      authority_status: "authoritative",
      canonical_name: "Manufacturing Coaching",
      attributes: { industry: "制造" },
      reference_count: 9,
    }),
  ];

  assert(entityFilterText(items[0]).includes("finance course"), "aliases should be searchable");
  assert(entityFilterText(items[0]).includes("金融"), "attributes should be searchable");
  assertDeepEqual(
    applyEntityFilters(
      items,
      "candidate",
      { "行业": "金融", "排序": "被提及次数" },
      [
        { label: "行业", options: ["金融"] },
        { label: "排序", options: ["被提及次数"] },
      ],
    ).map((item) => item.id),
    [1],
    "filtering should combine authority and configured text filters while ignoring the sort filter",
  );
}

function sortsEntitiesByArchiveSortLabels(): void {
  const low = entity({ id: 1, canonical_name: "Beta", reference_count: 1, updated_at: "2026-01-01T00:00:00Z" });
  const high = entity({ id: 2, canonical_name: "Alpha", reference_count: 7, updated_at: "2026-02-01T00:00:00Z" });

  assertEqual(compareEntities(low, high, "被提及次数"), 6, "mention sorting should order by reference count descending");
  assert(compareEntities(low, high, "最近活跃") > 0, "activity sorting should order by updated_at descending");
  assert(compareEntities(low, high, "名称") > 0, "fallback sorting should order by canonical name");
  assertEqual(dateValue("not-a-date"), 0, "invalid dates should sort as zero");
}

function parsesAttributeDraftDefensively(): void {
  assertDeepEqual(parseAttributeDraft("{\"industry\":\"金融\",\"score\":4.8}"), { industry: "金融", score: 4.8 }, "valid object JSON should parse");
  assertThrows(() => parseAttributeDraft(""), "empty draft should be rejected");
  assertThrows(() => parseAttributeDraft("{bad json"), "invalid JSON should be rejected");
  assertThrows(() => parseAttributeDraft("[\"industry\"]"), "arrays should be rejected");
  assertThrows(() => parseAttributeDraft("null"), "null should be rejected");
}

function entity(overrides: YuxiEntity = {}): YuxiEntity {
  return {
    id: 0,
    entity_type: "teacher",
    canonical_name: "Entity",
    description: null,
    authority_status: "unconfirmed",
    attributes: {},
    metrics: {},
    aliases: [],
    reference_count: 0,
    updated_at: null,
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`);
  }
}

function assertThrows(fn: () => unknown, message: string): void {
  let thrown = false;
  try {
    fn();
  } catch {
    thrown = true;
  }
  if (!thrown) throw new Error(`Assertion failed: ${message}`);
}
