import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import type { ServicesContextValue } from "../state/services-context-types";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";

/*
 * Runtime half of the services context. The value shape (ServicesContextValue)
 * lives in state/services-context-types.ts so it stays test-graph-safe; this
 * .tsx owns the React-runtime pieces, exactly as components/i18n-provider.tsx
 * pairs with state/i18n.ts.
 *
 * Default is null with a throwing hook: there is no sensible "no client"
 * fallback, so consuming outside a provider is a programming error we surface
 * loudly rather than papering over.
 */
const ServicesContext = createContext<ServicesContextValue | null>(null);

export function ServicesProvider({
  children,
  client,
  dispatch,
  connected,
  // `connecting` is accepted but intentionally not placed on the context value:
  // it has zero `useServices()` consumers, so the reducer's `state.connecting`
  // (read directly in HiCodexApp) is the single live source. The prop itself is
  // kept only so the existing `<ServicesProvider connecting={...}>` call site
  // still type-checks; dropping the prop requires a paired edit at that call
  // site (in HiCodexApp, outside this file) and is left for that change.
  connecting: _connecting,
}: {
  children: ReactNode;
  client: CodexJsonRpcClient;
  dispatch: ThreadWorkflowDispatch;
  connected: boolean;
  connecting: boolean;
}) {
  const value = useMemo<ServicesContextValue>(
    () => ({ client, dispatch, connected }),
    [client, dispatch, connected],
  );
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): ServicesContextValue {
  const value = useContext(ServicesContext);
  if (value === null) {
    throw new Error("useServices must be used within a ServicesProvider");
  }
  return value;
}
