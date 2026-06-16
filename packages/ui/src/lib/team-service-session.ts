// Global "the team service rejected our login token" signal.
//
// Three independent request layers talk to the one team-service backend with
// the same login bearer token — KB calls (yuxi-request), the team model
// gateway (team-model-gateway), and the auth endpoints (team-service-auth).
// When any of them gets a 401 mid-session the token is dead, but each layer
// only knows about its own request. This module is the shared seam: a request
// layer calls notifyTeamServiceUnauthorized() on a 401, and the auth gate
// subscribes to drop the session and fall back to the sign-in screen instead
// of leaving the app half-alive (KB errors + gateway gone) until a restart.
//
// Deliberately dependency-free: yuxi-request and team-model-gateway both import
// it, and routing the signal through team-service-auth (which imports
// yuxi-client) would create an import cycle.

type TeamServiceUnauthorizedListener = () => void;

const listeners = new Set<TeamServiceUnauthorizedListener>();

export function notifyTeamServiceUnauthorized(): void {
  // Snapshot before iterating: a listener may unsubscribe itself on fire.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One listener throwing must not stop the others — nor the request that
      // triggered the signal, which still needs to throw its own error.
    }
  }
}

export function subscribeTeamServiceUnauthorized(
  listener: TeamServiceUnauthorizedListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
