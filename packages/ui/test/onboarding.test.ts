import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingEmptyState } from "../src/components/onboarding-empty-state";
import {
  DESKTOP_AMBIENT_SUGGESTIONS_CONSENT_SEEN_KEY,
  DESKTOP_AMBIENT_SUGGESTIONS_ENABLED_KEY,
  DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY,
  DESKTOP_ONBOARDING_LAST_COMPLETED_KEY,
  DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY,
  DESKTOP_WELCOME_PENDING_KEY,
  HICODEX_ONBOARDING_INSTALLATION_ID_KEY,
  completeProjectlessOnboarding,
  dismissFirstNewThreadPromos,
  loadOnboardingSnapshot,
  recordHostOnboardingSignal,
  shouldShowFirstNewThreadPromo,
  shouldShowOnboardingEmptyState,
  type OnboardingSnapshot,
} from "../src/state/onboarding";

export default function runOnboardingTests(): void {
  projectsDesktopOnboardingStorageKeys();
  appliesHostInstallationFirstLaunchSignal();
  derivesFirstNewThreadPromoVisibility();
  completesProjectlessOnboarding();
  rendersDesktopEmptyStateSloganWithoutDuplicateCtas();
}

function projectsDesktopOnboardingStorageKeys(): void {
  recordHostOnboardingSignal(null);
  const storage = memoryStorage([
    [DESKTOP_WELCOME_PENDING_KEY, "true"],
    [DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY, "false"],
    [DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY, "false"],
    [DESKTOP_ONBOARDING_LAST_COMPLETED_KEY, "1780000000"],
  ]);
  assertDeepEqual(
    loadOnboardingSnapshot(storage),
    onboardingSnapshot({
      hideFirstNewThreadPromos: false,
      lastCompletedOnboarding: 1780000000,
      projectlessCompleted: false,
      welcomePending: true,
    }),
    "Desktop onboarding keys should load into a stable HiCodex snapshot",
  );
}

function appliesHostInstallationFirstLaunchSignal(): void {
  recordHostOnboardingSignal(null);
  const storage = memoryStorage([
    [DESKTOP_WELCOME_PENDING_KEY, "false"],
    [DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY, "true"],
    [DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY, "true"],
    [DESKTOP_ONBOARDING_LAST_COMPLETED_KEY, "1780000000"],
  ]);

  recordHostOnboardingSignal({
    installationId: "11111111-1111-4111-8111-111111111111",
    firstLaunch: true,
  }, storage);

  assertEqual(
    storage.values.get(HICODEX_ONBOARDING_INSTALLATION_ID_KEY),
    "11111111-1111-4111-8111-111111111111",
    "host installation id should be remembered separately from Desktop onboarding keys",
  );
  const snapshot = loadOnboardingSnapshot(storage);
  assertDeepEqual(snapshot, onboardingSnapshot({
    installationId: "11111111-1111-4111-8111-111111111111",
    firstLaunch: true,
    hideFirstNewThreadPromos: false,
    lastCompletedOnboarding: null,
    projectlessCompleted: false,
    welcomePending: true,
  }), "host firstLaunch should win over stale local onboarding completion");
  assertEqual(
    shouldShowFirstNewThreadPromo(snapshot, {
      activeThreadId: null,
      connected: true,
      connecting: false,
      startingConversation: false,
      threadCount: 0,
    }),
    true,
    "host firstLaunch should show the first-new-thread promo",
  );

  const dismissed = dismissFirstNewThreadPromos(storage);
  assertEqual(dismissed.hideFirstNewThreadPromos, true, "dismiss should still hide the host first-launch promo");
  recordHostOnboardingSignal({
    installationId: "11111111-1111-4111-8111-111111111111",
    firstLaunch: true,
  }, storage);
  assertEqual(
    storage.values.get(DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY),
    "true",
    "repeated host firstLaunch for the same installation should not undo a user dismissal",
  );
  assertEqual(
    shouldShowFirstNewThreadPromo(loadOnboardingSnapshot(storage), {
      activeThreadId: null,
      connected: true,
      connecting: false,
      startingConversation: false,
      threadCount: 0,
    }),
    false,
    "dismissed host first-launch promo should stay hidden",
  );

  completeProjectlessOnboarding(storage, 1_780_000_001_000);
  recordHostOnboardingSignal({
    installationId: "11111111-1111-4111-8111-111111111111",
    firstLaunch: true,
  }, storage);
  const completedSnapshot = loadOnboardingSnapshot(storage);
  assertEqual(
    completedSnapshot.projectlessCompleted,
    true,
    "repeated host firstLaunch for the same installation should not reopen completed onboarding",
  );
  assertEqual(
    completedSnapshot.welcomePending,
    false,
    "completed onboarding should keep the welcome banner closed across repeated host status updates",
  );
  recordHostOnboardingSignal(null);
}

function derivesFirstNewThreadPromoVisibility(): void {
  recordHostOnboardingSignal(null);
  const baseContext = {
    activeThreadId: null,
    connected: true,
    connecting: false,
    startingConversation: false,
    threadCount: 0,
  };
  assertEqual(
    shouldShowOnboardingEmptyState(baseContext),
    true,
    "connected pre-conversation state should render the empty state",
  );
  assertEqual(
    shouldShowFirstNewThreadPromo(onboardingSnapshot({
      hideFirstNewThreadPromos: false,
      lastCompletedOnboarding: null,
      projectlessCompleted: null,
      welcomePending: false,
    }), baseContext),
    true,
    "first empty launch should show the first-new-thread promo",
  );
  assertEqual(
    shouldShowFirstNewThreadPromo(onboardingSnapshot({
      hideFirstNewThreadPromos: true,
      lastCompletedOnboarding: null,
      projectlessCompleted: null,
      welcomePending: true,
    }), baseContext),
    false,
    "dismissed first-new-thread promos should stay hidden",
  );
  assertEqual(
    shouldShowFirstNewThreadPromo(onboardingSnapshot({
      hideFirstNewThreadPromos: false,
      lastCompletedOnboarding: 1780000000,
      projectlessCompleted: true,
      welcomePending: false,
    }), { ...baseContext, threadCount: 3 }),
    false,
    "completed onboarding with existing threads should not show the promo",
  );
}

function completesProjectlessOnboarding(): void {
  recordHostOnboardingSignal(null);
  const storage = memoryStorage();
  const completed = completeProjectlessOnboarding(storage, 1_780_000_000_999);
  assertEqual(storage.values.get(DESKTOP_PROJECTLESS_ONBOARDING_COMPLETED_KEY), "true", "projectless key should be set");
  assertEqual(storage.values.get(DESKTOP_WELCOME_PENDING_KEY), "false", "welcome pending should be cleared");
  assertEqual(storage.values.get(DESKTOP_ONBOARDING_LAST_COMPLETED_KEY), "1780000000", "completed timestamp should be seconds");
  assertDeepEqual(completed, onboardingSnapshot({
    hideFirstNewThreadPromos: false,
    lastCompletedOnboarding: 1780000000,
    projectlessCompleted: true,
    welcomePending: false,
  }), "completed snapshot should reflect storage writes");

  const dismissed = dismissFirstNewThreadPromos(storage);
  assertEqual(storage.values.get(DESKTOP_HIDE_FIRST_NEW_THREAD_PROMOS_KEY), "true", "dismiss key should be set");
  assertEqual(dismissed.hideFirstNewThreadPromos, true, "dismissed snapshot should hide promos");

  const personalized = dismissFirstNewThreadPromos(storage, { ambientSuggestionsEnabled: false });
  assertEqual(
    storage.values.get(DESKTOP_AMBIENT_SUGGESTIONS_ENABLED_KEY),
    "false",
    "ambient suggestions setting should use the Desktop key",
  );
  assertEqual(
    storage.values.get(DESKTOP_AMBIENT_SUGGESTIONS_CONSENT_SEEN_KEY),
    "true",
    "ambient suggestions consent should use the Desktop key",
  );
  assertEqual(personalized.ambientSuggestionsEnabled, false, "dismiss snapshot should reflect ambient preference");
  assertEqual(personalized.ambientSuggestionsConsentSeen, true, "dismiss snapshot should mark ambient consent seen");
}

function rendersDesktopEmptyStateSloganWithoutDuplicateCtas(): void {
  const html = renderToStaticMarkup(createElement(OnboardingEmptyState, {
    onDismissPromo: () => undefined,
    onStartChat: () => undefined,
    onUseExistingFolder: () => undefined,
    showPromo: true,
    workspace: "/Users/haichao/Desktop/data/HiCodex",
  }));

  // codex app-main home hero is a single greeting heading with NO subtitle; the
  // "Let's build" slogan lives on the separate hotkey-window new-thread page, not
  // here (letsBuild appears 0× in app-main). So the main-home empty state must
  // render the greeting and must NOT render a "Let's build" subtitle.
  assertIncludes(html, "What should we work on in", "empty state should render Codex's main-home greeting");
  // codex pE: the project name is a clickable selector. The trailing "?" / locale suffix now sits
  // OUTSIDE the button (headlineAfter) so the project name positions correctly across locales
  // (zh-CN renders 我们应该在 {project} 中做些什么？ with the project in the middle).
  assertIncludes(html, "hc-onboarding-empty-project-trigger", "the project name should be a clickable selector (codex pE)");
  assertIncludes(html, "HiCodex</button>?", "the project selector should be followed by the trailing '?' (outside the clickable button)");
  assertEqual(html.includes("Let&#x27;s build"), false, "main-home hero must NOT show the hotkey-page 'Let's build' slogan");
  assertEqual(html.includes("Start a chat"), false, "empty state should not use ad hoc hero copy");
  assertEqual(html.includes("Choose folder"), false, "empty state should not duplicate composer folder controls");
  assertEqual(html.includes("Add project"), false, "empty state should not duplicate project selection controls");
  assertEqual(html.includes("/Users/haichao/Desktop/data/HiCodex"), false, "empty state should not repeat the workspace path");

  // Welcome-promo CTAs must reuse Codex's existing i18n labels (sidebarElectron.newThread
  // = "New chat"; projectSetup.addProjectMenu.useExistingFolder = "Use an existing folder")
  // rather than the previous self-authored "Begin new conversation"/"Open existing folder".
  assertIncludes(html, "New chat", "promo primary CTA should reuse Codex's newThread label");
  assertIncludes(html, "Use an existing folder", "promo secondary CTA should reuse Codex's useExistingFolder label");
  assertEqual(html.includes("Begin new conversation"), false, "promo must not use the self-authored primary CTA copy");
  assertEqual(html.includes("Open existing folder"), false, "promo must not use the self-authored secondary CTA copy");
  // The self-authored promo description sentence has no Codex equivalent and must be gone.
  assertEqual(html.includes("Connect external agents"), false, "promo must not carry self-authored description copy");
}

function onboardingSnapshot(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return {
    installationId: null,
    firstLaunch: null,
    ambientSuggestionsConnectAppsRowDismissed: false,
    ambientSuggestionsConsentSeen: false,
    ambientSuggestionsEnabled: true,
    hideFirstNewThreadPromos: false,
    lastCompletedOnboarding: null,
    projectlessCompleted: null,
    welcomePending: false,
    ...overrides,
  };
}

function memoryStorage(entries: Array<[string, string]> = []) {
  const values = new Map<string, string>(entries);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}

function assertIncludes(value: string, expected: string, message: string): void {
  if (!value.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}
