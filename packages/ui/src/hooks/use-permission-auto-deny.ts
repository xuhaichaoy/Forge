import { useEffect } from "react";
import type { MutableRefObject } from "react";

import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import { buildStopPendingRequestResult, isAutoDeniablePermissionRequest } from "../state/approval-requests";
import type { PendingServerRequest } from "../state/codex-reducer";

/*
 * Auto-decline permission requests that resolve to nothing grantable (no
 * `network` and no `fileSystem`). Codex's pending-request-item-panel renders no
 * panel for these and fires a useEffect that replies
 * `{ permissions: {}, scope: "turn" }` (emitting `codex_permission_request_auto_denied`)
 * to immediately unblock the turn. Forge previously left a stuck,
 * non-acceptable panel that the user had to Cancel by hand.
 *
 * Mirrors the image-tool auto-responder: claim each request once via the shared
 * ref (so it is replied to exactly once), send the decline, then resolve the
 * server request. `dispatch` is the stable useReducer dispatch; listing it in
 * the deps never retriggers the effect.
 */
export function usePermissionAutoDeny({
  handledRequestIdsRef,
  pendingRequests,
}: {
  handledRequestIdsRef: MutableRefObject<Set<string>>;
  pendingRequests: PendingServerRequest[];
}): void {
  const { client, dispatch } = useServices();
  useEffect(() => {
    for (const request of pendingRequests) {
      if (!isAutoDeniablePermissionRequest(request)) continue;
      const key = String(request.id);
      if (handledRequestIdsRef.current.has(key)) continue;
      handledRequestIdsRef.current.add(key);
      const result = buildStopPendingRequestResult(request);
      void (async () => {
        try {
          await client.respond(request.id, result);
        } catch (error) {
          dispatch({ type: "log", text: `Permission auto-deny response failed: ${formatError(error)}`, level: "error" });
        }
      })()
        .finally(() => {
          dispatch({ type: "resolveServerRequest", id: request.id });
        });
    }
  }, [client, dispatch, handledRequestIdsRef, pendingRequests]);
}
