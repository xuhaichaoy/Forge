import { composerStatusRows } from "../src/components/composer-status-panel";
import type { RateLimitSnapshot } from "@forge/codex-protocol/generated/v2/RateLimitSnapshot";

export default function runComposerStatusPanelTests(): void {
  formatsDesktopStatusRows();
  fallsBackWhenStatusDataIsUnavailable();
  formatsDesktopModelSections();
  formatsMultipleDesktopRateLimitBuckets();
}

function formatsDesktopStatusRows(): void {
  const rows = composerStatusRows({
    threadId: "thread-123",
    tokensUsed: 28_300,
    contextWindow: 249_000,
    rateLimits: rateLimitFixture(),
  });

  assertDeepEqual(
    rows,
    [
      { id: "session", label: "Session:", value: "thread-123" },
      { id: "context", label: "Context:", value: "89% left (28,300 used / 249K)" },
      { id: "rate-limit-section:codex", label: "Codex limit:", value: null, section: true },
      { id: "rate-limit:codex:primary", label: "5h limit:", value: "58% left (reset time unavailable)", rateLimitPercent: 57.6 },
      { id: "rate-limit:codex:secondary", label: "7d limit:", value: "11% left (reset time unavailable)", rateLimitPercent: 11.2 },
    ],
    "composer status rows should mirror Desktop's session/context/rate-limit panel data",
  );
}

function fallsBackWhenStatusDataIsUnavailable(): void {
  assertDeepEqual(
    composerStatusRows({
      threadId: null,
      tokensUsed: null,
      contextWindow: null,
      rateLimits: null,
    }),
    [
      { id: "rate-limit", label: "Rate limit:", value: "Unavailable" },
    ],
    "composer status rows should omit unavailable session/context rows and keep Desktop's rate-limit fallback",
  );
}

function formatsDesktopModelSections(): void {
  const rows = composerStatusRows({
    threadId: null,
    tokensUsed: null,
    contextWindow: null,
    rateLimits: {
      ...rateLimitFixture(),
      limitName: "gpt_5",
      primary: {
        usedPercent: 10,
        windowDurationMins: 60,
        resetsAt: null,
      },
      secondary: {
        usedPercent: 20,
        windowDurationMins: 300,
        resetsAt: null,
      },
    },
  });

  assertDeepEqual(
    rows,
    [
      { id: "rate-limit-section:codex", label: "gpt-5 limit:", value: null, section: true },
      { id: "rate-limit:codex:primary", label: "1h limit:", value: "90% left (reset time unavailable)", rateLimitPercent: 90 },
      { id: "rate-limit:codex:secondary", label: "5h limit:", value: "80% left (reset time unavailable)", rateLimitPercent: 80 },
    ],
    "composer status rows should render Desktop model sections and sorted rate-limit windows",
  );
}

function formatsMultipleDesktopRateLimitBuckets(): void {
  const core = { ...rateLimitFixture(), limitId: null, limitName: null };
  const model = {
    ...rateLimitFixture(),
    limitId: "gpt-5",
    limitName: "gpt_5",
    primary: {
      usedPercent: 10,
      windowDurationMins: 60,
      resetsAt: null,
    },
    secondary: null,
  };
  const rows = composerStatusRows({
    threadId: null,
    tokensUsed: null,
    contextWindow: null,
    rateLimits: core,
    rateLimitsByLimitId: { core, "gpt-5": model },
  });

  assertDeepEqual(
    rows,
    [
      { id: "rate-limit:core:primary", label: "5h limit:", value: "58% left (reset time unavailable)", rateLimitPercent: 57.6 },
      { id: "rate-limit:core:secondary", label: "7d limit:", value: "11% left (reset time unavailable)", rateLimitPercent: 11.2 },
      { id: "rate-limit-section:gpt-5", label: "gpt-5 limit:", value: null, section: true },
      { id: "rate-limit:gpt-5:primary", label: "1h limit:", value: "90% left (reset time unavailable)", rateLimitPercent: 90 },
    ],
    "composer status should include all Desktop rate-limit buckets when app-server provides the multi-bucket map",
  );
}

function rateLimitFixture(): RateLimitSnapshot {
  return {
    limitId: "codex",
    limitName: "Codex",
    primary: {
      usedPercent: 42.4,
      windowDurationMins: 300,
      resetsAt: null,
    },
    secondary: {
      usedPercent: 88.8,
      windowDurationMins: 10_080,
      resetsAt: null,
    },
    credits: {
      hasCredits: true,
      unlimited: false,
      balance: "12.50",
    },
    planType: "pro",
    rateLimitReachedType: null,
  };
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
