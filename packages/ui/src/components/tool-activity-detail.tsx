import type { ReactNode } from "react";
import { formatUnknown, stringField } from "../lib/format";
import { formatItemDetail, isItemInProgress, itemText, itemType, type AccumulatedThreadItem } from "../state/render-groups";

type ThreadItem = AccumulatedThreadItem;
type ItemRecord = ThreadItem & Record<string, unknown>;

export type ToolActivityDetailViewModel =
  | {
      kind: "exec";
      id: string;
      running: boolean;
      command: string;
      cwd: string;
      output: string;
      status: string;
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
      kind: "webSearch";
      id: string;
      running: boolean;
      detail: string;
    }
  | {
      kind: "multiAgent";
      id: string;
      running: boolean;
      rows: MultiAgentRowViewModel[];
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
  | {
      kind: "agent";
      color: string;
      label: string;
      threadId: string;
      title: string | null;
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
  onOpenThreadId?: (threadId: string) => void;
}) {
  const detail = toolActivityDetailViewModel(item);
  if (detail.kind === "webSearch") {
    return <div className="hc-tool-detail-row">{detail.detail}</div>;
  }
  if (detail.kind === "multiAgent") {
    return (
      <>
        {detail.rows.map((row) => (
          <div className="hc-tool-detail-row" key={row.key}>
            {row.parts.map((part, index) => {
              if (part.kind === "text") return <span key={`${row.key}:text:${index}`}>{part.text}</span>;
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
                  onClick={() => onOpenThreadId(part.threadId)}
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
  if (detail.kind === "exec") {
    return (
      <section className={`hc-tool-detail-card exec ${detail.running ? "is-running" : ""}`}>
        <Header title="Command" meta={detail.status} />
        <code className="hc-tool-detail-command">{detail.command}</code>
        {detail.cwd && <div className="hc-tool-detail-meta">cwd: {detail.cwd}</div>}
        {detail.output && <CodeBlock text={detail.output} />}
      </section>
    );
  }
  if (detail.kind === "patch") {
    return (
      <section className={`hc-tool-detail-card patch ${detail.running ? "is-running" : ""}`}>
        <Header title="File changes" meta={detail.status} />
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
          : <CodeBlock text="No file changes were provided." />}
      </section>
    );
  }
  if (detail.kind === "tool") {
    return (
      <section className={`hc-tool-detail-card tool ${detail.running ? "is-running" : ""}`}>
        <Header title={detail.name} meta={`${detail.toolKind}${detail.status ? ` · ${detail.status}` : ""}`} />
        {detail.argumentsText && <LabeledCode label="Parameters" text={detail.argumentsText} />}
        {detail.resultText && <LabeledCode label="Result" text={detail.resultText} />}
        {detail.errorText && <LabeledCode label="Error" text={detail.errorText} />}
      </section>
    );
  }
  return (
    <section className={`hc-tool-detail-card text ${detail.running ? "is-running" : ""}`}>
      <Header title={detail.title} />
      <CodeBlock text={detail.text || "..."} />
    </section>
  );
}

export function toolActivityDetailViewModel(item: ThreadItem): ToolActivityDetailViewModel {
  const type = itemType(item);
  const record = item as ItemRecord;
  const running = isItemInProgress(item);
  const status = statusLabel(record.status);
  if (type === "exec") {
    return {
      kind: "exec",
      id: item.id,
      running,
      command: stringField(record, "command") || "command",
      cwd: stringField(record, "cwd"),
      output: stringField(record, "aggregatedOutput") || stringField(record, "result") || stringField(record, "error"),
      status,
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
    return {
      kind: "tool",
      id: item.id,
      running,
      name: `${stringField(record, "server") || "mcp"}:${stringField(record, "tool") || "tool"}`,
      toolKind: "MCP",
      argumentsText: formatUnknown(record.arguments),
      resultText: formatUnknown(record.result),
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
  return {
    kind: "text",
    id: item.id,
    running,
    title: itemType(item),
    text: formatItemDetail(item) || itemText(item) || formatUnknown(item),
  };
}

function Header({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="hc-tool-detail-header">
      <span>{title}</span>
      {meta && <small>{meta}</small>}
    </div>
  );
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
    if (query) return query;
    const queries = Array.isArray(record.queries)
      ? record.queries.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : [])
      : [];
    if (queries.length > 1) return `${queries[0]} ...`;
    return queries[0] ?? "";
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
      return agentMultiAgentRow(`row-${record.id}-${threadId}`, ["Created ", agent, ` with the instructions: ${prompt}`]);
    }
    if (action === "sendInput" && prompt) {
      return agentMultiAgentRow(`row-${record.id}-${threadId}`, [
        `${multiAgentSendInputPromptVerb(status)} `,
        agent,
        `: ${prompt}`,
      ]);
    }
    return agentMultiAgentRow(`row-${record.id}-${threadId}`, [
      `${multiAgentRowVerb(action, status)} `,
      agent,
      stateSuffix,
    ]);
  });

  if (action !== "spawnAgent" && action !== "sendInput" && prompt) {
    rows.push(textMultiAgentRow(`meta-prompt-${record.id}`, `Input: ${prompt}`));
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
  const direct = Array.isArray(record.receiverThreadIds)
    ? record.receiverThreadIds
    : Array.isArray(record.receiverThreads)
      ? record.receiverThreads.map((thread) => objectField(thread, "threadId") ?? objectField(thread, "id"))
      : [];
  return direct.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
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
  return Array.isArray(record.changes)
    ? record.changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object")
    : [];
}

function patchKind(change: Record<string, unknown>): "add" | "delete" | "update" {
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
