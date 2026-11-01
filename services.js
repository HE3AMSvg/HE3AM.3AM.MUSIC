/* HE3AM service layer: API transport and browser-library persistence. */
(function (global) {
  "use strict";

  const DEFAULT_TIMEOUT = 12000;

  async function requestJSON(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = Number(options.timeout) || DEFAULT_TIMEOUT;
    const requestOptions = { ...options };
    delete requestOptions.timeout;

    const timer = global.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(requestOptions.headers || {})
        }
      });

      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.json();
          detail = body?.error || body?.message || "";
        } catch (_) {}
        throw new Error(detail || `Request failed (${response.status}).`);
      }

      return await response.json();
    } finally {
      global.clearTimeout(timer);
    }
  }

  const library = {
    readRaw(key) {
      try {
        return global.localStorage.getItem(key);
      } catch (error) {
        console.warn("[HE3AM] Browser storage is unavailable.", error);
        return null;
      }
    },
    writeRaw(key, value) {
      try {
        global.localStorage.setItem(key, value);
        return true;
      } catch (error) {
        console.error("[HE3AM] Could not persist library data.", error);
        return false;
      }
    }
  };

  global.HE3AM = global.HE3AM || {};
  global.HE3AM.services = Object.freeze({
    api: Object.freeze({ get: requestJSON }),
    library: Object.freeze(library)
  });
})(window);
