import {
  accountRefreshScopeForNotification,
  accountFromCredentialSummary,
  applyAccountNotification,
  hasOpenAiCredentialSummary,
  initialAccountState,
  logoutAndRefreshAccountState,
  projectAccountUsageAlert,
  projectComposerQuotaBanner,
  projectAccountMenuItems,
  projectAccountViewModel,
  refreshAccountState,
  shouldRefreshAccountStateForNotification,
  type AccountRpcClient,
} from "../src/state/account-state";
import type { RateLimitSnapshot } from "@hicodex/codex-protocol/generated/v2/RateLimitSnapshot";

export default async function runAccountStateTests(): Promise<void> {
  await refreshesAccountAndRateLimitProjection();
  updatesRateLimitSnapshotFromNotification();
  projectsSidebarUsageAlertFromCoreRateLimit();
  projectsComposerQuotaBannerOnlyForBlockingLimits();
  projectsCredentialSummaryWhenActiveProviderHasNoAccount();
  await logsOutThenRefreshesAccountState();
}

async function refreshesAccountAndRateLimitProjection(): Promise<void> {
  const rateLimits = rateLimitFixture({ usedPercent: 42.4 });
  const client = createClient([
    {
      account: { type: "chatgpt", email: "ada@example.com", planType: "pro" },
      requiresOpenaiAuth: false,
    },
    {
      rateLimits,
      rateLimitsByLimitId: { codex: rateLimits },
    },
  ]);

  const state = await refreshAccountState(client, initialAccountState, { now: 1234, timeoutMs: 3000 });

  assertDeepEqual(
    client.requests,
    [
      { method: "account/read", params: { refreshToken: false }, timeoutMs: 3000 },
      { method: "account/rateLimits/read", params: undefined, timeoutMs: 3000 },
    ],
    "account refresh should read account status and rate limits",
  );
  assertEqual(state.status, "ready", "account refresh should finish ready");
  assertEqual(state.account?.type, "chatgpt", "account refresh should store the account");
  assertEqual(state.rateLimitsByLimitId.codex?.primary?.usedPercent, 42.4, "rate limit bucket should be stored");

  const viewModel = projectAccountViewModel(state);
  const menuItems = projectAccountMenuItems(viewModel);
  assertDeepEqual(
    {
      signedIn: viewModel.signedIn,
      displayName: viewModel.displayName,
      email: viewModel.email,
      avatarInitials: viewModel.avatarInitials,
      authLabel: viewModel.authLabel,
      planLabel: viewModel.planLabel,
      quotaLabel: viewModel.quotaLabel,
      quotaDetail: viewModel.quotaDetail,
      quotaTone: viewModel.quotaTone,
      rateLimitHeading: viewModel.rateLimitSummary?.heading ?? null,
      rateLimitRemaining: viewModel.rateLimitSummary?.remainingText ?? null,
      rateLimitSections: viewModel.rateLimitSummary?.sections.map((section) => ({
        label: section.label,
        windows: section.windows.map((window) => ({
          label: window.label,
          remainingText: window.remainingText,
        })),
      })) ?? null,
      signOutDisabled: viewModel.signOutAction.disabled,
    },
    {
      signedIn: true,
      displayName: "ada",
      email: "ada@example.com",
      avatarInitials: "AD",
      authLabel: "ChatGPT",
      planLabel: "Pro",
      quotaLabel: "Codex: 42% used",
      quotaDetail: "Credits 12.50 | Primary window 300m",
      quotaTone: "success",
      rateLimitHeading: "Usage remaining",
      rateLimitRemaining: "58% left",
      rateLimitSections: [{
        label: "Codex limit:",
        windows: [{
          label: "5h limit:",
          remainingText: "58% left",
        }],
      }],
      signOutDisabled: false,
    },
    "account view model should expose footer/sidebar-ready identity and Desktop-style rate-limit fields",
  );
  assertDeepEqual(
    menuItems.map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      tone: item.tone,
      action: item.action ?? null,
      disabled: item.disabled ?? false,
    })),
    [
      { id: "identity", label: "Signed in as", value: "ada@example.com", tone: "neutral", action: null, disabled: false },
      { id: "plan", label: "Plan", value: "Pro", tone: "neutral", action: null, disabled: false },
      // codex: sign-out label aligns to upstream `codex.profileDropdown.logOut` = "Log out"
      { id: "signOut", label: "Log out", value: null, tone: "neutral", action: "account/signOut", disabled: false },
    ],
    "account menu should expose identity/plan/sign-out while the profile dropdown owns the compact rate-limit summary",
  );
}

function projectsSidebarUsageAlertFromCoreRateLimit(): void {
  const modelLimit = rateLimitFixture({ usedPercent: 97 });
  const coreLimit = {
    ...rateLimitFixture({ usedPercent: 88 }),
    limitId: null,
    limitName: null,
    primary: {
      usedPercent: 81,
      windowDurationMins: 300,
      resetsAt: null,
    },
    secondary: {
      usedPercent: 88,
      windowDurationMins: 10_080,
      resetsAt: 1_800_000_000,
    },
  };
  assertDeepEqual(
    projectAccountUsageAlert({ model: modelLimit, core: coreLimit }),
    {
      dismissalKey: "core:10080:1800000000",
      remainingPercent: 12,
      resetAt: 1_800_000_000,
      usedPercent: 88,
      windowDurationMins: 10_080,
    },
    "sidebar usage alert should use the most consumed core account window, not model-specific buckets",
  );
  assertEqual(
    projectAccountUsageAlert({ core: { ...rateLimitFixture({ usedPercent: 79 }), limitName: null } }),
    null,
    "sidebar usage alert should stay hidden above Desktop's low-remaining threshold",
  );
}

function projectsComposerQuotaBannerOnlyForBlockingLimits(): void {
  const coreLimit = {
    ...rateLimitFixture({ usedPercent: 100 }),
    limitId: null,
    limitName: null,
    primary: {
      usedPercent: 100,
      windowDurationMins: 300,
      resetsAt: null,
    },
  };
  assertDeepEqual(
    projectComposerQuotaBanner({ core: coreLimit }, null, "gpt-5"),
    {
      id: "rate-limit-window:core:default",
      title: "Codex usage limit reached",
      detail: "5h limit is fully used.",
      tone: "danger",
    },
    "composer quota banner should prioritize blocking core account limits",
  );

  const selectedModelLimit = {
    ...rateLimitFixture({ usedPercent: 100 }),
    limitId: "gpt-5",
    limitName: "gpt_5",
    primary: {
      usedPercent: 100,
      windowDurationMins: 60,
      resetsAt: null,
    },
  };
  assertDeepEqual(
    projectComposerQuotaBanner({ "gpt-5": selectedModelLimit }, null, "gpt-5"),
    {
      id: "rate-limit-window:model:gpt-5",
      title: "gpt-5 limit reached",
      detail: "1h limit is fully used.",
      tone: "danger",
    },
    "composer quota banner should show selected model limits without product-owned upgrade actions",
  );
  assertEqual(
    projectComposerQuotaBanner({ "gpt-5": selectedModelLimit }, null, "gpt-4.1"),
    null,
    "composer quota banner should not show non-selected model limits",
  );
}

function updatesRateLimitSnapshotFromNotification(): void {
  const previousRateLimits = rateLimitFixture({ usedPercent: 20 });
  const nextRateLimits = rateLimitFixture({ usedPercent: 95 });
  const previous = {
    ...initialAccountState,
    account: { type: "chatgpt", email: "ada@example.com", planType: "pro" } as const,
    requiresOpenaiAuth: false,
    rateLimits: previousRateLimits,
    rateLimitsByLimitId: { codex: previousRateLimits },
    status: "ready" as const,
  };

  const notification = {
    method: "account/rateLimits/updated",
    params: { rateLimits: nextRateLimits },
  };
  const next = applyAccountNotification(previous, notification, 999);

  assertEqual(accountRefreshScopeForNotification(notification), "rateLimits", "rate-limit notification should refresh rate limits");
  assertEqual(shouldRefreshAccountStateForNotification(notification), true, "rate-limit notification should invalidate account projection");
  assertEqual(next.invalidated, true, "rate-limit notification should mark state invalidated");
  assertEqual(next.rateLimits?.primary?.usedPercent, 95, "rate-limit notification should apply the snapshot immediately");
  assertEqual(next.rateLimitsUpdatedAt, 999, "rate-limit notification should update the rate-limit timestamp");

  const accountInvalidated = applyAccountNotification(next, {
    method: "account/updated",
    params: { authMode: "chatgpt", planType: "pro" },
  }, 1000);
  assertEqual(accountRefreshScopeForNotification({ method: "account/login/completed", params: { success: true } }), "all", "login completion should refresh account and quota");
  assertEqual(accountInvalidated.invalidated, true, "account update notification should invalidate state for a full refresh");
}

function projectsCredentialSummaryWhenActiveProviderHasNoAccount(): void {
  const signedOutLocalProviderState = {
    ...initialAccountState,
    account: null,
    requiresOpenaiAuth: false,
    status: "ready" as const,
  };
  const summary = {
    hasAuthFile: true,
    authMode: "chatgpt",
    hasApiKey: false,
    hasTokens: true,
    email: "ada@example.com",
    planType: "pro",
  };

  assertEqual(hasOpenAiCredentialSummary(summary), true, "ChatGPT token summary should be a usable OpenAI credential");
  assertDeepEqual(
    accountFromCredentialSummary(summary),
    { type: "chatgpt", email: "ada@example.com", planType: "pro" },
    "ChatGPT summary should produce a sidebar account fallback",
  );
  const viewModel = projectAccountViewModel(signedOutLocalProviderState, summary);

  assertEqual(viewModel.signedIn, true, "auth summary should keep the footer signed in under local providers");
  assertEqual(viewModel.displayName, "ada", "auth summary should use the decoded email");
  assertEqual(viewModel.authLabel, "ChatGPT", "auth summary should identify ChatGPT auth");
  assertEqual(viewModel.planLabel, "Pro", "auth summary should expose the decoded plan");
}

async function logsOutThenRefreshesAccountState(): Promise<void> {
  const previousRateLimits = rateLimitFixture({ usedPercent: 88 });
  const previous = {
    ...initialAccountState,
    account: { type: "chatgpt", email: "ada@example.com", planType: "pro" } as const,
    requiresOpenaiAuth: false,
    rateLimits: previousRateLimits,
    rateLimitsByLimitId: { codex: previousRateLimits },
    status: "ready" as const,
  };
  const client = createClient([
    {},
    { account: null, requiresOpenaiAuth: true },
    { rateLimits: rateLimitFixture({ usedPercent: 0 }), rateLimitsByLimitId: null },
  ]);

  const next = await logoutAndRefreshAccountState(client, previous, { now: 2000, timeoutMs: 5000 });

  assertDeepEqual(
    client.requests,
    [
      { method: "account/logout", params: undefined, timeoutMs: 5000 },
      { method: "account/read", params: { refreshToken: false }, timeoutMs: 5000 },
      { method: "account/rateLimits/read", params: undefined, timeoutMs: 5000 },
    ],
    "logout should call account/logout and then refresh account and rate-limit state",
  );
  assertEqual(next.account, null, "logout refresh should clear the account");
  assertDeepEqual(next.rateLimitsByLimitId, {}, "logout refresh should clear rate-limit buckets");
  const viewModel = projectAccountViewModel(next);
  assertEqual(viewModel.signedIn, false, "logout view model should be signed out");
  assertEqual(viewModel.signOutAction.disabled, true, "logout view model should disable sign out");
  assertEqual(
    projectAccountMenuItems(viewModel).find((item) => item.id === "signOut")?.disabled,
    true,
    "signed-out account menu should disable sign out",
  );
}

function createClient(results: unknown[]): AccountRpcClient & {
  requests: Array<{ method: string; params?: unknown; timeoutMs?: number | null }>;
} {
  const requests: Array<{ method: string; params?: unknown; timeoutMs?: number | null }> = [];
  let index = 0;
  return {
    requests,
    async request<T>(method: string, params?: unknown, timeoutMs?: number | null): Promise<T> {
      requests.push({ method, params, timeoutMs });
      return results[index++] as T;
    },
  };
}

function rateLimitFixture({ usedPercent }: { usedPercent: number }): RateLimitSnapshot {
  return {
    limitId: "codex",
    limitName: "Codex",
    primary: {
      usedPercent,
      windowDurationMins: 300,
      resetsAt: null,
    },
    secondary: null,
    credits: {
      hasCredits: true,
      unlimited: false,
      balance: "12.50",
    },
    planType: "pro",
    rateLimitReachedType: null,
  };
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
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
