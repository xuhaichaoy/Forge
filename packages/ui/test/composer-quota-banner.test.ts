import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerQuotaBanner } from "../src/components/composer-quota-banner";

export default function runComposerQuotaBannerTests(): void {
  rendersNothingWithoutBanner();
  rendersReadOnlyQuotaBanner();
}

function rendersNothingWithoutBanner(): void {
  const html = renderToStaticMarkup(createElement(ComposerQuotaBanner, {
    banner: null,
    onViewStatus: () => undefined,
  }));

  assertEqual(html, "", "composer quota banner should be absent without blocking quota data");
}

function rendersReadOnlyQuotaBanner(): void {
  const html = renderToStaticMarkup(createElement(ComposerQuotaBanner, {
    banner: {
      id: "rate-limit-window:core:default",
      title: "Codex usage limit reached",
      detail: "5h limit is fully used.",
      tone: "danger",
    },
    onViewStatus: () => undefined,
  }));

  assertIncludes(html, "Codex usage limit reached", "composer quota banner should show the quota title");
  assertIncludes(html, "5h limit is fully used.", "composer quota banner should show quota detail");
  assertIncludes(html, "View status", "composer quota banner should use the existing status panel action");
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
