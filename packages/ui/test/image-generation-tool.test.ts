import {
  HICODEX_IMAGE_DYNAMIC_TOOL_SPEC,
  HICODEX_IMAGE_SETTINGS_STORAGE_KEY,
  HICODEX_LEGACY_IMAGE_TOOL_PLAIN_NAME,
  HICODEX_LEGACY_IMAGE_TOOL_NAME,
  HICODEX_LEGACY_IMAGE_TOOL_NAMESPACE,
  HICODEX_IMAGE_TOOL_NAME,
  executeHiCodexImageToolCall,
  hiCodexImageToolOutputUrl,
  imageGenerationsEndpoint,
  imageUrlFromResponsePayload,
  isHiCodexImageToolCall,
  loadImageGenerationSettings,
  normalizeImageGenerationSettings,
  parseImageToolArguments,
  saveImageGenerationSettings,
  shouldRegisterHiCodexImageDynamicTool,
} from "../src/state/image-generation-tool";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortValue(nested)]),
  );
}

function assertIncludes(value: string, expected: string, message: string): void {
  if (!value.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}

export default async function runImageGenerationToolTests(): Promise<void> {
  assertEqual(HICODEX_IMAGE_DYNAMIC_TOOL_SPEC.namespace, undefined, "image tool should be a plain dynamic tool");
  assertEqual(HICODEX_IMAGE_DYNAMIC_TOOL_SPEC.name, HICODEX_IMAGE_TOOL_NAME, "image tool name");
  assertEqual(HICODEX_IMAGE_TOOL_NAME, "image_gen", "image tool name should match the system imagegen skill's built-in tool reference");
  assertDeepEqual(
    parseImageToolArguments({ prompt: " blue sky ", model: "", size: "1536x1024" }),
    { prompt: "blue sky", model: "", size: "1536x1024" },
    "image tool arguments normalize prompt, optional model, and size",
  );
  assertDeepEqual(
    parseImageToolArguments({ prompt: "blue sky", model: "image-model", size: "2048x2048" }),
    { prompt: "blue sky", model: "image-model", size: "1024x1024" },
    "image tool arguments fall back for unsupported size",
  );
  assertDeepEqual(
    parseImageToolArguments({ prompt: "blue sky" }),
    { prompt: "blue sky", model: "", size: "" },
    "image tool arguments leave size blank when the model did not request one",
  );
  assertDeepEqual(
    normalizeImageGenerationSettings({
      baseUrl: " https://images.example.test/v1/// ",
      apiKey: " image-secret ",
      model: " gpt-image ",
      size: "1536x1024",
    }),
    {
      baseUrl: "https://images.example.test/v1",
      apiKey: " image-secret ",
      model: "gpt-image",
      size: "1536x1024",
    },
    "image generation settings preserve the user endpoint and normalize model/size",
  );
  const storage = new MemoryStorage();
  assertDeepEqual(
    loadImageGenerationSettings(storage),
    { baseUrl: "", apiKey: "", model: "", size: "1024x1024" },
    "missing image generation settings fall back to reuse-model defaults",
  );
  saveImageGenerationSettings(storage, {
    baseUrl: " https://images.example.test/v1 ",
    apiKey: "image-secret",
    model: " gpt-image ",
    size: "auto",
  });
  assertIncludes(
    storage.getItem(HICODEX_IMAGE_SETTINGS_STORAGE_KEY) ?? "",
    "\"model\":\"gpt-image\"",
    "image settings should persist normalized model",
  );
  assertDeepEqual(
    loadImageGenerationSettings(storage),
    {
      baseUrl: "https://images.example.test/v1",
      apiKey: "image-secret",
      model: "gpt-image",
      size: "auto",
    },
    "saved image generation settings should reload from local storage",
  );
  assertEqual(
    shouldRegisterHiCodexImageDynamicTool({ baseUrl: "", apiKey: "", model: "", size: "1024x1024" }),
    false,
    "blank image settings should leave Codex native image_generation as the default path",
  );
  assertEqual(
    shouldRegisterHiCodexImageDynamicTool({ baseUrl: "", apiKey: "", model: "gpt-image", size: "1024x1024" }),
    true,
    "explicit image settings should register the HiCodex dynamic image tool",
  );
  assertEqual(
    imageGenerationsEndpoint(" https://gateway.example.test/v1/// "),
    "https://gateway.example.test/v1/images/generations",
    "image endpoint uses configured OpenAI-compatible base URL",
  );
  assertEqual(
    imageUrlFromResponsePayload({ data: [{ b64_json: "AAA" }] }),
    "data:image/png;base64,AAA",
    "image response supports b64_json payloads",
  );
  assertEqual(
    imageUrlFromResponsePayload({ data: [{ url: "https://example.test/image.png" }] }),
    "https://example.test/image.png",
    "image response supports URL payloads",
  );
  assertEqual(
    isHiCodexImageToolCall({
      id: "1",
      method: "item/tool/call",
      params: { tool: HICODEX_IMAGE_TOOL_NAME },
    }),
    true,
    "image tool request is recognized",
  );
  assertEqual(
    isHiCodexImageToolCall({
      id: "1",
      method: "item/tool/call",
      params: { tool: HICODEX_LEGACY_IMAGE_TOOL_PLAIN_NAME },
    }),
    true,
    "previous plain HiCodex image tool requests are still recognized",
  );
  assertEqual(
    isHiCodexImageToolCall({
      id: "1",
      method: "item/tool/call",
      params: { namespace: HICODEX_LEGACY_IMAGE_TOOL_NAMESPACE, tool: HICODEX_LEGACY_IMAGE_TOOL_NAME },
    }),
    true,
    "legacy namespaced image tool request is still recognized",
  );
  assertEqual(
    isHiCodexImageToolCall({
      id: "1",
      method: "item/tool/call",
      params: { namespace: "image_gen", tool: "generate" },
    }),
    false,
    "reserved image_gen namespace is not treated as the HiCodex dynamic tool",
  );
  assertEqual(
    hiCodexImageToolOutputUrl({
      type: "dynamicToolCall",
      tool: HICODEX_IMAGE_TOOL_NAME,
      contentItems: [
        { type: "inputText", text: "Generated image for: blue sky" },
        { type: "inputImage", imageUrl: "data:image/png;base64,PNGDATA" },
      ],
    }),
    "data:image/png;base64,PNGDATA",
    "image dynamic tool thread item should expose the generated image URL",
  );
  assertEqual(
    hiCodexImageToolOutputUrl({
      type: "dynamicToolCall",
      namespace: HICODEX_LEGACY_IMAGE_TOOL_NAMESPACE,
      tool: HICODEX_LEGACY_IMAGE_TOOL_NAME,
      contentItems: [
        { type: "inputText", text: "Generated image for: blue sky" },
        { type: "inputImage", imageUrl: "https://example.test/legacy.png" },
      ],
    }),
    "https://example.test/legacy.png",
    "legacy image dynamic tool thread item should still expose the generated image URL",
  );

  const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init: init ?? {} });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: "PNGDATA" }] }),
      text: async () => "",
    } as Response;
  }) as typeof fetch;
  const result = await executeHiCodexImageToolCall(
    {
      id: "img-1",
      method: "item/tool/call",
      params: {
        tool: HICODEX_IMAGE_TOOL_NAME,
        arguments: { prompt: "blue sky", size: "auto" },
      },
    },
    {
      id: "local",
      name: "Local",
      protocol: "openai",
      baseUrl: "https://gateway.example.test/v1/",
      apiKey: "secret",
      model: "gpt-5.4-mini",
      temperature: 0,
      maxTokens: null,
    },
    {
      fetchImpl,
      preferHost: false,
      imageSettings: {
        baseUrl: "https://gateway.example.test/v1",
        apiKey: "secret",
        model: "",
        size: "1024x1024",
      },
    },
  );
  assertEqual(result.success, true, "image tool execution should succeed with b64_json response");
  assertDeepEqual(
    result.contentItems,
    [
      { type: "inputText", text: "Generated image for: blue sky" },
      { type: "inputImage", imageUrl: "data:image/png;base64,PNGDATA" },
    ],
    "image tool execution should return text plus image content items",
  );
  assertEqual(fetchCalls[0]?.url, "https://gateway.example.test/v1/images/generations", "image tool should call images endpoint");
  assertEqual(fetchCalls[0]?.init.method, "POST", "image tool should POST to the backend");
  const headers = fetchCalls[0]?.init.headers as Record<string, string>;
  assertEqual(headers.Authorization, "Bearer secret", "image tool should pass configured bearer token");
  assertDeepEqual(
    JSON.parse(String(fetchCalls[0]?.init.body)),
    {
      prompt: "blue sky",
      n: 1,
      size: "auto",
    },
    "image tool should omit the model and let the configured backend choose its default when no model is requested",
  );

  const hostCalls: unknown[] = [];
  const hostResult = await executeHiCodexImageToolCall(
    {
      id: "img-host",
      method: "item/tool/call",
      params: {
        tool: HICODEX_IMAGE_TOOL_NAME,
        arguments: { prompt: "blue sky", model: "image-model", size: "1024x1536" },
      },
    },
    {
      id: "local",
      name: "Local",
      protocol: "openai",
      baseUrl: "http://127.0.0.1:8890/v1",
      apiKey: "local-secret",
      model: "gpt-5.4-mini",
      temperature: 0,
      maxTokens: null,
    },
    {
      preferHost: true,
      imageSettings: {
        baseUrl: "http://127.0.0.1:8890/v1",
        apiKey: "local-secret",
        model: "",
        size: "1024x1024",
      },
      hostGenerateImage: async (request) => {
        hostCalls.push(request);
        return { data: [{ url: "http://127.0.0.1:8890/generated.png" }] };
      },
      fetchImpl: (async () => {
        throw new Error("fetch should not be used in host mode");
      }) as typeof fetch,
    },
  );
  assertEqual(hostResult.success, true, "image tool execution should support host proxy transport");
  assertDeepEqual(
    hostCalls,
    [{
      baseUrl: "http://127.0.0.1:8890/v1",
      apiKey: "local-secret",
      payload: {
        model: "image-model",
        prompt: "blue sky",
        n: 1,
        size: "1024x1536",
      },
    }],
    "image tool host transport should receive base URL, token, and OpenAI-compatible body",
  );

  const unconfigured = await executeHiCodexImageToolCall(
    {
      id: "img-unconfigured",
      method: "item/tool/call",
      params: {
        tool: HICODEX_IMAGE_TOOL_NAME,
        arguments: { prompt: "blue sky" },
      },
    },
    {
      id: "local",
      name: "Local",
      protocol: "openai",
      baseUrl: "https://gateway.example.test/v1/",
      apiKey: "secret",
      model: "gpt-5.4-mini",
      temperature: 0,
      maxTokens: null,
    },
    {
      fetchImpl: (async () => {
        throw new Error("unconfigured image tool should not call the model endpoint");
      }) as typeof fetch,
      preferHost: false,
      imageSettings: { baseUrl: "", apiKey: "", model: "", size: "1024x1024" },
    },
  );
  assertEqual(unconfigured.success, false, "unconfigured image tool should fail before calling the backend");
  const unconfiguredText = unconfigured.contentItems[0]?.type === "inputText" ? unconfigured.contentItems[0].text : "";
  assertIncludes(unconfiguredText, "No HiCodex image endpoint is configured", "unconfigured image tool failure should explain the missing endpoint");

  const failed = await executeHiCodexImageToolCall(
    {
      id: "img-2",
      method: "item/tool/call",
      params: {
        tool: HICODEX_IMAGE_TOOL_NAME,
        arguments: { prompt: "blue sky" },
      },
    },
    {
      id: "local",
      name: "Local",
      protocol: "openai",
      baseUrl: "https://gateway.example.test/v1/",
      apiKey: "",
      model: "gpt-5.4-mini",
      temperature: 0,
      maxTokens: null,
    },
    {
      fetchImpl: (async () => ({
        ok: false,
        status: 502,
        json: async () => ({}),
        text: async () => "bad gateway",
      } as Response)) as typeof fetch,
      preferHost: false,
      imageSettings: {
        baseUrl: "https://gateway.example.test/v1",
        apiKey: "",
        model: "",
        size: "1024x1024",
      },
    },
  );
  assertEqual(failed.success, false, "image tool execution should report backend failures");
  const failedText = failed.contentItems[0]?.type === "inputText" ? failed.contentItems[0].text : "";
  assertIncludes(failedText, "502: bad gateway", "image tool failure should include backend status and body");
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
