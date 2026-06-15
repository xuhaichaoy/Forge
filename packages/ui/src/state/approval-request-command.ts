/*
 * Command-execution approval domain (item/commandExecution/requestApproval +
 * legacy execCommandApproval), including the network-access approval branch
 * and execpolicy/network-policy amendments. Extracted verbatim from
 * ./approval-requests; the hub dispatcher composes these per-method pieces.
 */
import { stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import {
  APPROVAL_DECISION_QUESTION_ID,
  approvalDecisionQuestion,
  objectRecord,
  requestMetadata,
  type PendingRequestMetadata,
  type PendingRequestOption,
  type PendingRequestQuestion,
} from "./approval-requests-shared";
import type { PendingServerRequest } from "./codex-reducer";

export function commandApprovalQuestions(params: unknown): PendingRequestQuestion[] {
  return [approvalDecisionQuestion(commandApprovalTitle(params), commandApprovalOptions(params))];
}

function commandApprovalOptions(params: unknown): PendingRequestOption[] {
  // codex: option labels align verbatim to upstream ICU defaults —
  //   network branch:
  //     execApprovalRequest.network.menu.allowOnce       = "Yes, just this once"
  //     execApprovalRequest.network.menu.allowForSession = "Yes, and allow this host for this conversation"
  //     execApprovalRequest.network.menu.allowAlways     = "Yes, and allow this host in the future"
  //   exec branch:
  //     execApprovalRequest.menu.runOnce                          = "Yes"
  //     execApprovalRequest.menu.runAlwaysWithAmendment.prefix    = "Yes, and don't ask again for commands that start with"
  //     execApprovalRequest.menu.runAlways                        = "Yes, and don't ask again this session"
  const filterAvailable = (options: PendingRequestOption[]) =>
    filterAvailableCommandDecisionOptions(params, options);
  if (networkApprovalContext(params)) {
    return filterAvailable([
      {
        value: "accept",
        label: formatMessage({ id: "execApprovalRequest.network.menu.allowOnce", defaultMessage: "Yes, just this once" }),
        description: formatMessage({
          id: "hc.pendingRequest.command.network.acceptDescription",
          defaultMessage: "Approve only the current network attempt.",
        }),
      },
      {
        value: "acceptForSession",
        label: formatMessage({
          id: "execApprovalRequest.network.menu.allowForSession",
          defaultMessage: "Yes, and allow this host for this conversation",
        }),
        description: formatMessage({
          id: "hc.pendingRequest.command.network.acceptForSessionDescription",
          defaultMessage: "Approve this host for the current conversation.",
        }),
      },
      ...(allowNetworkPolicyAmendment(params)
        ? [{
            value: "applyNetworkPolicyAmendment",
            label: formatMessage({
              id: "execApprovalRequest.network.menu.allowAlways",
              defaultMessage: "Yes, and allow this host in the future",
            }),
            description: formatMessage({
              id: "hc.pendingRequest.command.network.allowAlwaysDescription",
              defaultMessage: "Save a host allowlist rule for future requests.",
            }),
          }]
        : []),
    ]);
  }

  const amendment = execPolicyAmendment(params);
  return filterAvailable([
    {
      value: "accept",
      label: formatMessage({ id: "execApprovalRequest.menu.runOnce", defaultMessage: "Yes" }),
      description: formatMessage({
        id: "hc.pendingRequest.command.acceptDescription",
        defaultMessage: "Approve this command execution.",
      }),
    },
    amendment
      ? {
          value: "acceptWithExecpolicyAmendment",
          label: formatMessage({
            id: "execApprovalRequest.menu.runAlwaysWithAmendment.prefix",
            defaultMessage: "Yes, and don't ask again for commands that start with",
          }),
          description: formatMessage({
            id: "hc.pendingRequest.command.amendmentDescription",
            defaultMessage: "Approve commands with the same prefix.",
          }),
          codePreview: execPolicyAmendmentText(amendment),
          ariaLabel: formatMessage(
            {
              id: "execApprovalRequest.menu.runAlwaysWithAmendment",
              defaultMessage: "Yes, and don't ask again for commands that start with {command}",
            },
            { command: execPolicyAmendmentText(amendment) },
          ),
        }
      : {
          value: "acceptForSession",
          label: formatMessage({
            id: "execApprovalRequest.menu.runAlways",
            defaultMessage: "Yes, and don't ask again this session",
          }),
          description: formatMessage({
            id: "hc.pendingRequest.command.acceptForSessionDescription",
            defaultMessage: "Approve command executions until app-server restarts.",
          }),
        },
  ]);
}

export function commandApprovalTitle(params: unknown): string {
  // codex: prompt strings align verbatim to upstream ICU defaults —
  //   execApprovalRequest.network.prompt = `Do you want to approve network access to "{host}"?`
  //   execApprovalRequest.prompt         = "Do you want to run this command?"
  const network = networkApprovalContext(params);
  if (network) {
    const host = stringField(network, "host");
    return host
      ? formatMessage(
          { id: "execApprovalRequest.network.prompt", defaultMessage: "Do you want to approve network access to \"{host}\"?" },
          { host },
        )
      : formatMessage({
          id: "hc.pendingRequest.command.networkPromptNoHost",
          defaultMessage: "Do you want to approve network access?",
        });
  }
  return formatMessage({ id: "execApprovalRequest.prompt", defaultMessage: "Do you want to run this command?" });
}

export function commandApprovalBody(params: unknown): string {
  const network = networkApprovalContext(params);
  if (network) {
    const host = stringField(network, "host");
    return host
      ? formatMessage(
          { id: "execApprovalRequest.network.reason", defaultMessage: "Reason: {host} isn't on the current network allowlist" },
          { host },
        )
      : formatMessage(
          { id: "execApprovalRequest.network.reason", defaultMessage: "Reason: {host} isn't on the current network allowlist" },
          { host: "host" },
        );
  }
  return [
    commandText(params),
    stringField(params, "cwd") ? `cwd: ${stringField(params, "cwd")}` : "",
  ].filter(Boolean).join("\n");
}

export function commandApprovalDecisionFromAnswers(
  request: PendingServerRequest,
  answers: Record<string, string[]>,
): unknown {
  const requested = answers[APPROVAL_DECISION_QUESTION_ID]?.[0];
  const available = availableCommandDecisionIds(request.params);
  if (requested && available && !available.has(requested)) return available.has("accept") ? "accept" : "decline";
  if (requested === "acceptForSession") return "acceptForSession";
  if (requested === "acceptWithExecpolicyAmendment") {
    const amendment = execPolicyAmendment(request.params);
    return amendment
      ? { acceptWithExecpolicyAmendment: { execpolicy_amendment: amendment } }
      : "acceptForSession";
  }
  if (requested === "applyNetworkPolicyAmendment") {
    const amendment = allowNetworkPolicyAmendment(request.params);
    return amendment
      ? { applyNetworkPolicyAmendment: { network_policy_amendment: amendment } }
      : "acceptForSession";
  }
  return "accept";
}

function filterAvailableCommandDecisionOptions(
  params: unknown,
  options: PendingRequestOption[],
): PendingRequestOption[] {
  const available = availableCommandDecisionIds(params);
  if (!available) return options;
  const filtered = options.filter((option) => available.has(option.value));
  return filtered;
}

function availableCommandDecisionIds(params: unknown): Set<string> | null {
  const record = objectRecord(params);
  const decisions = record?.availableDecisions;
  if (!Array.isArray(decisions)) return null;
  const ids = decisions.flatMap((decision) => {
    if (typeof decision === "string") return [decision];
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) return [];
    return Object.keys(decision);
  });
  return ids.length > 0 ? new Set(ids) : null;
}

function networkApprovalContext(params: unknown): Record<string, unknown> | null {
  const record = objectRecord(params);
  const network = record?.networkApprovalContext;
  return objectRecord(network);
}

function execPolicyAmendment(params: unknown): string[] | null {
  const record = objectRecord(params);
  const amendment = record?.proposedExecpolicyAmendment;
  if (!Array.isArray(amendment)) return null;
  if (!amendment.every((item): item is string => typeof item === "string")) return null;
  return execPolicyAmendmentText(amendment).includes("\n") || execPolicyAmendmentText(amendment).includes("\r")
    ? null
    : amendment;
}

function execPolicyAmendmentText(amendment: string[]): string {
  return amendment.join(" ");
}

function allowNetworkPolicyAmendment(params: unknown): Record<string, unknown> | null {
  const record = objectRecord(params);
  const amendments = record?.proposedNetworkPolicyAmendments;
  if (!Array.isArray(amendments)) return null;
  for (const amendment of amendments) {
    const item = objectRecord(amendment);
    if (!item || item.action !== "allow" || !stringField(item, "host")) continue;
    return item;
  }
  return null;
}

export function commandApprovalMetadata(params: unknown): PendingRequestMetadata[] {
  const metadata = requestMetadata(params, ["cwd", "threadId", "turnId", "itemId", "approvalId"]);
  if (!params || typeof params !== "object") return metadata;
  const record = params as Record<string, unknown>;
  const network = record.networkApprovalContext && typeof record.networkApprovalContext === "object"
    ? record.networkApprovalContext as Record<string, unknown>
    : null;
  if (!network) return metadata;
  const host = stringField(network, "host");
  const protocol = stringField(network, "protocol");
  return [
    ...metadata,
    ...(host ? [{ label: "Network host", value: protocol ? `${protocol}://${host}` : host }] : []),
  ];
}

function commandText(value: unknown): string {
  const command = value && typeof value === "object"
    ? (value as Record<string, unknown>).command ?? (value as Record<string, unknown>).cmd
    : null;
  if (Array.isArray(command)) return command.map((part) => String(part)).join(" ");
  return typeof command === "string" ? command : "command";
}
