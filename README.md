# HE3AM 3AM MUSIC

A lightweight music player with a small service layer and an optional Cloudflare Worker API.

## Run locally

Serve this folder over HTTP (the browser blocks some API requests from `file://`):

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Project layout

- `index.html` — accessible app structure and player controls.
- `style.css` — responsive, minimal interface.
- `app.js` — UI state, playlists, search rendering and audio playback.
- `services.js` — API transport and local-library storage adapter.
- `config.js` — one place to configure the API base URL.
- `worker/index.js` — optional server-side music-search API.
- `wrangler.toml` — Cloudflare Worker deployment settings.

## Data model and privacy

Playlist data is still stored in this browser using the existing `pulseMusic` storage key. Existing playlists are preserved. The service adapter keeps storage operations separate from the UI so a database adapter can be added later.

The Worker handles provider search requests and caches successful responses for five minutes. It does not store personal playlists, create user accounts, or sync data between devices.

## Deploy the API Worker

1. Install Wrangler and sign in to your Cloudflare account.
2. From the repository root, run `npx wrangler deploy`.
3. If using Jamendo, add its client ID as a Worker secret: `npx wrangler secret put JAMENDO_CLIENT_ID`.
4. Add your Pages origin to `ALLOWED_ORIGINS` in `wrangler.toml` if your deployment uses a different domain.
5. Copy the deployed Worker URL into `config.js` as `apiBaseUrl`, then publish the GitHub Pages site.

The Audius search route works without a private key. Jamendo search returns a configuration response until `JAMENDO_CLIENT_ID` is set.

## API routes

- `GET /api/health`
- `GET /api/tracks/search?query=...` — Audius
- `GET /api/jamendo/tracks?query=...` — Jamendo

Only fixed provider endpoints are exposed; the Worker is not an arbitrary URL proxy.
