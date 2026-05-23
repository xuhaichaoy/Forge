import type { BrowserStorageLike } from "./image-generation-tool";

export const DESKTOP_ONBOARDING_LAST_COMPLETED_KEY = "last_completed_onboarding";
export const DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY = "electron:onboarding-projectless-completed";
export const DESKTOP_WELCOME_PENDING_KEY = "electron:onboarding-welcome-pending";
export const DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY = "electron:onboarding-hide-first-new-thread-promos";
export const DESKTOP_AMBIENT_SUGGESTIONS_ENABLED_KEY = "ambient-suggestions-enabled";
export const DESKTOP_AMBIENT_SUGGESTIONS_CONSENT_SEEN_KEY = "has-seen-ambient-suggestions-connected-apps-consent";
export const DESKTOP_AMBIENT_SUGGESTIONS_CONNECT_APPS_ROW_DISMISSED_KEY = "has-dismissed-ambient-suggestions-connect-apps-row";
export const HICODEX_ONBOARDING_INSTALLATION_ID_KEY = "hicodex:onboarding-installation-id";

export interface OnboardingSnapshot {
  installationId: string | null;
  firstLaunch: boolean | null;
  ambientSuggestionsConnectAppsRowDismissed: boolean;
  ambientSuggestionsConsentSeen: boolean;
  ambientSuggestionsEnabled: boolean;
  hideFirstNewThreadPromos: boolean;
  lastCompletedOnboarding: number | null;
  projectlessCompleted: boolean | null;
  welcomePending: boolean;
}

export interface OnboardingCompletionOptions {
  ambientSuggestionsEnabled?: boolean;
}

export interface HostOnboardingSignal {
  installationId?: string | null;
  firstLaunch?: boolean | null;
}

interface NormalizedHostOnboardingSignal {
  installationId: string | null;
  firstLaunch: boolean | null;
}

export interface OnboardingEmptyStateContext {
  activeThreadId: string | null | undefined;
  connected: boolean;
  connecting: boolean;
  startingConversation: boolean;
}

export interface FirstNewThreadPromoContext extends OnboardingEmptyStateContext {
  threadCount: number;
}

const EMPTY_HOST_ONBOARDING_SIGNAL: NormalizedHostOnboardingSignal = Object.freeze({
  installationId: null,
  firstLaunch: null,
});

let latestHostOnboardingSignal: NormalizedHostOnboardingSignal = EMPTY_HOST_ONBOARDING_SIGNAL;

export function recordHostOnboardingSignal(
  signal: HostOnboardingSignal | null | undefined,
  storage: BrowserStorageLike | null = null,
): void {
  const installationId = normalizedInstallationId(signal?.installationId);
  let firstLaunch = normalizeFirstLaunch(signal?.firstLaunch);
  if (installationId && storage) {
    const previousInstallationId = readStoredString(storage, HICODEX_ONBOARDING_INSTALLATION_ID_KEY);
    const newInstallationMarker = previousInstallationId !== installationId;
    if (previousInstallationId && previousInstallationId !== installationId) {
      firstLaunch = true;
    }
    if (firstLaunch === true && !newInstallationMarker && currentInstallationFirstLaunchHandled(storage)) {
      firstLaunch = false;
    }
    writeStoredString(storage, HICODEX_ONBOARDING_INSTALLATION_ID_KEY, installationId);
    if (firstLaunch === true && newInstallationMarker) {
      writeStoredBoolean(storage, DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY, false);
      writeStoredBoolean(storage, DESKTOP_WELCOME_PENDING_KEY, true);
      writeStoredBoolean(storage, DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY, false);
    }
  }
  latestHostOnboardingSignal = installationId || firstLaunch !== null
    ? { installationId, firstLaunch }
    : EMPTY_HOST_ONBOARDING_SIGNAL;
}

export function loadOnboardingSnapshot(
  storage: BrowserStorageLike | null,
  hostSignal: HostOnboardingSignal | null = latestHostOnboardingSignal,
): OnboardingSnapshot {
  const normalizedHostSignal = normalizeHostOnboardingSignal(hostSignal);
  const hostFirstLaunch = normalizedHostSignal.firstLaunch === true;
  return {
    installationId: normalizedHostSignal.installationId,
    firstLaunch: normalizedHostSignal.firstLaunch,
    ambientSuggestionsConnectAppsRowDismissed:
      readStoredBoolean(storage, DESKTOP_AMBIENT_SUGGESTIONS_CONNECT_APPS_ROW_DISMISSED_KEY) ?? false,
    ambientSuggestionsConsentSeen:
      readStoredBoolean(storage, DESKTOP_AMBIENT_SUGGESTIONS_CONSENT_SEEN_KEY) ?? false,
    ambientSuggestionsEnabled:
      readStoredBoolean(storage, DESKTOP_AMBIENT_SUGGESTIONS_ENABLED_KEY) ?? true,
    hideFirstNewThreadPromos: readStoredBoolean(storage, DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY) ?? false,
    lastCompletedOnboarding: hostFirstLaunch ? null : readStoredNumber(storage, DESKTOP_ONBOARDING_LAST_COMPLETED_KEY),
    projectlessCompleted: hostFirstLaunch ? false : readStoredBoolean(storage, DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY),
    welcomePending: hostFirstLaunch ? true : readStoredBoolean(storage, DESKTOP_WELCOME_PENDING_KEY) ?? false,
  };
}

export function completeProjectlessOnboarding(
  storage: BrowserStorageLike | null,
  completedAtMs: number = Date.now(),
  options: OnboardingCompletionOptions = {},
): OnboardingSnapshot {
  writeAmbientSuggestionPreference(storage, options.ambientSuggestionsEnabled);
  writeStoredBoolean(storage, DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY, true);
  writeStoredBoolean(storage, DESKTOP_WELCOME_PENDING_KEY, false);
  writeStoredNumber(storage, DESKTOP_ONBOARDING_LAST_COMPLETED_KEY, Math.floor(completedAtMs / 1000));
  if (latestHostOnboardingSignal.firstLaunch === true) {
    latestHostOnboardingSignal = { ...latestHostOnboardingSignal, firstLaunch: false };
  }
  return loadOnboardingSnapshot(storage);
}

export function dismissFirstNewThreadPromos(
  storage: BrowserStorageLike | null,
  options: OnboardingCompletionOptions = {},
): OnboardingSnapshot {
  writeAmbientSuggestionPreference(storage, options.ambientSuggestionsEnabled);
  writeStoredBoolean(storage, DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY, true);
  return loadOnboardingSnapshot(storage);
}

export function shouldShowOnboardingEmptyState(context: OnboardingEmptyStateContext): boolean {
  return !context.activeThreadId
    && context.connected
    && !context.connecting
    && !context.startingConversation;
}

export function shouldShowFirstNewThreadPromo(
  snapshot: OnboardingSnapshot,
  context: FirstNewThreadPromoContext,
): boolean {
  if (!shouldShowOnboardingEmptyState(context)) return false;
  const effectiveSnapshot = snapshotWithLatestHostSignal(snapshot);
  if (effectiveSnapshot.hideFirstNewThreadPromos) return false;
  return effectiveSnapshot.welcomePending
    || (context.threadCount === 0 && effectiveSnapshot.projectlessCompleted !== true);
}

function snapshotWithLatestHostSignal(snapshot: OnboardingSnapshot): OnboardingSnapshot {
  if (latestHostOnboardingSignal.firstLaunch !== true) {
    if (latestHostOnboardingSignal.installationId && snapshot.installationId !== latestHostOnboardingSignal.installationId) {
      return {
        ...snapshot,
        installationId: latestHostOnboardingSignal.installationId,
        firstLaunch: latestHostOnboardingSignal.firstLaunch,
      };
    }
    return snapshot;
  }
  return {
    ...snapshot,
    installationId: latestHostOnboardingSignal.installationId,
    firstLaunch: true,
    lastCompletedOnboarding: null,
    projectlessCompleted: false,
    welcomePending: true,
  };
}

function normalizeHostOnboardingSignal(signal: HostOnboardingSignal | null | undefined): NormalizedHostOnboardingSignal {
  return {
    installationId: normalizedInstallationId(signal?.installationId),
    firstLaunch: normalizeFirstLaunch(signal?.firstLaunch),
  };
}

function normalizedInstallationId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeFirstLaunch(value: boolean | null | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStoredString(storage: BrowserStorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(key)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function currentInstallationFirstLaunchHandled(storage: BrowserStorageLike | null): boolean {
  return readStoredBoolean(storage, DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY) === true
    || readStoredBoolean(storage, DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY) === true
    || (
      readStoredBoolean(storage, DESKTOP_WELCOME_PENDING_KEY) === false
      && readStoredNumber(storage, DESKTOP_ONBOARDING_LAST_COMPLETED_KEY) !== null
    );
}

function readStoredBoolean(storage: BrowserStorageLike | null, key: string): boolean | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  } catch {
    return null;
  }
}

function readStoredNumber(storage: BrowserStorageLike | null, key: string): number | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredBoolean(storage: BrowserStorageLike | null, key: string, value: boolean): void {
  if (!storage) return;
  try {
    storage.setItem(key, value ? "true" : "false");
  } catch {
    // The in-memory React snapshot still updates when browser storage is unavailable.
  }
}

function writeAmbientSuggestionPreference(
  storage: BrowserStorageLike | null,
  enabled: boolean | undefined,
): void {
  if (typeof enabled !== "boolean") return;
  writeStoredBoolean(storage, DESKTOP_AMBIENT_SUGGESTIONS_ENABLED_KEY, enabled);
  writeStoredBoolean(storage, DESKTOP_AMBIENT_SUGGESTIONS_CONSENT_SEEN_KEY, true);
}

function writeStoredNumber(storage: BrowserStorageLike | null, key: string, value: number): void {
  if (!storage) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    // The in-memory React snapshot still updates when browser storage is unavailable.
  }
}

function writeStoredString(storage: BrowserStorageLike | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // The in-memory React snapshot still updates when browser storage is unavailable.
  }
}
