import type { I18nMessageDescriptor } from "../state/i18n";
import {
  DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID,
  DEFAULT_SUBSCRIPTION_PROVIDER_ID,
  decodeSelection,
} from "./model-settings";

/*
 * Same lock as hc.modelPicker.crossAccountLockReason (model-picker-menu.tsx),
 * but a separate id on purpose: the picker tooltip is the short form while
 * this error/toast copy is the full sentence ("…请新建聊天后选择目标模型。"),
 * so merging the ids would silently rewrite one of the visible strings.
 */
export const CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE: I18nMessageDescriptor = {
  id: "hc.modelProviderSwitch.crossAccountBlocked",
  defaultMessage:
    "Subscription models and personal/team models can't be switched within the same chat. Start a new chat and choose the target model.",
};

export const PROVIDER_SWITCH_FAILED_MESSAGE: I18nMessageDescriptor = {
  id: "hc.modelProviderSwitch.switchFailed",
  defaultMessage: "This chat didn't switch to the selected model provider. Pick the model again before sending.",
};

export function isSubscriptionModelProvider(providerId: string | null | undefined): boolean {
  const normalized = providerId?.trim();
  return normalized === DEFAULT_SUBSCRIPTION_PROVIDER_ID
    || normalized === DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID;
}

export function normalizedModelProviderForSwitch(providerId: string | null | undefined): string {
  const trimmed = providerId?.trim() ?? "";
  return trimmed === DEFAULT_SUBSCRIPTION_PROVIDER_ID
    ? DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID
    : trimmed;
}

export function isCrossAccountProviderSwitch(
  currentProvider: string | null | undefined,
  nextProvider: string | null | undefined,
): boolean {
  const current = normalizedModelProviderForSwitch(currentProvider);
  const next = normalizedModelProviderForSwitch(nextProvider);
  if (!current || !next || current === next) return false;
  return isSubscriptionModelProvider(current) !== isSubscriptionModelProvider(next);
}

export function providerIdForModelSelectionKey(
  key: string | null,
  fallbackProviderId: string | null | undefined,
): string {
  return decodeSelection(key)?.providerId ?? fallbackProviderId?.trim() ?? "";
}

export function isCrossAccountModelSelectionForThread(input: {
  currentProvider: string | null | undefined;
  selectedKey: string | null;
  fallbackProvider: string | null | undefined;
}): boolean {
  return isCrossAccountProviderSwitch(
    input.currentProvider,
    providerIdForModelSelectionKey(input.selectedKey, input.fallbackProvider),
  );
}
