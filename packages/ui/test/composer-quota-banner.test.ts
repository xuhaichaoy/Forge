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
      // codex: aligns to `codex.upsellBanner.general.title` = "You’re out of Codex messages"
      title: "You’re out of Codex messages",
      detail: "5h limit is fully used.",
      tone: "danger",
    },
    onViewStatus: () => undefined,
  }));

  assertIncludes(html, "You’re out of Codex messages", "composer quota banner should show the quota title");
  assertIncludes(html, "5h limit is fully used.", "composer quota banner should show quota detail");
  // codex: CTA aligns to `codex.upsellBanner.cta.viewUsage` = "View Usage"
  assertIncludes(html, "View Usage", "composer quota banner should use the upstream upsell CTA label");
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
