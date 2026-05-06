import { buildApprovalResult, pendingRequestDetail } from "../src/state/approval-requests";
import type { PendingServerRequest } from "../src/state/codex-reducer";

function request(method: string, params?: unknown): PendingServerRequest {
  return {
    id: "test-request",
    method,
    params,
    createdAt: 0,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

export default function runApprovalRequestTests(): void {
  const commandRequest = request("item/commandExecution/requestApproval", {
    command: ["npm", "run", "typecheck"],
    cwd: "/workspace/project",
    reason: "Check UI types",
  });
  const commandDetail = pendingRequestDetail(commandRequest);
  assertEqual(commandDetail.title, "Run command", "command approval title");
  assertEqual(commandDetail.reason, "Check UI types", "command approval reason");
  assertIncludes(commandDetail.body, "npm run typecheck", "command approval command text");
  assertIncludes(commandDetail.body, "cwd: /workspace/project", "command approval cwd");
  assertDeepEqual(
    buildApprovalResult(commandRequest, true),
    { decision: "accept" },
    "command approval accept result",
  );
  assertDeepEqual(
    buildApprovalResult(commandRequest, false),
    { decision: "decline" },
    "command approval decline result",
  );

  const fileChangeRequest = request("item/fileChange/requestApproval", {
    reason: "Apply generated changes",
    changes: [
      { path: "src/main.ts", kind: "update" },
      { path: "src/style.css", kind: "add" },
      { kind: "delete" },
    ],
  });
  const fileChangeDetail = pendingRequestDetail(fileChangeRequest);
  assertEqual(fileChangeDetail.title, "Apply file changes", "file change approval title");
  assertEqual(fileChangeDetail.reason, "Apply generated changes", "file change approval reason");
  assertIncludes(fileChangeDetail.body, "src/main.ts", "file change includes first path");
  assertIncludes(fileChangeDetail.body, "src/style.css", "file change includes second path");
  assertDeepEqual(
    buildApprovalResult(fileChangeRequest, true),
    { decision: "accept" },
    "file change accept result",
  );

  const inputRequest = request("item/tool/requestUserInput", {
    questions: [
      { prompt: "Pick a profile" },
      { label: "Fallback label" },
      { metadata: { fallback: true } },
    ],
  });
  const inputDetail = pendingRequestDetail(inputRequest);
  assertEqual(inputDetail.title, "Codex needs input", "user input title");
  assertIncludes(inputDetail.body, "1. Pick a profile", "user input uses prompt fallback");
  assertIncludes(inputDetail.body, "2. Fallback label", "user input uses label fallback");
  assertIncludes(inputDetail.body, "\"fallback\": true", "user input formats unknown question fallback");
  assertDeepEqual(
    buildApprovalResult(inputRequest, true),
    { answers: {} },
    "user input accept result",
  );
  assertEqual(buildApprovalResult(inputRequest, false), null, "user input decline result");

  const permissionsRequest = request("item/permissions/requestApproval", {
    reason: "Need temporary access",
    cwd: "/workspace/project",
    permissions: {
      network: { allowedHosts: ["example.com"] },
      fileSystem: { writableRoots: ["/workspace/project"] },
    },
  });
  const permissionsDetail = pendingRequestDetail(permissionsRequest);
  assertEqual(permissionsDetail.title, "Permission request", "permissions title");
  assertEqual(permissionsDetail.reason, "Need temporary access", "permissions reason");
  assertIncludes(permissionsDetail.body, "cwd: /workspace/project", "permissions cwd");
  assertIncludes(permissionsDetail.body, "allowedHosts", "permissions body includes network permission");
  assertDeepEqual(
    buildApprovalResult(permissionsRequest, true),
    {
      permissions: {
        network: { allowedHosts: ["example.com"] },
        fileSystem: { writableRoots: ["/workspace/project"] },
      },
      scope: "turn",
      strictAutoReview: false,
    },
    "permissions accept result",
  );
  assertEqual(buildApprovalResult(permissionsRequest, false), null, "permissions decline result");

  const unknownRequest = request("unknown/request", { raw: true });
  const unknownDetail = pendingRequestDetail(unknownRequest);
  assertEqual(unknownDetail.title, "Unsupported request: unknown/request", "unknown request title");
  assertIncludes(unknownDetail.body, "\"raw\": true", "unknown request body shows params");
  assertEqual(buildApprovalResult(unknownRequest, true), null, "unknown accept result is null");
  assertEqual(buildApprovalResult(unknownRequest, false), null, "unknown decline result is null");
}
