import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  GeneratedImagePreviewTab,
  type GeneratedImagePreviewItem,
} from "../src/components/generated-image-preview-tab";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runGeneratedImagePreviewTabDomTests(): Promise<void> {
  await preservesActiveImageWhenImagesArrayReferenceChanges();
}

async function preservesActiveImageWhenImagesArrayReferenceChanges(): Promise<void> {
  const mounted = await mountGeneratedImagePreview(imageItems());
  try {
    await clickThumbnail(mounted.env, "Generated image 2");
    assertIncludes(
      activeImage(mounted.env).src,
      "/two.png",
      "clicking the second generated image should make it active",
    );

    await mounted.render(imageItems());
    assertIncludes(
      activeImage(mounted.env).src,
      "/two.png",
      "rebuilding the images array should preserve the current generated image",
    );
  } finally {
    mounted.cleanup();
  }
}

async function mountGeneratedImagePreview(
  images: GeneratedImagePreviewItem[],
): Promise<MountedGeneratedImagePreview> {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root: Root = createRoot(container);
  const render = async (nextImages: GeneratedImagePreviewItem[]) => {
    await act(async () => {
      root.render(createElement(
        ForgeIntlProvider,
        {
          locale: "en-US",
          children: createElement(GeneratedImagePreviewTab, { images: nextImages }),
        },
      ));
      await Promise.resolve();
    });
  };
  await render(images);
  return {
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
      env.teardown();
    },
    env,
    render,
    root,
  };
}

async function clickThumbnail(env: DomTestEnv, label: string): Promise<void> {
  const button = env.document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`generated image thumbnail ${label} should render`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

function activeImage(env: DomTestEnv): HTMLImageElement {
  const image = env.document.querySelector<HTMLImageElement>(".hc-generated-image-preview-image");
  if (!image) throw new Error("generated image preview should render an active image");
  return image;
}

function imageItems(): GeneratedImagePreviewItem[] {
  return [
    {
      id: "image-1",
      src: "https://example.com/output/one.png",
      alt: "Generated image 1",
      title: "Generated image 1",
    },
    {
      id: "image-2",
      src: "https://example.com/output/two.png",
      alt: "Generated image 2",
      title: "Generated image 2",
    },
  ];
}

function assertIncludes(value: string, needle: string, message: string): void {
  if (!value.includes(needle)) {
    throw new Error(`${message}: expected ${JSON.stringify(value)} to include ${JSON.stringify(needle)}`);
  }
}

interface MountedGeneratedImagePreview {
  cleanup: () => void;
  env: DomTestEnv;
  render: (images: GeneratedImagePreviewItem[]) => Promise<void>;
  root: Root;
}
