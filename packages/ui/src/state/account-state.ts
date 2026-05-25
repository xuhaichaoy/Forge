import type { JsonRpcNotification } from "@hicodex/codex-protocol";
import type { Account } from "@hicodex/codex-protocol/generated/v2/Account";
import type { GetAccountResponse } from "@hicodex/codex-protocol/generated/v2/GetAccountResponse";
import type { GetAccountRateLimitsResponse } from "@hicodex/codex-protocol/generated/v2/GetAccountRateLimitsResponse";
import type { PlanType } from "@hicodex/codex-protocol/generated/PlanType";
import type { RateLimitSnapshot } from "@hicodex/codex-protocol/generated/v2/RateLimitSnapshot";
import type { RateLimitWindow } from "@hicodex/codex-protocol/generated/v2/RateLimitWindow";

export type AccountRefreshScope = "account" | "rateLimits" | "all";

export interface AccountRpcClient {
  request<T = unknown>(method: string, params?: unknown, timeoutMs?: number | null): Promise<T>;
}

export interface AccountState {
  account: Account | null;
  requiresOpenaiAuth: boolean | null;
  rateLimits: RateLimitSnapshot | null;
  rateLimitsByLimitId: Record<string, RateLimitSnapshot>;
  status: "idle" | "loading" | "ready" | "error";
  refreshing: boolean;
  invalidated: boolean;
  error: string | null;
  updatedAt: number | null;
  rateLimitsUpdatedAt: number | null;
}

export interface AccountSignOutAction {
  type: "account/signOut";
  label: string;
  disabled: boolean;
  reason?: string;
}

export interface AccountViewModel {
  signedIn: boolean;
  displayName: string;
  email: string | null;
  avatarInitials: string;
  avatarUrl: null;
  authLabel: string;
  planLabel: string | null;
  quotaLabel: string;
  quotaDetail: string | null;
  quotaTone: "neutral" | "success" | "warning" | "danger";
  loading: boolean;
  error: string | null;
  signOutAction: AccountSignOutAction;
}

export interface AccountMenuItem {
  id: "identity" | "plan" | "quota" | "quotaDetail" | "error" | "signOut";
  label: string;
  value: string | null;
  tone: "neutral" | "success" | "warning" | "danger";
  action?: AccountSignOutAction["type"];
  disabled?: boolean;
}

export interface RefreshAccountStateOptions {
  scope?: AccountRefreshScope;
  refreshToken?: boolean;
  timeoutMs?: number | null;
  now?: number;
}

export interface AccountCredentialSummary {
  hasAuthFile: boolean;
  authMode?: string | null;
  hasApiKey: boolean;
  hasTokens: boolean;
  email?: string | null;
  planType?: string | null;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export const initialAccountState: AccountState = Object.freeze({
  account: null,
  requiresOpenaiAuth: null,
  rateLimits: null,
  rateLimitsByLimitId: {},
  status: "idle",
  refreshing: false,
  invalidated: false,
  error: null,
  updatedAt: null,
  rateLimitsUpdatedAt: null,
});

export function beginAccountStateRefresh(state: AccountState): AccountState {
  return {
    ...state,
    status: state.status === "idle" ? "loading" : state.status,
    refreshing: true,
    error: null,
  };
}

export function clearAccountState(state: AccountState = initialAccountState, now = Date.now()): AccountState {
  return {
    ...state,
    account: null,
    requiresOpenaiAuth: true,
    rateLimits: null,
    rateLimitsByLimitId: {},
    status: "ready",
    refreshing: false,
    invalidated: false,
    error: null,
    updatedAt: now,
    rateLimitsUpdatedAt: now,
  };
}

export function accountRefreshScopeForNotification(message: JsonRpcNotification): AccountRefreshScope | null {
  switch (message.method) {
    case "account/updated":
    case "account/login/completed":
      return "all";
    case "account/rateLimits/updated":
      return "rateLimits";
    default:
      return null;
  }
}

export function shouldRefreshAccountStateForNotification(message: JsonRpcNotification): boolean {
  return accountRefreshScopeForNotification(message) !== null;
}

export function applyAccountNotification(
  state: AccountState,
  message: JsonRpcNotification,
  now = Date.now(),
): AccountState {
  const scope = accountRefreshScopeForNotification(message);
  if (!scope) return state;
  if (message.method !== "account/rateLimits/updated") {
    return {
      ...state,
      invalidated: true,
      error: null,
    };
  }

  const rateLimits = rateLimitSnapshotFromUnknown((message.params as Record<string, unknown> | undefined)?.rateLimits);
  if (!rateLimits) {
    return {
      ...state,
      invalidated: true,
      error: null,
    };
  }
  return {
    ...state,
    rateLimits,
    rateLimitsByLimitId: mergeRateLimitSnapshot(state.rateLimitsByLimitId, rateLimits),
    invalidated: true,
    error: null,
    rateLimitsUpdatedAt: now,
  };
}

export async function refreshAccountState(
  client: AccountRpcClient,
  previous: AccountState = initialAccountState,
  options: RefreshAccountStateOptions = {},
): Promise<AccountState> {
  const scope = options.scope ?? "all";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now();
  const shouldReadAccount = scope === "account" || scope === "all";
  const shouldReadRateLimits = scope === "rateLimits" || scope === "all";

  const accountResult = shouldReadAccount
    ? await readAccount(client, options.refreshToken === true, timeoutMs)
    : ok<GetAccountResponse>({
        account: previous.account,
        requiresOpenaiAuth: previous.requiresOpenaiAuth ?? true,
      });
  const rateLimitsResult = shouldReadRateLimits
    ? await readRateLimits(client, timeoutMs)
    : ok<GetAccountRateLimitsResponse>({
        rateLimits: previous.rateLimits ?? emptyRateLimitSnapshot(),
        rateLimitsByLimitId: previous.rateLimitsByLimitId,
      });

  const account = accountResult.ok ? accountResult.value.account : previous.account;
  const requiresOpenaiAuth = accountResult.ok
    ? accountResult.value.requiresOpenaiAuth
    : previous.requiresOpenaiAuth;
  const signedOut = accountResult.ok && accountResult.value.account === null;
  let rateLimits: RateLimitSnapshot | null;
  let rateLimitsByLimitId: Record<string, RateLimitSnapshot>;
  if (signedOut) {
    rateLimits = null;
    rateLimitsByLimitId = {};
  } else if (rateLimitsResult.ok) {
    rateLimits = rateLimitsResult.value.rateLimits;
    rateLimitsByLimitId = normalizeRateLimitMap(rateLimitsResult.value.rateLimitsByLimitId, rateLimitsResult.value.rateLimits);
  } else if (shouldReadRateLimits) {
    rateLimits = null;
    rateLimitsByLimitId = {};
  } else {
    rateLimits = previous.rateLimits;
    rateLimitsByLimitId = previous.rateLimitsByLimitId;
  }
  const error = accountResult.ok
    ? rateLimitsResult.ok ? null : `Rate limits unavailable: ${rateLimitsResult.error}`
    : accountResult.error;

  return {
    ...previous,
    account,
    requiresOpenaiAuth,
    rateLimits,
    rateLimitsByLimitId,
    status: accountResult.ok ? "ready" : "error",
    refreshing: false,
    invalidated: false,
    error,
    updatedAt: accountResult.ok ? now : previous.updatedAt,
    rateLimitsUpdatedAt: rateLimitsResult.ok ? now : shouldReadRateLimits ? now : previous.rateLimitsUpdatedAt,
  };
}

export async function logoutAndRefreshAccountState(
  client: AccountRpcClient,
  previous: AccountState = initialAccountState,
  options: RefreshAccountStateOptions = {},
): Promise<AccountState> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  await client.request("account/logout", undefined, timeoutMs);
  return refreshAccountState(client, clearAccountState(previous, options.now), {
    ...options,
    scope: "all",
    refreshToken: false,
  });
}

export function hasOpenAiCredentialSummary(summary: AccountCredentialSummary | null | undefined): boolean {
  if (!summary?.hasAuthFile) return false;
  const authMode = normalizeAuthMode(summary.authMode);
  if (authMode === "chatgpt" || authMode === "chatgptauthtokens" || authMode === "agentidentity") {
    return summary.hasTokens;
  }
  if (authMode === "apikey") {
    return summary.hasApiKey;
  }
  return summary.hasTokens || summary.hasApiKey;
}

export function accountFromCredentialSummary(summary: AccountCredentialSummary | null | undefined): Account | null {
  if (!hasOpenAiCredentialSummary(summary)) return null;
  const authMode = normalizeAuthMode(summary?.authMode);
  if (authMode === "apikey") {
    return { type: "apiKey" };
  }
  if (summary?.hasTokens) {
    return {
      type: "chatgpt",
      email: summary.email?.trim() ?? "",
      planType: normalizePlanType(summary.planType),
    };
  }
  return summary?.hasApiKey ? { type: "apiKey" } : null;
}

export function projectAccountViewModel(
  state: AccountState,
  credentialSummary?: AccountCredentialSummary | null,
): AccountViewModel {
  const account = state.account ?? accountFromCredentialSummary(credentialSummary);
  const identity = projectAccountIdentity(account);
  const quota = projectQuotaSummary(state.rateLimits);
  const signedIn = account !== null;
  return {
    signedIn,
    displayName: identity.displayName,
    email: identity.email,
    avatarInitials: initialsFor(identity.displayName, identity.email),
    avatarUrl: null,
    authLabel: identity.authLabel,
    planLabel: planLabel(identity.planType),
    quotaLabel: quota.label,
    quotaDetail: quota.detail,
    quotaTone: quota.tone,
    loading: state.refreshing || state.status === "loading",
    error: state.error,
    signOutAction: {
      type: "account/signOut",
      // codex: profile dropdown sign-out label — ICU id `codex.profileDropdown.logOut`
      // defaultMessage:`Log out` (also `codex.command.logOut`, distinct from the
      // longer command description `codex.commandDescription.logOut`:`Sign out of Codex`).
      label: "Log out",
      disabled: !signedIn || state.refreshing,
      ...(!signedIn ? { reason: "No Codex account is signed in." } : {}),
    },
  };
}

export function projectAccountMenuItems(view: AccountViewModel): AccountMenuItem[] {
  const items: AccountMenuItem[] = [
    {
      id: "identity",
      label: view.signedIn ? "Signed in as" : "Account",
      value: view.email ?? view.displayName,
      tone: view.signedIn ? "neutral" : "warning",
    },
  ];
  if (view.planLabel) {
    items.push({
      id: "plan",
      label: "Plan",
      value: view.planLabel,
      tone: "neutral",
    });
  }
  items.push({
    id: "quota",
    label: "Usage",
    value: view.quotaLabel,
    tone: view.quotaTone,
  });
  if (view.quotaDetail) {
    items.push({
      id: "quotaDetail",
      label: "Usage detail",
      value: view.quotaDetail,
      tone: view.quotaTone,
    });
  }
  if (view.error) {
    items.push({
      id: "error",
      label: "Account error",
      value: view.error,
      tone: "danger",
    });
  }
  items.push({
    id: "signOut",
    label: view.signOutAction.label,
    value: view.signOutAction.reason ?? null,
    tone: "neutral",
    action: "account/signOut",
    disabled: view.signOutAction.disabled,
  });
  return items;
}

async function readAccount(
  client: AccountRpcClient,
  refreshToken: boolean,
  timeoutMs: number | null,
): Promise<Result<GetAccountResponse>> {
  try {
    return ok(await client.request<GetAccountResponse>("account/read", { refreshToken }, timeoutMs));
  } catch (error) {
    return fail(errorMessage(error));
  }
}

async function readRateLimits(
  client: AccountRpcClient,
  timeoutMs: number | null,
): Promise<Result<GetAccountRateLimitsResponse>> {
  try {
    return ok(await client.request<GetAccountRateLimitsResponse>("account/rateLimits/read", undefined, timeoutMs));
  } catch (error) {
    return fail(errorMessage(error));
  }
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function normalizeRateLimitMap(
  value: GetAccountRateLimitsResponse["rateLimitsByLimitId"],
  fallback: RateLimitSnapshot | null,
): Record<string, RateLimitSnapshot> {
  const entries = Object.entries(value ?? {})
    .filter((entry): entry is [string, RateLimitSnapshot] => Boolean(entry[1]));
  if (entries.length > 0) return Object.fromEntries(entries);
  return fallback ? mergeRateLimitSnapshot({}, fallback) : {};
}

function mergeRateLimitSnapshot(
  current: Record<string, RateLimitSnapshot>,
  snapshot: RateLimitSnapshot,
): Record<string, RateLimitSnapshot> {
  const key = snapshot.limitId || "default";
  return {
    ...current,
    [key]: snapshot,
  };
}

function rateLimitSnapshotFromUnknown(value: unknown): RateLimitSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    limitId: stringOrNull(record.limitId),
    limitName: stringOrNull(record.limitName),
    primary: rateLimitWindowFromUnknown(record.primary),
    secondary: rateLimitWindowFromUnknown(record.secondary),
    credits: record.credits && typeof record.credits === "object"
      ? {
          hasCredits: Boolean((record.credits as Record<string, unknown>).hasCredits),
          unlimited: Boolean((record.credits as Record<string, unknown>).unlimited),
          balance: stringOrNull((record.credits as Record<string, unknown>).balance),
        }
      : null,
    planType: planTypeOrNull(record.planType),
    rateLimitReachedType: stringOrNull(record.rateLimitReachedType) as RateLimitSnapshot["rateLimitReachedType"],
  };
}

function rateLimitWindowFromUnknown(value: unknown): RateLimitWindow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const usedPercent = typeof record.usedPercent === "number" ? record.usedPercent : 0;
  const windowDurationMins = typeof record.windowDurationMins === "number" ? record.windowDurationMins : null;
  const resetsAt = typeof record.resetsAt === "number" ? record.resetsAt : null;
  return { usedPercent, windowDurationMins, resetsAt };
}

function emptyRateLimitSnapshot(): RateLimitSnapshot {
  return {
    limitId: null,
    limitName: null,
    primary: null,
    secondary: null,
    credits: null,
    planType: null,
    rateLimitReachedType: null,
  };
}

function projectAccountIdentity(account: Account | null): {
  displayName: string;
  email: string | null;
  authLabel: string;
  planType: PlanType | null;
} {
  if (!account) {
    return { displayName: "Signed out", email: null, authLabel: "Not signed in", planType: null };
  }
  switch (account.type) {
    case "chatgpt": {
      const email = account.email.trim();
      const localPart = email.split("@")[0]?.trim();
      return {
        displayName: localPart || email || "ChatGPT account",
        email: email || null,
        authLabel: "ChatGPT",
        planType: account.planType,
      };
    }
    case "apiKey":
      return { displayName: "API key", email: null, authLabel: "API key", planType: null };
    case "amazonBedrock":
      return { displayName: "Amazon Bedrock", email: null, authLabel: "Amazon Bedrock", planType: null };
    default:
      return { displayName: "Codex account", email: null, authLabel: "Signed in", planType: null };
  }
}

function projectQuotaSummary(snapshot: RateLimitSnapshot | null): {
  label: string;
  detail: string | null;
  tone: AccountViewModel["quotaTone"];
} {
  if (!snapshot) return { label: "Quota unavailable", detail: null, tone: "neutral" };
  const primary = snapshot.primary;
  const secondary = snapshot.secondary;
  const credits = snapshot.credits;
  if (snapshot.rateLimitReachedType) {
    return {
      label: "Quota limit reached",
      detail: humanizeIdentifier(snapshot.rateLimitReachedType),
      tone: "danger",
    };
  }
  if (credits && !credits.unlimited && !credits.hasCredits) {
    return { label: "Credits depleted", detail: "No credits available", tone: "danger" };
  }
  const primaryLabel = primary
    ? `${snapshot.limitName || "Codex"}: ${formatPercent(primary.usedPercent)} used`
    : snapshot.limitName || "Usage unavailable";
  const details = [
    credits ? creditLabel(credits) : null,
    primary ? resetLabel(primary, "Primary") : null,
    secondary ? `${formatPercent(secondary.usedPercent)} secondary used` : null,
    secondary ? resetLabel(secondary, "Secondary") : null,
  ].filter((value): value is string => Boolean(value));
  return {
    label: primaryLabel,
    detail: details.length > 0 ? details.join(" | ") : null,
    tone: primary && primary.usedPercent >= 100
      ? "danger"
      : primary && primary.usedPercent >= 90 ? "warning" : "success",
  };
}

function creditLabel(credits: NonNullable<RateLimitSnapshot["credits"]>): string {
  if (credits.unlimited) return "Credits unlimited";
  if (credits.balance) return `Credits ${credits.balance}`;
  return credits.hasCredits ? "Credits available" : "Credits unavailable";
}

function resetLabel(window: RateLimitWindow, label: string): string | null {
  if (window.resetsAt) {
    return `${label} resets ${new Date(window.resetsAt * 1_000).toLocaleString()}`;
  }
  if (window.windowDurationMins) return `${label} window ${window.windowDurationMins}m`;
  return null;
}

function initialsFor(displayName: string, email: string | null): string {
  const source = email || displayName;
  const parts = source
    .replace(/@.*/, "")
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`
    : parts[0]?.slice(0, 2) || "CD";
  return initials.toUpperCase();
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function planLabel(value: PlanType | null): string | null {
  if (!value || value === "unknown") return null;
  return humanizeIdentifier(value);
}

function humanizeIdentifier(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function planTypeOrNull(value: unknown): PlanType | null {
  return typeof value === "string" ? value as PlanType : null;
}

function normalizePlanType(value: unknown): PlanType {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  return knownPlanTypes.has(normalized) ? normalized as PlanType : "unknown";
}

function normalizeAuthMode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[-_\s]/g, "") : "";
}

const knownPlanTypes = new Set<string>([
  "free",
  "go",
  "plus",
  "pro",
  "prolite",
  "team",
  "self_serve_business_usage_based",
  "business",
  "enterprise_cbp_usage_based",
  "enterprise",
  "edu",
  "unknown",
]);

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
