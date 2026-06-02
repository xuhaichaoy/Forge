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
  usesIntendedModelWhenItsProviderIsReady();
  fallsBackToReadyProviderWhenIntendedIsNotSignedIn();
  blocksWhenNoProviderIsReady();
  picksReadyDefaultWithoutFlaggingFallbackWhenNoIntention();
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

// The screenshot case: default is gpt-5.5 but ChatGPT is not signed in, while
// the local gateway is ready → fall back to it instead of sending to nowhere.
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

function render(readyProviders: ReadonlySet<string>): string {
  return renderToStaticMarkup(
    createElement(ModelPickerMenu, {
      anchor: fakeAnchor,
      providers: [readyProvider, lockedProvider],
      selectedKey: null,
      defaultKey: null,
      readyProviders,
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
