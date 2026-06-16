/*
 * App tool-call request domain: option picker (item/tool/requestOptionPicker),
 * setup-context picker (item/tool/requestSetupCodexContextPicker), onboarding
 * input, their dynamic item/tool/call variants, and the unsupported dynamic
 * tool-call fallback detail. Extracted verbatim from ./approval-requests.
 */
import { stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import {
  appToolRequestLabel,
  cancelLabel,
  dismissLabel,
  inlineUnknown,
  objectRecord,
  requestMetadata,
  submitLabel,
  unsupportedLabel,
  type PendingRequestDetail,
  type PendingRequestMetadata,
  type PendingRequestOption,
  type PendingRequestQuestion,
  type PendingRequestSetupContextPicker,
  type PendingRequestSetupContextSource,
} from "./approval-requests-shared";
import type { PendingServerRequest } from "./codex-reducer";

export const OPTION_PICKER_ACTION_QUESTION_ID = "__optionPicker.action";

export const OPTION_PICKER_QUESTION_ID = "optionPickerSelection";

export const SETUP_CONTEXT_ACTION_QUESTION_ID = "__setupCodexContextPicker.action";

export const SETUP_CONTEXT_SOURCES_QUESTION_ID = "__setupCodexContextPicker.sources";

export const SETUP_CODEX_STEP_ROLE_QUESTION_ID = "__setupCodexStep.roles";

export const SETUP_CODEX_STEP_TASK_ACTION_QUESTION_ID = "__setupCodexStep.taskAction";

export const SETUP_CODEX_STEP_TASK_QUESTION_ID = "first_task";

type SetupCodexStep = "role" | "task" | "context";

interface SetupCodexStepModel {
  step: SetupCodexStep;
  roles: string[];
}

export function onboardingInputRequestDetail(params: unknown): PendingRequestDetail | null {
  const questions = onboardingInputQuestions(params);
  if (!questions) return null;
  return {
    title: "",
    body: questions.map((question, index) => `${index + 1}. ${question.question}`).join("\n"),
    metadata: requestMetadata(params, ["threadId", "turnId", "itemId", "callId"]),
    questions,
    acceptLabel: submitLabel(),
    declineLabel: dismissLabel(),
    canAccept: true,
    userInput: true,
  };
}

export function buildOnboardingInputResult(
  request: PendingServerRequest,
  accepted: boolean,
  answers: Record<string, string[]>,
): unknown | null {
  const questions = onboardingInputQuestions(request.params);
  if (!questions) return null;
  return {
    success: true,
    contentItems: [{
      type: "inputText",
      text: JSON.stringify({ answers: accepted ? onboardingInputAnswers(questions, answers) : {} }),
    }],
  };
}

export function setupCodexStepRequestDetail(params: unknown): PendingRequestDetail | null {
  const model = setupCodexStep(params);
  if (!model) return null;
  switch (model.step) {
    case "role":
      return setupCodexRoleRequestDetail(params);
    case "task":
      return setupCodexTaskRequestDetail(params, model.roles);
    case "context":
      return setupCodexContextStepRequestDetail(params);
  }
}

export function buildSetupCodexStepResult(
  request: PendingServerRequest,
  accepted: boolean,
  answers: Record<string, string[]>,
): unknown | null {
  const model = setupCodexStep(request.params);
  if (!model) return null;
  switch (model.step) {
    case "role":
      return setupCodexStepToolResult(setupCodexRoleResponse(accepted, answers));
    case "task":
      return setupCodexStepToolResult(setupCodexTaskResponse(accepted, answers));
    case "context":
      return setupCodexStepToolResult(setupCodexContextStepResponse(accepted, answers));
  }
}

export function setupContextPickerRequestDetail(
  params: unknown,
  dynamicToolCall: boolean,
): PendingRequestDetail | null {
  const setupContextPicker = setupContextPickerRequestModel(params, dynamicToolCall);
  if (!setupContextPicker) return null;
  return {
    title: formatMessage({
      id: "setupCodexContextPicker.title",
      defaultMessage: "Where can we pull context from?",
    }),
    body: "",
    metadata: requestMetadata(params, ["threadId", "turnId", "itemId", "callId"]),
    questions: [],
    acceptLabel: formatMessage({ id: "setupCodexContextPicker.continue", defaultMessage: "Continue" }),
    declineLabel: formatMessage({ id: "setupCodexContextPicker.skip", defaultMessage: "Skip" }),
    canAccept: true,
    setupContextPicker,
  };
}

export function buildSetupContextPickerResult(
  request: PendingServerRequest,
  accepted: boolean,
  answers: Record<string, string[]>,
  dynamicToolCall: boolean,
): unknown | null {
  const setupContextPicker = setupContextPickerRequestModel(request.params, dynamicToolCall);
  if (!setupContextPicker) return null;
  const action = setupContextPickerAction(accepted, answers);
  const response = {
    action,
    selectedSources: setupContextPickerSelectedSources(action, setupContextPicker, answers),
  };
  if (!dynamicToolCall) return response;
  /*
   * CODEX-REF: app-server-manager-signals-Bpaj8VHp.pretty.js
   * `replyWithSetupCodexContextPickerResponse` wraps dynamic
   * `setup_codex_context_picker` responses with the same `bc` inputText
   * wrapper used by `request_option_picker`.
   */
  return {
    success: true,
    contentItems: [{ type: "inputText", text: JSON.stringify(response) }],
  };
}

function setupContextPickerAction(
  accepted: boolean,
  answers: Record<string, string[]>,
): "continue" | "skip" | "dismiss" {
  if (!accepted) return "dismiss";
  const requested = answers[SETUP_CONTEXT_ACTION_QUESTION_ID]?.[0];
  return requested === "skip" || requested === "dismiss" ? requested : "continue";
}

function setupContextPickerRequestModel(
  params: unknown,
  dynamicToolCall: boolean,
): PendingRequestSetupContextPicker | null {
  const source = dynamicToolCall ? dynamicSetupContextPickerArguments(params) : objectRecord(params) ?? {};
  if (!source) return null;
  const sources = setupContextPickerSources(source.sources);
  const defaultSelectedSourceIds = setupContextPickerDefaultSelectedSourceIds(source, sources);
  const canSelectSources = (source.canSelectSources === true || source.can_select_sources === true) && sources.length > 0;
  return {
    canSelectSources,
    sources,
    defaultSelectedSourceIds: canSelectSources ? defaultSelectedSourceIds : [],
  };
}

function dynamicSetupContextPickerArguments(params: unknown): Record<string, unknown> | null {
  const record = objectRecord(params);
  if (!record) return null;
  if (stringField(record, "tool") !== "setup_codex_context_picker") return null;
  const args = record.arguments;
  if (args === undefined || args === null) return {};
  if (typeof args === "string") {
    try {
      return objectRecord(JSON.parse(args)) ?? {};
    } catch {
      return null;
    }
  }
  return objectRecord(args) ?? {};
}

function setupContextPickerSources(value: unknown): PendingRequestSetupContextSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) return [];
    const record = source as Record<string, unknown>;
    const id = stringField(record, "id")
      || stringField(record, "pluginId")
      || stringField(record, "plugin_id")
      || stringField(record, "pluginName")
      || stringField(record, "plugin_name")
      || stringField(record, "name");
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const label = stringField(record, "label")
      || stringField(record, "title")
      || stringField(record, "displayName")
      || stringField(record, "display_name")
      || stringField(record, "name")
      || id;
    return [{
      id,
      label,
      description: stringField(record, "description"),
      connected: record.connected === true || record.isConnected === true || record.is_connected === true,
    }];
  });
}

function setupContextPickerDefaultSelectedSourceIds(
  source: Record<string, unknown>,
  sources: PendingRequestSetupContextSource[],
): string[] {
  const validIds = new Set(sources.map((item) => item.id));
  const explicit = stringArrayField(source.defaultSelectedSourceIds)
    ?? stringArrayField(source.default_selected_source_ids)
    ?? stringArrayField(source.selectedSources)
    ?? stringArrayField(source.selected_sources)
    ?? [];
  return uniqueSourceIds(
    [
      ...sources.filter((item) => item.connected).map((item) => item.id),
      ...explicit,
    ].filter((id) => validIds.has(id)),
  );
}

function setupContextPickerSelectedSources(
  action: "continue" | "skip" | "dismiss",
  setupContextPicker: PendingRequestSetupContextPicker,
  answers: Record<string, string[]>,
): string[] {
  if (action !== "continue" || !setupContextPicker.canSelectSources) return [];
  const validIds = new Set(setupContextPicker.sources.map((source) => source.id));
  const connectedIds = setupContextPicker.sources
    .filter((source) => source.connected)
    .map((source) => source.id);
  const selected = answers[SETUP_CONTEXT_SOURCES_QUESTION_ID] ?? setupContextPicker.defaultSelectedSourceIds;
  return uniqueSourceIds([...connectedIds, ...selected].filter((id) => validIds.has(id)));
}

function stringArrayField(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : [];
}

function uniqueSourceIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function setupCodexRoleRequestDetail(params: unknown): PendingRequestDetail {
  const title = formatMessage({
    id: "setupCodexRolePicker.title",
    defaultMessage: "What type of work do you do?",
  });
  const options = setupCodexRoleOptions();
  return {
    title,
    body: options.map((option) => option.label).join("\n"),
    metadata: requestMetadata(params, ["threadId", "turnId", "itemId", "callId"]),
    questions: [{
      id: SETUP_CODEX_STEP_ROLE_QUESTION_ID,
      header: title,
      question: title,
      kind: "multiSelect",
      isSecret: false,
      required: true,
      defaultAnswers: [],
      options,
    }],
    acceptLabel: formatMessage({ id: "setupCodexRolePicker.continue", defaultMessage: "Continue" }),
    declineLabel: dismissLabel(),
    canAccept: true,
  };
}

function setupCodexTaskRequestDetail(params: unknown, roles: string[]): PendingRequestDetail {
  const header = formatMessage({
    id: "setupCodexTaskPicker.title",
    defaultMessage: "First task",
  });
  const question = formatMessage({
    id: "setupCodexTaskPicker.question",
    defaultMessage: "What's something we can knock off your list today?",
  });
  const options = setupCodexTaskSuggestionOptions(roles);
  return {
    title: "",
    body: options.map((option) => option.label).join("\n"),
    metadata: requestMetadata(params, ["threadId", "turnId", "itemId", "callId"]),
    questions: [{
      id: SETUP_CODEX_STEP_TASK_QUESTION_ID,
      header,
      question,
      kind: "singleSelect",
      isSecret: false,
      required: false,
      defaultAnswers: [],
      options,
      isOther: true,
      otherPlaceholder: formatMessage({
        id: "optionPickerRequest.freeformPlaceholder",
        defaultMessage: "Something else",
      }),
    }],
    acceptLabel: submitLabel(),
    declineLabel: formatMessage({ id: "optionPickerRequest.skip", defaultMessage: "Skip" }),
    canAccept: true,
    userInput: true,
    setupTaskPicker: {
      questionId: SETUP_CODEX_STEP_TASK_QUESTION_ID,
    },
  };
}

function setupCodexContextStepRequestDetail(params: unknown): PendingRequestDetail {
  return {
    title: formatMessage({
      id: "setupCodexContextPicker.title",
      defaultMessage: "Where can we pull context from?",
    }),
    body: "",
    metadata: requestMetadata(params, ["threadId", "turnId", "itemId", "callId"]),
    questions: [],
    acceptLabel: formatMessage({ id: "setupCodexContextPicker.continue", defaultMessage: "Continue" }),
    declineLabel: formatMessage({ id: "setupCodexContextPicker.skip", defaultMessage: "Skip" }),
    canAccept: true,
    setupContextPicker: {
      canSelectSources: false,
      sources: [],
      defaultSelectedSourceIds: [],
    },
  };
}

function setupCodexRoleOptions(): PendingRequestOption[] {
  return SETUP_CODEX_ROLE_OPTIONS.map((option) => ({
    value: option.value,
    label: formatMessage(option.message),
    description: "",
  }));
}

function setupCodexRoleResponse(
  accepted: boolean,
  answers: Record<string, string[]>,
): { action: "submit" | "dismiss"; selectedRoles: string[] } {
  if (!accepted) return { action: "dismiss", selectedRoles: [] };
  const validRoles: ReadonlySet<string> = new Set(SETUP_CODEX_ROLE_OPTIONS.map((option) => option.value));
  const selectedRoles = uniqueSourceIds((answers[SETUP_CODEX_STEP_ROLE_QUESTION_ID] ?? [])
    .filter((role) => validRoles.has(role)));
  return { action: "submit", selectedRoles };
}

function setupCodexTaskResponse(
  accepted: boolean,
  answers: Record<string, string[]>,
): { action: "submit" | "skip" | "dismiss"; answers: Record<string, { answers: string[] }> } {
  if (!accepted) return { action: "dismiss", answers: {} };
  const requested = answers[SETUP_CODEX_STEP_TASK_ACTION_QUESTION_ID]?.[0];
  if (requested === "skip") return { action: "skip", answers: {} };
  if (requested === "dismiss") return { action: "dismiss", answers: {} };
  const firstTask = (answers[SETUP_CODEX_STEP_TASK_QUESTION_ID] ?? [])
    .map((answer) => answer.trim())
    .find((answer) => answer.length > 0);
  return {
    action: "submit",
    answers: firstTask ? { [SETUP_CODEX_STEP_TASK_QUESTION_ID]: { answers: [firstTask] } } : {},
  };
}

function setupCodexContextStepResponse(
  accepted: boolean,
  answers: Record<string, string[]>,
): { action: "continue" | "skip" | "dismiss"; selectedSources: string[] } {
  if (!accepted) return { action: "dismiss", selectedSources: [] };
  const requested = answers[SETUP_CONTEXT_ACTION_QUESTION_ID]?.[0];
  const action = requested === "skip" || requested === "dismiss" ? requested : "continue";
  return { action, selectedSources: [] };
}

function setupCodexStepToolResult(response: unknown): { success: true; contentItems: Array<{ type: "inputText"; text: string }> } {
  /*
   * CODEX-REF: app-server-manager-signals-*.js `replyWithSetupCodexStepResponse`
   * strips the local `step` guard and wraps role/task/context responses as the
   * same inputText tool result used by other dynamic client-input helpers.
   */
  return {
    success: true,
    contentItems: [{ type: "inputText", text: JSON.stringify(response) }],
  };
}

function setupCodexStep(params: unknown): SetupCodexStepModel | null {
  const record = objectRecord(params);
  if (!record || stringField(record, "tool") !== "setup_codex_step") return null;
  const args = setupCodexStepArguments(record.arguments);
  if (!args) return null;
  if (args.step !== "role" && args.step !== "task" && args.step !== "context") return null;
  return {
    step: args.step,
    roles: args.roles.length > 0 ? args.roles : setupCodexStepRoles(record),
  };
}

function setupCodexStepArguments(value: unknown): { step: string; roles: string[] } | null {
  const args = typeof value === "string" ? parseRecord(value) : objectRecord(value);
  const step = stringField(args, "step");
  return step ? { step, roles: setupCodexStepRoles(args) } : null;
}

function setupCodexStepRoles(record: Record<string, unknown> | null): string[] {
  if (!record) return [];
  return uniqueSourceIds(
    stringArrayField(record.roles)
      ?? stringArrayField(record.selectedRoles)
      ?? stringArrayField(record.selected_roles)
      ?? [],
  );
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    return objectRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

const SETUP_CODEX_ROLE_OPTIONS = [
  {
    value: "engineering",
    message: {
      id: "electron.onboarding.welcomeV2.role.engineering",
      defaultMessage: "Engineering",
    },
  },
  {
    value: "data_science",
    message: {
      id: "electron.onboarding.welcomeV2.role.dataScience",
      defaultMessage: "Data Science",
    },
  },
  {
    value: "product_management",
    message: {
      id: "electron.onboarding.welcomeV2.role.product",
      defaultMessage: "Product",
    },
  },
  {
    value: "design",
    message: {
      id: "electron.onboarding.welcomeV2.role.design",
      defaultMessage: "Design",
    },
  },
  {
    value: "marketing",
    message: {
      id: "electron.onboarding.welcomeV2.role.marketing",
      defaultMessage: "Marketing",
    },
  },
  {
    value: "sales",
    message: {
      id: "electron.onboarding.welcomeV2.role.sales",
      defaultMessage: "Sales",
    },
  },
  {
    value: "finance",
    message: {
      id: "electron.onboarding.welcomeV2.role.finance",
      defaultMessage: "Finance",
    },
  },
  {
    value: "operations",
    message: {
      id: "electron.onboarding.welcomeV2.role.operations",
      defaultMessage: "Operations",
    },
  },
  {
    value: "people_hr",
    message: {
      id: "electron.onboarding.welcomeV2.role.peopleHr",
      defaultMessage: "People & HR",
    },
  },
  {
    value: "legal",
    message: {
      id: "electron.onboarding.welcomeV2.role.legal",
      defaultMessage: "Legal",
    },
  },
  {
    value: "student",
    message: {
      id: "electron.onboarding.welcomeV2.role.student",
      defaultMessage: "Student",
    },
  },
  {
    value: "something_else",
    message: {
      id: "electron.onboarding.welcomeV2.role.somethingElse",
      defaultMessage: "Something else",
    },
  },
] as const;

type SetupCodexTaskPrompt = {
  titleMessage: { id: string; defaultMessage: string; description: string };
  promptMessage: { id: string; defaultMessage: string; description: string };
};

const SETUP_CODEX_TASK_SUGGESTION_LIMIT = 3;

const SETUP_CODEX_TASK_PROMPTS_BY_ROLE: Record<string, SetupCodexTaskPrompt[]> = {
  engineering: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.engineering.debugIssue.title",
        defaultMessage: "Debug an issue",
        description: "Short home prompt title for engineering role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.engineering.debugIssue.prompt",
        defaultMessage: "Use GitHub, Linear, or my uploaded logs/code to investigate a bug, PR, build failure, or issue I choose. If missing, ask what to inspect. Identify likely root cause, fix path, and tests.",
        description: "Long home prompt for engineering issue debugging",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.engineering.planImplementation.title",
        defaultMessage: "Plan implementation",
        description: "Short home prompt title for engineering role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.engineering.planImplementation.prompt",
        defaultMessage: "Use GitHub, Linear, or my uploaded spec to plan implementation for a feature or bug. If I have not named one, ask me which issue. Include likely files, edge cases, and test plan.",
        description: "Long home prompt for engineering implementation planning",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.engineering.reviewPr.title",
        defaultMessage: "Review a PR",
        description: "Short home prompt title for engineering role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.engineering.reviewPr.prompt",
        defaultMessage: "Use GitHub or an uploaded diff to review a specific PR. If no PR is provided, ask which PR to review. Check correctness, risk, edge cases, missing tests, and alignment with the issue or spec.",
        description: "Long home prompt for engineering PR review",
      },
    },
  ],
  product_management: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.product.reviewPrd.title",
        defaultMessage: "Review a PRD",
        description: "Short home prompt title for product management role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.product.reviewPrd.prompt",
        defaultMessage: "If I uploaded or attached a PRD, use that first. Otherwise ask me which PRD, feature, or product area to review. Critique it for unclear requirements, missing metrics, risks, open questions, and next decisions.",
        description: "Long home prompt for product PRD review",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.product.prepLaunch.title",
        defaultMessage: "Prep a launch",
        description: "Short home prompt title for product management role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.product.prepLaunch.prompt",
        defaultMessage: "Use Linear or my uploaded context to prep a launch-readiness brief. If I have not named the launch, ask me which one. Summarize blockers, owners, risks, unresolved decisions, and next actions.",
        description: "Long home prompt for product launch prep",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.product.summarizeStakeholderAsks.title",
        defaultMessage: "Summarize stakeholder asks",
        description: "Short home prompt title for product management role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.product.summarizeStakeholderAsks.prompt",
        defaultMessage: "Use Gmail, Slack, or my uploaded notes to summarize stakeholder asks on a product topic I choose. If missing, ask for the topic. Group asks by theme and recommend what to do next.",
        description: "Long home prompt for product stakeholder asks",
      },
    },
  ],
  finance: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.finance.prepReview.title",
        defaultMessage: "Prep a finance review",
        description: "Short home prompt title for finance role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.finance.prepReview.prompt",
        defaultMessage: "Use Google Calendar, Google Drive, Gmail, or my uploaded docs to prep for a finance review, budget, forecast, close item, or model I choose. If missing, ask which topic. Summarize key numbers, risks, decisions, and likely questions.",
        description: "Long home prompt for finance review prep",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.finance.triageAsks.title",
        defaultMessage: "Triage finance asks",
        description: "Short home prompt title for finance role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.finance.triageAsks.prompt",
        defaultMessage: "Use Gmail, Slack, or my uploaded notes to find finance asks for a topic I choose. Create a tracker with requester, ask, amount if mentioned, deadline, status, missing info, and next step.",
        description: "Long home prompt for finance ask triage",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.finance.reviewModel.title",
        defaultMessage: "Review a model",
        description: "Short home prompt title for finance role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.finance.reviewModel.prompt",
        defaultMessage: "Use Google Drive or my uploaded spreadsheet/model to review a forecast, budget, close package, or results file. Summarize what changed, what looks off, follow-ups, and a leadership-ready narrative.",
        description: "Long home prompt for finance model review",
      },
    },
  ],
  marketing: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.marketing.reviewBrief.title",
        defaultMessage: "Review a campaign brief",
        description: "Short home prompt title for marketing role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.marketing.reviewBrief.prompt",
        defaultMessage: "If I uploaded or attached a campaign brief, use that first. Otherwise ask me which campaign, launch, audience, or message to review. Summarize positioning, gaps, risks, open questions, and next assets needed.",
        description: "Long home prompt for marketing campaign brief review",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.marketing.feedbackDirection.title",
        defaultMessage: "Turn feedback into direction",
        description: "Short home prompt title for marketing role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.marketing.feedbackDirection.prompt",
        defaultMessage: "Use Slack, Gmail, or my uploaded feedback to analyze campaign feedback for a topic I choose. Separate signal from noise, identify repeated concerns, and recommend messaging changes.",
        description: "Long home prompt for marketing feedback synthesis",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.marketing.assetConcepts.title",
        defaultMessage: "Draft asset concepts",
        description: "Short home prompt title for marketing role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.marketing.assetConcepts.prompt",
        defaultMessage: "Use Google Drive or my uploaded brief to create 3 asset concepts for a campaign or audience I choose. Include audience, message, visual direction, headline copy, and channel fit.",
        description: "Long home prompt for marketing asset concepts",
      },
    },
  ],
  sales: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.sales.prepCustomerMeeting.title",
        defaultMessage: "Prep a customer meeting",
        description: "Short home prompt title for sales role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.sales.prepCustomerMeeting.prompt",
        defaultMessage: "Use Google Calendar, Gmail, Google Drive, Slack, or my uploaded account notes to prep for a customer meeting I choose. If missing, ask which account. Give me context, buyer priorities, talk track, objections, risks, and next steps.",
        description: "Long home prompt for sales meeting prep",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.sales.draftFollowUp.title",
        defaultMessage: "Draft a follow-up",
        description: "Short home prompt title for sales role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.sales.draftFollowUp.prompt",
        defaultMessage: "Use Gmail or my uploaded meeting notes to draft a follow-up for an account or prospect I choose. Summarize context, infer buyer priorities, identify missing info, and write the follow-up.",
        description: "Long home prompt for sales follow-up drafting",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.sales.inspectDealRisk.title",
        defaultMessage: "Inspect deal risk",
        description: "Short home prompt title for sales role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.sales.inspectDealRisk.prompt",
        defaultMessage: "Use Slack, Gmail, or my uploaded notes to inspect a deal, account, or territory I choose. Create a risk table with latest signal, risk, owner, next action, and suggested message.",
        description: "Long home prompt for sales deal risk inspection",
      },
    },
  ],
  operations: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.strategy.prepOperatingReview.title",
        defaultMessage: "Prep an operating review",
        description: "Short home prompt title for strategy and operations role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.strategy.prepOperatingReview.prompt",
        defaultMessage: "Use Google Calendar, Google Drive, Slack, or my uploaded docs to prep an operating review for an initiative I choose. If missing, ask which initiative. Summarize goals, blockers, owners, decisions needed, escalation points, and next steps.",
        description: "Long home prompt for strategy and operations review prep",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.strategy.mapDependencies.title",
        defaultMessage: "Map dependencies",
        description: "Short home prompt title for strategy and operations role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.strategy.mapDependencies.prompt",
        defaultMessage: "Use Google Drive, Slack, or my uploaded project plan to map dependencies for a workstream I choose. Include owner, status, risk, dependency, decision needed, and recommended next action.",
        description: "Long home prompt for strategy dependency mapping",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.strategy.prioritizeStakeholderAsks.title",
        defaultMessage: "Prioritize stakeholder asks",
        description: "Short home prompt title for strategy and operations role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.strategy.prioritizeStakeholderAsks.prompt",
        defaultMessage: "Use Gmail, Slack, Google Calendar, or my uploaded notes to summarize stakeholder asks for an initiative I choose. Prioritize them by urgency, impact, and deadline, then suggest responses.",
        description: "Long home prompt for strategy stakeholder ask prioritization",
      },
    },
  ],
  people_hr: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.peopleHr.prepOperatingReview.title",
        defaultMessage: "Prep an operating review",
        description: "Short home prompt title for people and HR role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.peopleHr.prepOperatingReview.prompt",
        defaultMessage: "Use Google Calendar, Google Drive, Slack, Gmail, and my uploaded docs where available to prep an operating review for an initiative I choose. If missing, ask which initiative. Summarize goals, blockers, owners, decisions needed, escalation points, and next steps.",
        description: "Long home prompt for people and HR operating review prep",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.peopleHr.triagePartnerAsks.title",
        defaultMessage: "Triage cross-functional partner asks",
        description: "Short home prompt title for people and HR role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.peopleHr.triagePartnerAsks.prompt",
        defaultMessage: "Use Gmail, Slack, or Teams, or my uploaded notes to find cross-functional team or partner asks for a topic I choose. Create a tracker with requester, ask, amount if mentioned, deadline, status, missing info, and next step.",
        description: "Long home prompt for people and HR partner ask triage",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.peopleHr.structureProblem.title",
        defaultMessage: "Structure a messy business problem",
        description: "Short home prompt title for people and HR role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.peopleHr.structureProblem.prompt",
        defaultMessage: "Use problem structuring to turn an ambiguous business question I choose into a clear decision frame. Identify the core question, sub-questions, assumptions, evidence needed, stakeholders, and recommended workplan.",
        description: "Long home prompt for people and HR problem structuring",
      },
    },
  ],
  legal: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.legal.prepOperatingReview.title",
        defaultMessage: "Prep an operating review",
        description: "Short home prompt title for legal role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.legal.prepOperatingReview.prompt",
        defaultMessage: "Use Google Calendar, Google Drive, Slack, Gmail, and my uploaded docs where available to prep an operating review for an initiative I choose. If missing, ask which initiative. Summarize goals, blockers, owners, decisions needed, escalation points, and next steps.",
        description: "Long home prompt for legal operating review prep",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.legal.draftLeadershipMemo.title",
        defaultMessage: "Draft a leadership memo",
        description: "Short home prompt title for legal role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.legal.draftLeadershipMemo.prompt",
        defaultMessage: "Use available docs, Slack context, Gmail, and uploaded notes to draft a crisp leadership memo on a topic I choose. Include the situation, decision needed, evidence, options, risks, and recommended next step.",
        description: "Long home prompt for legal leadership memo drafting",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.legal.structureProblem.title",
        defaultMessage: "Structure a messy business problem",
        description: "Short home prompt title for legal role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.legal.structureProblem.prompt",
        defaultMessage: "Use problem structuring to turn an ambiguous business question I choose into a clear decision frame. Identify the core question, sub-questions, assumptions, evidence needed, stakeholders, and recommended workplan.",
        description: "Long home prompt for legal problem structuring",
      },
    },
  ],
  data_science: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.dataScience.investigateMetric.title",
        defaultMessage: "Investigate a metric",
        description: "Short home prompt title for data science role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.dataScience.investigateMetric.prompt",
        defaultMessage: "Use Google Drive, Slack, GitHub, or my uploaded data/readout to investigate a metric, experiment, or dashboard I choose. If missing, ask which one. Summarize the business question, evidence, caveats, likely drivers, and next analysis.",
        description: "Long home prompt for data science metric investigation",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.dataScience.reviewNotebook.title",
        defaultMessage: "Review a notebook",
        description: "Short home prompt title for data science role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.dataScience.reviewNotebook.prompt",
        defaultMessage: "Use GitHub or my uploaded notebook/code to review a notebook, model, pipeline, or data issue. Explain what changed, why it matters, what could break, and how to validate it.",
        description: "Long home prompt for data science notebook review",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.dataScience.triageRequests.title",
        defaultMessage: "Triage analysis requests",
        description: "Short home prompt title for data science role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.dataScience.triageRequests.prompt",
        defaultMessage: "Use Gmail, Slack, or my uploaded notes to triage data science requests for an area I choose. Rank them by business impact, urgency, data availability, ambiguity, and recommended priority.",
        description: "Long home prompt for data science analysis request triage",
      },
    },
  ],
  design: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.design.critiqueDesign.title",
        defaultMessage: "Critique a design",
        description: "Short home prompt title for design role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.design.critiqueDesign.prompt",
        defaultMessage: "Use Figma or my uploaded screenshot/prototype to critique a design, flow, or screen I choose. Review hierarchy, interaction clarity, accessibility, edge cases, and product goal alignment, then suggest 5 improvements.",
        description: "Long home prompt for design critique",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.design.synthesizeFeedback.title",
        defaultMessage: "Synthesize design feedback",
        description: "Short home prompt title for design role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.design.synthesizeFeedback.prompt",
        defaultMessage: "Use Slack, Gmail, Figma, or my uploaded feedback to synthesize feedback for a design project I choose. Group themes, identify contradictions, recommend what to accept or push back on, and draft an alignment reply.",
        description: "Long home prompt for design feedback synthesis",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.design.reviewSpec.title",
        defaultMessage: "Review spec to design",
        description: "Short home prompt title for design role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.design.reviewSpec.prompt",
        defaultMessage: "Use Google Drive, Figma, or my uploaded spec/design to compare a product spec with the design. Identify mismatches, missing states, UX risks, and decisions needed before handoff.",
        description: "Long home prompt for design spec review",
      },
    },
  ],
  student: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.student.studyPlan.title",
        defaultMessage: "Build a study plan",
        description: "Short home prompt title for student role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.student.studyPlan.prompt",
        defaultMessage: "Use Google Calendar, Gmail, Google Drive, or my uploaded syllabus/notes to build a study plan for a class, exam, assignment, or paper I choose. If missing, ask which one. Include deadlines, priorities, and daily next steps.",
        description: "Long home prompt for student study planning",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.student.debugAssignment.title",
        defaultMessage: "Debug my assignment",
        description: "Short home prompt title for student role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.student.debugAssignment.prompt",
        defaultMessage: "Use GitHub or my uploaded code/course materials to help debug a coding assignment or project. Explain the issue in plain English, suggest a fix path, and list what to test.",
        description: "Long home prompt for student assignment debugging",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.student.summarizeMaterials.title",
        defaultMessage: "Summarize class materials",
        description: "Short home prompt title for student role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.student.summarizeMaterials.prompt",
        defaultMessage: "Use Gmail, Google Drive, or my uploaded lecture notes/readings to summarize a class topic I choose. Pull out key concepts, deadlines, assignments, and what I should study next.",
        description: "Long home prompt for student material summary",
      },
    },
  ],
  something_else: [
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.other.summarizeUpdates.title",
        defaultMessage: "Summarize updates",
        description: "Short home prompt title for other role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.other.summarizeUpdates.prompt",
        defaultMessage: "Summarize updates across Slack, Gmail, and docs, then draft a to-do list for me",
        description: "Long home prompt for summarizing updates",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.other.draftFollowUps.title",
        defaultMessage: "Draft follow-ups",
        description: "Short home prompt title for other role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.other.draftFollowUps.prompt",
        defaultMessage: "Review recent unread Gmail messages and draft personalized follow-ups",
        description: "Long home prompt for drafting follow-ups",
      },
    },
    {
      titleMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.other.prepMeetings.title",
        defaultMessage: "Prep for meetings",
        description: "Short home prompt title for other role onboarding",
      },
      promptMessage: {
        id: "electron.onboarding.welcomeV2.roleCopy.other.prepMeetings.prompt",
        defaultMessage: "Prep me for today's meetings using Google Calendar, Gmail, Google Drive, and Slack: context, agenda items, and key decisions",
        description: "Long home prompt for meeting prep",
      },
    },
  ],
};

function setupCodexTaskSuggestionOptions(roles: string[]): PendingRequestOption[] {
  const usedLabels = new Set<string>();
  return setupCodexTaskSuggestionPrompts(roles).flatMap((prompt) => {
    const label = formatMessage(prompt.titleMessage);
    if (usedLabels.has(label)) return [];
    usedLabels.add(label);
    return [{
      value: label,
      label,
      description: formatMessage(prompt.promptMessage),
      ariaLabel: label,
    }];
  });
}

function setupCodexTaskSuggestionPrompts(roles: string[]): SetupCodexTaskPrompt[] {
  /*
   * CODEX-REF: ambient-suggestion-apps-*.js `suggestionPrompts` - normalize
   * selected roles, fall back to `something_else`, take the first prompt from
   * each role in order, then round-robin the remaining prompts until three.
   */
  const promptGroups = normalizedSetupCodexRoles(roles).map((role) => SETUP_CODEX_TASK_PROMPTS_BY_ROLE[role]);
  const indexes = promptGroups.map(() => 0);
  const selected: SetupCodexTaskPrompt[] = [];
  const seen = new Set<SetupCodexTaskPrompt>();
  for (const [groupIndex, group] of promptGroups.entries()) {
    const prompt = group[indexes[groupIndex]];
    indexes[groupIndex] += 1;
    if (prompt && !seen.has(prompt)) {
      seen.add(prompt);
      selected.push(prompt);
      if (selected.length >= SETUP_CODEX_TASK_SUGGESTION_LIMIT) return selected;
    }
  }
  while (selected.length < SETUP_CODEX_TASK_SUGGESTION_LIMIT) {
    let advanced = false;
    for (let groupIndex = 0; groupIndex < promptGroups.length; groupIndex += 1) {
      const prompt = promptGroups[groupIndex][indexes[groupIndex]];
      indexes[groupIndex] += 1;
      if (prompt && !seen.has(prompt)) {
        seen.add(prompt);
        selected.push(prompt);
        advanced = true;
        if (selected.length >= SETUP_CODEX_TASK_SUGGESTION_LIMIT) break;
      }
    }
    if (!advanced) break;
  }
  return selected;
}

function normalizedSetupCodexRoles(roles: string[]): string[] {
  const sourceRoles = roles.length > 0 ? roles : ["something_else"];
  return uniqueSourceIds(sourceRoles.map(normalizeSetupCodexRole));
}

function normalizeSetupCodexRole(role: string): string {
  if (role === "default") return "engineering";
  return role in SETUP_CODEX_TASK_PROMPTS_BY_ROLE ? role : "something_else";
}

function onboardingInputQuestions(params: unknown): PendingRequestQuestion[] | null {
  const source = dynamicOnboardingInputArguments(params);
  const rawQuestions = Array.isArray(source?.questions) ? source.questions : [];
  if (rawQuestions.length < 1 || rawQuestions.length > 3) return null;
  const questions = rawQuestions.flatMap((question): PendingRequestQuestion[] => {
    const record = objectRecord(question);
    if (!record) return [];
    const id = stringField(record, "id");
    const text = stringField(record, "question");
    const options = onboardingInputOptions(record.options);
    if (!id || !text || options.length < 2) return [];
    return [{
      id,
      header: text,
      question: text,
      kind: "singleSelect",
      isSecret: false,
      required: true,
      defaultAnswers: [],
      options,
      isOther: true,
      otherPlaceholder: formatMessage({
        id: "pendingRequest.onboardingInput.otherPlaceholder",
        defaultMessage: "Something else",
      }),
    }];
  });
  return questions.length === rawQuestions.length ? questions : null;
}

function dynamicOnboardingInputArguments(params: unknown): Record<string, unknown> | null {
  const record = objectRecord(params);
  if (!record || stringField(record, "tool") !== "request_onboarding_input") return null;
  const args = record.arguments;
  if (typeof args === "string") {
    try {
      return objectRecord(JSON.parse(args));
    } catch {
      return null;
    }
  }
  return objectRecord(args);
}

function onboardingInputOptions(value: unknown): PendingRequestOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    const record = objectRecord(option);
    if (!record) return [];
    const label = stringField(record, "label");
    if (!label) return [];
    return [{
      value: label,
      label,
      description: stringField(record, "description"),
    }];
  });
}

function onboardingInputAnswers(
  questions: PendingRequestQuestion[],
  answers: Record<string, string[]>,
): Record<string, { answers: string[] }> {
  const result: Record<string, { answers: string[] }> = {};
  for (const question of questions) {
    const values = (answers[question.id] ?? [])
      .map((answer) => answer.trim())
      .filter(Boolean);
    if (values.length > 0) {
      result[question.id] = { answers: values };
    }
  }
  return result;
}

export function unsupportedToolCallDetail(params: unknown): PendingRequestDetail {
  return {
    title: appToolRequestLabel(),
    reason: formatMessage({
      id: "hc.pendingRequest.appTool.reason",
      defaultMessage: "Dynamic client-side tool execution is not implemented.",
    }),
    body: toolCallRequestBody(params),
    metadata: toolCallRequestMetadata(params),
    questions: [],
    acceptLabel: unsupportedLabel(),
    declineLabel: cancelLabel(),
    canAccept: false,
    acceptDisabledReason: formatMessage({
      id: "hc.pendingRequest.appTool.disabledReason",
      defaultMessage: "Forge can show this app-server request but cannot execute dynamic app tools from the UI shell yet.",
    }),
  };
}

export function optionPickerRequestDetail(params: unknown, dynamicToolCall: boolean): PendingRequestDetail | null {
  const parsed = optionPickerRequestModel(params, dynamicToolCall);
  if (!parsed) return null;
  const question: PendingRequestQuestion = {
    id: OPTION_PICKER_QUESTION_ID,
    header: parsed.question,
    question: parsed.question,
    kind: parsed.allowMultiple ? "multiSelect" : "singleSelect",
    isSecret: false,
    required: true,
    defaultAnswers: [],
    options: parsed.options,
    isOther: true,
  };
  return {
    title: parsed.question,
    body: parsed.options.map((option) => option.label).join("\n"),
    metadata: requestMetadata(params, ["threadId", "turnId", "itemId", "callId"]),
    questions: [question],
    acceptLabel: parsed.submitLabel,
    declineLabel: parsed.skipLabel,
    canAccept: true,
    optionPicker: {
      questionId: OPTION_PICKER_QUESTION_ID,
      allowMultiple: parsed.allowMultiple,
      submitLabel: parsed.submitLabel,
      skipLabel: parsed.skipLabel,
    },
  };
}

export function buildOptionPickerResult(
  request: PendingServerRequest,
  accepted: boolean,
  answers: Record<string, string[]>,
  dynamicToolCall: boolean,
): unknown | null {
  const parsed = optionPickerRequestModel(request.params, dynamicToolCall);
  if (!parsed) return null;
  const action = optionPickerAction(accepted, answers);
  const answerValues = answers[OPTION_PICKER_QUESTION_ID] ?? [];
  const optionValues = new Set(parsed.options.map((option) => option.value));
  const selectedOptions = action === "dismiss"
    ? []
    : answerValues.filter((value) => optionValues.has(value));
  const freeformAnswer = action === "dismiss"
    ? null
    : answerValues.map((value) => value.trim()).find((value) => value.length > 0 && !optionValues.has(value)) ?? null;
  const response = { action, selectedOptions, freeformAnswer };
  if (!dynamicToolCall) return response;
  /*
   * CODEX-REF: app-server-manager-signals-Bpaj8VHp.pretty.js `bc` wraps
   * dynamic `request_option_picker` responses as an MCP-style tool result:
   * { success:true, contentItems:[{ type:"inputText", text:JSON.stringify(response) }] }.
   */
  return {
    success: true,
    contentItems: [{ type: "inputText", text: JSON.stringify(response) }],
  };
}

function optionPickerAction(
  accepted: boolean,
  answers: Record<string, string[]>,
): "submit" | "skip" | "dismiss" {
  if (!accepted) return "dismiss";
  const requested = answers[OPTION_PICKER_ACTION_QUESTION_ID]?.[0];
  return requested === "skip" || requested === "dismiss" ? requested : "submit";
}

function optionPickerRequestModel(
  params: unknown,
  dynamicToolCall: boolean,
): {
  question: string;
  options: PendingRequestOption[];
  allowMultiple: boolean;
  submitLabel: string;
  skipLabel: string;
} | null {
  const record = objectRecord(params);
  if (!record) return null;
  const source = dynamicToolCall ? dynamicOptionPickerArguments(record) : record;
  if (!source) return null;
  const question = stringField(source, "question");
  const options = optionPickerOptions(source.options);
  if (!question || options.length === 0) return null;
  return {
    question,
    options,
    allowMultiple: source.allowMultiple === true || source.allow_multiple === true,
    submitLabel: stringField(source, "submitLabel") || stringField(source, "submit_label")
      || formatMessage({ id: "optionPickerRequest.submit", defaultMessage: "Submit" }),
    skipLabel: stringField(source, "skipLabel") || stringField(source, "skip_label")
      || formatMessage({ id: "optionPickerRequest.skip", defaultMessage: "Skip" }),
  };
}

function dynamicOptionPickerArguments(record: Record<string, unknown>): Record<string, unknown> | null {
  if (stringField(record, "tool") !== "request_option_picker") return null;
  const args = record.arguments;
  if (typeof args === "string") {
    try {
      return objectRecord(JSON.parse(args));
    } catch {
      return null;
    }
  }
  return objectRecord(args);
}

function optionPickerOptions(value: unknown): PendingRequestOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) return [];
    const record = option as Record<string, unknown>;
    const label = stringField(record, "label");
    if (!label) return [];
    return [{
      value: label,
      label,
      description: stringField(record, "description"),
    }];
  });
}

function toolCallRequestBody(params: unknown): string {
  const record = objectRecord(params);
  const argumentsText = inlineUnknown(record?.arguments);
  return [
    "Status: Unsupported dynamic tool call",
    "Details: This request came from app-server as an app tool call. Forge displays it as a pending request and does not run it as regular tool activity.",
    ...(argumentsText ? [`Arguments: ${argumentsText}`] : []),
  ].join("\n");
}

function toolCallRequestMetadata(params: unknown): PendingRequestMetadata[] {
  const metadata = requestMetadata(params, ["namespace", "tool", "callId", "threadId", "turnId"]);
  const labels: Record<string, string> = {
    namespace: "Namespace",
    tool: "Tool",
    callId: "Call",
    threadId: "Thread",
    turnId: "Turn",
  };
  return [
    { label: "Kind", value: "App tool request" },
    ...metadata.map((item) => ({
      label: labels[item.label] ?? item.label,
      value: item.value,
    })),
  ];
}
