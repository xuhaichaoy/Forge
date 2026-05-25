import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HiCodexIntlProvider, useHiCodexIntl } from "../src/components/i18n-provider";
import {
  HICODEX_LOCALE_STORAGE_KEY,
  createI18nBundle,
  formatI18nMessage,
  loadHiCodexLocale,
  resolveHiCodexLocale,
  saveHiCodexLocale,
} from "../src/state/i18n";

export default function runI18nTests(): void {
  resolvesDesktopStyleLocaleFallbacks();
  formatsMessagesWithLocalFallbacks();
  formatsDesktopPluralMessages();
  persistsLocalePreference();
  rendersProviderConsumerWithLocalizedMessages();
}

function resolvesDesktopStyleLocaleFallbacks(): void {
  assertEqual(resolveHiCodexLocale("zh-Hans-CN"), "zh-CN", "Simplified Chinese should resolve to zh-CN");
  assertEqual(resolveHiCodexLocale("fr-FR"), "en-US", "unsupported locales should fall back to en-US");
  assertEqual(resolveHiCodexLocale(null), "en-US", "missing locale should fall back to en-US");
}

function formatsMessagesWithLocalFallbacks(): void {
  const zh = createI18nBundle("zh-CN");
  assertEqual(
    formatI18nMessage(zh, { id: "hc.command.theme.title", defaultMessage: "Theme" }),
    "主题",
    "known messages should localize",
  );
  assertEqual(
    formatI18nMessage(zh, { id: "hc.test.value", defaultMessage: "Hello {name}" }, { name: "Codex" }),
    "Hello Codex",
    "unknown messages should fall back and interpolate",
  );
}

function formatsDesktopPluralMessages(): void {
  const en = createI18nBundle("en-US");
  const zh = createI18nBundle("zh-CN");
  const descriptor = {
    id: "assistantMessage.memoryCitations.summary",
    defaultMessage: "{count, plural, one {1 memory citation} other {# memory citations}}",
  };

  assertEqual(formatI18nMessage(en, descriptor, { count: 1 }), "1 memory citation", "English singular ICU label");
  assertEqual(formatI18nMessage(en, descriptor, { count: 2 }), "2 memory citations", "English plural ICU label");
  assertEqual(formatI18nMessage(zh, descriptor, { count: 2 }), "2 条记忆引用", "Chinese plural ICU label");
  assertEqual(
    formatI18nMessage(
      zh,
      {
        id: "localConversation.reviewComments.showMore",
        defaultMessage: "{count, plural, one {Show # more comment} other {Show # more comments}}",
      },
      { count: 2 },
    ),
    "再显示 2 条评论",
    "Chinese review comment show-more ICU label",
  );
  assertEqual(
    formatI18nMessage(
      zh,
      {
        id: "localConversationPage.planItemsCompleted",
        defaultMessage: "{completedItems} out of {totalItems, plural, one {# task completed} other {# tasks completed}}",
      },
      { completedItems: 1, totalItems: 3 },
    ),
    "共 3 个任务，已经完成 1 个",
    "Chinese inline todo-list completed summary should match Codex Desktop zh-CN copy",
  );
  assertEqual(
    formatI18nMessage(
      zh,
      {
        id: "codex.todoPlan.stepIndexPrefix",
        defaultMessage: "{index}.",
      },
      { index: 2 },
    ),
    "2.",
    "Chinese todo-list step index prefix should match Codex Desktop zh-CN copy",
  );
}

function persistsLocalePreference(): void {
  const storage = memoryStorage();
  assertEqual(loadHiCodexLocale(storage, "zh-CN"), "zh-CN", "browser locale should be used without storage");
  saveHiCodexLocale(storage, "en-US");
  assertEqual(storage.values.get(HICODEX_LOCALE_STORAGE_KEY), "en-US", "locale should be persisted");
  assertEqual(loadHiCodexLocale(storage, "zh-CN"), "en-US", "stored locale should win");
}

function rendersProviderConsumerWithLocalizedMessages(): void {
  function Consumer() {
    const { locale, formatMessage } = useHiCodexIntl();
    return createElement(
      "span",
      { "data-locale": locale },
      formatMessage({ id: "hc.command.theme.toggleDark", defaultMessage: "Switch to dark theme" }),
    );
  }

  const html = renderToStaticMarkup(createElement(
    HiCodexIntlProvider,
    { locale: "zh-CN", children: createElement(Consumer) },
  ));
  assertIncludes(html, "data-locale=\"zh-CN\"", "provider consumer should receive the resolved locale");
  assertIncludes(html, "切换到深色主题", "provider consumer should format localized messages");
}

function memoryStorage() {
  const values = new Map<string, string>();
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

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
