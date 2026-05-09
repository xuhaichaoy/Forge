import { useState, type ReactNode } from "react";
import { formatUnknown, stringField } from "../lib/format";
import {
  assistantMessageText,
  commandOutputText,
  commandText,
  formatItemDetail,
  isItemInProgress,
  itemText,
  itemType,
  mcpServerName,
  mcpSourceTitle,
  mcpToolName,
  type AccumulatedThreadItem,
} from "../state/render-groups";
import type { OpenThreadHandler } from "./open-thread";

type ThreadItem = AccumulatedThreadItem;
type ItemRecord = ThreadItem & Record<string, unknown>;

export type ToolActivityDetailViewModel =
  | {
      kind: "execSummary";
      id: string;
      running: boolean;
      label: string;
    }
  | {
      kind: "exec";
      id: string;
      running: boolean;
      command: string;
      cwd: string;
      output: string;
      status: string;
      footer: string;
    }
  | {
      kind: "patch";
      id: string;
      running: boolean;
      changes: PatchChangeViewModel[];
      status: string;
    }
  | {
      kind: "tool";
      id: string;
      running: boolean;
      name: string;
      toolKind: "MCP" | "Tool";
      argumentsText: string;
      resultText: string;
      errorText: string;
      status: string;
    }
  | {
      kind: "pendingTool";
      id: string;
      running: boolean;
      name: string;
      source: string;
      label: string;
      status: string;
    }
  | {
      kind: "webSearch";
      id: string;
      running: boolean;
      detail: string;
      faviconUrl: string | null;
    }
  | {
      kind: "multiAgent";
      id: string;
      running: boolean;
      rows: MultiAgentRowViewModel[];
    }
  | {
      kind: "assistant";
      id: string;
      running: boolean;
      text: string;
    }
  | {
      kind: "text";
      id: string;
      running: boolean;
      title: string;
      text: string;
    };

export interface MultiAgentRowViewModel {
  key: string;
  parts: MultiAgentRowPart[];
  text: string;
}

export type MultiAgentRowPart =
  | { kind: "text"; text: string }
  | { kind: "prompt"; text: string }
  | {
      kind: "agent";
      color: string;
      label: string;
      threadId: string;
      title: string | null;
      model: string | null;
      role: string | null;
    };

export function multiAgentRowText(parts: MultiAgentRowPart[]): string {
  return parts.map((part) => part.kind === "agent" ? part.label : part.text).join("");
}

export function multiAgentAgentColor(threadId: string): string {
  const palette = [
    "#2f7a63",
    "#6f5fb5",
    "#b05d35",
    "#2d75a8",
    "#8a5a2b",
    "#2f7b8f",
    "#9a4f74",
    "#5d7334",
  ];
  let hash = 0;
  for (let index = 0; index < threadId.length; index += 1) {
    hash = (hash * 31 + threadId.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0];
}

export interface PatchChangeViewModel {
  action: "Created" | "Deleted" | "Edited";
  path: string;
  diff: string;
}

export function ToolActivityDetail({
  item,
  onOpenThreadId,
}: {
  item: ThreadItem;
  onOpenThreadId?: OpenThreadHandler;
}) {
  const detail = toolActivityDetailViewModel(item);
  if (detail.kind === "webSearch") {
    return (
      <div className="hc-tool-detail-row hc-tool-detail-web-search-row">
        {detail.faviconUrl && (
          <img
            alt=""
            className="hc-tool-detail-web-search-favicon"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            src={detail.faviconUrl}
          />
        )}
        <span>{detail.detail}</span>
      </div>
    );
  }
  if (detail.kind === "multiAgent") {
    return (
      <>
        {detail.rows.map((row) => (
          <div className="hc-tool-detail-row" key={row.key}>
            {row.parts.map((part, index) => {
              if (part.kind === "text") return <span key={`${row.key}:text:${index}`}>{part.text}</span>;
              if (part.kind === "prompt") return <MultiAgentPrompt key={`${row.key}:prompt:${index}`} text={part.text} />;
              if (!onOpenThreadId) {
                return (
                  <span
                    className="hc-tool-detail-agent"
                    key={`${row.key}:agent:${part.threadId}`}
                    style={{ color: part.color }}
                    title={part.title ?? undefined}
                  >
                    {part.label}
                  </span>
                );
              }
              return (
                <button
                  className="hc-tool-detail-agent hc-tool-detail-agent-button"
                  key={`${row.key}:agent:${part.threadId}`}
                  style={{ color: part.color }}
                  title={part.title ?? undefined}
                  type="button"
                  onClick={() => onOpenThreadId(part.threadId, {
                    displayName: part.label,
                    model: part.model,
                    role: part.role,
                  })}
                >
                  {part.label}
                </button>
              );
            })}
          </div>
        ))}
      </>
    );
  }
  if (detail.kind === "assistant") {
    return <div className="hc-tool-detail-prose">{detail.text}</div>;
  }
  if (detail.kind === "execSummary") {
    return (
      <div className={`hc-tool-detail-row hc-tool-detail-command-row ${detail.running ? "is-running" : ""}`}>
        {detail.label}
      </div>
    );
  }
  if (detail.kind === "exec") {
    return (
      <section className={`hc-exec-shell ${detail.running ? "is-running" : ""}`}>
        <div className="hc-exec-shell-command">
          <span>$</span>
          <code>{detail.command}</code>
        </div>
        {detail.cwd && <div className="hc-exec-shell-cwd">{detail.cwd}</div>}
        {detail.output && (
          <pre className="hc-exec-shell-output">
            <code>{detail.output}</code>
          </pre>
        )}
        {detail.footer && <div className="hc-exec-shell-footer">{detail.footer}</div>}
      </section>
    );
  }
  if (detail.kind === "patch") {
    return (
      <section className={`hc-tool-detail-stack patch ${detail.running ? "is-running" : ""}`}>
        {detail.changes.length > 0
          ? detail.changes.map((change, index) => (
              <div className="hc-tool-detail-change" key={`${change.path}:${index}`}>
                <div className="hc-tool-detail-change-title">
                  <span>{change.action}</span>
                  <code>{change.path}</code>
                </div>
                {change.diff && <CodeBlock diff text={change.diff} />}
              </div>
            ))
          : <div className="hc-tool-detail-row">No file changes were provided.</div>}
      </section>
    );
  }
  if (detail.kind === "tool") {
    return (
      <section className={`hc-tool-detail-stack tool ${detail.running ? "is-running" : ""}`}>
        <div className="hc-tool-detail-line">
          <span className="hc-tool-detail-title">{detail.name}</span>
          <small>{detail.toolKind}{detail.status ? ` · ${detail.status}` : ""}</small>
        </div>
        {detail.argumentsText && <LabeledCode label="Parameters" text={detail.argumentsText} />}
        {detail.resultText && <LabeledCode label="Result" text={detail.resultText} />}
        {detail.errorText && <LabeledCode label="Error" text={detail.errorText} />}
      </section>
    );
  }
  if (detail.kind === "pendingTool") {
    return (
      <div
        className={`hc-tool-detail-row hc-tool-detail-tool-row ${detail.running ? "is-running" : ""}`}
        title={detail.name}
      >
        <span className="hc-tool-detail-source">{detail.source}</span>
        <span className="hc-tool-detail-tool-label">{detail.label}</span>
      </div>
    );
  }
  return (
    <section className={`hc-tool-detail-stack text ${detail.running ? "is-running" : ""}`}>
      <div className="hc-tool-detail-line">
        <span className="hc-tool-detail-title">{detail.title}</span>
      </div>
      <CodeBlock text={detail.text || "..."} />
    </section>
  );
}

function MultiAgentPrompt({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      className={`hc-tool-detail-prompt ${expanded ? "is-expanded" : ""}`}
      type="button"
      onClick={() => setExpanded((value) => !value)}
    >
      {text}
    </button>
  );
}

export function toolActivityDetailViewModel(item: ThreadItem): ToolActivityDetailViewModel {
  const type = itemType(item);
  const record = item as ItemRecord;
  const running = isItemInProgress(item);
  const status = statusLabel(record.status);
  if (type === "exec") {
    const summary = execSummaryLabel(record, running);
    if (summary) {
      return {
        kind: "execSummary",
        id: item.id,
        running,
        label: summary,
      };
    }
    return {
      kind: "exec",
      id: item.id,
      running,
      command: commandText(item) || "command",
      cwd: stringField(record, "cwd"),
      output: commandOutputText(item),
      status,
      footer: execFooter(record, running),
    };
  }
  if (type === "patch") {
    return {
      kind: "patch",
      id: item.id,
      running,
      changes: patchChanges(record).map((change) => ({
        action: patchAction(patchKind(change)),
        path: patchPath(change),
        diff: stringField(change, "diff"),
      })),
      status,
    };
  }
  if (type === "mcp-tool-call") {
    const server = mcpServerName(item) || "mcp";
    const tool = mcpToolName(item) || "tool";
    const name = `${server}:${tool}`;
    if (running) {
      return {
        kind: "pendingTool",
        id: item.id,
        running,
        name,
        source: mcpSourceTitle(server),
        label: `Calling ${tool}`,
        status: status || "pending",
      };
    }
    const invocation = recordObject(record.invocation);
    return {
      kind: "tool",
      id: item.id,
      running,
      name,
      toolKind: "MCP",
      argumentsText: formatUnknown(record.arguments ?? invocation.arguments),
      resultText: toolResultText(record.result),
      errorText: formatUnknown(record.error),
      status,
    };
  }
  if (type === "dynamic-tool-call") {
    const name = [stringField(record, "namespace"), stringField(record, "tool") || "tool"].filter(Boolean).join(".");
    return {
      kind: "tool",
      id: item.id,
      running,
      name,
      toolKind: "Tool",
      argumentsText: formatUnknown(record.arguments),
      resultText: formatUnknown(record.result ?? record.contentItems),
      errorText: formatUnknown(record.error),
      status,
    };
  }
  if (type === "web-search") {
    return {
      kind: "webSearch",
      id: item.id,
      running,
      detail: webSearchDetail(record),
      faviconUrl: webSearchFaviconUrl(record),
    };
  }
  if (type === "multi-agent-action") {
    return {
      kind: "multiAgent",
      id: item.id,
      running,
      rows: multiAgentRows(record),
    };
  }
  if (type === "assistant-message") {
    return {
      kind: "assistant",
      id: item.id,
      running,
      text: assistantMessageText(item),
    };
  }
  return {
    kind: "text",
    id: item.id,
    running,
    title: itemType(item),
    text: formatItemDetail(item) || itemText(item) || formatUnknown(item),
  };
}

function LabeledCode({ label, text }: { label: string; text: string }) {
  return (
    <div className="hc-tool-detail-section">
      <div className="hc-tool-detail-section-label">{label}</div>
      <CodeBlock text={text} />
    </div>
  );
}

function CodeBlock({ text, diff = false }: { text: string; diff?: boolean }) {
  return (
    <pre className={diff ? "is-diff" : undefined}>
      <code>{diff ? renderDiffText(text) : text}</code>
    </pre>
  );
}

function renderDiffText(text: string): ReactNode[] {
  return text.split("\n").map((line, index) => {
    const className = line.startsWith("+")
      ? "hc-diff-add"
      : line.startsWith("-")
        ? "hc-diff-remove"
        : line.startsWith("@@")
          ? "hc-diff-hunk"
          : "hc-diff-context";
    return <span className={className} key={index}>{line || " "}</span>;
  });
}

function statusLabel(status: unknown): string {
  if (typeof status === "string") return status;
  if (status === null || status === undefined) return "";
  return formatUnknown(status);
}

function execFooter(record: ItemRecord, running: boolean): string {
  if (running) return "";
  if (record.executionStatus === "interrupted") return "Stopped";
  const exitCode = execExitCode(record);
  if (exitCode === 0) return "";
  if (exitCode !== null) return `Exit code ${exitCode}`;
  return statusLabel(record.status);
}

function execSummaryLabel(record: ItemRecord, running: boolean): string {
  const action = execSummaryAction(record);
  if (!action) return "";
  if (action.type === "read") {
    if (running && !action.finished) return "";
    return `${action.finished === false ? "Reading" : "Read"} ${displayPath(action.path)}`;
  }
  if (action.type === "search") {
    const verb = running || action.finished === false ? "Searching" : "Searched";
    const query = action.query.trim();
    const path = action.path.trim();
    if (query && path) return `${verb} for ${query} in ${displayPath(path)}`;
    if (query) return `${verb} for ${query}`;
    if (path) return `${verb} ${displayPath(path)}`;
    return `${verb} files`;
  }
  if (action.type === "list_files") {
    const verb = running || action.finished === false ? "Listing" : "Listed";
    return action.path.trim() ? `${verb} files in ${displayPath(action.path)}` : `${verb} files`;
  }
  return "";
}

type ExecSummaryAction =
  | { type: "read"; path: string; finished: boolean | null }
  | { type: "search"; path: string; query: string; finished: boolean | null }
  | { type: "list_files"; path: string; finished: boolean | null };

function execSummaryAction(record: ItemRecord): ExecSummaryAction | null {
  const direct = normalizeExecSummaryAction(recordObject(record.parsedCmd));
  if (direct) return direct;
  const actions = Array.isArray(record.commandActions)
    ? record.commandActions
    : Array.isArray(record.parsedCmd) ? record.parsedCmd : [];
  for (const raw of actions) {
    const action = normalizeExecSummaryAction(recordObject(raw));
    if (action) return action;
  }
  return null;
}

function normalizeExecSummaryAction(record: Record<string, unknown>): ExecSummaryAction | null {
  const type = stringField(record, "type");
  const finished = typeof record.isFinished === "boolean" ? record.isFinished : null;
  if (type === "read") {
    const path = stringField(record, "path") || stringField(record, "name");
    return path ? { type, path, finished } : null;
  }
  if (type === "search") {
    return {
      type,
      path: stringField(record, "path"),
      query: stringField(record, "query"),
      finished,
    };
  }
  if (type === "list_files" || type === "listFiles") {
    return {
      type: "list_files",
      path: stringField(record, "path"),
      finished,
    };
  }
  return null;
}

function displayPath(path: string): string {
  const trimmed = path.trim().replace(/^\.\//, "");
  if (!trimmed) return "file";
  return trimmed.length > 80 ? `...${trimmed.slice(-77)}` : trimmed;
}

function execExitCode(record: ItemRecord): number | null {
  if (typeof record.exitCode === "number" && Number.isFinite(record.exitCode)) return record.exitCode;
  const output = recordObject(record.output);
  return typeof output.exitCode === "number" && Number.isFinite(output.exitCode) ? output.exitCode : null;
}

function webSearchDetail(record: ItemRecord): string {
  const action = webSearchActionDetail(record.action);
  const query = stringField(record, "query").trim();
  return action || query || (isItemInProgress(record) ? "Searching the web" : "Searched web");
}

function webSearchActionDetail(action: unknown): string {
  if (!action || typeof action !== "object") return "";
  const record = action as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type === "search") {
    const query = stringField(record, "query").trim();
    if (query) return cleanWebSearchQuery(query);
    const queries = Array.isArray(record.queries)
      ? record.queries.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : [])
      : [];
    if (queries.length > 1) return `${cleanWebSearchQuery(queries[0] ?? "")} ...`;
    return cleanWebSearchQuery(queries[0] ?? "");
  }
  if (type === "openPage") return stringField(record, "url").trim();
  if (type === "findInPage") {
    const pattern = stringField(record, "pattern").trim();
    const url = stringField(record, "url").trim();
    if (pattern && url) return `'${pattern}' in ${url}`;
    return pattern ? `'${pattern}'` : url;
  }
  return "";
}

const WEB_SEARCH_SITE_RE = /\bsite:([^\s]+)/giu;
const WEB_SEARCH_OR_RE = /\bOR\b/gu;

function cleanWebSearchQuery(query: string): string {
  const domains: string[] = [];
  const withoutSites = query.replace(WEB_SEARCH_SITE_RE, (match, domain: string) => {
    const normalized = normalizedSearchDomain(domain);
    if (!normalized) return match;
    if (!domains.includes(normalized)) domains.push(normalized);
    return "";
  });
  if (domains.length === 0) return query;
  const terms = withoutSites.replace(WEB_SEARCH_OR_RE, " ").replace(/\s+/gu, " ").trim();
  return terms ? `${terms} | ${domains.join(" · ")}` : query;
}

function normalizedSearchDomain(domain: string): string | null {
  try {
    return new URL(`https://${domain}`).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
}

const WEB_SEARCH_URL_RE = /\bhttps?:\/\/[^\s"'<>]+/iu;
const WEB_SEARCH_SITE_SINGLE_RE = /\bsite:([^\s]+)/iu;

export function webSearchFaviconUrl(record: ItemRecord): string | null {
  const actionUrl = webSearchActionUrl(record.action);
  if (actionUrl) return webSearchFaviconGoogleUrl(actionUrl);
  for (const query of webSearchFaviconQueryCandidates(record)) {
    const url = webSearchQueryUrl(query);
    if (url) return webSearchFaviconGoogleUrl(url);
  }
  return null;
}

function webSearchActionUrl(action: unknown): URL | null {
  if (!action || typeof action !== "object") return null;
  const record = action as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type !== "openPage" && type !== "findInPage") return null;
  return parseWebSearchUrl(stringField(record, "url"));
}

function webSearchFaviconQueryCandidates(record: ItemRecord): string[] {
  const action = recordObject(record.action);
  if (stringField(action, "type") === "search") {
    return [
      stringField(action, "query"),
      ...arrayStringItems(action.queries),
      stringField(record, "query"),
    ].filter((value) => value.trim().length > 0);
  }
  const query = stringField(record, "query");
  return query.trim() ? [query] : [];
}

function webSearchQueryUrl(query: string): URL | null {
  const siteMatch = WEB_SEARCH_SITE_SINGLE_RE.exec(query);
  const candidate = siteMatch?.[1] ?? WEB_SEARCH_URL_RE.exec(query)?.[0] ?? "";
  return parseWebSearchUrl(candidate);
}

function parseWebSearchUrl(value: string): URL | null {
  const cleaned = trimSearchUrlCandidate(value);
  if (!cleaned) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+\-.]*:\/\//iu.test(cleaned) ? cleaned : `https://${cleaned}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function trimSearchUrlCandidate(value: string): string {
  return value.trim().replace(/^[("'`]+|[)"'`,.;!?]+$/gu, "");
}

function webSearchFaviconGoogleUrl(url: URL): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(webSearchFaviconDomain(url.hostname))}&sz=32`;
}

function webSearchFaviconDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const secondLevel = parts.at(-2);
  const topLevel = parts.at(-1);
  if (topLevel?.length === 2 && secondLevel != null && secondLevel.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function arrayStringItems(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => typeof item === "string" ? [item] : []) : [];
}

function toolResultText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const record = recordObject(value);
  if (stringField(record, "type") === "error") return stringField(record, "error") || formatUnknown(value);
  const content = Array.isArray(record.content)
    ? record.content.map(toolResultContentText).filter(Boolean).join("\n\n")
    : "";
  const structured = record.structuredContent ?? record.structured_content;
  const structuredText = structured === null || structured === undefined ? "" : formatUnknown(structured);
  return [content, structuredText].filter(Boolean).join("\n\n") || formatUnknown(value);
}

function toolResultContentText(value: unknown): string {
  if (!value || typeof value !== "object") return formatUnknown(value);
  const record = value as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type === "text") return stringField(record, "text");
  if (type === "image") return `Image output: ${stringField(record, "mimeType") || stringField(record, "mime_type") || "image"}`;
  if (type === "audio") return `Audio output: ${stringField(record, "mimeType") || stringField(record, "mime_type") || "audio"}`;
  if (type === "resource_link") return `Resource: ${stringField(record, "title") || stringField(record, "name") || stringField(record, "uri")}`;
  if (type === "embedded_resource") {
    const resource = recordObject(record.resource);
    const title = stringField(resource, "title") || stringField(resource, "name") || stringField(resource, "uri") || "resource";
    const text = stringField(resource, "text");
    return text ? `Resource: ${title}\n\n${text}` : `Resource: ${title}`;
  }
  return formatUnknown(value);
}

function multiAgentRows(record: ItemRecord): MultiAgentRowViewModel[] {
  const receiverIds = multiAgentReceiverThreadIds(record);
  const action = multiAgentAction(record);
  const status = multiAgentStatus(record);
  const prompt = stringField(record, "prompt").trim();
  if (receiverIds.length === 0) {
    return [textMultiAgentRow(`row-generic-${record.id}`, multiAgentRowVerb(action, status))];
  }

  const rows: MultiAgentRowViewModel[] = receiverIds.map((threadId) => {
    const agent = multiAgentAgentPart(record, threadId);
    const stateSuffix = multiAgentStateSuffix(record, threadId);
    if (action === "spawnAgent" && status === "completed" && prompt) {
      return agentMultiAgentRow(`row-${record.id}-${threadId}`, [
        "Created ",
        agent,
        " with the instructions: ",
        { kind: "prompt", text: prompt },
      ]);
    }
    if (action === "sendInput" && prompt) {
      return agentMultiAgentRow(`row-${record.id}-${threadId}`, [
        `${multiAgentSendInputPromptVerb(status)} `,
        agent,
        ": ",
        { kind: "prompt", text: prompt },
      ]);
    }
    return agentMultiAgentRow(`row-${record.id}-${threadId}`, [
      `${multiAgentRowVerb(action, status)} `,
      agent,
      stateSuffix,
    ]);
  });

  if (action !== "spawnAgent" && action !== "sendInput" && prompt) {
    rows.push(agentMultiAgentRow(`meta-prompt-${record.id}`, ["Input: ", { kind: "prompt", text: prompt }]));
  }
  return rows;
}

function textMultiAgentRow(key: string, text: string): MultiAgentRowViewModel {
  const parts: MultiAgentRowPart[] = [{ kind: "text", text }];
  return { key, parts, text };
}

function agentMultiAgentRow(key: string, rawParts: Array<string | MultiAgentRowPart>): MultiAgentRowViewModel {
  const parts = rawParts.flatMap((part) => {
    if (typeof part !== "string") return [part];
    return part ? [{ kind: "text" as const, text: part }] : [];
  });
  return { key, parts, text: multiAgentRowText(parts) };
}

function multiAgentReceiverThreadIds(record: ItemRecord): string[] {
  const ids = new Set<string>();
  const direct = Array.isArray(record.receiverThreadIds) ? record.receiverThreadIds : [];
  for (const value of direct) {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  }
  if (Array.isArray(record.receiverThreads)) {
    for (const thread of record.receiverThreads) {
      const id = objectField(thread, "threadId") ?? objectField(thread, "id");
      if (id) ids.add(id);
    }
  }
  const states = record.agentsStates;
  if (states && typeof states === "object") {
    for (const id of Object.keys(states)) {
      if (id.trim()) ids.add(id.trim());
    }
  }
  return Array.from(ids).sort();
}

function multiAgentAction(record: ItemRecord): string {
  return stringField(record, "action") || stringField(record, "tool") || "agent";
}

function multiAgentStatus(record: ItemRecord): string {
  return stringField(record, "status") || "completed";
}

function multiAgentAgentPart(record: ItemRecord, threadId: string): MultiAgentRowPart {
  const receiver = multiAgentReceiverInfo(record, threadId);
  const label = stripLeadingAt(receiver.title || shortId(threadId));
  const roleLabel = receiver.role ? `${label} (${receiver.role})` : label;
  const model = receiver.model || multiAgentSpawnModel(record);
  return {
    kind: "agent",
    color: multiAgentAgentColor(threadId),
    label: roleLabel,
    threadId,
    title: model ? `Uses ${model}` : null,
    model: model || null,
    role: receiver.role || null,
  };
}

function multiAgentReceiverInfo(record: ItemRecord, threadId: string): { model: string; role: string; title: string } {
  if (!Array.isArray(record.receiverThreads)) return { model: "", role: "", title: "" };
  for (const receiver of record.receiverThreads) {
    if (!receiver || typeof receiver !== "object") continue;
    const receiverRecord = receiver as Record<string, unknown>;
    const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
    if (id !== threadId) continue;
    const thread = receiverRecord.thread;
    const threadRecord = thread && typeof thread === "object" ? thread as Record<string, unknown> : null;
    return {
      model: stringField(receiverRecord, "model") || (threadRecord ? stringField(threadRecord, "model") : ""),
      role: multiAgentRole(receiverRecord) || (threadRecord ? multiAgentRole(threadRecord) : ""),
      title: receiverTitle(receiverRecord, threadRecord),
    };
  }
  return { model: "", role: "", title: "" };
}

function multiAgentRole(thread: Record<string, unknown>): string {
  const raw = stringField(thread, "agentRole");
  const role = raw.trim();
  return role && role !== "default" ? role : "";
}

function receiverTitle(receiver: Record<string, unknown>, thread: Record<string, unknown> | null): string {
  return (
    stringField(receiver, "agentNickname")
    || stringField(receiver, "agentName")
    || stringField(receiver, "displayName")
    || stringField(receiver, "name")
    || (thread
      ? stringField(thread, "agentNickname")
        || stringField(thread, "agentName")
        || stringField(thread, "displayName")
        || stringField(thread, "name")
        || stringField(thread, "title")
        || stringField(thread, "preview")
      : "")
  ).trim();
}

function multiAgentSpawnModel(record: ItemRecord): string {
  return multiAgentAction(record) === "spawnAgent" ? stringField(record, "model").trim() : "";
}

function multiAgentStateSuffix(record: ItemRecord, threadId: string): string {
  const action = multiAgentAction(record);
  if (action === "closeAgent" || action === "resumeAgent") return "";
  const states = record.agentsStates;
  if (!states || typeof states !== "object") return "";
  const state = (states as Record<string, unknown>)[threadId];
  if (!state || typeof state !== "object") return "";
  const stateRecord = state as Record<string, unknown>;
  const status = multiAgentStateStatusLabel(stringField(stateRecord, "status"));
  if (!status) return "";
  const message = stringField(stateRecord, "message").trim();
  return message ? ` (${status}: ${message})` : ` (${status})`;
}

function multiAgentStateStatusLabel(status: string): string {
  switch (status) {
    case "pendingInit":
      return "pending init";
    case "notFound":
      return "not found";
    default:
      return status;
  }
}

function multiAgentRowVerb(action: string, status: string): string {
  if (action === "sendInput" && status === "completed") return "Messaged";
  if (action === "sendInput" && status === "failed") return "Failed messaging";
  if (action === "sendInput") return "Messaging";
  if (action === "spawnAgent" && status === "completed") return "Spawned";
  if (action === "spawnAgent" && status === "failed") return "Failed spawning";
  if (action === "spawnAgent") return "Spawning";
  if (action === "resumeAgent" && status === "completed") return "Resumed";
  if (action === "resumeAgent" && status === "failed") return "Failed resuming";
  if (action === "resumeAgent") return "Resuming";
  if (action === "closeAgent" && status === "completed") return "Closed";
  if (action === "closeAgent" && status === "failed") return "Failed closing";
  if (action === "closeAgent") return "Closing";
  return status === "inProgress" ? "Working with agents" : "Updated agents";
}

function multiAgentSendInputPromptVerb(status: string): string {
  if (status === "failed") return "Failed to message";
  if (status === "completed") return "Messaged";
  return "Messaging";
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function objectField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function stripLeadingAt(value: string): string {
  return value.trim().startsWith("@") ? value.trim().slice(1) : value.trim();
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function patchChanges(record: ItemRecord): Record<string, unknown>[] {
  if (Array.isArray(record.changes)) {
    return record.changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object");
  }
  if (!record.changes || typeof record.changes !== "object") return [];
  return Object.entries(record.changes as Record<string, unknown>).flatMap(([path, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const change = value as Record<string, unknown>;
    return [{ ...change, path: stringField(change, "path") || path }];
  });
}

function patchKind(change: Record<string, unknown>): "add" | "delete" | "update" {
  const directType = stringField(change, "type");
  if (directType === "add" || directType === "delete") return directType;
  if (directType === "update") return "update";
  const kind = change.kind;
  if (typeof kind === "string") return kind === "add" || kind === "delete" ? kind : "update";
  if (kind && typeof kind === "object") {
    const type = stringField(kind, "type");
    return type === "add" || type === "delete" ? type : "update";
  }
  return "update";
}

function patchAction(kind: "add" | "delete" | "update"): PatchChangeViewModel["action"] {
  if (kind === "add") return "Created";
  if (kind === "delete") return "Deleted";
  return "Edited";
}

function patchPath(change: Record<string, unknown>): string {
  return stringField(change, "path") || stringField(change, "newPath") || stringField(change, "oldPath") || "file";
}
