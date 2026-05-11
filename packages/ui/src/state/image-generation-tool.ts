import type { JsonRpcRequest, JsonValue, ModelConfig } from "@hicodex/codex-protocol";
import { formatError, formatUnknown, stringField } from "../lib/format";
import { generateImageWithHost, isTauriRuntime } from "../lib/tauri-host";
import { DEFAULT_MODEL_BASE_URL, normalizeBaseUrl } from "../model/model-settings";

export const HICODEX_IMAGE_TOOL_NAME = "image_gen";
export const HICODEX_LEGACY_IMAGE_TOOL_PLAIN_NAME = "hicodex_generate_image";
export const HICODEX_LEGACY_IMAGE_TOOL_NAMESPACE = "hicodex_image";
export const HICODEX_LEGACY_IMAGE_TOOL_NAME = "generate";
export const HICODEX_IMAGE_SETTINGS_STORAGE_KEY = "hicodex:image-generation-settings";
export const IMAGE_GENERATION_SIZE_OPTIONS = ["1024x1024", "1024x1536", "1536x1024", "auto"] as const;
export type ImageGenerationSize = (typeof IMAGE_GENERATION_SIZE_OPTIONS)[number];

export interface ImageGenerationSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: ImageGenerationSize;
}

export interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EMPTY_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  baseUrl: "",
  apiKey: "",
  model: "",
  size: "1024x1024",
};

export interface DynamicToolSpecLike {
  namespace?: string;
  name: string;
  description: string;
  inputSchema: JsonValue;
  deferLoading?: boolean;
}

export interface DynamicToolCallResponseLike {
  contentItems: Array<
    | { type: "inputText"; text: string }
    | { type: "inputImage"; imageUrl: string }
  >;
  success: boolean;
}

export interface ImageGenerationHostRequest {
  baseUrl: string;
  apiKey?: string | null;
  payload: JsonValue;
}

export interface ImageGenerationExecuteOptions {
  fetchImpl?: typeof fetch;
  hostGenerateImage?: (request: ImageGenerationHostRequest) => Promise<unknown>;
  imageSettings?: ImageGenerationSettings | null;
  preferHost?: boolean;
}

export const HICODEX_IMAGE_DYNAMIC_TOOL_SPEC: DynamicToolSpecLike = {
  name: HICODEX_IMAGE_TOOL_NAME,
  description:
    "Generate a raster image from a prompt using the HiCodex-configured image generation backend. Use this immediately when the user asks to create an image, picture, illustration, wallpaper, or bitmap asset. Return the generated image content to the user instead of describing possible styles.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: {
        type: "string",
        description: "Detailed image prompt to generate.",
      },
      model: {
        type: "string",
        description: "Optional image model. Omit it to let the configured backend choose its default image model.",
      },
      size: {
        type: "string",
        description: "Optional image size.",
        enum: ["1024x1024", "1024x1536", "1536x1024", "auto"],
      },
    },
    required: ["prompt"],
  },
};

export function isHiCodexImageToolCall(request: JsonRpcRequest): boolean {
  if (request.method !== "item/tool/call") return false;
  const params = request.params as Record<string, unknown> | undefined;
  return isCurrentHiCodexImageTool(stringField(params, "namespace"), stringField(params, "tool"))
    || isLegacyHiCodexImageTool(stringField(params, "namespace"), stringField(params, "tool"));
}

export function hiCodexImageToolOutputUrl(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  if (record.type !== "dynamicToolCall") return "";
  if (
    !isCurrentHiCodexImageTool(stringField(record, "namespace"), stringField(record, "tool"))
    && !isLegacyHiCodexImageTool(stringField(record, "namespace"), stringField(record, "tool"))
  ) return "";
  const contentItems = Array.isArray(record.contentItems) ? record.contentItems : [];
  for (const item of contentItems) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const itemRecord = item as Record<string, unknown>;
    if (itemRecord.type !== "inputImage") continue;
    const imageUrl = stringField(itemRecord, "imageUrl").trim();
    if (imageUrl) return imageUrl;
  }
  return "";
}

export function imageGenerationsEndpoint(baseUrl: string | null | undefined): string {
  return `${normalizeBaseUrl(baseUrl?.trim() || DEFAULT_MODEL_BASE_URL)}/images/generations`;
}

export function parseImageToolArguments(value: unknown): { prompt: string; model: string; size: string } {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const prompt = stringField(record, "prompt").trim();
  const model = stringField(record, "model").trim();
  const rawSize = stringField(record, "size").trim();
  const size = rawSize ? normalizedImageSize(rawSize) : "";
  return { prompt, model, size };
}

export async function executeHiCodexImageToolCall(
  request: JsonRpcRequest,
  model: ModelConfig,
  optionsOrFetch: typeof fetch | ImageGenerationExecuteOptions = fetch,
): Promise<DynamicToolCallResponseLike> {
  const params = request.params as Record<string, unknown> | undefined;
  const parsed = parseImageToolArguments(params?.arguments);
  if (!parsed.prompt) {
    return imageToolFailure("Image generation requires a non-empty prompt.");
  }
  const options = normalizeExecuteOptions(optionsOrFetch);
  const imageSettings = normalizeImageGenerationSettings(options.imageSettings);
  if (!shouldRegisterHiCodexImageDynamicTool(imageSettings)) {
    return imageToolFailure("No HiCodex image endpoint is configured. Configure Images settings, or use Codex native image_generation with a supported Codex account and model.");
  }
  const backendBaseUrl = imageSettings.baseUrl || model.baseUrl;
  const backendApiKey = imageSettings.apiKey || model.apiKey;
  const imageModel = parsed.model || imageSettings.model;
  const payload: JsonValue = {
    prompt: parsed.prompt,
    n: 1,
    size: parsed.size || imageSettings.size,
  };
  if (imageModel) {
    (payload as Record<string, JsonValue | undefined>).model = imageModel;
  }

  try {
    const payloadResult = options.preferHost
      ? await options.hostGenerateImage({
          baseUrl: backendBaseUrl,
          apiKey: backendApiKey,
          payload,
        })
      : await executeImageGenerationFetch({ baseUrl: backendBaseUrl, apiKey: backendApiKey }, payload, options.fetchImpl);
    const imageUrl = imageUrlFromResponsePayload(payloadResult);
    if (!imageUrl) {
      return imageToolFailure(`Image generation backend returned no image: ${formatUnknown(payloadResult)}`);
    }
    return {
      success: true,
      contentItems: [
        { type: "inputText", text: `Generated image for: ${parsed.prompt}` },
        { type: "inputImage", imageUrl },
      ],
    };
  } catch (error) {
    return imageToolFailure(`Image generation request failed: ${formatError(error)}`);
  }
}

async function executeImageGenerationFetch(
  model: Pick<ModelConfig, "baseUrl" | "apiKey">,
  payload: JsonValue,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchImpl(imageGenerationsEndpoint(model.baseUrl), {
    method: "POST",
    headers: imageGenerationHeaders(model.apiKey),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await safeResponseText(response);
    throw new Error(`Image generation backend returned ${response.status}${body ? `: ${body}` : ""}`);
  }
  return response.json() as Promise<unknown>;
}

export function normalizeImageGenerationSettings(value: unknown): ImageGenerationSettings {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const baseUrl = stringField(record, "baseUrl").trim();
  return {
    baseUrl: baseUrl ? normalizeBaseUrl(baseUrl) : "",
    apiKey: stringField(record, "apiKey"),
    model: stringField(record, "model").trim(),
    size: normalizedImageSize(stringField(record, "size")),
  };
}

export function loadImageGenerationSettings(storage: BrowserStorageLike | null | undefined): ImageGenerationSettings {
  if (!storage) return EMPTY_IMAGE_GENERATION_SETTINGS;
  try {
    return normalizeImageGenerationSettings(JSON.parse(storage.getItem(HICODEX_IMAGE_SETTINGS_STORAGE_KEY) || "null"));
  } catch {
    return EMPTY_IMAGE_GENERATION_SETTINGS;
  }
}

export function saveImageGenerationSettings(
  storage: BrowserStorageLike | null | undefined,
  settings: ImageGenerationSettings,
): ImageGenerationSettings {
  const normalized = normalizeImageGenerationSettings(settings);
  if (storage) {
    storage.setItem(HICODEX_IMAGE_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function shouldRegisterHiCodexImageDynamicTool(settings: ImageGenerationSettings): boolean {
  const normalized = normalizeImageGenerationSettings(settings);
  return Boolean(normalized.baseUrl || normalized.apiKey.trim() || normalized.model);
}

export function imageUrlFromResponsePayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = (payload as { data?: unknown }).data;
  const first = Array.isArray(data) ? data[0] : null;
  if (!first || typeof first !== "object") return "";
  const record = first as Record<string, unknown>;
  const directUrl = stringField(record, "url").trim();
  if (directUrl) return directUrl;
  const b64 = stringField(record, "b64_json").trim() || stringField(record, "b64Json").trim();
  return b64 ? `data:image/png;base64,${b64}` : "";
}

function imageToolFailure(text: string): DynamicToolCallResponseLike {
  return {
    success: false,
    contentItems: [{ type: "inputText", text }],
  };
}

function imageGenerationHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = apiKey.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function normalizeExecuteOptions(optionsOrFetch: typeof fetch | ImageGenerationExecuteOptions): Required<ImageGenerationExecuteOptions> {
  if (typeof optionsOrFetch === "function") {
    return {
      fetchImpl: optionsOrFetch,
      hostGenerateImage: generateImageWithHost,
      imageSettings: EMPTY_IMAGE_GENERATION_SETTINGS,
      preferHost: isTauriRuntime(),
    };
  }
  return {
    fetchImpl: optionsOrFetch.fetchImpl ?? fetch,
    hostGenerateImage: optionsOrFetch.hostGenerateImage ?? generateImageWithHost,
    imageSettings: optionsOrFetch.imageSettings ?? EMPTY_IMAGE_GENERATION_SETTINGS,
    preferHost: optionsOrFetch.preferHost ?? isTauriRuntime(),
  };
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}

function normalizedImageSize(value: string): ImageGenerationSize {
  const normalized = value.trim();
  return IMAGE_GENERATION_SIZE_OPTIONS.includes(normalized as ImageGenerationSize)
    ? normalized as ImageGenerationSize
    : "1024x1024";
}

function isCurrentHiCodexImageTool(namespace: string, tool: string): boolean {
  return namespace.trim() === "" && tool === HICODEX_IMAGE_TOOL_NAME;
}

function isLegacyHiCodexImageTool(namespace: string, tool: string): boolean {
  if (namespace.trim() === "" && tool === HICODEX_LEGACY_IMAGE_TOOL_PLAIN_NAME) return true;
  return namespace === HICODEX_LEGACY_IMAGE_TOOL_NAMESPACE && tool === HICODEX_LEGACY_IMAGE_TOOL_NAME;
}
