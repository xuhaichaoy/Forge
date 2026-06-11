import { formatMessage as formatMessageModule, type I18nValues } from "../state/i18n";
import type { ConversationRenderUnit } from "../state/render-groups";

interface WorkedForRowDescriptor {
  id: string;
  defaultMessage: string;
  values?: I18nValues;
}

export interface WorkedForAggregateRow {
  key: string;
  leading: WorkedForRowDescriptor;
  compact: WorkedForRowDescriptor;
}

function aggregateRow(
  key: string,
  baseId: string,
  leadingDefault: string,
  compactDefault: string,
  values?: I18nValues,
): WorkedForAggregateRow {
  return {
    key,
    leading: { id: `${baseId}.leading`, defaultMessage: leadingDefault, values },
    compact: { id: baseId, defaultMessage: compactDefault, values },
  };
}

export function workedForAggregateRows(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): WorkedForAggregateRow[] {
  const { counts, inProgress } = unit.summary;
  const rows: WorkedForAggregateRow[] = [];

  const runningCommands = counts.runningCommands ?? 0;
  const webSearchCommands = counts.webSearchCommands ?? 0;
  const runningWebSearchCommands = counts.runningWebSearchCommands ?? 0;
  const ordinaryCommands = Math.max(counts.commands - webSearchCommands, 0);
  const runningOrdinaryCommands = Math.max(runningCommands - runningWebSearchCommands, 0);
  const completedCommands = Math.max(ordinaryCommands - runningOrdinaryCommands, 0);
  const completedWebSearchCommands = Math.max(webSearchCommands - runningWebSearchCommands, 0);
  if (inProgress && runningOrdinaryCommands > 0) {
    rows.push(aggregateRow(
      "commands.running",
      "localConversation.toolActivitySummary.commands.running",
      "{count, plural, one {Running # command} other {Running # commands}}",
      "{count, plural, one {running # command} other {running # commands}}",
      { count: runningOrdinaryCommands },
    ));
  }
  if (completedWebSearchCommands > 0) {
    rows.push(aggregateRow(
      "webSearchCommands.completed",
      "localConversation.toolActivitySummary.webSearchCommands.searched",
      "{count, plural, one {Searched web} other {Searched web # times}}",
      "{count, plural, one {searched web} other {searched web # times}}",
      { count: completedWebSearchCommands },
    ));
  }
  if (completedCommands > 0) {
    rows.push(aggregateRow(
      "commands.completed",
      "localConversation.toolActivitySummary.commands",
      "{count, plural, one {Ran # command} other {Ran # commands}}",
      "{count, plural, one {ran # command} other {ran # commands}}",
      { count: completedCommands },
    ));
  }
  if (inProgress && runningWebSearchCommands > 0) {
    rows.push(aggregateRow(
      "webSearchCommands.running",
      "localConversation.toolActivitySummary.webSearchCommands.searching",
      "Searching the web",
      "searching the web",
    ));
  }

  const runningCreated = counts.runningCreatedFiles ?? 0;
  const completedCreated = Math.max(counts.createdFiles - runningCreated, 0);
  if (inProgress && runningCreated > 0) {
    rows.push(aggregateRow(
      "created.running",
      "localConversation.toolActivitySummary.creating",
      "{count, plural, one {Creating # file} other {Creating # files}}",
      "{count, plural, one {creating # file} other {creating # files}}",
      { count: runningCreated },
    ));
  }
  if (completedCreated > 0) {
    rows.push(aggregateRow(
      "created.completed",
      "localConversation.toolActivitySummary.created",
      "{count, plural, one {Created # file} other {Created # files}}",
      "{count, plural, one {created # file} other {created # files}}",
      { count: completedCreated },
    ));
  }

  const runningEdited = counts.runningEditedFiles ?? 0;
  const completedEdited = Math.max(counts.editedFiles - runningEdited, 0);
  if (inProgress && runningEdited > 0) {
    rows.push(aggregateRow(
      "edited.running",
      "localConversation.toolActivitySummary.editing",
      "{count, plural, one {Editing # file} other {Editing # files}}",
      "{count, plural, one {editing # file} other {editing # files}}",
      { count: runningEdited },
    ));
  }
  if (completedEdited > 0) {
    rows.push(aggregateRow(
      "edited.completed",
      "localConversation.toolActivitySummary.edited",
      "{count, plural, one {Edited # file} other {Edited # files}}",
      "{count, plural, one {edited # file} other {edited # files}}",
      { count: completedEdited },
    ));
  }

  const runningDeleted = counts.runningDeletedFiles ?? 0;
  const completedDeleted = Math.max(counts.deletedFiles - runningDeleted, 0);
  if (inProgress && runningDeleted > 0) {
    rows.push(aggregateRow(
      "deleted.running",
      "localConversation.toolActivitySummary.deleting",
      "{count, plural, one {Deleting # file} other {Deleting # files}}",
      "{count, plural, one {deleting # file} other {deleting # files}}",
      { count: runningDeleted },
    ));
  }
  if (completedDeleted > 0) {
    rows.push(aggregateRow(
      "deleted.completed",
      "localConversation.toolActivitySummary.deleted",
      "{count, plural, one {Deleted # file} other {Deleted # files}}",
      "{count, plural, one {deleted # file} other {deleted # files}}",
      { count: completedDeleted },
    ));
  }

  if (counts.exploredFiles > 0 || counts.searches > 0 || counts.lists > 0) {
    const details = explorationDetails(counts.exploredFiles, counts.searches, counts.lists);
    if (inProgress) {
      rows.push(aggregateRow(
        "exploration",
        "localConversation.toolActivitySummary.exploration.exploring",
        "Exploring {details}",
        "exploring {details}",
        { details },
      ));
    } else {
      rows.push(aggregateRow(
        "exploration",
        "localConversation.toolActivitySummary.exploration",
        "Explored {details}",
        "explored {details}",
        { details },
      ));
    }
  }

  if (counts.webSearches > 0) {
    if (inProgress) {
      rows.push(aggregateRow(
        "webSearch.completed",
        "localConversation.toolActivitySummary.webSearches.searching",
        "{count, plural, one {Searching the web # time} other {Searching the web # times}}",
        "{count, plural, one {searching the web # time} other {searching the web # times}}",
        { count: counts.webSearches },
      ));
    } else {
      rows.push(aggregateRow(
        "webSearch.completed",
        "localConversation.toolActivitySummary.webSearches",
        "{count, plural, one {Searched web # time} other {Searched web # times}}",
        "{count, plural, one {searched web # time} other {searched web # times}}",
        { count: counts.webSearches },
      ));
    }
  }

  if (counts.mcpCalls > 0) {
    rows.push(aggregateRow(
      "mcp",
      "localConversation.toolActivitySummary.mcpToolCalls",
      "{count, plural, one {Called # tool} other {Called # tools}}",
      "{count, plural, one {called # tool} other {called # tools}}",
      { count: counts.mcpCalls },
    ));
  }

  if (counts.approvedRequests && counts.approvedRequests > 0) {
    rows.push(aggregateRow(
      "approved",
      "localConversation.toolActivitySummary.approvedRequests",
      "{count, plural, one {Approved request} other {Approved # requests}}",
      "{count, plural, one {approved request} other {approved # requests}}",
      { count: counts.approvedRequests },
    ));
  }
  if (counts.deniedRequests && counts.deniedRequests > 0) {
    rows.push(aggregateRow(
      "denied",
      "localConversation.toolActivitySummary.deniedRequests",
      "{count, plural, one {Denied request} other {Denied # requests}}",
      "{count, plural, one {denied request} other {denied # requests}}",
      { count: counts.deniedRequests },
    ));
  }

  return rows;
}

function explorationDetails(exploredFiles: number, searches: number, lists: number): string {
  const parts: string[] = [];
  if (exploredFiles > 0) {
    parts.push(formatMessageModule(
      { id: "localConversation.toolActivitySummary.exploration.files", defaultMessage: "{count, plural, one {# file} other {# files}}" },
      { count: exploredFiles },
    ));
  }
  if (searches > 0) {
    parts.push(formatMessageModule(
      { id: "localConversation.toolActivitySummary.exploration.searches", defaultMessage: "{count, plural, one {# search} other {# searches}}" },
      { count: searches },
    ));
  }
  if (lists > 0) {
    parts.push(formatMessageModule(
      { id: "localConversation.toolActivitySummary.exploration.lists", defaultMessage: "{count, plural, one {# list} other {# lists}}" },
      { count: lists },
    ));
  }
  return typeof Intl !== "undefined" && typeof Intl.ListFormat === "function"
    ? new Intl.ListFormat(undefined, { type: "unit", style: "long" }).format(parts)
    : parts.join(", ");
}
