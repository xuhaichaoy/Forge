import { Check, ChevronRight, Cpu, LogIn, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  decodeSelection,
  encodeSelection,
  formatModelDisplayName,
} from "../model/model-settings";
import { isCrossAccountProviderSwitch } from "../model/model-provider-switch";
import {
  isSubscriptionProviderId,
  type ModelPickerProvider,
} from "../model/model-picker-selection";
import type { I18nMessageDescriptor } from "../state/i18n";
import { useForgeIntl } from "./i18n-provider";

export {
  DEFAULT_PROVIDERS,
  isModelSelectionAvailable,
  isSubscriptionProviderId,
  normalizeSubscriptionProviderId,
  resolveEffectiveModelSelection,
  type ModelPickerProvider,
  type ModelSelectionRef,
  type ResolvedModelSelection,
} from "../model/model-picker-selection";

/*
 * Footer model picker popover (selection-only).
 *
 * Provider configuration (API key, base URL, OAuth) lives in Settings →
 * Models / Codex auth, not here. The picker changes the active (provider,
 * model) pair. DEFAULT_PROVIDERS is a fallback/catalog seed; the app should
 * pass runtime providers when available.
 *
 * Codex protocol pipeline:
 *   selection → effectiveThreadContextDefaults → ThreadStartParams.model /
 *   .modelProvider → codex-rs uses the [model_providers.X] block in config.toml
 *
 * Existing running turns keep the model/provider they started with. On the next
 * idle send, a provider change stays in the same conversation by cold-resuming
 * the selected thread with ThreadResumeParams.modelProvider before turn/start.
 */
export interface ModelPickerMenuProps {
  anchor: HTMLElement;
  providers: ModelPickerProvider[];
  /** Currently selected `${providerId}::${model}`; null = follow config.toml default */
  selectedKey: string | null;
  /** Config.toml default; the row matching this is the implicit choice when selectedKey is null */
  defaultKey: string | null;
  /** Provider ids whose auth is verified (OAuth logged in OR api key configured). */
  readyProviders: ReadonlySet<string>;
  /**
   * Provider the active chat is bound to, if any. Subscription and API/team
   * providers cannot be switched within one chat (different account/credit
   * pools), so providers on the other side are locked with an explanation
   * instead of failing at send time.
   */
  activeThreadProviderId?: string | null;
  onSelect: (key: string | null) => void;
  onOpenSettings: () => void;
  /** Trigger OAuth sign-in for an `authMode: "oauth"` provider. */
  onSignIn?: (providerId: string) => void | Promise<void>;
  onClose: () => void;
}

export const CROSS_ACCOUNT_PICKER_LOCK_REASON: I18nMessageDescriptor = {
  id: "hc.modelPicker.crossAccountLockReason",
  defaultMessage: "Subscription models and personal/team models can't be switched within the same chat — start a new chat to choose one.",
};

export function isProviderLockedForActiveThread(
  providerId: string,
  activeThreadProviderId: string | null | undefined,
): boolean {
  return isCrossAccountProviderSwitch(activeThreadProviderId, providerId);
}

const MENU_WIDTH_PX = 340;
const MENU_VIEWPORT_MARGIN_PX = 12;

export function ModelPickerMenu({
  anchor,
  providers,
  selectedKey,
  defaultKey,
  readyProviders,
  activeThreadProviderId,
  onSelect,
  onOpenSettings,
  onSignIn,
  onClose,
}: ModelPickerMenuProps) {
  const { formatMessage } = useForgeIntl();
  const menuRef = useRef<HTMLDivElement | null>(null);
  /*
   * Subscription sections start collapsed: mixing ChatGPT subscription with
   * personal/team API providers is the rare case — most users live entirely
   * on personal/team models, so the subscription block stays one click away
   * unless it holds the current selection.
   */
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(() => {
    const activeProviderId = decodeSelection(selectedKey ?? defaultKey)?.providerId ?? null;
    const collapsed = new Set<string>();
    for (const provider of providers) {
      if (isSubscriptionProviderId(provider.id) && provider.id !== activeProviderId) {
        collapsed.add(provider.id);
      }
    }
    return collapsed;
  });
  /*
   * Anchor the popover to the chip but clamp position so it never overflows
   * the viewport. Without clamping, the bottom-right chip + 340px popover
   * extends past the right edge on narrow windows (we saw the popover get
   * cut off and the section header wrap weirdly). We pin `top` above the
   * chip and `left` to fit inside [margin, viewport-width-menu-margin].
   */
  const [position, setPosition] = useState<{ top: number; left: number }>(() => {
    const rect = anchor.getBoundingClientRect();
    const left = clampLeft(rect.left);
    return { top: rect.top - 8, left };
  });
  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition({ top: rect.top - 8, left: clampLeft(rect.left) });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current) return;
      const target = event.target as Node | null;
      if (target && menuRef.current.contains(target)) return;
      if (target && anchor.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (providers.length === 0) {
    return null;
  }

  const activeKey = selectedKey ?? defaultKey;

  return (
    <div
      ref={menuRef}
      className="hc-model-picker-menu"
      role="menu"
      data-state="open"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: MENU_WIDTH_PX,
        transform: "translateY(-100%)",
      }}
    >
      <div className="hc-model-picker-menu-header">Model</div>
      <div className="hc-model-picker-menu-providers">
        {providers.map((provider) => {
          const isCollapsed = collapsedProviders.has(provider.id);
          const isReady = readyProviders.has(provider.id);
          const isCrossAccountLocked = isProviderLockedForActiveThread(provider.id, activeThreadProviderId);
          return (
            <section key={provider.id} className="hc-model-picker-provider">
              <button
                type="button"
                className="hc-model-picker-provider-title"
                onClick={() => {
                  setCollapsedProviders((current) => {
                    const next = new Set(current);
                    if (next.has(provider.id)) next.delete(provider.id);
                    else next.add(provider.id);
                    return next;
                  });
                }}
                aria-expanded={!isCollapsed}
              >
                <ChevronRight
                  size={12}
                  className="hc-model-picker-provider-chevron"
                  data-open={isCollapsed ? undefined : "true"}
                />
                <span>{provider.label}</span>
                <span className="hc-model-picker-provider-host">
                  {provider.host}
                  {isCrossAccountLocked && (
                    <span className="hc-model-picker-provider-warning" title={formatMessage(CROSS_ACCOUNT_PICKER_LOCK_REASON)}>
                      {" · "}
                      {formatMessage({ id: "hc.modelPicker.newChatRequired", defaultMessage: "New chat required" })}
                    </span>
                  )}
                  {!isReady && (
                    <span className="hc-model-picker-provider-warning" title={
                      provider.authMode === "oauth"
                        ? "Not signed in — Settings → Models → Sign in"
                        : "API key not set — Settings → Models"
                    }>
                      {" · "}
                      {provider.authMode === "oauth" ? "not signed in" : "no key"}
                    </span>
                  )}
                </span>
              </button>
              {!isCollapsed && provider.authMode === "oauth" && !isReady && onSignIn && (
                <div className="hc-model-picker-signin-row">
                  <button
                    type="button"
                    className="hc-model-picker-signin-button"
                    onClick={() => {
                      void onSignIn(provider.id);
                      onClose();
                    }}
                  >
                    <LogIn size={13} />
                    {/* codex profile-dropdown `signInWithOpenAI` defaultMessage = "Sign in with ChatGPT" */}
                    <span>Sign in with ChatGPT</span>
                  </button>
                  <span className="hc-model-picker-signin-hint">
                    Opens chatgpt.com OAuth in your browser.
                  </span>
                </div>
              )}
              {!isCollapsed && provider.models.length > 0 && (
                <ul className="hc-model-picker-model-list" role="none">
                  {provider.models.map((modelSlug) => {
                    const key = encodeSelection(provider.id, modelSlug);
                    const isActive = key === activeKey;
                    /*
                     * A provider whose auth is not verified (`!isReady` → the
                     * "not signed in" / "no key" header warning) cannot serve a
                     * turn, so its models are not selectable — picking one only
                     * produced a connect/reconnect error ("Reconnecting… N/5").
                     * Forge extension: Codex Desktop has no per-provider model
                     * picker (it gates the whole app behind a single ChatGPT
                     * login), so there is no upstream idiom to mirror — we lock
                     * the rows and steer the user to the inline Sign-in row
                     * (oauth) or Settings → Models (api key).
                     * Cross-account rows (subscription vs API/team while a chat
                     * is active) are locked for the same reason: picking one
                     * could only fail later, at send time.
                     */
                    const isLocked = !isReady || isCrossAccountLocked;
                    return (
                      <li key={modelSlug} role="none">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          aria-disabled={isLocked || undefined}
                          className="hc-model-picker-model-item"
                          data-active={isActive ? "true" : undefined}
                          data-locked={isLocked ? "true" : undefined}
                          title={
                            isLocked
                              ? isCrossAccountLocked
                                ? formatMessage(CROSS_ACCOUNT_PICKER_LOCK_REASON)
                                : provider.authMode === "oauth"
                                ? "Sign in with ChatGPT to use this model"
                                : "Set an API key in Settings → Models to use this model"
                              : undefined
                          }
                          onClick={() => {
                            if (isLocked) return;
                            onSelect(key === defaultKey ? null : key);
                            onClose();
                          }}
                        >
                          <span className="hc-model-picker-model-icon" aria-hidden>
                            <Cpu size={12} />
                          </span>
                          <span className="hc-model-picker-model-name">
                            {provider.modelLabels?.[modelSlug] ?? formatModelDisplayName(modelSlug)}
                          </span>
                          {isActive && (
                            <span className="hc-model-picker-model-check" aria-hidden>
                              <Check size={13} />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <button
        type="button"
        className="hc-model-picker-settings-link"
        onClick={() => {
          onClose();
          onOpenSettings();
        }}
      >
        <SettingsIcon size={13} />
        <span>Configure providers · API keys · sign-in</span>
      </button>
      <div className="hc-model-picker-menu-footer">
        {formatMessage({
          id: "hc.modelPicker.footerHint",
          defaultMessage: "Switches take effect on the next turn and only affect this chat and new chats. Switching between subscription and personal/team models requires a new chat.",
        })}
      </div>
    </div>
  );
}

function clampLeft(rawLeft: number): number {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : MENU_WIDTH_PX;
  const maxLeft = viewportWidth - MENU_WIDTH_PX - MENU_VIEWPORT_MARGIN_PX;
  return Math.max(MENU_VIEWPORT_MARGIN_PX, Math.min(rawLeft, maxLeft));
}
