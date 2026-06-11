import type { ReactNode } from "react";
import type { PendingServerRequest } from "../state/codex-reducer";
import type { PendingRequestDetail } from "../state/approval-requests";
import {
  CommandPreview,
  commandPreviewText,
  looksLikeCommandOrPath,
} from "./pending-request-command-preview";
import { McpToolApprovalParams } from "./mcp-tool-approval-preview";
import { useHiCodexIntl } from "./i18n-provider";

interface RequestDetailItem {
  label: string;
  value: string;
  code?: boolean;
  values?: string[];
}

export type RequestKind =
  | "command"
  | "file-change"
  | "user-input"
  | "option-picker"
  | "setup-context-picker"
  | "mcp"
  | "tool-call"
  | "permission"
  | "unknown";

export function RequestDetailList({ details }: { details: RequestDetailItem[] }) {
  if (details.length === 0) return null;
  return (
    <div className="hc-request-panel-details">
      {details.map((item) => (
        <RequestDetailRow key={`${item.label}:${item.value}`} label={item.label}>
          {item.values
            ? (
              <span className="hc-request-detail-code-lines">
                {item.values.map((path, index) => (
                  <code key={`${path}:${index}`}>{path}</code>
                ))}
              </span>
            )
            : item.code
              ? <code>{item.value}</code>
              : item.value}
        </RequestDetailRow>
      ))}
    </div>
  );
}

function RequestDetailRow({ label, children }: { label: string; children: ReactNode }) {
  const { formatMessage } = useHiCodexIntl();
  const displayLabel =
    label === "Network" ? formatMessage({ id: "permissionRequest.network", defaultMessage: "Network" })
    : label === "Read" ? formatMessage({ id: "permissionRequest.fileRead", defaultMessage: "Read" })
    : label === "Write" ? formatMessage({ id: "permissionRequest.fileWrite", defaultMessage: "Write" })
    : label === "Read and write" ? formatMessage({ id: "permissionRequest.fileReadWrite", defaultMessage: "Read and write" })
    : label;
  return (
    <div className="hc-request-detail-row">
      <span>{displayLabel}</span>
      <span>{children}</span>
    </div>
  );
}

export function requestPanelTitle(detail: PendingRequestDetail): string {
  if (detail.title) return detail.title;
  return detail.questions[0]?.question || detail.title;
}

function detailRowFromLabelValue(label: string, value: string): RequestDetailItem {
  const code = isTechnicalDetail(label, value);
  if ((label === "Read" || label === "Write" || label === "Read and write") && value.includes(", ")) {
    const values = value.split(", ").map((path) => path.trim()).filter(Boolean);
    if (values.length > 1) return { label, value, code, values };
  }
  return { label, value, code };
}

export function requestPanelDetails(
  detail: PendingRequestDetail,
  request: PendingServerRequest,
): RequestDetailItem[] {
  const rows: RequestDetailItem[] = [];
  if (detail.reason) rows.push({ label: "Reason", value: detail.reason });
  if (detail.mcpToolApproval) return rows;
  for (const item of detail.metadata) {
    rows.push({ label: item.label, value: item.value, code: isTechnicalDetail(item.label, item.value) });
  }
  const kind = requestKind(request.method);
  if (kind === "command") {
    if (networkApprovalContext(request.params) && !detail.reason) {
      rows.push(...bodyLinesToDetailRows(detail.body, detail));
    }
    return rows;
  }
  if (kind === "file-change") return rows;
  for (const line of detail.body.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    if (line === detail.title || line === detail.questions[0]?.question) continue;
    const [label, ...rest] = line.split(": ");
    if (rest.length > 0 && label.length <= 24) {
      rows.push(detailRowFromLabelValue(label, rest.join(": ")));
    } else {
      rows.push({ label: "Details", value: line, code: looksLikeCommandOrPath(line) });
    }
  }
  return rows;
}

function bodyLinesToDetailRows(detailBody: string, detail: PendingRequestDetail): RequestDetailItem[] {
  const rows: RequestDetailItem[] = [];
  for (const line of detailBody.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    if (line === detail.title || line === detail.questions[0]?.question) continue;
    const [label, ...rest] = line.split(": ");
    if (rest.length > 0 && label.length <= 24) {
      rows.push(detailRowFromLabelValue(label, rest.join(": ")));
    } else {
      rows.push({ label: "Details", value: line, code: looksLikeCommandOrPath(line) });
    }
  }
  return rows;
}

export function RequestBodyPreview({
  detail,
  request,
  requestKind,
}: {
  detail: PendingRequestDetail;
  request: PendingServerRequest;
  requestKind: RequestKind;
}) {
  const { formatMessage } = useHiCodexIntl();
  if (detail.mcpToolApproval) {
    return <McpToolApprovalParams approval={detail.mcpToolApproval} />;
  }
  if (requestKind === "command") {
    if (networkApprovalContext(request.params)) return null;
    return <CommandPreview text={commandPreviewText(request.params)} />;
  }
  if (requestKind === "file-change") {
    const paths = detail.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (paths.length === 0 || paths.some((line) => line.startsWith("{") || line.startsWith("["))) return null;
    return (
      <div
        className="hc-request-file-preview"
        aria-label={formatMessage({ id: "hc.pendingRequest.requestedFileChanges", defaultMessage: "Requested file changes" })}
      >
        {paths.map((path) => (
          <code key={path}>{path}</code>
        ))}
      </div>
    );
  }
  return null;
}

function networkApprovalContext(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const network = (params as Record<string, unknown>).networkApprovalContext;
  return network && typeof network === "object" && !Array.isArray(network)
    ? network as Record<string, unknown>
    : null;
}

function isTechnicalDetail(label: string, value: string): boolean {
  return /cwd|thread|turn|item|request|url|path|root|namespace|tool|call|argument|parameter|server|connector/i.test(label)
    || looksLikeCommandOrPath(value);
}

export function requestKind(method: string): RequestKind {
  if (method.includes("commandExecution") || method === "execCommandApproval") return "command";
  if (method.includes("fileChange") || method === "applyPatchApproval") return "file-change";
  if (method.includes("requestUserInput") || method.includes("requestImplementation")) return "user-input";
  if (method.includes("requestOptionPicker")) return "option-picker";
  if (method.includes("requestSetupCodexContextPicker")) return "setup-context-picker";
  if (method.includes("elicitation")) return "mcp";
  if (method === "item/tool/call") return "tool-call";
  if (method.includes("permissions")) return "permission";
  return "unknown";
}
