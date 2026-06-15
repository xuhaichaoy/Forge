import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { LogIn, Moon, Server, Settings, Sun } from "lucide-react";
import {
  DEFAULT_TEAM_SERVICE_BASE_URL,
  TeamServiceAuthError,
  clearTeamServiceAuthSession,
  loginTeamService,
  readTeamServiceAuthSession,
  refreshTeamServiceUser,
  registerTeamService,
  teamServiceAuthErrorMessage,
  type TeamServiceAuthSession,
} from "../lib/team-service-auth";
import {
  loadUiThemeMode,
  nextToggleThemeMode,
  readSystemThemeVariant,
  resolveUiThemeMode,
  saveUiThemeMode,
  subscribeSystemThemeVariant,
  type ResolvedUiTheme,
} from "../state/theme";
import { loadForgeLocale } from "../state/i18n";
import { ForgeIntlProvider, useForgeIntl } from "./i18n-provider";
import { startTopbarWindowDrag } from "../lib/window-drag";

interface TeamServiceAuthGateProps {
  children: ReactNode;
}

export function TeamServiceAuthGate({ children }: TeamServiceAuthGateProps) {
  // The gate renders *outside* ForgeAppBody's ForgeIntlProvider (it gates the
  // body itself), so it mounts its own provider from the stored locale — the
  // same boot-read as useUiPreferences. Once the gate unlocks, the nested app
  // provider takes over for children; the gate itself mirrors how it already
  // self-manages the theme for the pre-auth screen.
  const [locale] = useState(() => (
    loadForgeLocale(browserStorage(), typeof navigator === "undefined" ? null : navigator.language)
  ));
  return (
    <ForgeIntlProvider locale={locale}>
      <TeamServiceAuthGateBody>{children}</TeamServiceAuthGateBody>
    </ForgeIntlProvider>
  );
}

function TeamServiceAuthGateBody({ children }: TeamServiceAuthGateProps) {
  const { formatMessage } = useForgeIntl();
  const [session, setSession] = useState<TeamServiceAuthSession | null>(() => readTeamServiceAuthSession());
  const [checking, setChecking] = useState(() => Boolean(readTeamServiceAuthSession()?.token));
  const [baseUrl, setBaseUrl] = useState(() => readTeamServiceAuthSession()?.baseUrl ?? DEFAULT_TEAM_SERVICE_BASE_URL);
  const [serviceConfigOpen, setServiceConfigOpen] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemTheme, setSystemTheme] = useState<ResolvedUiTheme>(() => readSystemThemeVariant());
  const [themeMode, setThemeMode] = useState(() => loadUiThemeMode(browserStorage()));
  const resolvedTheme = resolveUiThemeMode(themeMode, systemTheme);

  useEffect(() => subscribeSystemThemeVariant(setSystemTheme), []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.hcTheme = resolvedTheme;
    root.dataset.hcThemeMode = themeMode;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("electron-dark", resolvedTheme === "dark");
  }, [resolvedTheme, themeMode]);

  useEffect(() => {
    let cancelled = false;
    const stored = readTeamServiceAuthSession();
    if (!stored?.token) {
      setChecking(false);
      return;
    }
    setChecking(true);
    void refreshTeamServiceUser(stored)
      .then((next) => {
        if (cancelled) return;
        setSession(next);
        setBaseUrl(next.baseUrl);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        clearTeamServiceAuthSession();
        setSession(null);
        // Empty string = "session check failed without lib-provided copy"; the
        // render path resolves it to the localized session-expired fallback.
        // (This mount-only effect cannot capture formatMessage without widening
        // its dependency list and re-running the session check on locale swap.)
        setError(teamServiceAuthErrorMessage(requestError) || "");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submitDisabled = useMemo(() => {
    return submitting || !baseUrl.trim() || !loginId.trim() || !password;
  }, [baseUrl, loginId, password, submitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await loginOrRegisterTeamService({ baseUrl, loginId, password });
      setSession(next);
      setBaseUrl(next.baseUrl);
    } catch (requestError) {
      // `|| null` keeps the original "empty copy renders nothing" semantics now
      // that the error row checks `error != null` (see session-expired fallback).
      setError(teamServiceAuthErrorMessage(requestError, formatMessage) || null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleThemeToggle = () => {
    const nextMode = nextToggleThemeMode(resolvedTheme);
    setThemeMode(nextMode);
    saveUiThemeMode(browserStorage(), nextMode);
  };
  const handleGateMouseDownCapture = (event: MouseEvent<HTMLElement>) => {
    if (!serviceConfigOpen) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".hc-team-auth-service-settings,.hc-team-auth-service-popover")) return;
    setServiceConfigOpen(false);
  };
  const handleGateKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      setServiceConfigOpen(false);
    }
  };
  const themeToggleLabel = resolvedTheme === "dark"
    ? formatMessage({ id: "hc.command.theme.toggleLight", defaultMessage: "Switch to light theme" })
    : formatMessage({ id: "hc.command.theme.toggleDark", defaultMessage: "Switch to dark theme" });
  const serviceSettingsLabel = formatMessage({ id: "hc.teamAuth.serviceSettings", defaultMessage: "Service URL settings" });
  const themeToggle = (
    <button
      type="button"
      className="hc-team-auth-theme-toggle"
      aria-label={themeToggleLabel}
      title={themeToggleLabel}
      onClick={handleThemeToggle}
    >
      {resolvedTheme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );

  if (session?.token && !checking) {
    return <>{children}</>;
  }

  if (session?.token && checking) {
    return (
      <main
        className="hc-team-auth-gate"
        data-theme={resolvedTheme}
        data-theme-mode={themeMode}
        onMouseDownCapture={handleGateMouseDownCapture}
        onKeyDown={handleGateKeyDown}
      >
        <div
          className="hc-team-auth-window-drag"
          data-tauri-drag-region
          aria-hidden="true"
          onMouseDown={startTopbarWindowDrag}
        />
        {themeToggle}
        <section
          className="hc-team-auth-loading"
          aria-label={formatMessage({ id: "hc.teamAuth.openingAriaLabel", defaultMessage: "Opening Forge" })}
          role="status"
        >
          <strong>Forge</strong>
          <span>{formatMessage({ id: "hc.teamAuth.opening", defaultMessage: "Opening Forge..." })}</span>
        </section>
      </main>
    );
  }

  return (
    <main
      className="hc-team-auth-gate"
      data-theme={resolvedTheme}
      data-theme-mode={themeMode}
      onMouseDownCapture={handleGateMouseDownCapture}
      onKeyDown={handleGateKeyDown}
    >
      <div
        className="hc-team-auth-window-drag"
        data-tauri-drag-region
        aria-hidden="true"
        onMouseDown={startTopbarWindowDrag}
      />
      {themeToggle}
      <section className="hc-team-auth-panel" aria-labelledby="hc-team-auth-title">
        <button
          type="button"
          className="hc-team-auth-service-settings"
          aria-label={serviceSettingsLabel}
          aria-expanded={serviceConfigOpen}
          aria-controls="hc-team-auth-service-config"
          title={serviceSettingsLabel}
          onClick={() => setServiceConfigOpen((current) => !current)}
        >
          <Settings size={17} aria-hidden="true" />
        </button>

        {serviceConfigOpen ? (
          <div
            className="hc-team-auth-service-popover"
            id="hc-team-auth-service-config"
            role="dialog"
            aria-label={serviceSettingsLabel}
          >
            <label className="hc-team-auth-service">
              <span>
                <Server size={13} aria-hidden="true" />
                {formatMessage({ id: "hc.teamAuth.serviceUrl", defaultMessage: "Service URL" })}
              </span>
              <input
                id="hc-team-auth-base-url"
                type="url"
                value={baseUrl}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className="hc-team-auth-header">
          <h1 id="hc-team-auth-title">Forge</h1>
        </div>

        <form className="hc-team-auth-form" onSubmit={handleSubmit}>
          <label className="hc-team-auth-field">
            <span>{formatMessage({ id: "hc.teamAuth.username", defaultMessage: "Username" })}</span>
            <input
              value={loginId}
              autoComplete="username"
              onChange={(event) => setLoginId(event.target.value)}
            />
          </label>

          <label className="hc-team-auth-field">
            <span>{formatMessage({ id: "hc.teamAuth.password", defaultMessage: "Password" })}</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error != null ? (
            <div className="hc-team-auth-error" role="alert">
              {error || formatMessage({ id: "hc.teamAuth.sessionExpired", defaultMessage: "Your session has expired. Please sign in again." })}
            </div>
          ) : null}

          <button className="hc-team-auth-submit" type="submit" disabled={submitDisabled}>
            <LogIn size={18} aria-hidden="true" />
            <span>
              {submitting
                ? formatMessage({ id: "hc.teamAuth.signingIn", defaultMessage: "Signing in..." })
                : formatMessage({ id: "hc.teamAuth.signIn", defaultMessage: "Sign in" })}
            </span>
          </button>

          <div
            className="hc-team-auth-alt-login"
            aria-label={formatMessage({ id: "hc.teamAuth.quickSignIn", defaultMessage: "Quick sign-in" })}
          >
            <button
              type="button"
              className="hc-team-auth-dingtalk"
              disabled
              aria-label={formatMessage({ id: "hc.teamAuth.dingTalkSignIn", defaultMessage: "Sign in with DingTalk" })}
              title={formatMessage({ id: "hc.teamAuth.dingTalkComingSoon", defaultMessage: "DingTalk sign-in coming soon" })}
            >
              <DingTalkIcon />
            </button>
          </div>
        </form>

        {checking ? (
          <div className="hc-team-auth-checking" role="status">
            {formatMessage({ id: "hc.teamAuth.verifyingSession", defaultMessage: "Verifying your session..." })}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function DingTalkIcon() {
  return (
    <svg className="hc-team-auth-dingtalk-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M18.7 3.6c-1.7-.7-5.1-1.4-9.9-1.8-.6-.1-1 .5-.7 1 1.1 1.7 2.8 3.3 5 4.7-2.4-.6-5-1.4-7.6-2.3-.6-.2-1.1.4-.8 1 1.1 2.1 3.2 4.1 6.2 5.8-1.6-.1-3.1-.4-4.7-.8-.6-.1-1 .6-.6 1.1 1.5 1.8 3.8 3 6.8 3.6l-1.9 3.7c-.2.4.3.8.6.5l7.7-7.3c.9-.9 1.5-2 1.6-3.2.2-2.1-.4-4-1.7-6Z"
        fill="currentColor"
      />
      <path
        d="M12.3 15.8c1.1.1 2.2.1 3.4-.1l-3 2.9 1.2-2.4c.1-.2-.1-.4-.3-.4h-1.3Z"
        fill="rgba(255,255,255,0.9)"
      />
    </svg>
  );
}

async function loginOrRegisterTeamService(payload: {
  baseUrl: string;
  loginId: string;
  password: string;
}): Promise<TeamServiceAuthSession> {
  try {
    return await loginTeamService(payload);
  } catch (loginError) {
    if (!shouldTryAutoRegister(loginError)) throw loginError;
    try {
      return await registerTeamService({
        baseUrl: payload.baseUrl,
        username: payload.loginId,
        password: payload.password,
      });
    } catch (registerError) {
      if (registerError instanceof TeamServiceAuthError && registerError.status === 409) {
        throw loginError;
      }
      throw registerError;
    }
  }
}

function shouldTryAutoRegister(error: unknown): boolean {
  if (!(error instanceof TeamServiceAuthError)) return false;
  return error.status === 400 || error.status === 401 || error.status === 404;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
