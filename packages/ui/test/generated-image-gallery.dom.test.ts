import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  GeneratedImageGallery,
  type OpenGeneratedImageGalleryPreview,
} from "../src/components/generated-image-gallery";
import type { ThreadItem } from "../src/state/render-groups";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runGeneratedImageGalleryDomTests(): Promise<void> {
  await opensSidePanelCallbackBeforeLightbox();
  await fallsBackToLightboxWhenSidePanelCallbackDeclines();
}

async function opensSidePanelCallbackBeforeLightbox(): Promise<void> {
  const calls: Array<{ image: ThreadItem; images: readonly ThreadItem[]; index: number }> = [];
  const images = generatedImageItems();
  const mounted = await mountGallery({
    images,
    onOpenGeneratedImagePreview: (image, allImages, index) => {
      calls.push({ image, images: allImages, index });
      return true;
    },
  });
  try {
    await clickFirstThumbnail(mounted.env);

    assertEqual(calls.length, 1, "thumbnail click should call the side-panel opener once");
    assertEqual(calls[0]?.image.id, "image-1", "opener should receive the clicked image item");
    assertEqual(calls[0]?.images, images, "opener should receive the gallery image collection");
    assertEqual(calls[0]?.index, 0, "opener should receive the clicked image index");
    assertEqual(
      mounted.env.document.querySelector(".hc-preview-lightbox-dialog") === null,
      true,
      "successful side-panel open should suppress the lightbox fallback",
    );
  } finally {
    mounted.cleanup();
  }
}

async function fallsBackToLightboxWhenSidePanelCallbackDeclines(): Promise<void> {
  const mounted = await mountGallery({
    images: generatedImageItems(),
    onOpenGeneratedImagePreview: () => false,
  });
  try {
    await clickFirstThumbnail(mounted.env);

    assertEqual(
      mounted.env.document.querySelector(".hc-preview-lightbox-dialog") !== null,
      true,
      "declined side-panel open should fall back to the existing lightbox",
    );
  } finally {
    mounted.cleanup();
  }
}

async function mountGallery({
  images,
  onOpenGeneratedImagePreview,
}: {
  images: ThreadItem[];
  onOpenGeneratedImagePreview: OpenGeneratedImageGalleryPreview;
}): Promise<{ env: DomTestEnv; cleanup: () => void }> {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(createElement(GeneratedImageGallery, {
      images,
      hasPending: false,
      onOpenGeneratedImagePreview,
    }));
  });
  return {
    env,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
      env.teardown();
    },
  };
}

async function clickFirstThumbnail(env: DomTestEnv): Promise<void> {
  const button = env.document.querySelector<HTMLButtonElement>('button[aria-label="Generated image 1"]');
  if (!button) throw new Error("generated image thumbnail button should render");
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

function generatedImageItems(): ThreadItem[] {
  return [
    {
      id: "image-1",
      type: "generated-image",
      src: "data:image/png;base64,aW1hZ2Ux",
      status: "completed",
    },
    {
      id: "image-2",
      type: "generated-image",
      src: "data:image/png;base64,aW1hZ2Uy",
      status: "completed",
    },
  ];
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
