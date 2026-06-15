/*
 * Minimal team-service auth mock for the e2e smoke (scenario 2).
 *
 * Wire contract mirrored from packages/ui/src/lib/team-service-auth.ts:
 *
 *   POST /api/auth/token     loginTeamService() — multipart FormData with
 *                            `username` + `password`. Success: 200 JSON with
 *                            `access_token` (sessionFromAuthResponse rejects
 *                            anything without it); `user` is normalized via
 *                            normalizeTeamServiceUser (needs `username`).
 *                            Content-Type must be application/json, otherwise
 *                            readResponseBody() treats the body as plain text.
 *
 *   GET /api/auth/me         refreshTeamServiceUser() — the gate's mount-time
 *                            session check. `Authorization: Bearer <token>`;
 *                            200 user JSON for the token this mock issued,
 *                            401 for anything else (e.g. the stale token the
 *                            smoke preseeds to aim the gate at this mock).
 *
 *   POST /api/auth/register  exists in the real service (auto-register
 *                            fallback for 400/401/404 login failures) but is
 *                            deliberately NOT implemented here — it 404s like
 *                            every unknown path, so the smoke fails loudly if
 *                            the app ever falls back to register instead of
 *                            the login path under test.
 *
 * CORS: the app origin is http://127.0.0.1:5178 while this mock listens on a
 * random port — cross-origin. The Authorization header on /api/auth/me forces
 * a preflight, so OPTIONS is answered permissively; every response carries
 * Access-Control-Allow-Origin (requests are sent without credentials).
 */
import http from "node:http";

export const MOCK_ACCESS_TOKEN = "e2e-mock-access-token";
/** Preseeded into localStorage by the smoke; /api/auth/me rejects it (401). */
export const STALE_SESSION_TOKEN = "e2e-stale-session-token";

const CORS_ORIGIN_HEADER = { "Access-Control-Allow-Origin": "*" };

function readFormField(rawBody, field) {
  // Just enough multipart parsing for FormData(username, password): the value
  // line follows the part's blank header/body separator.
  const pattern = new RegExp(`name="${field}"\\r?\\n\\r?\\n([^\\r\\n]*)`);
  const match = pattern.exec(rawBody);
  return match ? match[1] : null;
}

/**
 * Boots the mock on 127.0.0.1 with an OS-assigned port.
 * Resolves to { origin, requests, close() } — `requests` is a live log of
 * { method, path, authorization } the smoke uses to assert the app really
 * spoke to the mock (a runtime guard against storage-key/contract drift).
 */
export function startTeamServiceMock() {
  const requests = [];
  let lastUsername = null;

  const server = http.createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      const { pathname } = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push({
        method: request.method,
        path: pathname,
        authorization: request.headers.authorization ?? null,
      });

      const sendJson = (status, body) => {
        response.writeHead(status, {
          "Content-Type": "application/json",
          ...CORS_ORIGIN_HEADER,
        });
        response.end(JSON.stringify(body));
      };

      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          ...CORS_ORIGIN_HEADER,
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers":
            request.headers["access-control-request-headers"] ?? "Authorization, Content-Type",
          "Access-Control-Max-Age": "600",
        });
        response.end();
        return;
      }

      if (request.method === "POST" && pathname === "/api/auth/token") {
        const username = readFormField(rawBody, "username")?.trim() || null;
        const password = readFormField(rawBody, "password");
        if (!username || !password) {
          sendJson(400, { detail: "mock: missing username/password in form body" });
          return;
        }
        lastUsername = username;
        sendJson(200, {
          access_token: MOCK_ACCESS_TOKEN,
          token_type: "bearer",
          user: { id: 1, username, role: "member", capabilities: [] },
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/auth/me") {
        if (request.headers.authorization === `Bearer ${MOCK_ACCESS_TOKEN}`) {
          sendJson(200, {
            id: 1,
            username: lastUsername ?? "smoke-user",
            role: "member",
            capabilities: [],
          });
        } else {
          sendJson(401, { detail: "mock: invalid or expired token" });
        }
        return;
      }

      // Anything else (including /api/auth/register and stray KB calls): a
      // soft JSON 404 — fetch() resolves, app-level error handling owns it.
      sendJson(404, { detail: `mock: no handler for ${request.method} ${pathname}` });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => resolveClose());
            // Smoke clients are short-lived; drop any keep-alive sockets so
            // close() cannot hang the script's finally block.
            server.closeAllConnections?.();
          }),
      });
    });
  });
}
