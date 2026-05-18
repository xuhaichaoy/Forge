import {
  appConnectOAuthFullRedirectUrl,
  claimAppConnectOAuthCallback,
  markAppConnectOAuthPending,
  oauthStateFromUrl,
  resetAppConnectOAuthPendingForTest,
} from "../src/state/app-connect-oauth";

export default function runAppConnectOAuthTests(): void {
  resetAppConnectOAuthPendingForTest();
  parsesOAuthStateAndCallbackUrls();
  resetAppConnectOAuthPendingForTest();
  claimsPendingCallbackOnce();
  resetAppConnectOAuthPendingForTest();
  claimsOAuthErrorDetails();
  resetAppConnectOAuthPendingForTest();
}

function parsesOAuthStateAndCallbackUrls(): void {
  const redirectUrl = "https://chatgpt.com/aip/connectors/links/oauth/callback?state=abc&code=123";
  const encoded = encodeURIComponent(redirectUrl);
  assertEqual(oauthStateFromUrl(redirectUrl), "abc", "OAuth state should be read from the redirect URL");
  assertEqual(
    appConnectOAuthFullRedirectUrl(`codex://app-connect-oauth-callback?fullRedirectUrl=${encoded}`),
    redirectUrl,
    "codex callback should unwrap the full redirect URL",
  );
  assertEqual(
    appConnectOAuthFullRedirectUrl("https://chatgpt.com/connector_platform_oauth_redirect?state=abc&code=123"),
    "https://chatgpt.com/connector_platform_oauth_redirect?state=abc&code=123",
    "browser redirect callback should be accepted as the full redirect URL",
  );
  assertEqual(
    appConnectOAuthFullRedirectUrl("codex://threads/thread-123"),
    null,
    "thread deeplinks are not app-connect OAuth callbacks",
  );
}

function claimsPendingCallbackOnce(): void {
  const redirectUrl = "https://chatgpt.com/aip/connectors/links/oauth/callback?state=gmail-state&code=123";
  const pending = markAppConnectOAuthPending({
    appId: "gmail",
    appName: "Gmail",
    redirectUrl,
    openedAt: 100,
  });
  assertEqual(pending?.oauthState, "gmail-state", "pending connector should be keyed by OAuth state");

  const claim = claimAppConnectOAuthCallback(
    `codex://app-connect-oauth/callback?full_redirect_url=${encodeURIComponent(redirectUrl)}`,
  );
  assertEqual(claim?.pending?.appName, "Gmail", "callback should resolve the pending connector by state");
  assertEqual(claim?.duplicate, false, "first callback claim should not be duplicate");
  assertEqual(claim?.pending?.claimed, true, "first callback claim should mark pending connector claimed");

  const duplicate = claimAppConnectOAuthCallback(redirectUrl);
  assertEqual(duplicate?.duplicate, true, "second callback claim should be marked duplicate");
}

function claimsOAuthErrorDetails(): void {
  const redirectUrl = "https://chatgpt.com/aip/connectors/links/oauth/callback?state=gmail-state&error=access_denied&error_description=User%20cancelled";
  markAppConnectOAuthPending({
    appId: "gmail",
    appName: "Gmail",
    redirectUrl: "https://chatgpt.com/aip/connectors/links/oauth/callback?state=gmail-state",
  });

  const claim = claimAppConnectOAuthCallback(
    `codex://app-connect-oauth/callback?fullRedirectUrl=${encodeURIComponent(redirectUrl)}`,
  );
  assertEqual(claim?.pending?.appName, "Gmail", "OAuth error callback should still resolve pending app by state");
  assertEqual(claim?.duplicate, false, "OAuth error callback should still be claimed once");
  assertEqual(claim?.oauthError, "access_denied", "OAuth error code should be surfaced");
  assertEqual(claim?.oauthErrorDescription, "User cancelled", "OAuth error description should be surfaced");
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
