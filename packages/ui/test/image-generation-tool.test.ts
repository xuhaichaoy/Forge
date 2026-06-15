import {
  IMAGE_GENERATION_FETCH_TIMEOUT_MS,
  FORGE_IMAGE_DYNAMIC_TOOL_SPEC,
  FORGE_IMAGE_SETTINGS_STORAGE_KEY,
  FORGE_LEGACY_IMAGE_TOOL_PLAIN_NAME,
  FORGE_LEGACY_IMAGE_TOOL_NAME,
  FORGE_LEGACY_IMAGE_TOOL_NAMESPACE,
  FORGE_IMAGE_TOOL_NAME,
  claimForgeImageToolRequest,
  executeForgeImageToolCall,
  forgeImageToolOutputUrl,
  forgeImageToolPresenceFromRolloutText,
  imageGenerationsEndpoint,
  imageToolFailureText,
  imageToolThreadIdFromRequest,
  imageUrlFromResponsePayload,
  isForgeImageDynamicToolSpec,
  isForgeImageToolCall,
  loadImageGenerationSettings,
  normalizeImageGenerationSettings,
  parseImageToolArguments,
  saveImageGenerationSettings,
  shouldRegisterForgeImageDynamicTool,
  userInputLikelyRequestsImageGeneration,
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
  assertEqual(FORGE_IMAGE_DYNAMIC_TOOL_SPEC.namespace, undefined, "image tool should be a plain dynamic tool");
  assertEqual(FORGE_IMAGE_DYNAMIC_TOOL_SPEC.name, FORGE_IMAGE_TOOL_NAME, "image tool name");
  assertEqual(FORGE_IMAGE_TOOL_NAME, "image_gen", "image tool name should match the system imagegen skill's built-in tool reference");
  assertEqual(
    isForgeImageDynamicToolSpec(FORGE_IMAGE_DYNAMIC_TOOL_SPEC),
    true,
    "current image dynamic tool spec should be recognized",
  );
  assertEqual(
    isForgeImageDynamicToolSpec({ namespace: FORGE_LEGACY_IMAGE_TOOL_NAMESPACE, name: FORGE_LEGACY_IMAGE_TOOL_NAME }),
    true,
    "legacy namespaced image dynamic tool spec should be recognized for restored threads",
  );
  assertEqual(
    userInputLikelyRequestsImageGeneration([{ type: "text", text: "please generate an image of a glass city", text_elements: [] }]),
    true,
    "English image-generation prompt should be detected",
  );
  assertEqual(
    userInputLikelyRequestsImageGeneration([{ type: "text", text: "帮我生成一张海边日落图片", text_elements: [] }]),
    true,
    "Chinese image-generation prompt should be detected",
  );
  assertEqual(
    userInputLikelyRequestsImageGeneration([{ type: "text", text: "summarize the image input support code", text_elements: [] }]),
    false,
    "plain technical discussion about image support should not be treated as generation",
  );
  assertEqual(
    forgeImageToolPresenceFromRolloutText(JSON.stringify({
      timestamp: "2026-05-18T00:00:00Z",
      type: "session_meta",
      payload: {
        dynamic_tools: [FORGE_IMAGE_DYNAMIC_TOOL_SPEC],
      },
    })),
    "present",
    "rollout session_meta should expose restorable image_gen tools",
  );
  assertEqual(
    forgeImageToolPresenceFromRolloutText(JSON.stringify({
      timestamp: "2026-05-18T00:00:00Z",
      type: "session_meta",
      payload: {},
    })),
    "absent",
    "rollout session_meta without dynamic tools should be treated as an old thread",
  );
  assertEqual(
    forgeImageToolPresenceFromRolloutText("{not json"),
    "unknown",
    "unreadable rollout text should not be treated as a confirmed dynamic-tool thread",
  );
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
    storage.getItem(FORGE_IMAGE_SETTINGS_STORAGE_KEY) ?? "",
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
    shouldRegisterForgeImageDynamicTool({ baseUrl: "", apiKey: "", model: "", size: "1024x1024" }),
    false,
    "blank image settings should leave Codex native image_generation as the default path",
  );
  assertEqual(
    shouldRegisterForgeImageDynamicTool({ baseUrl: "", apiKey: "", model: "gpt-image", size: "1024x1024" }),
    false,
    "model-only image settings should not register a runtime tool without an explicit image endpoint",
  );
  assertEqual(
    shouldRegisterForgeImageDynamicTool({ baseUrl: "https://images.example.test/v1", apiKey: "", model: "", size: "1024x1024" }),
    true,
    "explicit image endpoint should register the Forge dynamic image tool",
  );
  assertEqual(
    imageGenerationsEndpoint(" https://gateway.example.test/v1/// "),
    "https://gateway.example.test/v1/images/generations",
    "image endpoint uses configured OpenAI-compatible base URL",
  );
  assertEqual(
    imageUrlFromResponsePayload({ data: [{ b64_json: "AAA" }] }),
    "data:image/png;base64,AAA",
    "b64_json without response MIME keeps the legacy png fallback used by the host proxy",
  );
  assertEqual(
    imageUrlFromResponsePayload({ data: [{ b64_json: "JPEGDATA", content_type: "image/jpeg" }] }),
    "data:image/jpeg;base64,JPEGDATA",
    "image response should use content_type for b64_json payloads",
  );
  assertEqual(
    imageUrlFromResponsePayload({ data: [{ b64_json: "data:image/webp;base64,WEBPDATA", mime_type: "image/png" }] }),
    "data:image/webp;base64,WEBPDATA",
    "image response should preserve b64 data URLs instead of rewriting them as png",
  );
  assertEqual(
    imageUrlFromResponsePayload({ data: [{ url: "https://example.test/image.png" }] }),
    "https://example.test/image.png",
    "image response supports URL payloads",
  );
  assertEqual(
    isForgeImageToolCall({
      id: "1",
      method: "item/tool/call",
      params: { tool: FORGE_IMAGE_TOOL_NAME },
    }),
    true,
    "image tool request is recognized",
  );
  assertEqual(
    isForgeImageToolCall({
      id: "1",
      method: "item/tool/call",
      params: { tool: FORGE_LEGACY_IMAGE_TOOL_PLAIN_NAME },
    }),
    true,
    "previous plain legacy-named (hicodex_generate_image) image tool requests are still recognized",
  );
  assertEqual(
    isForgeImageToolCall({
      id: "1",
      method: "item/tool/call",
      params: { namespace: FORGE_LEGACY_IMAGE_TOOL_NAMESPACE, tool: FORGE_LEGACY_IMAGE_TOOL_NAME },
    }),
    true,
    "legacy namespaced image tool request is still recognized",
  );
  assertEqual(
    isForgeImageToolCall({
      id: "1",
      method: "item/tool/call",
      params: { namespace: "image_gen", tool: "generate" },
    }),
    false,
    "reserved image_gen namespace is not treated as the Forge dynamic tool",
  );
  const seenImageToolRequests = new Set<string>();
  assertEqual(
    claimForgeImageToolRequest(seenImageToolRequests, { id: "image-request-1" }),
    true,
    "first image tool request claim should win",
  );
  assertEqual(
    claimForgeImageToolRequest(seenImageToolRequests, { id: "image-request-1" }),
    false,
    "repeated image tool request claims should be deduped across automatic and manual responders",
  );
  assertEqual(
    imageToolThreadIdFromRequest({
      id: "thread-direct",
      method: "item/tool/call",
      params: { tool: FORGE_IMAGE_TOOL_NAME, threadId: " thread-direct " },
    }),
    "thread-direct",
    "request threadId should be read directly from tool-call params",
  );
  assertEqual(
    imageToolThreadIdFromRequest({
      id: "thread-nested",
      method: "item/tool/call",
      params: { tool: FORGE_IMAGE_TOOL_NAME, context: { thread_id: "thread-nested" } },
    }),
    "thread-nested",
    "request threadId should be recovered from nested params when the top-level field is absent",
  );
  assertEqual(
    imageToolThreadIdFromRequest({
      id: "thread-missing",
      method: "item/tool/call",
      params: { tool: FORGE_IMAGE_TOOL_NAME },
    }),
    null,
    "missing request threadId should remain unscoped instead of falling back to a switched active thread",
  );
  assertEqual(
    forgeImageToolOutputUrl({
      type: "dynamicToolCall",
      tool: FORGE_IMAGE_TOOL_NAME,
      contentItems: [
        { type: "inputText", text: "Generated image for: blue sky" },
        { type: "inputImage", imageUrl: "data:image/png;base64,PNGDATA" },
      ],
    }),
    "data:image/png;base64,PNGDATA",
    "image dynamic tool thread item should expose the generated image URL",
  );
  assertEqual(
    forgeImageToolOutputUrl({
      type: "dynamicToolCall",
      namespace: FORGE_LEGACY_IMAGE_TOOL_NAMESPACE,
      tool: FORGE_LEGACY_IMAGE_TOOL_NAME,
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
  const result = await executeForgeImageToolCall(
    {
      id: "img-1",
      method: "item/tool/call",
      params: {
        tool: FORGE_IMAGE_TOOL_NAME,
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
  assertEqual(fetchCalls[0]?.init.signal instanceof AbortSignal, true, "browser image fetch should include an abort signal");

  let timeoutSignalSeen = false;
  const timedOut = await executeForgeImageToolCall(
    {
      id: "img-timeout",
      method: "item/tool/call",
      params: {
        tool: FORGE_IMAGE_TOOL_NAME,
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
      fetchTimeoutMs: 1,
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        timeoutSignalSeen = signal instanceof AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("missing abort signal"));
            return;
          }
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      }) as typeof fetch,
      preferHost: false,
      imageSettings: {
        baseUrl: "https://gateway.example.test/v1",
        apiKey: "secret",
        model: "",
        size: "1024x1024",
      },
    },
  );
  assertEqual(timeoutSignalSeen, true, "timeout fetch should receive an AbortSignal");
  assertEqual(timedOut.success, false, "timed out browser image fetch should be reported as a tool failure");
  assertIncludes(
    imageToolFailureText(timedOut),
    "timed out after 1ms",
    "timed out browser image fetch should include the timeout duration",
  );
  assertEqual(IMAGE_GENERATION_FETCH_TIMEOUT_MS, 120_000, "default image fetch timeout should remain long enough for image backends");

  const hostCalls: unknown[] = [];
  const hostResult = await executeForgeImageToolCall(
    {
      id: "img-host",
      method: "item/tool/call",
      params: {
        tool: FORGE_IMAGE_TOOL_NAME,
        threadId: "thread-from-request",
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
      codexHome: "/tmp/hicodex-home",
      preferHost: true,
      imageSettings: {
        baseUrl: "http://127.0.0.1:8890/v1",
        apiKey: "local-secret",
        model: "",
        size: "1024x1024",
      },
      hostGenerateImage: async (request) => {
        hostCalls.push(request);
        return { data: [{ url: "file:///tmp/hicodex-home/generated_images/thread-from-request/ig_generated.png" }] };
      },
      fetchImpl: (async () => {
        throw new Error("fetch should not be used in host mode");
      }) as typeof fetch,
    },
  );
  assertEqual(hostResult.success, true, "image tool execution should support host proxy transport");
  assertDeepEqual(
    hostResult.contentItems,
    [
      { type: "inputText", text: "Generated image for: blue sky" },
      { type: "inputImage", imageUrl: "file:///tmp/hicodex-home/generated_images/thread-from-request/ig_generated.png" },
    ],
    "image tool host transport should return persisted local file URLs",
  );
  assertDeepEqual(
    hostCalls,
    [{
      baseUrl: "http://127.0.0.1:8890/v1",
      apiKey: "local-secret",
      codexHome: "/tmp/hicodex-home",
      payload: {
        model: "image-model",
        prompt: "blue sky",
        n: 1,
        size: "1024x1536",
      },
      threadId: "thread-from-request",
    }],
    "image tool host transport should receive base URL, token, request thread id, and OpenAI-compatible body",
  );
  hostCalls.length = 0;
  const unscopedHostResult = await executeForgeImageToolCall(
    {
      id: "img-host-unscoped",
      method: "item/tool/call",
      params: {
        tool: FORGE_IMAGE_TOOL_NAME,
        arguments: { prompt: "blue sky" },
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
      codexHome: "/tmp/hicodex-home",
      preferHost: true,
      imageSettings: {
        baseUrl: "http://127.0.0.1:8890/v1",
        apiKey: "local-secret",
        model: "",
        size: "1024x1024",
      },
      hostGenerateImage: async (request) => {
        hostCalls.push(request);
        return { data: [{ url: "file:///tmp/hicodex-home/generated_images/unscoped/ig_generated.png" }] };
      },
      fetchImpl: (async () => {
        throw new Error("fetch should not be used in host mode");
      }) as typeof fetch,
    },
  );
  assertEqual(unscopedHostResult.success, true, "unscoped host image request should still execute");
  assertEqual(
    (hostCalls[0] as { threadId?: string | null } | undefined)?.threadId ?? null,
    null,
    "host image request without request threadId should not inherit a switched active thread",
  );

  const unconfigured = await executeForgeImageToolCall(
    {
      id: "img-unconfigured",
      method: "item/tool/call",
      params: {
        tool: FORGE_IMAGE_TOOL_NAME,
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
  assertIncludes(unconfiguredText, "No Forge image endpoint is configured", "unconfigured image tool failure should explain the missing endpoint");

  const modelOnlySettings = await executeForgeImageToolCall(
    {
      id: "img-model-only",
      method: "item/tool/call",
      params: {
        tool: FORGE_IMAGE_TOOL_NAME,
        arguments: { prompt: "blue sky" },
      },
    },
    {
      id: "local",
      name: "Local",
      protocol: "openai",
      baseUrl: "https://chat-model.example.test/v1/",
      apiKey: "chat-secret",
      model: "gpt-5.4-mini",
      temperature: 0,
      maxTokens: null,
    },
    {
      fetchImpl: (async () => {
        throw new Error("model-only image settings should not fall back to the chat model endpoint");
      }) as typeof fetch,
      preferHost: false,
      imageSettings: { baseUrl: "", apiKey: "image-secret", model: "gpt-image", size: "1024x1024" },
    },
  );
  assertEqual(modelOnlySettings.success, false, "model-only image settings should fail before calling a backend");
  assertIncludes(
    imageToolFailureText(modelOnlySettings),
    "No Forge image endpoint is configured",
    "model-only image settings should explain that an image endpoint is required",
  );

  const failed = await executeForgeImageToolCall(
    {
      id: "img-2",
      method: "item/tool/call",
      params: {
        tool: FORGE_IMAGE_TOOL_NAME,
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
