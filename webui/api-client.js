// webui/api-client.js
// Lightweight wrapper around fetch() for the local AQMAR admin API.
//
// All read endpoints (GET /api/health, /api/martyrs, /api/martyrs/{id})
// require no auth — anyone can read.
//
// Write endpoints (PUT/POST on /api/martyrs/* and /api/publish) require
// an X-Admin-Token header matching the ADMIN_TOKEN in .env. The token
// is captured by the login flow (app.js doLogin → AQMAR_API.setToken)
// and stashed in sessionStorage so it survives page reload without
// surviving a browser-close.

(function (global) {
  "use strict";

  const BASE = "/api";
  const TOKEN_KEY = "aqmar.adminToken";

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; }
    catch (e) { return ""; }
  }

  function setToken(token) {
    try { sessionStorage.setItem(TOKEN_KEY, token); }
    catch (e) {}
  }

  function clearToken() {
    try { sessionStorage.removeItem(TOKEN_KEY); }
    catch (e) {}
  }

  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const tok = getToken();
    if (tok) headers["X-Admin-Token"] = tok;
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (netErr) {
      // Network-level failure (server down, CORS, etc.)
      throw new Error(`Network error: ${netErr.message}`);
    }
    if (!res.ok) {
      // Try to surface FastAPI's `{ "detail": "..." }` envelope
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = await res.json();
        if (parsed && parsed.detail) detail = parsed.detail;
        else if (parsed && parsed.error) detail = parsed.error;
      } catch (e) {
        // Body wasn't JSON
      }
      const err = new Error(`${method} ${path} → ${res.status}: ${detail}`);
      err.status = res.status;
      throw err;
    }
    // 204 No Content: return null instead of trying to parse
    if (res.status === 204) return null;
    return res.json();
  }

  global.AQMAR_API = {
    get:        (path)       => request("GET",  path),
    put:        (path, body) => request("PUT",  path, body),
    post:       (path, body) => request("POST", path, body),
    setToken,
    clearToken,
    hasToken:   () => !!getToken(),
  };
})(window);
