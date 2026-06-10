import {
  DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID,
  DEFAULT_SUBSCRIPTION_PROVIDER_ID,
  decodeSelection,
} from "./model-settings";

export const CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE =
  "订阅模型和个人/团队模型不能在同一个聊天中互切。请新建聊天后选择目标模型。";

export const PROVIDER_SWITCH_FAILED_MESSAGE =
  "当前聊天没有切到所选模型提供方。请重新选择模型后再发送。";

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
