import { Check, ChevronRight, Cpu, LogIn, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DEFAULT_MODEL_NAME,
  DEFAULT_SUBSCRIPTION_MODELS,
  formatModelDisplayName,
} from "../model/model-settings";

/*
 * Footer model picker popover (selection-only).
 *
 * Provider configuration (API key, base URL, OAuth) lives in Settings →
 * Models / Codex auth, not here. The picker only changes the active
 * (provider, model) pair for the next new chat. DEFAULT_PROVIDERS is a
 * fallback/catalog seed; the app should pass runtime providers when available.
 *
 * Codex protocol pipeline:
 *   selection → effectiveThreadContextDefaults → ThreadStartParams.model /
 *   .modelProvider → codex-rs uses the [model_providers.X] block in config.toml
 *
 * Active chats keep their model (protocol locks model per thread). To switch
 * a running chat, the user must fork it (thread/fork accepts the same
 * model/modelProvider override).
 */
export interface ModelPickerProvider {
  /** Matches `[model_providers.X]` key in config.toml */
  id: string;
  /** Display name shown in the section header */
  label: string;
  /** Endpoint host shown in the section header meta */
  host: string;
  /** Default base URL (display only — actual call uses config.toml) */
  baseUrl: string;
  /** List of model slugs available under this provider */
  models: string[];
  /**
   * `"oauth"` = provider uses ChatGPT subscription via `codex login` flow,
   * no API key required (e.g. OpenAI 官方);
   * `"api-key"` = traditional bearer token (e.g. gptbest proxy).
   */
  authMode: "oauth" | "api-key";
}

export const DEFAULT_PROVIDERS: ModelPickerProvider[] = [
  {
    id: "hicodex_local",
    label: "API compatible provider",
    host: "127.0.0.1:8890",
    baseUrl: "http://127.0.0.1:8890/v1",
    models: [DEFAULT_MODEL_NAME],
    authMode: "api-key",
  },
  {
    // id 必须是 "openai" — codex-rs 后端内置的 provider 名（auto OAuth）。
    // ChatGPT Plus / Pro 订阅走这条：用 `/login` slash command 完成 OAuth，
    // token 写入 codex-home/auth.json，新建 chat 时 codex-rs 自动用它。
    id: "openai",
    label: "ChatGPT 订阅 · OpenAI",
    host: "api.openai.com",
    baseUrl: "https://api.openai.com/v1",
    models: DEFAULT_SUBSCRIPTION_MODELS,
    authMode: "oauth",
  },
];

/** Persisted selection: `${providerId}::${modelSlug}` */
export function encodeSelection(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}
export function decodeSelection(value: string | null): { providerId: string; model: string } | null {
  if (!value) return null;
  const idx = value.indexOf("::");
  if (idx < 0) return null;
  return { providerId: value.slice(0, idx), model: value.slice(idx + 2) };
}

export interface ModelPickerMenuProps {
  anchor: HTMLElement;
  providers: ModelPickerProvider[];
  /** Currently selected `${providerId}::${model}`; null = follow config.toml default */
  selectedKey: string | null;
  /** Config.toml default; the row matching this is the implicit choice when selectedKey is null */
  defaultKey: string | null;
  /** Provider ids whose auth is verified (OAuth logged in OR api key configured). */
  readyProviders: ReadonlySet<string>;
  onSelect: (key: string | null) => void;
  onOpenSettings: () => void;
  /** Trigger OAuth sign-in for an `authMode: "oauth"` provider. */
  onSignIn?: (providerId: string) => void | Promise<void>;
  onClose: () => void;
}

const MENU_WIDTH_PX = 340;
const MENU_VIEWPORT_MARGIN_PX = 12;

export function ModelPickerMenu({
  anchor,
  providers,
  selectedKey,
  defaultKey,
  readyProviders,
  onSelect,
  onOpenSettings,
  onSignIn,
  onClose,
}: ModelPickerMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(() => new Set());
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
      <div className="hc-model-picker-menu-header">Default for new chats</div>
      <div className="hc-model-picker-menu-providers">
        {providers.map((provider) => {
          const isCollapsed = collapsedProviders.has(provider.id);
          const isReady = readyProviders.has(provider.id);
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
                    return (
                      <li key={modelSlug} role="none">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          className="hc-model-picker-model-item"
                          data-active={isActive ? "true" : undefined}
                          onClick={() => {
                            onSelect(key === defaultKey ? null : key);
                            onClose();
                          }}
                        >
                          <span className="hc-model-picker-model-icon" aria-hidden>
                            <Cpu size={12} />
                          </span>
                          <span className="hc-model-picker-model-name">{formatModelDisplayName(modelSlug)}</span>
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
        Active chats keep their model. To switch a running chat, fork it.
      </div>
    </div>
  );
}

function clampLeft(rawLeft: number): number {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : MENU_WIDTH_PX;
  const maxLeft = viewportWidth - MENU_WIDTH_PX - MENU_VIEWPORT_MARGIN_PX;
  return Math.max(MENU_VIEWPORT_MARGIN_PX, Math.min(rawLeft, maxLeft));
}
