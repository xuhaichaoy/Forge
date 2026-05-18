export const APP_CONNECT_OAUTH_CALLBACK_PATH = "/aip/connectors/links/oauth/callback";
export const APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH = "/connector_platform_oauth_redirect";

export interface PendingAppConnectOAuth {
  appId: string;
  appName: string;
  oauthState: string;
  redirectUrl: string;
  openedAt: number;
  claimed: boolean;
}

export interface MarkAppConnectOAuthPendingInput {
  appId: string;
  appName: string;
  redirectUrl: string;
  openedAt?: number;
}

export interface AppConnectOAuthCallbackClaim {
  fullRedirectUrl: string;
  oauthState: string | null;
  oauthError: string | null;
  oauthErrorDescription: string | null;
  pending: PendingAppConnectOAuth | null;
  duplicate: boolean;
}

const pendingAppConnectByState = new Map<string, PendingAppConnectOAuth>();

export function markAppConnectOAuthPending(
  input: MarkAppConnectOAuthPendingInput,
): PendingAppConnectOAuth | null {
  const redirectUrl = input.redirectUrl.trim();
  const oauthState = oauthStateFromUrl(redirectUrl);
  if (!oauthState) return null;
  const pending = {
    appId: input.appId,
    appName: input.appName,
    oauthState,
    redirectUrl,
    openedAt: input.openedAt ?? Date.now(),
    claimed: false,
  };
  pendingAppConnectByState.set(oauthState, pending);
  return pending;
}

export function claimAppConnectOAuthCallback(
  value: string | null | undefined,
): AppConnectOAuthCallbackClaim | null {
  const fullRedirectUrl = appConnectOAuthFullRedirectUrl(value);
  if (!fullRedirectUrl) return null;
  const oauthState = oauthStateFromUrl(fullRedirectUrl) ?? oauthStateFromUrl(value);
  const oauthError = oauthCallbackParam(fullRedirectUrl, "error") ?? oauthCallbackParam(value, "error");
  const oauthErrorDescription = oauthCallbackParam(fullRedirectUrl, "error_description")
    ?? oauthCallbackParam(fullRedirectUrl, "errorDescription")
    ?? oauthCallbackParam(value, "error_description")
    ?? oauthCallbackParam(value, "errorDescription");
  const pending = oauthState ? pendingAppConnectByState.get(oauthState) ?? null : null;
  const duplicate = pending?.claimed === true;
  if (pending && oauthState && !pending.claimed) {
    pendingAppConnectByState.set(oauthState, { ...pending, claimed: true });
  }
  return {
    fullRedirectUrl,
    oauthState,
    oauthError,
    oauthErrorDescription,
    pending: pending ? { ...pending, claimed: pending.claimed || !duplicate } : null,
    duplicate,
  };
}

export function appConnectOAuthFullRedirectUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const url = parseUrl(raw);
  if (!url) return null;

  if (isCodexAppConnectCallbackUrl(url) || isHttpAppConnectCallbackUrl(url)) {
    return nestedFullRedirectUrl(url) ?? raw;
  }

  if (isHttpConnectorPlatformRedirectUrl(url)) {
    return raw;
  }

  return null;
}

export function oauthStateFromUrl(value: string | null | undefined): string | null {
  return oauthCallbackParam(value, "state");
}

function oauthCallbackParam(value: string | null | undefined, key: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const url = parseUrl(raw);
  if (!url) return null;
  return url.searchParams.get(key)?.trim() || null;
}

export function resetAppConnectOAuthPendingForTest(): void {
  pendingAppConnectByState.clear();
}

function nestedFullRedirectUrl(url: URL): string | null {
  for (const key of ["fullRedirectUrl", "full_redirect_url", "redirectUrl", "redirect_url", "url"]) {
    const value = url.searchParams.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

function isCodexAppConnectCallbackUrl(url: URL): boolean {
  if (url.protocol !== "codex:") return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return host === "app-connect-oauth-callback"
    || host === "app-connect-oauth"
    || path.includes("app-connect-oauth-callback")
    || path.includes("app-connect-oauth/callback");
}

function isHttpAppConnectCallbackUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return normalizedPath(url).endsWith(APP_CONNECT_OAUTH_CALLBACK_PATH);
}

function isHttpConnectorPlatformRedirectUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return normalizedPath(url).endsWith(APP_CONNECT_OAUTH_BROWSER_REDIRECT_PATH);
}

function normalizedPath(url: URL): string {
  return url.pathname.replace(/\/+/g, "/");
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
