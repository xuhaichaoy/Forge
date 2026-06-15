/*
 * Regression suite for the approval-card keyboard surface: PendingRequestStack
 * → ApprovalCard → usePendingRequestApprovalController, driven end-to-end by
 * real DOM keyboard events in jsdom. The respond callback's parameter shape is
 * asserted EXACTLY — a previous incident swapped an answers sentinel during a
 * refactor and silently swallowed approval parameters.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PendingRequestStack } from "../src/components/pending-request-stack";
import type { PendingServerRequest } from "../src/state/codex-reducer";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

/*
 * item/tool/requestUserInput normalization (state/approval-requests.ts):
 * option.value === option.label, questions are required, and unanswered
 * singleSelect questions default to their first option. Two questions so the
 * stepper, arrow navigation and next-vs-submit behavior are all live.
 */
interface UserInputQuestionFixture {
  id: string;
  header: string;
  question: string;
  options?: Array<{ label: string; description: string }>;
}

const QUESTION_DEFINITIONS: UserInputQuestionFixture[] = [
  {
    id: "approach",
    header: "Approach",
    question: "Which approach should we take?",
    options: [
      { label: "Refactor", description: "" },
      { label: "Rewrite", description: "" },
    ],
  },
  {
    id: "scope",
    header: "Scope",
    question: "Which scope applies?",
    options: [
      { label: "Narrow", description: "" },
      { label: "Broad", description: "" },
    ],
  },
];

function buildUserInputRequest(questions: UserInputQuestionFixture[] = QUESTION_DEFINITIONS): PendingServerRequest {
  return {
    id: "request-1",
    method: "item/tool/requestUserInput",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      questions,
    },
    createdAt: 0,
  };
}

type RespondArgs = [PendingServerRequest, boolean, Record<string, string[]> | undefined];

interface MountedApprovalCard {
  env: DomTestEnv;
  root: Root;
  panel: HTMLElement;
  request: PendingServerRequest;
  respondCalls: RespondArgs[];
  dispatchKey: (init: KeyboardEventInit) => KeyboardEvent;
  text: () => string;
  cleanup: () => void;
}

function mountApprovalCard({
  questions = QUESTION_DEFINITIONS,
}: { questions?: UserInputQuestionFixture[] } = {}): MountedApprovalCard {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const respondCalls: RespondArgs[] = [];
  const request = buildUserInputRequest(questions);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(PendingRequestStack, {
      pendingRequests: [request],
      onRespond: (...args: RespondArgs) => {
        respondCalls.push(args);
      },
    }));
  });
  const panel = env.document.querySelector<HTMLElement>(".hc-request-input-panel");
  if (!panel) {
    env.teardown();
    throw new Error("approval card panel did not render");
  }
  return {
    env,
    root,
    panel,
    request,
    respondCalls,
    dispatchKey: (init) => {
      const event = new env.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      act(() => {
        panel.dispatchEvent(event);
      });
      return event;
    },
    text: () => panel.textContent ?? "",
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
  };
}

function primaryActionButton(card: MountedApprovalCard): HTMLButtonElement {
  const button = card.panel.querySelector<HTMLButtonElement>(".hc-request-action.primary");
  if (!button) {
    throw new Error("primary request action did not render");
  }
  return button;
}

/*
 * Number keys select the matching option of the CURRENT question; on a
 * non-final question that advances the stepper instead of submitting, and on
 * the final question it submits with the exact accumulated answers.
 */
export function numberKeySelectsOptionAndAdvancesThenSubmitsExactAnswers(): void {
  const card = mountApprovalCard();
  try {
    assertIncludes(card.text(), "1 of 2", "precondition: stepper starts on question 1");

    card.dispatchKey({ key: "2" });
    assertEqual(card.respondCalls.length, 0, "selecting an option on a non-final question must not submit");
    assertIncludes(card.text(), "2 of 2", "number-key selection on question 1 must advance to question 2");
    assertQuestionVisible(card.text(), 1, "question 2 must be the visible question after the number-key advance");

    card.dispatchKey({ key: "2" });
    assertEqual(card.respondCalls.length, 1, "number-key selection on the final question must submit");
    const [request, accepted, answers] = card.respondCalls[0];
    assertEqual(card.respondCalls[0].length, 3, "respond must be called with exactly (request, accepted, answers)");
    assertEqual(request, card.request, "respond must pass the ORIGINAL request object by identity");
    assertEqual(accepted, true, "number-key submit is an accept");
    assertExactAnswerShape(answers, { approach: ["Rewrite"], scope: ["Broad"] });
  } finally {
    card.cleanup();
  }
}

/* ArrowRight / ArrowLeft switch between questions without responding. */
export function arrowKeysSwitchQuestionsWithoutResponding(): void {
  const card = mountApprovalCard();
  try {
    assertIncludes(card.text(), "1 of 2", "precondition: stepper starts on question 1");
    assertQuestionVisible(card.text(), 0, "precondition: question 1 visible");

    const right = card.dispatchKey({ key: "ArrowRight" });
    assertIncludes(card.text(), "2 of 2", "ArrowRight must move to question 2");
    assertQuestionVisible(card.text(), 1, "question 2 must be visible after ArrowRight");
    assertEqual(right.defaultPrevented, true, "question navigation must consume the key");

    card.dispatchKey({ key: "ArrowLeft" });
    assertIncludes(card.text(), "1 of 2", "ArrowLeft must move back to question 1");
    assertQuestionVisible(card.text(), 0, "question 1 must be visible after ArrowLeft");

    assertEqual(card.respondCalls.length, 0, "switching questions must never respond");
  } finally {
    card.cleanup();
  }
}

/* Escape declines: accepted=false and the answers slot is EXACTLY undefined. */
export function escapeDeclinesWithExactlyUndefinedAnswers(): void {
  const card = mountApprovalCard();
  try {
    const event = card.dispatchKey({ key: "Escape" });
    assertEqual(card.respondCalls.length, 1, "Escape must respond once");
    const args = card.respondCalls[0];
    assertEqual(args.length, 3, "decline must still pass the full (request, accepted, answers) arity");
    assertEqual(args[0], card.request, "decline must pass the ORIGINAL request object by identity");
    assertEqual(args[1], false, "Escape is a decline");
    assertEqual(args[2], undefined, "a decline must carry answers === undefined, not a sentinel object");
    assertEqual(event.defaultPrevented, true, "Escape must be consumed by the card");
  } finally {
    card.cleanup();
  }
}

/*
 * Enter advances on a non-final question and submits on the final one. The
 * submitted answers object must have EXACTLY the question ids as keys (in
 * question order) with the default selections — no extra keys, no dropped
 * keys, no sentinel substitution.
 */
export function enterSubmitsExactRespondParameterShape(): void {
  const card = mountApprovalCard();
  try {
    card.dispatchKey({ key: "Enter" });
    assertEqual(card.respondCalls.length, 0, "Enter on a non-final question must advance, not submit");
    assertIncludes(card.text(), "2 of 2", "Enter on question 1 must advance to question 2");

    card.dispatchKey({ key: "Enter" });
    assertEqual(card.respondCalls.length, 1, "Enter on the final question must submit exactly once");
    const args = card.respondCalls[0];
    assertEqual(args.length, 3, "respond must be called with exactly (request, accepted, answers)");
    assertEqual(args[0], card.request, "respond must pass the ORIGINAL request object by identity");
    assertEqual(args[1], true, "Enter submit is an accept");
    assertExactAnswerShape(args[2], { approach: ["Refactor"], scope: ["Narrow"] });
  } finally {
    card.cleanup();
  }
}

export function continueAdvancesWhenLaterRequiredTextareaIsBlank(): void {
  const card = mountApprovalCard({
    questions: [
      QUESTION_DEFINITIONS[0],
      {
        id: "details",
        header: "Details",
        question: "What extra detail should we include?",
      },
    ],
  });
  try {
    const continueButton = primaryActionButton(card);
    assertEqual(continueButton.disabled, false, "Continue must be enabled when only the current question is answered");
    act(() => {
      continueButton.click();
    });
    assertEqual(card.respondCalls.length, 0, "Continue must advance instead of submitting with a blank later textarea");
    assertIncludes(card.text(), "2 of 2", "Continue must navigate to the later required textarea");
    assertIncludes(card.text(), "Details", "the textarea question must be visible after Continue");
    const submitButton = primaryActionButton(card);
    assertEqual(submitButton.disabled, true, "Submit must stay disabled until the required textarea is answered");
  } finally {
    card.cleanup();
  }
}

/*
 * The card renders one question at a time: panel title = question header
 * (QuestionField's own heading is hidden for user-input) plus that question's
 * option labels. Visibility is asserted via header + first option label, and
 * via the ABSENCE of the other question's options.
 */
function assertQuestionVisible(text: string, questionIndex: 0 | 1, message: string): void {
  const visible = QUESTION_DEFINITIONS[questionIndex];
  const hidden = QUESTION_DEFINITIONS[questionIndex === 0 ? 1 : 0];
  assertIncludes(text, visible.header, `${message} (header)`);
  for (const option of visible.options ?? []) {
    assertIncludes(text, option.label, `${message} (option ${option.label})`);
  }
  for (const option of hidden.options ?? []) {
    if (text.includes(option.label)) {
      throw new Error(`${message}: option ${JSON.stringify(option.label)} of the other question must not be visible`);
    }
  }
}

/** Strict shape check: exact key set/order, arrays of strings, exact values. */
function assertExactAnswerShape(
  actual: Record<string, string[]> | undefined,
  expected: Record<string, string[]>,
): void {
  if (actual === undefined || actual === null) {
    throw new Error(`answers payload was swallowed: expected ${JSON.stringify(expected)}, got ${String(actual)}`);
  }
  assertDeepEqual(
    Object.keys(actual),
    Object.keys(expected),
    "answers must contain exactly the question ids, in question order",
  );
  for (const key of Object.keys(expected)) {
    const value = actual[key];
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
      throw new Error(`answers[${key}] must be a string[]; got ${JSON.stringify(value)}`);
    }
  }
  assertDeepEqual(actual, expected, "answers must match the exact expected payload");
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
