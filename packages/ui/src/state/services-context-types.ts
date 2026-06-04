import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import type { ThreadWorkflowDispatch } from "./thread-workflow";

/**
 * Shared service singletons that the root HiCodexApp owns — the JSON-RPC
 * `client`, the reducer `dispatch`, and the `connected` flag — and that nearly
 * every feature subtree needs. Today these are drilled through the
 * tree as props (client ~94 refs, dispatch ~80, ensureConnected ~40); the
 * services context provides them once so container/feature components can read
 * them via `useServices()` instead.
 *
 * This file is intentionally type-only so it stays inside the
 * tsconfig.test.json compile graph (`src/state/**`) without pulling the React
 * runtime in. The runtime half — `createContext`, `ServicesProvider`,
 * `useServices` — lives in `components/services-context.tsx`, mirroring how
 * `state/i18n.ts` pairs with `components/i18n-provider.tsx`.
 */
export interface ServicesContextValue {
  client: CodexJsonRpcClient;
  dispatch: ThreadWorkflowDispatch;
  connected: boolean;
}
