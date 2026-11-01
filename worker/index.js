const DEFAULT_ORIGINS = [
  "https://he3amsvg.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",").map(value => value.trim()).filter(Boolean);
  const allowed = new Set([...DEFAULT_ORIGINS, ...configured]);
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  });

  if (allowed.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(data, status, headers) {
  const output = new Headers(headers || {});
  output.set("Content-Type", "application/json; charset=utf-8");
  output.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status: status || 200, headers: output });
}

async function cachedFetch(request, upstreamUrl, cacheSeconds) {
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Music provider returned HTTP ${response.status}.`);
  }

  const body = await response.json();
  const result = json(body, 200, {
    "Cache-Control": `public, max-age=0, s-maxage=${cacheSeconds}`
  });
  await cache.put(cacheKey, result.clone());
  return result;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (origin && !cors.has("Access-Control-Allow-Origin")) {
        return json({ error: "Origin not allowed." }, 403, cors);
      }
      return new Response(null, { status: 204, headers: cors });
    }

    if (origin && !cors.has("Access-Control-Allow-Origin")) {
      return json({ error: "Origin not allowed." }, 403, cors);
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed." }, 405, cors);
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get("query") || "").trim();

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "HE3AM 3AM Music API" }, 200, cors);
    }

    if (!["/api/tracks/search", "/api/jamendo/tracks"].includes(url.pathname)) {
      return json({ error: "Not found." }, 404, cors);
    }

    if (!query || query.length > 100) {
      return json({ error: "A search query between 1 and 100 characters is required." }, 400, cors);
    }

    try {
      let upstream;

      if (url.pathname === "/api/tracks/search") {
        upstream = new URL("https://api.audius.co/v1/tracks/search");
        upstream.searchParams.set("query", query);
        upstream.searchParams.set("app_name", "HE3AM");
        upstream.searchParams.set("limit", "50");
      } else {
        if (!env.JAMENDO_CLIENT_ID) {
          return json({ error: "Jamendo is not configured on the API server." }, 503, cors);
        }
        upstream = new URL("https://api.jamendo.com/v3.0/tracks/");
        upstream.searchParams.set("client_id", env.JAMENDO_CLIENT_ID);
        upstream.searchParams.set("format", "json");
        upstream.searchParams.set("limit", "50");
        upstream.searchParams.set("namesearch", query);
        upstream.searchParams.set("audioformat", "mp32");
        upstream.searchParams.set("include", "musicinfo");
      }

      const upstreamResponse = await cachedFetch(request, upstream, 300);
      const headers = new Headers(upstreamResponse.headers);
      for (const [key, value] of cors.entries()) headers.set(key, value);
      headers.set("X-HE3AM-API", "edge-cache");
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers
      });
    } catch (error) {
      return json({
        error: "Music search is temporarily unavailable.",
        detail: env.NODE_ENV === "development" ? String(error.message || error) : undefined
      }, 502, cors);
    }
  }
};
