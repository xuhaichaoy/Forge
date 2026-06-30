import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GeneratedImagePreviewTab,
  generatedImageSidePanelTabId,
  generatedImagePreviewKeyboardOffset,
} from "../src/components/generated-image-preview-tab";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import { generatedImagePreviewItemsFromRailEntries } from "../src/hooks/use-forge-app-preview-wiring";
import type { UiMessageFormatter } from "../src/hooks/use-ui-preferences";
import type { RailEntry } from "../src/state/render-groups";

export default function runGeneratedImagePreviewTabTests(): void {
  usesDesktopImageSidePanelPreviewTabId();
  rendersDesktopDownloadNameFromAltInsteadOfTabTitle();
  fallsBackToDecodedSourceFilenameForDownloadName();
  rendersDesktopThumbnailRailForMultipleImages();
  projectsRailGeneratedImagesInDesktopPreviewOrder();
  mapsDesktopThumbnailArrowKeys();
}

function usesDesktopImageSidePanelPreviewTabId(): void {
  assertEqual(
    generatedImageSidePanelTabId("abc-123"),
    "image:abc-123",
    "generated image side-panel preview tabs should use Desktop's image:<uuid> id prefix",
  );
}

function rendersDesktopDownloadNameFromAltInsteadOfTabTitle(): void {
  const html = renderGeneratedImagePreview([{
    id: "image-1",
    src: "https://example.com/output/render.png?token=secret",
    alt: "Generated image 1",
    title: "Conversation title - Generated image 1",
  }]);

  assertIncludes(html, 'download="Generated image 1.png"', "download name should use the image alt label");
  assertEqual(
    html.includes('download="Conversation title - Generated image 1.png"'),
    false,
    "download name should not use the side-panel tab title",
  );
}

function fallsBackToDecodedSourceFilenameForDownloadName(): void {
  const html = renderGeneratedImagePreview([{
    id: "image-1",
    src: "https://example.com/output/generated%20image.jpg?token=secret",
    alt: "",
    title: "",
  }]);

  assertIncludes(html, 'download="generated image.jpg"', "download name should fall back to the decoded source filename");
}

function rendersDesktopThumbnailRailForMultipleImages(): void {
  const html = renderGeneratedImagePreview([
    {
      id: "image-1",
      src: "https://example.com/output/one.png",
      alt: "Generated image 1",
      title: "Conversation title - Generated image 1",
    },
    {
      id: "image-2",
      src: "https://example.com/output/two.png",
      previewSrc: "https://example.com/output/two-thumb.png",
      alt: "Generated image 2",
      title: "Conversation title - Generated image 2",
    },
  ], { initialImageId: "image-2" });

  assertIncludes(html, 'aria-label="Generated images"', "multiple images should render the Desktop thumbnail rail");
  assertIncludes(html, 'aria-current="true"', "initial image should be marked current in the thumbnail rail");
  assertIncludes(html, "two-thumb.png", "thumbnail rail should use the preview source when available");
}

function projectsRailGeneratedImagesInDesktopPreviewOrder(): void {
  const entries: RailEntry[] = [
    {
      id: "image:data-1",
      title: "Generated image",
      meta: "data:image/png;base64,AAA",
      status: "completed",
      artifactKind: "generated-image",
      action: { kind: "url", url: "data:image/png;base64,AAA" },
    },
    {
      id: "image:data-2",
      title: "Generated image",
      meta: "data:image/png;base64,BBB",
      status: "completed",
      artifactKind: "generated-image",
      action: { kind: "url", url: "data:image/png;base64,BBB" },
    },
  ];

  const { images, initialImage } = generatedImagePreviewItemsFromRailEntries(
    entries[1],
    entries,
    null,
    formatTestUiMessage,
  );

  assertEqual(images.map((image) => image.id).join(","), "image:data-2,image:data-1", "preview rail should match Desktop reverse order");
  assertEqual(images.map((image) => image.alt).join(","), "Generated image 1,Generated image 2", "preview labels should keep Desktop latest-first numbering");
  assertEqual(initialImage?.id ?? null, "image:data-2", "clicked generated image should stay active after preview reorder");
}

function mapsDesktopThumbnailArrowKeys(): void {
  assertEqual(generatedImagePreviewKeyboardOffset("ArrowUp"), -1, "ArrowUp should move to previous image");
  assertEqual(generatedImagePreviewKeyboardOffset("ArrowLeft"), -1, "ArrowLeft should move to previous image");
  assertEqual(generatedImagePreviewKeyboardOffset("ArrowDown"), 1, "ArrowDown should move to next image");
  assertEqual(generatedImagePreviewKeyboardOffset("ArrowRight"), 1, "ArrowRight should move to next image");
  assertEqual(generatedImagePreviewKeyboardOffset("Enter"), 0, "non-arrow keys should not move images");
}

function renderGeneratedImagePreview(
  images: Parameters<typeof GeneratedImagePreviewTab>[0]["images"],
  props: Partial<Parameters<typeof GeneratedImagePreviewTab>[0]> = {},
): string {
  return renderToStaticMarkup(createElement(
    ForgeIntlProvider,
    {
      locale: "en-US",
      children: createElement(GeneratedImagePreviewTab, { images, ...props }),
    },
  ));
}

const formatTestUiMessage: UiMessageFormatter = (descriptor, values) => {
  const replacements = (values ?? {}) as Record<string, unknown>;
  const message = descriptor.defaultMessage ?? descriptor.id;
  return message.replace(/\{([^}]+)\}/g, (_match, key: string) => String(replacements[key] ?? ""));
};

function assertIncludes(value: string, needle: string, message: string): void {
  if (!value.includes(needle)) {
    throw new Error(`${message}: missing ${needle}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
