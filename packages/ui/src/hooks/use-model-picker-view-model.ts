import { useMemo } from "react";
import type { ModelConfig } from "@hicodex/codex-protocol";
import {
  DEFAULT_PROVIDERS,
  isModelSelectionAvailable,
  isSubscriptionProviderId,
  normalizeSubscriptionProviderId,
  resolveEffectiveModelSelection,
  type ModelPickerProvider,
  type ModelSelectionRef,
  type ResolvedModelSelection,
} from "../model/model-picker-selection";
import { hostFromBaseUrl } from "../lib/format";
import type { CodexAuthSummary } from "../lib/tauri-host";
import { hasOpenAiCredentialSummary } from "../state/account-state";
import {
  DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID,
  DEFAULT_SUBSCRIPTION_PROVIDER_ID,
  decodeSelection,
  encodeSelection,
  modelSlugsForConfig,
  normalizeModelSlugs,
} from "../model/model-settings";
import {
  isSettingsModelProviderExcluded,
  isSubscriptionCatalogModel,
} from "../model/model-selection-context";
import { TEAM_MODEL_GATEWAY_PROVIDER_ID } from "../model/team-model-gateway";
import type { ThreadContextDefaults } from "../state/codex-reducer";

interface ActiveThreadResolvedModel {
  model: string | null;
  modelProvider: string | null;
}

export interface BuildModelPickerProvidersArgs {
  modelDraft: ModelConfig;
  /*
   * Whether the personal provider has a REAL config.toml entry. The draft
   * always materializes a factory placeholder; only a saved provider may be
   * exposed as selectable or win default/fallback resolution.
   */
  personalProviderConfigured: boolean;
  threadContextDefaults: ThreadContextDefaults | null | undefined;
  teamModelGatewayProvider: ModelPickerProvider | null;
}

interface UseModelPickerViewModelArgs extends BuildModelPickerProvidersArgs {
  activeThreadId: string | null;
  activeThreadModelProvider: string | null | undefined;
  activeThreadResolvedModel: ActiveThreadResolvedModel | null | undefined;
  selectedModelKey: string | null;
  threadModelSelections: Record<string, string>;
  codexAuthSummary: CodexAuthSummary | null;
  oauthAuthMethod: string | null;
}

interface ModelPickerViewModel {
  modelPickerProviders: ModelPickerProvider[];
  readyProviders: ReadonlySet<string>;
  decodedSelectedModelSelection: ModelSelectionRef | null;
  decodedActiveThreadModelSelection: ModelSelectionRef | null;
  defaultModelSelection: ModelSelectionRef | null;
  activeThreadDisplayModelSelection: ModelSelectionRef | null;
  effectiveModelSelection: ResolvedModelSelection;
  modelPickerDefaultKey: string | null;
  modelPickerOverlaySelectedKey: string | null;
  modelPickerOverlayDefaultKey: string | null;
}

export function useModelPickerViewModel({
  modelDraft,
  personalProviderConfigured,
  threadContextDefaults,
  activeThreadId,
  activeThreadModelProvider,
  activeThreadResolvedModel,
  selectedModelKey,
  threadModelSelections,
  codexAuthSummary,
  oauthAuthMethod,
  teamModelGatewayProvider,
}: UseModelPickerViewModelArgs): ModelPickerViewModel {
  const modelPickerProviders = useMemo(() => buildModelPickerProviders({
    modelDraft,
    personalProviderConfigured,
    threadContextDefaults,
    teamModelGatewayProvider,
  }), [
    modelDraft.baseUrl,
    modelDraft.id,
    modelDraft.model,
    modelDraft.models,
    modelDraft.name,
    personalProviderConfigured,
    teamModelGatewayProvider,
    threadContextDefaults?.model,
    threadContextDefaults?.modelProvider,
  ]);

  const readyProviders = useMemo(() => {
    const ready = new Set<string>();
    const configuredPersonalProviderId = modelDraft.id.trim();
    /*
     * Personal provider: ready only with a REAL saved config.toml entry —
     * the factory placeholder (and the old "the active config provider is
     * always ready" heuristic) let a fresh install silently send to a dead
     * 127.0.0.1 endpoint. A keyless local gateway with a saved entry still
     * counts (api keys are optional for local gateways).
     */
    if (configuredPersonalProviderId
      && !isSettingsModelProviderExcluded(configuredPersonalProviderId)
      && personalProviderConfigured) {
      ready.add(configuredPersonalProviderId);
    }
    if (teamModelGatewayProvider) {
      ready.add(TEAM_MODEL_GATEWAY_PROVIDER_ID);
    }
    if ((oauthAuthMethod && oauthAuthMethod.length > 0) || hasOpenAiCredentialSummary(codexAuthSummary)) {
      ready.add(DEFAULT_SUBSCRIPTION_PROVIDER_ID);
      ready.add(DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID);
    }
    return ready;
  }, [
    codexAuthSummary,
    modelDraft.id,
    oauthAuthMethod,
    personalProviderConfigured,
    teamModelGatewayProvider,
  ]);

  const decodedSelectedModelSelection = useMemo(() => {
    const decoded = decodeSelection(selectedModelKey);
    return isModelSelectionAvailable(decoded, modelPickerProviders) ? decoded : null;
  }, [modelPickerProviders, selectedModelKey]);

  const decodedActiveThreadModelSelection = useMemo(() => {
    const key = activeThreadId ? threadModelSelections[activeThreadId] ?? null : null;
    const decoded = decodeSelection(key);
    return isModelSelectionAvailable(decoded, modelPickerProviders) ? decoded : null;
  }, [activeThreadId, modelPickerProviders, threadModelSelections]);

  const defaultModelSelection = useMemo(() => (
    threadContextDefaults?.modelProvider && threadContextDefaults?.model
      ? {
          providerId: normalizeSubscriptionProviderId(threadContextDefaults.modelProvider),
          model: threadContextDefaults.model,
        }
      : null
  ), [threadContextDefaults?.model, threadContextDefaults?.modelProvider]);

  const activeThreadDisplayModelSelection = useMemo(() => {
    if (!activeThreadId) return null;
    if (decodedActiveThreadModelSelection) return decodedActiveThreadModelSelection;
    const rawProviderId = activeThreadResolvedModel?.modelProvider?.trim()
      || activeThreadModelProvider?.trim()
      || "";
    const providerId = normalizeSubscriptionProviderId(rawProviderId);
    if (!providerId) return null;
    const resolvedModelName = activeThreadResolvedModel?.model?.trim();
    if (resolvedModelName) {
      const selection = { providerId, model: resolvedModelName };
      return isModelSelectionAvailable(selection, modelPickerProviders) ? selection : null;
    }
    if (defaultModelSelection && defaultModelSelection.providerId === providerId) {
      return isModelSelectionAvailable(defaultModelSelection, modelPickerProviders)
        ? defaultModelSelection
        : null;
    }
    const provider = modelPickerProviders.find((candidate) => candidate.id === providerId);
    return provider && provider.models.length === 1
      ? { providerId, model: provider.models[0] }
      : null;
  }, [
    activeThreadId,
    activeThreadModelProvider,
    activeThreadResolvedModel,
    decodedActiveThreadModelSelection,
    defaultModelSelection,
    modelPickerProviders,
  ]);

  const effectiveModelSelection = useMemo(() => {
    const intended = activeThreadId
      ? decodedActiveThreadModelSelection
      : decodedSelectedModelSelection ?? defaultModelSelection;
    return resolveEffectiveModelSelection({
      intended,
      providers: modelPickerProviders,
      readyProviders,
      allowFallback: !activeThreadId && decodedSelectedModelSelection == null,
    });
  }, [
    activeThreadId,
    decodedActiveThreadModelSelection,
    decodedSelectedModelSelection,
    defaultModelSelection,
    modelPickerProviders,
    readyProviders,
  ]);

  const modelPickerDefaultKey = defaultModelSelection && isModelSelectionAvailable(defaultModelSelection, modelPickerProviders)
    ? encodeSelection(defaultModelSelection.providerId, defaultModelSelection.model)
    : null;
  const selectedModelKeyForPicker = decodedSelectedModelSelection
    ? encodeSelection(decodedSelectedModelSelection.providerId, decodedSelectedModelSelection.model)
    : null;
  const modelPickerOverlaySelectedKey = activeThreadId
    ? (activeThreadDisplayModelSelection
        ? encodeSelection(activeThreadDisplayModelSelection.providerId, activeThreadDisplayModelSelection.model)
        : null)
    : (decodedSelectedModelSelection
        ? selectedModelKeyForPicker
        : (!effectiveModelSelection.noReadyProvider
            ? encodeSelection(effectiveModelSelection.providerId, effectiveModelSelection.model)
            : null));
  const modelPickerOverlayDefaultKey = activeThreadId ? null : modelPickerDefaultKey;

  return {
    modelPickerProviders,
    readyProviders,
    decodedSelectedModelSelection,
    decodedActiveThreadModelSelection,
    defaultModelSelection,
    activeThreadDisplayModelSelection,
    effectiveModelSelection,
    modelPickerDefaultKey,
    modelPickerOverlaySelectedKey,
    modelPickerOverlayDefaultKey,
  };
}

export function buildModelPickerProviders({
  modelDraft,
  personalProviderConfigured,
  threadContextDefaults,
  teamModelGatewayProvider,
}: BuildModelPickerProvidersArgs): ModelPickerProvider[] {
  const localFallback = DEFAULT_PROVIDERS.find((provider) => provider.id === "hicodex_local")
    ?? DEFAULT_PROVIDERS[0];
  const subscriptionProvider = DEFAULT_PROVIDERS.find((provider) => provider.id === DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID);
  const activeProviderId = threadContextDefaults?.modelProvider?.trim() || localFallback.id;
  const draftProviderId = modelDraft.id.trim();
  const activeIsSubscription = isSubscriptionProviderId(activeProviderId);
  const useDraftForLocalProvider = draftProviderId.length > 0 && !isSettingsModelProviderExcluded(draftProviderId);
  const localProviderId = useDraftForLocalProvider
    ? draftProviderId
    : (!activeIsSubscription ? activeProviderId : localFallback.id);
  const localModels = personalProviderConfigured
    ? normalizeModelSlugs([
        ...modelSlugsForConfig(modelDraft),
      ])
    : [];
  const subscriptionModels = subscriptionProvider
    ? normalizeModelSlugs([
        ...subscriptionProvider.models,
        activeIsSubscription && isSubscriptionCatalogModel(threadContextDefaults?.model)
          ? threadContextDefaults?.model
          : null,
      ])
    : [];
  /*
   * Team first: the primary product scenario is team-configured models, so
   * the team section leads the picker AND wins ready-provider fallback for
   * new chats. Personal follows; the (rare) subscription block stays last
   * and collapsed by default.
   */
  return [
    ...(teamModelGatewayProvider ? [teamModelGatewayProvider] : []),
    {
      ...localFallback,
      id: localProviderId,
      label: useDraftForLocalProvider && modelDraft.name.trim()
        ? modelDraft.name.trim()
        : localFallback.label,
      host: useDraftForLocalProvider
        ? hostFromBaseUrl(modelDraft.baseUrl, localFallback.host)
        : localFallback.host,
      baseUrl: useDraftForLocalProvider && modelDraft.baseUrl.trim()
        ? modelDraft.baseUrl.trim()
        : localFallback.baseUrl,
      models: personalProviderConfigured
        ? (localModels.length > 0 ? localModels : localFallback.models)
        : [],
    },
    ...(subscriptionProvider
      ? [{
          ...subscriptionProvider,
          models: subscriptionModels.length > 0 ? subscriptionModels : subscriptionProvider.models,
        }]
      : []),
  ];
}
