import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type ModelPickerProvider,
  ModelPickerMenu,
  resolveEffectiveModelSelection,
} from "../src/components/model-picker-menu";

export default function runModelPickerMenuTests(): void {
  locksModelsForUnverifiedProviders();
  keepsModelsSelectableForVerifiedProviders();
  locksCrossAccountProvidersWhileAChatIsActive();
  keepsSameAccountProvidersSelectableWhileAChatIsActive();
  rendersServerDisplayLabelsForModels();
  usesIntendedModelWhenItsProviderIsReady();
  rejectsReadyProviderWhenModelIsNotInThatProvider();
  fallsBackToReadyProviderWhenIntendedIsNotSignedIn();
  blocksExplicitProviderSelectionWhenIntendedIsNotSignedIn();
  blocksWhenNoProviderIsReady();
  picksReadyDefaultWithoutFlaggingFallbackWhenNoIntention();
  prefersProviderDefaultModelInFallback();
  describesCrossAccountProviderLimitInFooter();
}

const RESOLVER_PROVIDERS = [
  { id: "hicodex_local", models: ["Qwen3.6-27B-mxfp4"] },
  { id: "openai_http", models: ["gpt-5.5", "gpt-5.4"] },
];

// Normal signed-in path must be untouched: the user's pick is used as-is.
function usesIntendedModelWhenItsProviderIsReady(): void {
  const r = resolveEffectiveModelSelection({
    intended: { providerId: "openai_http", model: "gpt-5.5" },
    providers: RESOLVER_PROVIDERS,
    readyProviders: new Set(["hicodex_local", "openai_http"]),
  });
  assertEqual(r.providerId, "openai_http", "ready intended provider is used");
  assertEqual(r.model, "gpt-5.5", "ready intended model is used");
  assertEqual(r.fellBack, false, "no fallback when intended is ready");
  assertEqual(r.noReadyProvider, false, "ready provider exists");
}

function rejectsReadyProviderWhenModelIsNotInThatProvider(): void {
  const r = resolveEffectiveModelSelection({
    intended: { providerId: "openai_http", model: "team-prefix:Qwen3.6-27B-mxfp4" },
    providers: RESOLVER_PROVIDERS,
    readyProviders: new Set(["hicodex_local", "openai_http"]),
    allowFallback: false,
  });
  assertEqual(r.providerId, "openai_http", "provider identity is preserved for explicit invalid picks");
  assertEqual(r.model, "team-prefix:Qwen3.6-27B-mxfp4", "invalid model is preserved for display/debug");
  assertEqual(r.fellBack, false, "explicit invalid pick does not fall back");
  assertEqual(r.noReadyProvider, true, "caller should not send a model that is not in the provider catalog");
}

// Config/default resolution: if there is no explicit picker override and the
// configured provider is unavailable, use a ready provider instead of sending
// to nowhere.
function fallsBackToReadyProviderWhenIntendedIsNotSignedIn(): void {
  const r = resolveEffectiveModelSelection({
    intended: { providerId: "openai_http", model: "gpt-5.5" },
    providers: RESOLVER_PROVIDERS,
    readyProviders: new Set(["hicodex_local"]),
  });
  assertEqual(r.providerId, "hicodex_local", "falls back to the ready provider");
  assertEqual(r.model, "Qwen3.6-27B-mxfp4", "falls back to its first model");
  assertEqual(r.fellBack, true, "fellBack flagged so the UI can explain the swap");
  assertEqual(r.noReadyProvider, false, "a ready provider exists");
  assertEqual(r.intended?.providerId, "openai_http", "intended pick is preserved for the sign-in hint");
}

// Explicit user provider picks must not silently route to a different provider.
function blocksExplicitProviderSelectionWhenIntendedIsNotSignedIn(): void {
  const r = resolveEffectiveModelSelection({
    intended: { providerId: "openai_http", model: "gpt-5.5" },
    providers: RESOLVER_PROVIDERS,
    readyProviders: new Set(["hicodex_local"]),
    allowFallback: false,
  });
  assertEqual(r.providerId, "openai_http", "explicit provider pick stays selected");
  assertEqual(r.model, "gpt-5.5", "explicit model pick stays selected");
  assertEqual(r.fellBack, false, "explicit provider pick does not fall back");
  assertEqual(r.noReadyProvider, true, "caller should avoid silently sending to another provider");
}

// Nothing ready (not signed in AND local gateway not configured) → caller blocks send.
function blocksWhenNoProviderIsReady(): void {
  const r = resolveEffectiveModelSelection({
    intended: { providerId: "openai_http", model: "gpt-5.5" },
    providers: RESOLVER_PROVIDERS,
    readyProviders: new Set(),
  });
  assertEqual(r.noReadyProvider, true, "no ready provider → block send");
  assertEqual(r.fellBack, false, "cannot fall back to nothing");
}

// No saved pick / config default + a ready provider → just use it, but this is
// a plain default, not a "fell back from X", so no swap banner should show.
function picksReadyDefaultWithoutFlaggingFallbackWhenNoIntention(): void {
  const r = resolveEffectiveModelSelection({
    intended: null,
    providers: RESOLVER_PROVIDERS,
    readyProviders: new Set(["hicodex_local"]),
  });
  assertEqual(r.providerId, "hicodex_local", "uses the ready provider as default");
  assertEqual(r.fellBack, false, "no intention → not a fallback");
  assertEqual(r.noReadyProvider, false, "a ready provider exists");
}

// Fallback resolution honors the provider's own default model (e.g. the team
// member default from /models is_default) instead of blindly taking models[0].
function prefersProviderDefaultModelInFallback(): void {
  const r = resolveEffectiveModelSelection({
    intended: null,
    providers: [
      {
        id: "team_model_gateway",
        models: ["123123:Qwen3.6-27B-mxfp4", "123123:DeepSeek-V4"],
        defaultModel: "123123:DeepSeek-V4",
      },
      ...RESOLVER_PROVIDERS,
    ],
    readyProviders: new Set(["team_model_gateway", "hicodex_local"]),
  });
  assertEqual(r.providerId, "team_model_gateway", "first ready provider wins");
  assertEqual(r.model, "123123:DeepSeek-V4", "the provider default model beats models[0]");
}

function describesCrossAccountProviderLimitInFooter(): void {
  const markup = render(new Set(["ready_provider", "locked_provider"]));
  assertIncludes(
    markup,
    "订阅模型与个人/团队模型互切需新建聊天",
    "footer should not claim every provider change keeps the current chat",
  );
}

/*
 * Subscription vs API/team providers use different account/credit pools, so
 * they cannot be switched within one chat. With an active chat bound to an
 * API provider, the subscription provider's rows must be locked (and vice
 * versa) instead of failing at send time.
 */
function locksCrossAccountProvidersWhileAChatIsActive(): void {
  // Account class is derived from the real subscription provider ids
  // (openai / openai_http) — the fixture must use them.
  const subscriptionProvider: ModelPickerProvider = {
    id: "openai_http",
    label: "ChatGPT 订阅 · OpenAI HTTP",
    host: "chatgpt.com",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    models: ["gpt-5.5", "gpt-5.4"],
    authMode: "oauth",
  };
  // API-provider chat: the subscription section starts collapsed (rare
  // scenario) and its header explains the cross-account limit.
  const apiChatMarkup = renderToStaticMarkup(
    createElement(ModelPickerMenu, {
      anchor: fakeAnchor,
      providers: [readyProvider, subscriptionProvider],
      selectedKey: null,
      defaultKey: null,
      readyProviders: new Set(["ready_provider", "openai_http"]),
      activeThreadProviderId: "ready_provider",
      onSelect: () => {},
      onOpenSettings: () => {},
      onSignIn: () => {},
      onClose: () => {},
    }),
  );
  assertEqual(
    occurrences(apiChatMarkup, "GPT-5.5"),
    0,
    "subscription models should start collapsed — mixing account classes is the rare case",
  );
  assertIncludes(
    apiChatMarkup,
    "需新建聊天",
    "cross-account lock should explain that a new chat is required",
  );
  // Subscription chat: the section is expanded (it holds the selection) and
  // the API provider's row is the locked side.
  const subscriptionChatMarkup = renderToStaticMarkup(
    createElement(ModelPickerMenu, {
      anchor: fakeAnchor,
      providers: [readyProvider, subscriptionProvider],
      selectedKey: "openai_http::gpt-5.5",
      defaultKey: null,
      readyProviders: new Set(["ready_provider", "openai_http"]),
      activeThreadProviderId: "openai_http",
      onSelect: () => {},
      onOpenSettings: () => {},
      onSignIn: () => {},
      onClose: () => {},
    }),
  );
  assertIncludes(
    subscriptionChatMarkup,
    "GPT-5.5",
    "subscription section holding the current selection should stay expanded",
  );
  assertEqual(
    occurrences(subscriptionChatMarkup, 'data-locked="true"'),
    1,
    "the API provider's model should be locked while a subscription chat is active",
  );
}

function keepsSameAccountProvidersSelectableWhileAChatIsActive(): void {
  const teamProvider: ModelPickerProvider = {
    id: "team_model_gateway",
    label: "团队模型",
    host: "127.0.0.1:5050",
    baseUrl: "http://127.0.0.1:5050/api/team-gateway/v1",
    models: ["123123:Qwen3.6-27B-mxfp4"],
    authMode: "api-key",
  };
  const markup = renderToStaticMarkup(
    createElement(ModelPickerMenu, {
      anchor: fakeAnchor,
      providers: [readyProvider, teamProvider],
      selectedKey: null,
      defaultKey: null,
      readyProviders: new Set(["ready_provider", "team_model_gateway"]),
      activeThreadProviderId: "ready_provider",
      onSelect: () => {},
      onOpenSettings: () => {},
      onSignIn: () => {},
      onClose: () => {},
    }),
  );
  assertEqual(
    occurrences(markup, 'data-locked="true"'),
    0,
    "personal ↔ team (same account class) switching stays available in-chat",
  );
}

function rendersServerDisplayLabelsForModels(): void {
  const teamProvider: ModelPickerProvider = {
    id: "team_model_gateway",
    label: "团队模型",
    host: "127.0.0.1:5050",
    baseUrl: "http://127.0.0.1:5050/api/team-gateway/v1",
    models: ["123123:Qwen3.6-27B-mxfp4"],
    modelLabels: { "123123:Qwen3.6-27B-mxfp4": "Qwen3.6 27B" },
    authMode: "api-key",
  };
  const markup = renderToStaticMarkup(
    createElement(ModelPickerMenu, {
      anchor: fakeAnchor,
      providers: [teamProvider],
      selectedKey: null,
      defaultKey: null,
      readyProviders: new Set(["team_model_gateway"]),
      onSelect: () => {},
      onOpenSettings: () => {},
      onSignIn: () => {},
      onClose: () => {},
    }),
  );
  assertIncludes(markup, "Qwen3.6 27B", "server display label should be rendered");
  assert(
    !markup.includes("123123:Qwen3.6-27B-mxfp4</span>"),
    "the raw provider-scoped id should not be the visible row label when a display label exists",
  );
}

// renderToStaticMarkup runs the component body (incl. the position useState
// initializer, which reads anchor.getBoundingClientRect) but not effects, so a
// minimal fake anchor is enough.
const fakeAnchor = {
  getBoundingClientRect: () => ({
    left: 100, top: 200, right: 100, bottom: 200, width: 0, height: 0, x: 100, y: 200,
    toJSON() {},
  }),
  contains: () => false,
} as unknown as HTMLElement;

const readyProvider: ModelPickerProvider = {
  id: "ready_provider",
  label: "Ready provider",
  host: "127.0.0.1:8890",
  baseUrl: "http://127.0.0.1:8890/v1",
  models: ["ready-model"],
  authMode: "api-key",
};
const lockedProvider: ModelPickerProvider = {
  id: "locked_provider",
  label: "ChatGPT 订阅 · OpenAI HTTP",
  host: "chatgpt.com",
  baseUrl: "https://chatgpt.com/backend-api/codex",
  models: ["gpt-5.5", "gpt-5.4"],
  authMode: "oauth",
};

function render(
  readyProviders: ReadonlySet<string>,
  options: { activeThreadProviderId?: string | null } = {},
): string {
  return renderToStaticMarkup(
    createElement(ModelPickerMenu, {
      anchor: fakeAnchor,
      providers: [readyProvider, lockedProvider],
      selectedKey: null,
      defaultKey: null,
      readyProviders,
      activeThreadProviderId: options.activeThreadProviderId ?? null,
      onSelect: () => {},
      onOpenSettings: () => {},
      onSignIn: () => {},
      onClose: () => {},
    }),
  );
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function assertIncludes(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}: expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`);
  }
}

// The bug this guards against: a provider showing "not signed in" / "no key"
// still let the user pick its models, which then only produced a
// connect/reconnect error. Unverified providers must render locked, non-radio
// model rows.
function locksModelsForUnverifiedProviders(): void {
  // Only the api-key provider is verified; the oauth (ChatGPT) provider is not.
  const markup = render(new Set(["ready_provider"]));
  // The 2 ChatGPT models are the only locked rows.
  assertEqual(
    occurrences(markup, 'data-locked="true"'),
    2,
    "both models of the not-signed-in provider should be locked",
  );
  assertEqual(
    occurrences(markup, 'aria-disabled="true"'),
    2,
    "locked model rows should be aria-disabled",
  );
  assert(
    markup.includes("Sign in with ChatGPT to use this model"),
    "oauth-locked rows should explain that sign-in is required",
  );
}

function keepsModelsSelectableForVerifiedProviders(): void {
  // Both providers verified → nothing is locked.
  const markup = render(new Set(["ready_provider", "locked_provider"]));
  assertEqual(
    occurrences(markup, 'data-locked="true"'),
    0,
    "verified providers must keep their models selectable",
  );
  assert(
    !markup.includes('aria-disabled="true"'),
    "no model row should be disabled when every provider is verified",
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}
