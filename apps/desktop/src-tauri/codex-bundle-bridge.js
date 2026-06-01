/*
 * codex-bundle-bridge.js
 * ----------------------------------------------------------------------------
 * Tauri `initialization_script` for the SEPARATE webview window that loads the
 * real Codex Desktop bundle (an Electron-targeted web app).
 *
 * This runs in GLOBAL scope BEFORE any of the bundle's own scripts. It is NOT
 * an ES module — no import/export, everything hangs off `window`.
 *
 * Job: emulate the Electron preload (`window.electronBridge`, `codexWindowType`,
 * telemetry short-circuits) so the bundle boots, and bridge every IPC/MCP/fetch
 * request the bundle makes onto HiCodex's Tauri host, which owns the single real
 * `codex app-server` process.
 *
 * Ported 1:1 from the proven puppeteer spike
 * (.tmp/spike/spike2.mjs — 0 errors against a real app-server), with the
 * `window.__rpc` / `window.__push` puppeteer plumbing replaced by Tauri:
 *
 *   - request out:  window.__TAURI__.core.invoke("host_send_raw", { message })
 *                   message = {id, method, params} | {method, params} | {id, result}
 *   - events in:    window.__TAURI__.event.listen("hicodex://app-server-event", cb)
 *                   cb(e) -> e.payload is HiCodex's tagged HostEvent enum:
 *                     { type: "json", value: <JSON-RPC message> }  // the interesting one
 *                     { type: "stdout" | "stderr" | "lifecycle" | "error", ... }
 *                   (We also accept a bare JSON-RPC message at e.payload for
 *                    robustness, in case the host is ever rewired to emit raw.)
 *
 * Everything is guarded by `if (window.__TAURI__)` + try/catch; with no Tauri
 * present the file degrades to a harmless no-op shim so it can be injected
 * anywhere safely.
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var VERSION = "26.519.81530";
  var APP_SERVER_EVENT = "hicodex://app-server-event";

  // ==========================================================================
  // 0) Telemetry short-circuits — install FIRST, before anything else can run.
  //    The bundle's StatsigProvider blocks on a feature-flag fetch to
  //    ab.chatgpt.com; offline that hangs/errors and the app never leaves the
  //    splash. We answer those (and Sentry) locally so Statsig "ready"s. ES
  //    module imports don't route through window.fetch, so app-server traffic
  //    (which goes through electronBridge below) is unaffected.
  // ==========================================================================
  function telemetryBody(url) {
    if (/initialize/i.test(url)) {
      return JSON.stringify({
        has_updates: true,
        time: 1780000000000,
        feature_gates: {},
        dynamic_configs: {},
        layer_configs: {},
        sdkParams: {},
        hash_used: "none",
        derived_fields: {},
        hashed_sdk_key_used: "x",
      });
    }
    return "{}";
  }

  // Returns a canned Response for telemetry hosts, or null to defer to the real fetch.
  function telemetryResponse(url) {
    try {
      if (/sentry/i.test(url)) {
        return new Response("{}", { status: 200 });
      }
      if (/ab\.chatgpt\.com|statsig|featuregates|featureassets/i.test(url)) {
        return new Response(telemetryBody(url), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    } catch (e) {
      /* Response may be unavailable extremely early; fall through. */
    }
    return null;
  }

  (function patchFetch() {
    try {
      var originalFetch =
        typeof window.fetch === "function" ? window.fetch.bind(window) : null;
      window.fetch = function (input, init) {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        var canned = telemetryResponse(url);
        if (canned) return Promise.resolve(canned);
        if (originalFetch) return originalFetch(input, init);
        return Promise.reject(new Error("no fetch"));
      };
    } catch (e) {
      /* best-effort */
    }
  })();

  // XHR short-circuit for the same hosts — Statsig may fall back to XHR.
  // We flag matching requests in open() and synthesize a 200 in send().
  (function patchXhr() {
    try {
      if (typeof XMLHttpRequest === "undefined") return;
      var proto = XMLHttpRequest.prototype;
      var originalOpen = proto.open;
      var originalSend = proto.send;
      proto.open = function (method, url) {
        try {
          var u = String(url || "");
          this.__hicodexTelemetryUrl =
            /sentry/i.test(u) ||
            /ab\.chatgpt\.com|statsig|featuregates|featureassets/i.test(u)
              ? u
              : null;
        } catch (e) {
          this.__hicodexTelemetryUrl = null;
        }
        return originalOpen.apply(this, arguments);
      };
      proto.send = function () {
        var url = this.__hicodexTelemetryUrl;
        if (!url) return originalSend.apply(this, arguments);
        var xhr = this;
        var body = /sentry/i.test(url) ? "{}" : telemetryBody(url);
        // Synthesize a successful, readonly response without hitting the network.
        setTimeout(function () {
          try {
            Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
            Object.defineProperty(xhr, "status", { value: 200, configurable: true });
            Object.defineProperty(xhr, "responseText", { value: body, configurable: true });
            Object.defineProperty(xhr, "response", { value: body, configurable: true });
          } catch (e) {
            /* some props are non-configurable in certain engines; ignore */
          }
          try { xhr.onreadystatechange && xhr.onreadystatechange(); } catch (e) {}
          try { xhr.onload && xhr.onload(); } catch (e) {}
          try { xhr.dispatchEvent(new Event("readystatechange")); } catch (e) {}
          try { xhr.dispatchEvent(new Event("load")); } catch (e) {}
        }, 0);
      };
    } catch (e) {
      /* best-effort */
    }
  })();

  // ==========================================================================
  // 1) Identity globals the bundle reads synchronously at boot.
  // ==========================================================================
  window.codexWindowType = "electron";
  window.codexVersion = VERSION;

  // If Tauri isn't present, install a harmless no-op electronBridge so the
  // bundle still boots (it just won't talk to any app-server), and stop here.
  var TAURI = window.__TAURI__;
  if (!TAURI || !TAURI.core || typeof TAURI.core.invoke !== "function") {
    var noopOnly = function () {};
    window.electronBridge = {
      windowType: "electron",
      getPathForFile: function () { return null; },
      sendWorkerMessageFromView: function () { return Promise.resolve(); },
      subscribeToWorkerMessages: function () { return noopOnly; },
      showContextMenu: function () { return Promise.resolve(); },
      showApplicationMenu: function () { return Promise.resolve(); },
      getFastModeRolloutMetrics: function () { return {}; },
      getSharedObjectSnapshotValue: function (k) {
        return /version/i.test(String(k)) ? VERSION : undefined;
      },
      getSystemThemeVariant: function () { return "dark"; },
      subscribeToSystemThemeVariant: function () { return noopOnly; },
      triggerSentryTestError: function () { return Promise.resolve(); },
      getSentryInitOptions: function () {
        return {
          codexAppSessionId: "hicodex",
          appVersion: VERSION,
          release: VERSION,
          dsn: null,
        };
      },
      getAppSessionId: function () { return "hicodex"; },
      getBuildFlavor: function () { return "production"; },
      sendMessageFromView: function () { return Promise.resolve(); },
    };
    return; // no Tauri -> nothing to bridge.
  }

  // ==========================================================================
  // 2) Tauri plumbing.
  // ==========================================================================
  var noop = function () {};

  // Dispatch an inbound message INTO the bundle. The bundle's "preload<->view"
  // channel is a window 'message' event whose `.data` is the payload.
  function reply(data) {
    setTimeout(function () {
      try {
        window.dispatchEvent(new MessageEvent("message", { data: data }));
      } catch (e) {
        /* ignore */
      }
    }, 0);
  }

  // Fire-and-forget JSON-RPC write to the host's app-server stdin.
  function hostSend(message) {
    try {
      return TAURI.core.invoke("host_send_raw", { message: message });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // Pending request map: app-server response id -> resolver.
  var pending = new Map();
  var rpcSeq = 0;
  function nextId(prefix) {
    rpcSeq += 1;
    return (prefix || "hicodex-bundle") + "-" + Date.now() + "-" + rpcSeq;
  }

  // Send a JSON-RPC request and resolve with the matching {id,result|error}.
  // Resolves to a JSON-RPC-shaped object either way (timeout -> error).
  function rpcRaw(id, method, params) {
    return new Promise(function (resolve) {
      pending.set(id, resolve);
      var message =
        params === undefined
          ? { id: id, method: method }
          : { id: id, method: method, params: params };
      hostSend(message).catch(function () {
        /* the response listener / timeout below still settles the promise */
      });
      setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id);
          resolve({ id: id, error: { code: -32000, message: "timeout" } });
        }
      }, 25000);
    });
  }

  // Open fetch-streams the bundle has registered; app-server NOTIFICATIONS are
  // fanned out to every one of them (mirrors the spike's __push behaviour —
  // the bundle multiplexes streams on its side by requestId).
  var streams = [];

  // Unwrap HiCodex's tagged HostEvent enum into a bare JSON-RPC message.
  //   { type: "json", value: <msg> }  -> <msg>
  //   bare { id, ... } / { method, ... } -> itself (robustness fallback)
  //   anything else (stdout/stderr/lifecycle/error) -> null (ignored here)
  function jsonRpcFromEvent(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.type === "json") {
      return payload.value && typeof payload.value === "object" ? payload.value : null;
    }
    if (typeof payload.type === "string") {
      // stdout / stderr / lifecycle / error — not an RPC message.
      return null;
    }
    // No tag: assume the host emitted a raw JSON-RPC message.
    if ("id" in payload || "method" in payload) return payload;
    return null;
  }

  function handleAppServerMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    var hasId = "id" in msg && msg.id !== undefined && msg.id !== null;
    var isResponse = hasId && ("result" in msg || "error" in msg);
    if (isResponse) {
      var resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg);
      }
      return;
    }
    // A notification (has `method`, no result/error) -> feed open fetch-streams.
    if (msg.method) {
      for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        reply({
          type: "fetch-stream-event",
          streamId: s.streamId,
          requestId: s.requestId,
          event: { data: msg },
          data: msg,
        });
      }
    }
  }

  // ==========================================================================
  // 3) Host initialize handshake — exactly once, before forwarding bundle RPCs.
  //    The app-server rejects every other method with -32600 until `initialize`
  //    + `initialized` complete. The single real server may already have been
  //    initialized by the clean-room window, in which case `initialize` comes
  //    back as an error mentioning "Already initialized" — we treat that as OK.
  // ==========================================================================
  var resolveReady;
  var ready = new Promise(function (r) { resolveReady = r; });

  function alreadyInitialized(res) {
    try {
      return (
        res &&
        res.error &&
        typeof res.error.message === "string" &&
        /already initialized/i.test(res.error.message)
      );
    } catch (e) {
      return false;
    }
  }

  function runInitHandshake() {
    rpcRaw("hicodex-bundle-init", "initialize", {
      clientInfo: {
        name: "hicodex_desktop",
        title: "HiCodex Desktop",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    })
      .then(function (res) {
        // Success OR an "Already initialized" error both count as ready.
        if (res && "error" in res && res.error && !alreadyInitialized(res)) {
          // Unexpected init failure: still send `initialized` + open the gate so
          // the bundle can surface its own error UI rather than hanging forever.
        }
        return hostSend({ method: "initialized" }).catch(noop);
      })
      .catch(noop)
      .then(function () {
        resolveReady();
      });
  }

  // Best-effort: make sure the host's app-server is actually running, THEN do
  // the handshake. NOTE: HiCodex's `host_start_app_server` takes a `config`
  // argument (see crates/host AppServerStartConfig + tauri-host.ts), not
  // `request`; we use the real param name so the server truly starts. Errors
  // (e.g. "already running") are ignored.
  function startServerThenHandshake() {
    var startCall;
    try {
      startCall = TAURI.core.invoke("host_start_app_server", {
        config: { codexHome: null },
      });
    } catch (e) {
      startCall = Promise.reject(e);
    }
    Promise.resolve(startCall).catch(noop).then(runInitHandshake);
  }

  // ==========================================================================
  // 4) Subscribe to inbound app-server events, then kick off the handshake.
  // ==========================================================================
  (function subscribe() {
    try {
      if (TAURI.event && typeof TAURI.event.listen === "function") {
        Promise.resolve(
          TAURI.event.listen(APP_SERVER_EVENT, function (e) {
            try {
              var msg = jsonRpcFromEvent(e && e.payload);
              if (msg) handleAppServerMessage(msg);
            } catch (err) {
              /* ignore a single bad event */
            }
          })
        ).catch(noop);
      }
    } catch (e) {
      /* ignore */
    }
    startServerThenHandshake();
  })();

  // ==========================================================================
  // 5) electronBridge — the preload surface the bundle calls into.
  // ==========================================================================
  window.electronBridge = {
    windowType: "electron",
    getPathForFile: function () { return null; },
    sendWorkerMessageFromView: function () { return Promise.resolve(); },
    subscribeToWorkerMessages: function () { return noop; },
    showContextMenu: function () { return Promise.resolve(); },
    showApplicationMenu: function () { return Promise.resolve(); },
    getFastModeRolloutMetrics: function () { return {}; },
    getSharedObjectSnapshotValue: function (k) {
      return /version/i.test(String(k)) ? VERSION : undefined;
    },
    getSystemThemeVariant: function () { return "dark"; },
    subscribeToSystemThemeVariant: function () { return noop; },
    triggerSentryTestError: function () { return Promise.resolve(); },
    getSentryInitOptions: function () {
      return {
        codexAppSessionId: "hicodex",
        appVersion: VERSION,
        release: VERSION,
        dsn: null,
      };
    },
    getAppSessionId: function () { return "hicodex"; },
    getBuildFlavor: function () { return "production"; },

    // The single multiplexed channel the bundle uses for IPC / MCP / fetch.
    sendMessageFromView: function (m) {
      if (!m) return Promise.resolve();
      try {
        return Promise.resolve(dispatchViewMessage(m));
      } catch (e) {
        return Promise.resolve();
      }
    },
  };

  // Route one view->preload message to the right handler.
  function dispatchViewMessage(m) {
    switch (m.type) {
      // Atom persistence: the bundle just wants its persisted state back; we
      // have none to restore, so hand back an empty snapshot.
      case "persisted-atom-sync-request":
        reply({ type: "persisted-atom-sync", state: {} });
        return;

      // Shared-object subscriptions: answer once with a sane default. Anything
      // mentioning "connection" expects an array (list of connections); others
      // default to null.
      case "shared-object-subscribe": {
        var key = m.key || (m.keys && m.keys[0]);
        reply({
          type: "shared-object-updated",
          key: key,
          value: /connection/i.test(String(key)) ? [] : null,
        });
        return;
      }

      // Direct MCP / JSON-RPC request: forward to the app-server, await the
      // matching response, hand it back tagged with the bundle's hostId.
      case "mcp-request": {
        var req = m.request || {};
        return ready.then(function () {
          return rpcRaw(req.id, req.method, req.params).then(function (r) {
            reply({
              type: "mcp-response",
              hostId: m.hostId,
              message:
                r && "error" in r
                  ? { id: req.id, error: r.error }
                  : { id: req.id, result: r ? r.result : undefined },
            });
          });
        });
      }

      // HTTP-style fetch the bundle issues against its "local" endpoints.
      case "fetch":
        return handleFetch(m);

      // Long-lived stream: record it so app-server notifications get fanned in.
      case "fetch-stream":
        streams.push({
          streamId: m.streamId != null ? m.streamId : m.requestId,
          requestId: m.requestId,
          url: m.url,
        });
        return;

      case "cancel-fetch-stream":
        // Drop any matching stream registration; harmless if absent.
        streams = streams.filter(function (s) {
          return (
            s.requestId !== m.requestId &&
            s.streamId !== (m.streamId != null ? m.streamId : m.requestId)
          );
        });
        return;

      case "log-message":
        return; // swallow renderer logs

      default:
        return; // unknown message types are ignored, as in the spike
    }
  }

  // fetch handler: maps the bundle's three "local" URL families onto host RPCs.
  function handleFetch(m) {
    var url = String(m.url || "");
    var rid = m.requestId;

    // Settings bootstrap — the bundle expects { values: {...} }.
    if (/get-settings/.test(url)) {
      reply({
        type: "fetch-response",
        responseType: "success",
        requestId: rid,
        status: 200,
        headers: {},
        body: JSON.stringify({ values: {} }),
      });
      return;
    }

    // The bundle's primary JSON-RPC-over-HTTP path. Body carries {method,params};
    // we forward with a fresh id and stream back result|error as the body.
    if (/ipc-request/.test(url)) {
      var body = {};
      try { body = JSON.parse(m.body || "{}"); } catch (e) { body = {}; }
      var id = nextId("ipc");
      return ready.then(function () {
        return rpcRaw(id, body.method, body.params).then(function (r) {
          var isError = r && "error" in r;
          reply({
            type: "fetch-response",
            responseType: isError ? "error" : "success",
            requestId: rid,
            status: isError ? 500 : 200,
            headers: {},
            body: JSON.stringify(isError ? r.error : r && r.result != null ? r.result : {}),
          });
        });
      });
    }

    // Anything else: an empty 200 keeps the bundle moving.
    reply({
      type: "fetch-response",
      responseType: "success",
      requestId: rid,
      status: 200,
      headers: {},
      body: "{}",
    });
  }
})();
