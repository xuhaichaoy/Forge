import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelConfig } from "@hicodex/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import type { ModelPickerProvider } from "../model/model-picker-selection";
import {
  buildLocalModelCatalogConfig,
  decodeSelection,
  encodeSelection,
  migrateSubscriptionModelSelection,
  type LocalModelCatalogConfigPayload,
} from "../model/model-settings";
import {
  catalogConfigWithExtraModels,
  provisionTeamModelGatewayProvider,
  type CodexUiDispatch,
} from "../model/model-workflow";
import {
  isTeamModelGatewayUnavailable,
  loadTeamModelGatewayProvider,
  reconcileTeamModelSlug,
  teamModelGatewayProvisionSignature,
  TEAM_MODEL_GATEWAY_PROVIDER_ID,
  type TeamModelGatewayProviderSnapshot,
} from "../model/team-model-gateway";
import type { ThreadContextDefaults } from "../state/codex-reducer";

export interface UseTeamModelGatewayOptions {
  client: CodexJsonRpcClient;
  dispatch: CodexUiDispatch;
  connect: () => Promise<boolean>;
  connected: boolean;
  codexHome?: string | null;
  threadContextDefaults: ThreadContextDefaults | null;
  /*
   * The personal provider config — its models share the (full-overwrite)
   * models.json catalog with the team models, so provisioning writes the
   * union of both.
   */
  personalModelDraft: ModelConfig;
  personalProviderConfigured: boolean;
  selectedModelKey: string | null;
  setSelectedModelKey: (key: string | null) => void;
  refreshKey?: unknown;
}

export interface UseTeamModelGatewayResult {
  provider: ModelPickerProvider | null;
  handleModelSelect: (key: string | null) => void;
}

/*
 * Team model gateway integration.
 *
 * Definition vs selection are deliberately separated:
 *   - The provider DEFINITION (`[model_providers.team_model_gateway]` +
 *     catalog entries) is provisioned by an effect whenever the gateway
 *     snapshot changes (sign-in, token rotation, model list change). Only a
 *     credential change of an existing definition restarts the runtime.
 *   - Model SELECTION is plain UI state; it reaches Codex per-thread via
 *     ThreadStart/ThreadResume modelProvider overrides and never rewrites
 *     the global `model` / `model_provider` config keys.
 */
export function useTeamModelGateway({
  client,
  dispatch,
  connect,
  connected,
  codexHome,
  threadContextDefaults,
  personalModelDraft,
  personalProviderConfigured,
  selectedModelKey,
  setSelectedModelKey,
  refreshKey,
}: UseTeamModelGatewayOptions): UseTeamModelGatewayResult {
  const [snapshot, setSnapshot] = useState<TeamModelGatewayProviderSnapshot | null>(null);
  const warningShownRef = useRef(false);
  const provisionedSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const refresh = () => {
      const decodedSelection = decodeSelection(selectedModelKey);
      const selectedTeamModel = decodedSelection?.providerId === TEAM_MODEL_GATEWAY_PROVIDER_ID
        ? decodedSelection.model
        : threadContextDefaults?.modelProvider === TEAM_MODEL_GATEWAY_PROVIDER_ID
        ? threadContextDefaults.model
        : null;
      void loadTeamModelGatewayProvider(selectedTeamModel)
        .then((nextSnapshot) => {
          if (cancelled) return;
          setSnapshot(nextSnapshot);
          if (nextSnapshot) warningShownRef.current = false;
        })
        .catch((error) => {
          if (cancelled) return;
          setSnapshot(null);
          if (isTeamModelGatewayUnavailable(error)) return;
          if (!warningShownRef.current) {
            warningShownRef.current = true;
            dispatch({
              type: "log",
              text: `Team model gateway unavailable: ${formatError(error)}`,
              level: "warn",
            });
          }
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [dispatch, refreshKey, selectedModelKey, threadContextDefaults?.model, threadContextDefaults?.modelProvider]);

  /*
   * Migrate a persisted team selection whose model id no longer matches the
   * gateway's canonical ids (legacy bare slugs or client-invented prefixes).
   */
  useEffect(() => {
    if (!snapshot) return;
    const decoded = decodeSelection(selectedModelKey);
    if (!decoded || decoded.providerId !== TEAM_MODEL_GATEWAY_PROVIDER_ID) return;
    if (snapshot.provider.models.includes(decoded.model)) return;
    const reconciled = reconcileTeamModelSlug(decoded.model, snapshot.provider.models);
    setSelectedModelKey(reconciled ? encodeSelection(TEAM_MODEL_GATEWAY_PROVIDER_ID, reconciled) : null);
  }, [selectedModelKey, setSelectedModelKey, snapshot]);

  /*
   * Provision the provider definition when it changes. Guarded by an
   * in-session signature so window-focus snapshot refreshes stay idle.
   */
  const catalogConfig = useMemo(() => (
    snapshot
      ? buildTeamModelGatewayCatalogConfig({
          personalModelDraft,
          personalProviderConfigured,
          teamModelConfig: snapshot.modelConfig,
          teamModels: snapshot.provider.models,
        })
      : null
  ), [personalModelDraft, personalProviderConfigured, snapshot]);
  const provisionSignature = snapshot
    ? teamModelGatewayProvisionSignature(snapshot, catalogConfig?.models ?? [])
    : null;
  useEffect(() => {
    if (!snapshot || !catalogConfig || !provisionSignature) return;
    if (provisionedSignatureRef.current === provisionSignature) return;
    provisionedSignatureRef.current = provisionSignature;
    void provisionTeamModelGatewayProvider({
      client,
      dispatch,
      connect,
      connected,
      codexHome,
      snapshot,
      catalogConfig,
    }).then((result) => {
      if (
        (result.status === "skipped" || result.status === "failed")
        && provisionedSignatureRef.current === provisionSignature
      ) {
        // Runtime unreachable or write error — retry on the next refresh.
        provisionedSignatureRef.current = null;
      }
    });
  }, [catalogConfig, client, codexHome, connect, connected, dispatch, provisionSignature, snapshot]);

  const handleModelSelect = useCallback((key: string | null) => {
    setSelectedModelKey(migrateSubscriptionModelSelection(key));
  }, [setSelectedModelKey]);

  return {
    provider: snapshot?.provider ?? null,
    handleModelSelect,
  };
}

export interface BuildTeamModelGatewayCatalogConfigOptions {
  personalModelDraft: ModelConfig;
  personalProviderConfigured: boolean;
  teamModelConfig: ModelConfig;
  teamModels: readonly string[];
}

export function buildTeamModelGatewayCatalogConfig({
  personalModelDraft,
  personalProviderConfigured,
  teamModelConfig,
  teamModels,
}: BuildTeamModelGatewayCatalogConfigOptions): LocalModelCatalogConfigPayload {
  const baseCatalogConfig = personalProviderConfigured
    ? buildLocalModelCatalogConfig(personalModelDraft)
    : buildLocalModelCatalogConfig(teamModelConfig);
  return catalogConfigWithExtraModels(baseCatalogConfig, teamModels);
}
