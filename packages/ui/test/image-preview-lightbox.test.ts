import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  IMAGE_PREVIEW_ZOOM_LEVELS,
  ImagePreviewLightbox,
  imagePreviewClampZoomPercent,
  imagePreviewDataUrlToBlob,
  imagePreviewFitZoomPercent,
  imagePreviewKeyboardZoomCommand,
  imagePreviewWheelZoomPercent,
  imagePreviewZoomRamp,
} from "../src/components/image-preview-lightbox";

export default async function runImagePreviewLightboxTests(): Promise<void> {
  rendersDesktopLightboxNavigationLabels();
  computesDesktopFitZoomRamp();
  mapsDesktopImagePreviewZoomShortcuts();
  computesDesktopWheelZoom();
  await convertsDataUrlsForDesktopStyleDownload();
}

function rendersDesktopLightboxNavigationLabels(): void {
  const html = renderToStaticMarkup(createElement(ImagePreviewLightbox, {
    src: "data:image/png;base64,abc",
    alt: "Generated image 2",
    imageReferrerPolicy: "no-referrer",
    title: "Generated image 2",
    viewportClassName: "hc-preview-lightbox-viewport--thread-content",
    onClose: () => {},
    onPreviousImage: () => {},
    onNextImage: () => {},
  }));

  assertStringIncludes(html, 'aria-label="Previous image"', "previous image aria label should match Desktop lightbox");
  assertStringIncludes(html, 'aria-label="Next image"', "next image aria label should match Desktop lightbox");
  assertStringIncludes(html, 'aria-label="Download image"', "download image aria label should match Desktop lightbox");
  assertStringIncludes(html, 'aria-label="Zoom out image"', "zoom-out aria label should match Desktop lightbox");
  assertStringIncludes(html, 'aria-label="Zoom in image"', "zoom-in aria label should match Desktop lightbox");
  assertStringIncludes(html, ">100%</span>", "lightbox should expose the zoom percent control like Desktop");
  assertStringIncludes(html, "hc-preview-lightbox-dialog--with-nav", "lightbox should reserve side space for Desktop-style image nav");
  assertStringIncludes(html, 'data-testid="image-preview-dismiss-area"', "lightbox should expose Desktop dismiss area test id");
  assertStringIncludes(html, 'download="Generated image 2"', "download filename should use Desktop alt-label fallback");
  assertStringIncludes(html, 'referrerPolicy="no-referrer"', "generated image preview should match Desktop's no-referrer policy");
  assertStringIncludes(html, "hc-preview-lightbox-viewport--thread-content", "generated image preview should use Desktop's thread-width cap");
  assertStringIncludes(html, 'class="sr-only"', "lightbox title should be screen-reader only like Desktop");
  assertEqual(html.includes("hc-preview-lightbox-header"), false, "lightbox should not render a visible card header");
  assertEqual(html.includes("Previous images"), false, "lightbox should not use gallery paging label");
  assertEqual(html.includes("Next images"), false, "lightbox should not use gallery paging label");
}

function computesDesktopFitZoomRamp(): void {
  assertEqual(IMAGE_PREVIEW_ZOOM_LEVELS[0], 25, "Desktop zoom ramp should include the 25% lower bound");
  assertEqual(
    IMAGE_PREVIEW_ZOOM_LEVELS[IMAGE_PREVIEW_ZOOM_LEVELS.length - 1],
    500,
    "Desktop zoom ramp should include the 500% upper bound",
  );
  const fit = imagePreviewFitZoomPercent({ width: 2000, height: 1000 }, { width: 1000, height: 800 });
  assertEqual(fit, 50, "fit zoom should clamp large images to the viewport");
  assertEqual(
    imagePreviewFitZoomPercent({ width: 400, height: 300 }, { width: 1000, height: 800 }),
    100,
    "fit zoom should not upscale smaller images",
  );
  const ramp = imagePreviewZoomRamp(62.5);
  assertEqual(ramp.includes(62.5), true, "fit zoom should be inserted into the Desktop zoom ramp");
  assertEqual(ramp.includes(25), true, "fit zoom ramp should keep Desktop lower bound");
  assertEqual(ramp.includes(500), true, "fit zoom ramp should keep Desktop upper bound");
}

function mapsDesktopImagePreviewZoomShortcuts(): void {
  assertEqual(
    JSON.stringify(imagePreviewKeyboardZoomCommand({ metaKey: true, key: "=" })),
    JSON.stringify({ type: "step-zoom", delta: 1 }),
    "Cmd+= should dispatch Desktop step-zoom in",
  );
  assertEqual(
    JSON.stringify(imagePreviewKeyboardZoomCommand({ ctrlKey: true, key: "+" })),
    JSON.stringify({ type: "step-zoom", delta: 1 }),
    "Ctrl++ should dispatch Desktop step-zoom in",
  );
  assertEqual(
    JSON.stringify(imagePreviewKeyboardZoomCommand({ metaKey: true, key: "-" })),
    JSON.stringify({ type: "step-zoom", delta: -1 }),
    "Cmd+- should dispatch Desktop step-zoom out",
  );
  assertEqual(
    JSON.stringify(imagePreviewKeyboardZoomCommand({ ctrlKey: true, key: "0" })),
    JSON.stringify({ type: "reset-zoom" }),
    "Ctrl+0 should dispatch Desktop reset-zoom",
  );
  assertEqual(
    imagePreviewKeyboardZoomCommand({ key: "=" }),
    null,
    "plain equals should not dispatch image preview zoom",
  );
}

function computesDesktopWheelZoom(): void {
  const zoomedIn = imagePreviewWheelZoomPercent({
    currentZoomPercent: 100,
    deltaMode: 0,
    deltaY: -100,
    maximumZoomPercent: 500,
    minimumZoomPercent: 25,
  });
  assertApprox(zoomedIn, 100 * Math.exp(0.5), 0.001, "pixel wheel zoom should use Desktop exponential curve");

  const lineModeZoom = imagePreviewWheelZoomPercent({
    currentZoomPercent: 100,
    deltaMode: 1,
    deltaY: 10,
    maximumZoomPercent: 500,
    minimumZoomPercent: 25,
  });
  assertApprox(lineModeZoom, 100 * Math.exp(-160 / 200), 0.001, "line-mode wheel delta should be scaled by 16");

  assertEqual(
    imagePreviewWheelZoomPercent({
      currentZoomPercent: 100,
      deltaMode: 2,
      deltaY: 1,
      maximumZoomPercent: 500,
      minimumZoomPercent: 25,
    }),
    25,
    "page-mode wheel delta should clamp to the minimum zoom",
  );
  assertEqual(
    imagePreviewWheelZoomPercent({
      currentZoomPercent: 100,
      deltaMode: 0,
      deltaY: -1000,
      maximumZoomPercent: 500,
      minimumZoomPercent: 25,
    }),
    500,
    "large zoom-in wheel delta should clamp to the maximum zoom",
  );
  assertEqual(
    imagePreviewClampZoomPercent({ maximumZoomPercent: 500, minimumZoomPercent: 25, zoomPercent: Number.NaN }),
    null,
    "invalid zoom values should be ignored",
  );
}

async function convertsDataUrlsForDesktopStyleDownload(): Promise<void> {
  const base64Blob = imagePreviewDataUrlToBlob("data:text/plain;base64,aGVsbG8=");
  assertTruthy(base64Blob, "base64 data URL should convert to a Blob");
  assertEqual(base64Blob.type, "text/plain", "base64 data URL should preserve MIME type");
  assertEqual(await base64Blob.text(), "hello", "base64 data URL should decode payload");

  const plainBlob = imagePreviewDataUrlToBlob("data:text/plain,hello%20world");
  assertTruthy(plainBlob, "plain data URL should convert to a Blob");
  assertEqual(await plainBlob.text(), "hello world", "plain data URL should decode percent escapes");
  assertEqual(imagePreviewDataUrlToBlob("https://example.com/image.png"), null, "non-data URL should not convert");
}

function assertStringIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertApprox(actual: number | null, expected: number, tolerance: number, message: string): void {
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${String(actual)}`);
  }
}

function assertTruthy<T>(actual: T | null | undefined, message: string): asserts actual is T {
  if (actual == null) {
    throw new Error(message);
  }
}
