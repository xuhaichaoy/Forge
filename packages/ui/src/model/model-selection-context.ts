import type { ThreadContextDefaults } from "../state/codex-reducer";
import {
  DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID,
  DEFAULT_SUBSCRIPTION_PROVIDER_ID,
} from "./model-settings";
import { TEAM_MODEL_GATEWAY_PROVIDER_ID } from "./team-model-gateway";

export const SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS = [
  TEAM_MODEL_GATEWAY_PROVIDER_ID,
  DEFAULT_SUBSCRIPTION_PROVIDER_ID,
  DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID,
] as const;

export function isSettingsModelProviderExcluded(providerId: string): boolean {
  return SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS.includes(providerId as typeof SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS[number]);
}

export function isSubscriptionCatalogModel(model: string | null | undefined): boolean {
  const trimmed = model?.trim() ?? "";
  return /^gpt[-_]/iu.test(trimmed);
}

export function omitThreadModelSelection(context: ThreadContextDefaults | null): ThreadContextDefaults | null {
  if (!context) return null;
  const {
    model: _model,
    modelProvider: _modelProvider,
    serviceTier: _serviceTier,
    ...rest
  } = context;
  return Object.keys(rest).length > 0 ? rest : null;
}
