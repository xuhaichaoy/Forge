import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { ModelConfig } from "@forge/codex-protocol";

import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import { normalizeModelConfig } from "../model/model-settings";
import type { PendingServerRequest } from "../state/codex-reducer";
import {
  claimForgeImageToolRequest,
  executeForgeImageToolCall,
  imageToolFailureText,
  isForgeImageToolCall,
  type DynamicToolCallResponseLike,
  type ImageGenerationExecuteOptions,
} from "../state/image-generation-tool";

/*
 * Auto-responder for Forge image-generation tool calls, lifted verbatim out of
 * ForgeApp. Scans pending requests, claims each unhandled image tool call via
 * the shared `handledImageToolRequestIdsRef` (still owned by the component so
 * respondToRequest can also claim against it), runs the generation, responds, and
 * resolves the server request. Toast wording, the failure contentItems shape, and
 * the dep array are contract-exact; `dispatch` (stable) is kept out of the deps.
 */
export function useForgeImageToolResponder({
  handledImageToolRequestIdsRef,
  pendingRequests,
  modelDraft,
  codexHome,
  imageGenerationSettings,
}: {
  handledImageToolRequestIdsRef: MutableRefObject<Set<string>>;
  pendingRequests: PendingServerRequest[];
  modelDraft: ModelConfig;
  codexHome: string | undefined;
  imageGenerationSettings: ImageGenerationExecuteOptions["imageSettings"];
}): void {
  const { client, dispatch } = useServices();
  useEffect(() => {
    for (const request of pendingRequests) {
      if (!isForgeImageToolCall(request)) continue;
      if (!claimForgeImageToolRequest(handledImageToolRequestIdsRef.current, request)) continue;
      void (async () => {
        let result: DynamicToolCallResponseLike;
        try {
          result = await executeForgeImageToolCall(request, normalizeModelConfig(modelDraft), {
            codexHome,
            imageSettings: imageGenerationSettings,
          });
        } catch (error) {
          result = {
            success: false,
            contentItems: [{ type: "inputText" as const, text: `Image generation request failed: ${formatError(error)}` }],
          };
        }
        const failureText = imageToolFailureText(result);
        if (failureText) dispatch({ type: "log", text: failureText, level: "error" });
        try {
          await client.respond(request.id, result);
        } catch (error) {
          dispatch({ type: "log", text: `Image generation response failed: ${formatError(error)}`, level: "error" });
        }
      })()
        .finally(() => {
          dispatch({ type: "resolveServerRequest", id: request.id });
        });
    }
  }, [client, dispatch, handledImageToolRequestIdsRef, imageGenerationSettings, modelDraft, codexHome, pendingRequests]);
}
