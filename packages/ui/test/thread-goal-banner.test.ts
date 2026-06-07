import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ThreadGoal } from "@hicodex/codex-protocol";

import {
  ThreadGoalBanner,
  formatThreadGoalDuration,
  threadGoalBannerSummary,
} from "../src/components/thread-goal-banner";

export default function runThreadGoalBannerTests(): void {
  hidesWhenNoGoalIsActive();
  rendersPausedGoalSummaryAndControls();
  summarizesActiveBudgetedGoalLikeCodexDesktop();
  hidesStatusToggleForCompletedGoals();
  formatsGoalDurationsLikeCodexDesktop();
}

function goal(overrides: Partial<ThreadGoal> = {}): ThreadGoal {
  return {
    threadId: "thread-goal",
    objective: "Ship the Desktop parity pass",
    status: "active",
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

function hidesWhenNoGoalIsActive(): void {
  const html = renderToStaticMarkup(createElement(ThreadGoalBanner, {
    goal: null,
  }));
  assertEqual(html, "", "thread goal banner should render nothing without a protocol goal");
}

function rendersPausedGoalSummaryAndControls(): void {
  const html = renderToStaticMarkup(createElement(ThreadGoalBanner, {
    goal: goal({ status: "paused", timeUsedSeconds: 90 }),
    onEditGoal: () => undefined,
    onSetGoalStatus: () => undefined,
    onClearGoal: () => undefined,
  }));

  assertEqual(html.includes("Paused goal"), true, "paused goals should use Desktop's paused label");
  assertEqual(html.includes("Ship the Desktop parity pass"), true, "the active objective should be visible");
  assertEqual(html.includes("1m 30s"), true, "paused goal duration should use Desktop's compact formatter");
  assertEqual(html.includes("aria-label=\"Edit goal\""), true, "goal banner should expose the edit action");
  assertEqual(html.includes("aria-label=\"Resume goal\""), true, "paused goals should expose the resume action");
  assertEqual(html.includes("aria-label=\"Clear goal\""), true, "goal banner should expose the clear action");
}

function summarizesActiveBudgetedGoalLikeCodexDesktop(): void {
  const summary = threadGoalBannerSummary(goal({
    status: "active",
    tokenBudget: 20_000,
    tokensUsed: 12_340,
    timeUsedSeconds: 5,
    updatedAt: 100_000,
  }), 110_000);

  assertDeepEqual(
    summary,
    {
      statusLabel: "Pursuing goal",
      objective: "Ship the Desktop parity pass",
      // codex composer-*.js: formatNumber(n, {notation:"compact", maximumFractionDigits:1})
      // → "12.3K" (locale-aware Intl compact, not a rounded-to-integer "12K").
      detail: "12.3K / 20K",
      nextStatus: "paused",
    },
    "active budgeted goals should show token progress and pause as the next status",
  );
}

function hidesStatusToggleForCompletedGoals(): void {
  const html = renderToStaticMarkup(createElement(ThreadGoalBanner, {
    goal: goal({ status: "complete", timeUsedSeconds: 60 }),
    onEditGoal: () => undefined,
    onSetGoalStatus: () => undefined,
    onClearGoal: () => undefined,
  }));

  assertEqual(html.includes("Goal achieved"), true, "completed goals should use Desktop's achieved label");
  assertEqual(html.includes("aria-label=\"Pause goal\""), false, "completed goals should not expose pause");
  assertEqual(html.includes("aria-label=\"Resume goal\""), false, "completed goals should not expose resume");
  assertEqual(html.includes("aria-label=\"Clear goal\""), true, "completed goals should still expose clear");
}

function formatsGoalDurationsLikeCodexDesktop(): void {
  assertEqual(formatThreadGoalDuration(0), "0s", "zero duration should be 0s");
  assertEqual(formatThreadGoalDuration(999), "0s", "sub-second duration should be 0s");
  assertEqual(formatThreadGoalDuration(90_000), "1m 30s", "minute duration should trim zero hours");
  assertEqual(formatThreadGoalDuration(3_725_000), "1h 2m 5s", "hour duration should include non-zero parts");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
