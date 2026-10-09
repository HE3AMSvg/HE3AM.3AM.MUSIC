/* ======================================================
   HE3AM MUSIC HUB
   Stable search, playback, playlists, themes and backup
   ====================================================== */

"use strict";

/* ---------------- CONFIG ---------------- */

const APP_NAME = "HE3AM";
const API_PROXY = "https://he3am.ghostrip82.workers.dev";
const STORAGE_KEY = "pulseMusic";
const AUDIUS_DIRECT_API = "https://api.audius.co/v1";

const DEFAULT_VOLUME = 0.8;
const REQUEST_TIMEOUT = 12000;
const MAX_SEARCH_RESULTS = 50;

/* ---------------- DOM HELPERS ---------------- */

const $ = (selector, root = document) =>
  root?.querySelector(selector) ?? null;

const $$ = (selector, root = document) =>
  Array.from(root?.querySelectorAll(selector) ?? []);

const byId = id => document.getElementById(id);

/* ---------------- DOM ELEMENTS ---------------- */

const dom = {
  body: document.body,
  audio: byId("audioPlayer"),

  views: {
    home: byId("homeView"),
    search: byId("searchView"),
    library: byId("libraryView")
  },

  navItems: $$("[data-view]"),

  searchForm: byId("searchForm"),
  searchInput: byId("searchInput"),
  searchButton: byId("searchButton"),

  providerFilter: byId("providerFilter"),
  searchStatus: byId("searchStatus"),
  resultsHeading: byId("resultsHeading"),
  onlineStatus: byId("onlineStatus"),
  onlineResults: byId("onlineResults"),
  searchEmptyState: byId("searchEmptyState"),

  sidebarPlaylists: byId("playlistGrid"),
  homePlaylists: byId("homePlaylists"),
  homePlaylistsEmpty: byId("homePlaylistsEmpty"),

  libraryPlaylistGrid: byId("libraryPlaylistGrid"),
  libraryEmptyState: byId("libraryEmptyState"),

  currentPlaylist: byId("currentPlaylist"),
  currentPlaylistTitle: byId("currentPlaylistTitle"),
  currentPlaylistMeta: byId("currentPlaylistMeta"),
  playlistTracks: byId("playlistTracks"),
  emptyLibrary: byId("emptyLibrary"),

  playlistDialog: byId("playlistDialog"),
  playlistForm: byId("playlistForm"),
  playlistDialogTitle: byId("playlistDialogTitle"),
  playlistName: byId("playlistName"),

  player: byId("player"),
  playerCoverImage: byId("playerCoverImage"),
  playerCoverFallback: byId("playerCoverFallback"),
  playerTitle: byId("playerTitle"),
  playerArtist: byId("playerArtist"),
  playerLikeBtn: byId("playerLikeBtn"),

  playPauseBtn: byId("playPauseBtn"),
  previousTrack: byId("previousTrack"),
  nextTrack: byId("nextTrack"),
  shuffleBtn: byId("shuffleBtn"),
  repeatBtn: byId("repeatBtn"),

  progressBar: byId("progressBar"),
  currentTime: byId("currentTime"),
  duration: byId("duration"),
  volume: byId("volume"),

  trackCount: byId("trackCount"),
  playlistCount: byId("playlistCount"),

  messageRegion: byId("messageRegion"),

  themeToggle: byId("themeToggle"),
  themeIcon: byId("themeIcon"),
  themeLabel: byId("themeLabel"),

  importFile: byId("importFile")
};

/* ---------------- STATE ---------------- */

const state = {
  playlists: [],
  activeView: "home",
  currentPlaylistId: null,

  searchResults: [],
  lastSearchQuery: "",
  searchProvider: "all",
  searchRequestId: 0,
  loadingSearch: false,

  queue: [],
  queueIndex: -1,
  currentTrack: null,

  shuffle: false,
  repeat: "off",
  theme: "dark",

  playlistDialogMode: "create",
  editingPlaylistId: null,

  playbackToken: 0,
  playbackCandidates: [],
  candidateIndex: 0,
  isResolvingPlayback: false,
  failedCandidates: new Set(),

  destroyed: false
};

/* ---------------- UTILITIES ---------------- */

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[char];
  });
}

function safeURL(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value.trim(), window.location.href);

    if (!["https:", "http:"].includes(url.protocol)) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function safeImageUrl(value) {
  return safeURL(value);
}

function safeAudioUrl(value) {
  return safeURL(value);
}

function uniqueStrings(values) {
  return [...new Set(
    values.filter(value => typeof value === "string" && value)
  )];
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function normalizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function getErrorMessage(error) {
  if (!error) {
    return "An unknown error occurred.";
  }

  if (error.name === "AbortError") {
    return "The request timed out. Please try again.";
  }

  return error.message || "Something went wrong.";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isCurrentPlayback(token) {
  return token === state.playbackToken;
}

/* ---------------- NOTIFICATIONS ---------------- */

function notify(message, type = "info", timeout = 3200) {
  if (!dom.messageRegion) {
    console.info(`[HE3AM] ${message}`);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon";

  icon.textContent =
    type === "error" ? "!" :
    type === "success" ? "✓" : "•";

  const text = document.createElement("span");
  text.textContent = String(message);

  toast.append(icon, text);
  dom.messageRegion.appendChild(toast);

  window.setTimeout(() => toast.remove(), timeout);
}

/* ---------------- API ---------------- */

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();

  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}).`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function buildQueryURL(base, path, query) {
  const url = new URL(path, base);
  url.searchParams.set("query", query);
  return url.href;
}

function unwrapCollection(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidates = [
    payload.data,
    payload.results,
    payload.tracks,
    payload.data?.results,
    payload.data?.tracks,
    payload.response?.data,
    payload.response?.results
  ];

  for (const item of candidates) {
    if (Array.isArray(item)) {
      return item;
    }
  }

  return [];
}

/* ---------------- TRACK NORMALIZATION ---------------- */

function getAudiusArtwork(track) {
  const artwork = track?.artwork;

  if (typeof artwork === "string") {
    return safeImageUrl(artwork);
  }

  if (artwork && typeof artwork === "object") {
    return safeImageUrl(
      artwork["480x480"] ||
      artwork["1000x1000"] ||
      artwork["150x150"] ||
      ""
    );
  }

  return "";
}

function normalizeAudiusTrack(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  const id = String(track.id ?? "").trim();
  const title = normalizeText(track.title);

  if (!id || !title) {
    return null;
  }

  const artist = normalizeText(
    track.user?.name ||
    track.user?.handle ||
    track.artist_name ||
    track.artist,
    "Unknown artist"
  );

  const streamCandidates = [
    track.stream_url,
    track.stream,
    track.audio_url,
    track.audio
  ]
    .map(safeAudioUrl)
    .filter(Boolean);

  streamCandidates.push(
    `${AUDIUS_DIRECT_API}/tracks/${encodeURIComponent(id)}/stream?app_name=${encodeURIComponent(APP_NAME)}`
  );

  const duration = Number(track.duration);

  return {
    id: `audius:${id}`,
    sourceId: id,
    provider: "audius",
    title,
    artist,
    artwork: getAudiusArtwork(track),
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    permalink: safeURL(track.permalink),
    streamCandidates: uniqueStrings(streamCandidates)
  };
}

function normalizeJamendoTrack(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  const id = String(track.id ?? "").trim();
  const title = normalizeText(track.name || track.title);

  if (!id || !title) {
    return null;
  }

  const artist = normalizeText(
    track.artist_name ||
    track.artist ||
    track.artistName,
    "Unknown artist"
  );

  const streamCandidates = [
    track.audio,
    track.audio_url,
    track.stream,
    track.stream_url,
    track.audiodownload,
    track.download
  ]
    .map(safeAudioUrl)
    .filter(Boolean);

  const artwork = safeImageUrl(
    track.album_image ||
    track.image ||
    track.image_url ||
    track.artwork ||
    ""
  );

  const duration = Number(track.duration);

  return {
    id: `jamendo:${id}`,
    sourceId: id,
    provider: "jamendo",
    title,
    artist,
    artwork,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    permalink: safeURL(track.shareurl || track.permalink),
    streamCandidates: uniqueStrings(streamCandidates)
  };
}

function normalizeTrack(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  const id = String(track.id || "");
  const provider = String(
    track.provider || track.source || ""
  ).toLowerCase();

  if (provider === "audius" || id.startsWith("audius:")) {
    if (id.startsWith("audius:") && track.sourceId) {
      return {
        ...track,
        id,
        provider: "audius",
        sourceId: String(track.sourceId),
        title: normalizeText(track.title, "Unknown title"),
        artist: normalizeText(track.artist, "Unknown artist"),
        artwork: safeImageUrl(track.artwork),
        streamCandidates: uniqueStrings(
          (Array.isArray(track.streamCandidates)
            ? track.streamCandidates
            : []
          ).map(safeAudioUrl)
        )
      };
    }

    return normalizeAudiusTrack({
      ...track,
      id: track.sourceId || id.replace(/^audius:/, "")
    });
  }

  if (provider === "jamendo" || id.startsWith("jamendo:")) {
    if (id.startsWith("jamendo:") && track.sourceId) {
      return {
        ...track,
        id,
        provider: "jamendo",
        sourceId: String(track.sourceId),
        title: normalizeText(track.title, "Unknown title"),
        artist: normalizeText(track.artist, "Unknown artist"),
        artwork: safeImageUrl(track.artwork),
        streamCandidates: uniqueStrings(
          (Array.isArray(track.streamCandidates)
            ? track.streamCandidates
            : []
          ).map(safeAudioUrl)
        )
      };
    }

    return normalizeJamendoTrack({
      ...track,
      id: track.sourceId || id.replace(/^jamendo:/, "")
    });
  }

  return null;
}

/* ---------------- SEARCH PROVIDERS ---------------- */

async function searchAudius(query) {
  const errors = [];

  const proxyURL = buildQueryURL(
    API_PROXY,
    "/api/tracks/search",
    query
  );

  try {
    const payload = await fetchJSON(proxyURL);

    const tracks = unwrapCollection(payload)
      .map(normalizeAudiusTrack)
      .filter(Boolean);

    if (tracks.length) {
      return tracks.slice(0, MAX_SEARCH_RESULTS);
    }
  } catch (error) {
    errors.push(error);
  }

  const directURL = new URL(
    buildQueryURL(AUDIUS_DIRECT_API, "/tracks/search", query)
  );

  directURL.searchParams.set("app_name", APP_NAME);
  directURL.searchParams.set("limit", String(MAX_SEARCH_RESULTS));

  try {
    const payload = await fetchJSON(directURL.href);

    const tracks = unwrapCollection(payload)
      .map(normalizeAudiusTrack)
      .filter(Boolean);

    if (tracks.length) {
      return tracks.slice(0, MAX_SEARCH_RESULTS);
    }

    if (errors.length) {
      throw errors[0];
    }

    return [];
  } catch (error) {
    if (!errors.includes(error)) {
      errors.push(error);
    }

    throw new Error(
      errors.map(getErrorMessage).join(" ")
    );
  }
}

async function searchJamendo(query) {
  const url = buildQueryURL(
    API_PROXY,
    "/api/jamendo/tracks",
    query
  );

  const payload = await fetchJSON(url);

  return unwrapCollection(payload)
    .map(normalizeJamendoTrack)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_RESULTS);
}

async function searchProvider(provider, query) {
  if (provider === "audius") {
    return searchAudius(query);
  }

  if (provider === "jamendo") {
    return searchJamendo(query);
  }

  const results = await Promise.allSettled([
    searchAudius(query),
    searchJamendo(query)
  ]);

  const tracks = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      tracks.push(...result.value);
    }
  }

  if (!tracks.length) {
    const errors = results
      .filter(result => result.status === "rejected")
      .map(result => getErrorMessage(result.reason));

    throw new Error(
      errors.length
        ? errors.join(" | ")
        : "No matching tracks were found."
    );
  }

  return tracks;
}

/* ---------------- SEARCH UI ---------------- */

function setSearchStatus(message = "", type = "") {
  if (!dom.searchStatus) {
    return;
  }

  dom.searchStatus.textContent = message;
  dom.searchStatus.className =
    `status-message ${type}`.trim();
}

function getFilteredSearchResults() {
  const provider = dom.providerFilter?.value || "all";

  if (provider === "all") {
    return state.searchResults;
  }

  return state.searchResults.filter(
    track => track.provider === provider
  );
}

async function performSearch(query) {
  query = String(query || "").trim();

  if (!query) {
    setSearchStatus("Enter a song, artist or genre.");
    dom.searchInput?.focus();
    return;
  }

  const requestId = ++state.searchRequestId;

  state.lastSearchQuery = query;
  state.searchProvider = dom.providerFilter?.value || "all";
  state.loadingSearch = true;

  navigate("search");

  if (dom.searchInput) {
    dom.searchInput.value = query;
  }

  if (dom.searchButton) {
    dom.searchButton.disabled = true;
    dom.searchButton.textContent = "Searching…";
  }

  if (dom.resultsHeading) {
    dom.resultsHeading.textContent = `Results for "${query}"`;
  }

  if (dom.onlineStatus) {
    dom.onlineStatus.textContent = "";
  }

  if (dom.onlineResults) {
    dom.onlineResults.replaceChildren();
  }

  if (dom.searchEmptyState) {
    dom.searchEmptyState.hidden = true;
  }

  setSearchStatus("Searching music sources…");

  try {
    const tracks = await searchProvider(
      state.searchProvider,
      query
    );

    if (requestId !== state.searchRequestId) {
      return;
    }

    const deduplicated = new Map();

    for (const track of tracks) {
      if (track?.id && !deduplicated.has(track.id)) {
        deduplicated.set(track.id, track);
      }
    }

    state.searchResults = Array
      .from(deduplicated.values())
      .slice(0, MAX_SEARCH_RESULTS);

    setSearchStatus("");
    renderSearchResults();

    if (!state.searchResults.length) {
      setSearchStatus("No matching tracks were found.");
    }
  } catch (error) {
    if (requestId !== state.searchRequestId) {
      return;
    }

    console.error("Search failed:", error);

    state.searchResults = [];
    renderSearchResults();

    setSearchStatus(
      `Search failed: ${getErrorMessage(error)}`,
      "error"
    );
  } finally {
    if (requestId === state.searchRequestId) {
      state.loadingSearch = false;

      if (dom.searchButton) {
        dom.searchButton.disabled = false;
        dom.searchButton.textContent = "Search";
      }
    }
  }
}

/* ---------------- TRACK RENDERING ---------------- */

function trackRowHTML(track, index, context = "search") {
  const artwork = safeImageUrl(track.artwork);
  const isPlaying = state.currentTrack?.id === track.id;

  const title = escapeHTML(track.title);
  const artist = escapeHTML(track.artist);
  const provider = escapeHTML(
    String(track.provider || "music").toUpperCase()
  );

  const cover = artwork
    ? `<img src="${escapeHTML(artwork)}" alt="" loading="lazy" data-cover-image>`
    : `<span class="track-cover-symbol">♫</span>`;

  const playingIcon =
    isPlaying && dom.audio && !dom.audio.paused ? "Ⅱ" : "▶";

  return `
    <article class="track-row ${isPlaying ? "is-playing" : ""}"
      data-track-row="${index}">

      <div class="track-cover">
        ${cover}
      </div>

      <div class="track-info">
        <span class="track-title" title="${title}">${title}</span>
        <span class="track-artist">${artist}</span>
        <span class="track-provider">${provider}</span>
      </div>

      <div class="track-actions">
        <button class="track-action track-play-button"
          type="button"
          data-action="play"
          data-index="${index}"
          data-context="${context}"
          aria-label="Play ${title}"
          title="Play">${playingIcon}</button>

        <button class="track-action"
          type="button"
          data-action="add"
          data-index="${index}"
          data-context="${context}"
          aria-label="Add ${title} to playlist"
          title="Add to playlist">+</button>
      </div>

    </article>
  `;
}

function attachImageFallbacks(root) {
  if (!root) {
    return;
  }

  $$("[data-cover-image]", root).forEach(image => {
    image.addEventListener("error", () => {
      const cover = image.closest(".track-cover");

      image.remove();

      if (cover && !$(".track-cover-symbol", cover)) {
        const fallback = document.createElement("span");
        fallback.className = "track-cover-symbol";
        fallback.textContent = "♫";
        cover.appendChild(fallback);
      }
    }, { once: true });
  });
}

function renderSearchResults() {
  if (!dom.onlineResults) {
    return;
  }

  const tracks = getFilteredSearchResults();

  dom.onlineResults.innerHTML = tracks
    .map((track, index) => trackRowHTML(track, index, "search"))
    .join("");

  attachImageFallbacks(dom.onlineResults);

  if (dom.onlineStatus) {
    dom.onlineStatus.textContent =
      `${tracks.length} track${tracks.length === 1 ? "" : "s"}`;
  }

  if (dom.searchEmptyState) {
    dom.searchEmptyState.hidden = tracks.length > 0;
  }
}

/* ---------------- NAVIGATION ---------------- */

function navigate(view) {
  if (!dom.views[view]) {
    view = "home";
  }

  state.activeView = view;

  for (const [name, element] of Object.entries(dom.views)) {
    if (element) {
      element.classList.toggle("active", name === view);
      element.hidden = name !== view;
    }
  }

  dom.navItems.forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
    button.setAttribute(
      "aria-current",
      button.dataset.view === view ? "page" : "false"
    );
  });

  if (view === "library") {
    renderLibrary();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ---------------- PLAYLIST DATA ---------------- */

function createPlaylistObject(name) {
  return {
    id: createId(),
    name: String(name).trim().slice(0, 60),
    tracks: [],
    createdAt: Date.now()
  };
}

function getPlaylistById(id) {
  return state.playlists.find(
    playlist => playlist.id === id
  ) || null;
}

function normalizePlaylist(playlist) {
  if (!playlist || typeof playlist !== "object") {
    return null;
  }

  const name = normalizeText(playlist.name);

  if (!name) {
    return null;
  }

  const tracks = Array.isArray(playlist.tracks)
    ? playlist.tracks.map(normalizeTrack).filter(Boolean)
    : [];

  const uniqueTracks = new Map();

  for (const track of tracks) {
    uniqueTracks.set(track.id, track);
  }

  return {
    id: String(playlist.id || createId()),
    name: name.slice(0, 60),
    tracks: Array.from(uniqueTracks.values()),
    createdAt: Number(playlist.createdAt) || Date.now()
  };
}

/* ---------------- STORAGE ---------------- */

function loadState() {
  let raw;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Local storage is unavailable.", error);
    return;
  }

  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    if (Array.isArray(parsed.playlists)) {
      state.playlists = parsed.playlists
        .map(normalizePlaylist)
        .filter(Boolean);
    }

    if (parsed.theme === "light" || parsed.theme === "dark") {
      state.theme = parsed.theme;
    }

    if (typeof parsed.volume === "number") {
      const volume = clamp(parsed.volume, 0, 1);

      if (dom.audio) {
        dom.audio.volume = volume;
      }

      if (dom.volume) {
        dom.volume.value = String(volume);
      }
    }

    if (typeof parsed.shuffle === "boolean") {
      state.shuffle = parsed.shuffle;
    }

    if (["off", "all", "one"].includes(parsed.repeat)) {
      state.repeat = parsed.repeat;
    }
  } catch (error) {
    console.error("Could not restore saved state:", error);
    notify("Saved data could not be read.", "error");
  }
}

function saveState() {
  const payload = {
    version: 3,
    playlists: state.playlists,
    theme: state.theme,
    volume: dom.audio?.volume ?? DEFAULT_VOLUME,
    shuffle: state.shuffle,
    repeat: state.repeat,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("Could not save state:", error);
    notify("Could not save data. Browser storage may be full.", "error");
  }
}

/* ---------------- PLAYLIST RENDERING ---------------- */

function renderSidebarPlaylists() {
  if (!dom.sidebarPlaylists) {
    return;
  }

  dom.sidebarPlaylists.innerHTML = state.playlists
    .map(playlist => `
      <button class="sidebar-playlist ${
        state.currentPlaylistId === playlist.id ? "active" : ""
      }"
        type="button"
        data-open-playlist="${escapeHTML(playlist.id)}"
        title="${escapeHTML(playlist.name)}">

        <span class="sidebar-playlist-icon">♫</span>

        <span class="sidebar-playlist-name">
          ${escapeHTML(playlist.name)}
        </span>
      </button>
    `)
    .join("");
}

function playlistCardHTML(playlist) {
  const id = escapeHTML(playlist.id);
  const name = escapeHTML(playlist.name);
  const count = playlist.tracks.length;

  return `
    <article class="playlist-card" data-playlist-card="${id}">

      <div class="playlist-card-art"
        data-playlist-action="open"
        data-playlist-id="${id}"
        role="button"
        tabindex="0"
        aria-label="Open ${name}">
        <span>♫</span>
      </div>

      <div class="playlist-card-title">${name}</div>

      <div class="playlist-card-meta">
        ${count} track${count === 1 ? "" : "s"}
      </div>

      <div class="playlist-card-actions">
        <button class="primary-button"
          type="button"
          data-playlist-action="play"
          data-playlist-id="${id}">▶ Play</button>

        <button class="secondary-button"
          type="button"
          data-playlist-action="open"
          data-playlist-id="${id}">Open</button>
      </div>

    </article>
  `;
}

function renderHomePlaylists() {
  if (dom.homePlaylists) {
    dom.homePlaylists.innerHTML = state.playlists
      .slice(0, 8)
      .map(playlistCardHTML)
      .join("");
  }

  if (dom.homePlaylistsEmpty) {
    dom.homePlaylistsEmpty.hidden = state.playlists.length > 0;
  }
}

function renderLibraryPlaylists() {
  if (dom.libraryPlaylistGrid) {
    dom.libraryPlaylistGrid.innerHTML = state.playlists
      .map(playlistCardHTML)
      .join("");
  }

  if (dom.libraryEmptyState) {
    dom.libraryEmptyState.hidden = state.playlists.length > 0;
  }
}

function getCurrentPlaylist() {
  return getPlaylistById(state.currentPlaylistId);
}

function renderCurrentPlaylist() {
  const playlist = getCurrentPlaylist();

  if (!dom.currentPlaylist) {
    return;
  }

  dom.currentPlaylist.hidden = !playlist;

  if (!playlist) {
    dom.playlistTracks?.replaceChildren();

    if (dom.emptyLibrary) {
      dom.emptyLibrary.hidden = false;
    }

    return;
  }

  if (dom.currentPlaylistTitle) {
    dom.currentPlaylistTitle.textContent = playlist.name;
  }

  if (dom.currentPlaylistMeta) {
    const count = playlist.tracks.length;

    dom.currentPlaylistMeta.textContent =
      `${count} track${count === 1 ? "" : "s"}`;
  }

  if (dom.playlistTracks) {
    dom.playlistTracks.innerHTML = playlist.tracks
      .map((track, index) => trackRowHTML(track, index, "playlist"))
      .join("");

    attachImageFallbacks(dom.playlistTracks);
  }

  if (dom.emptyLibrary) {
    dom.emptyLibrary.hidden = playlist.tracks.length > 0;
  }
}

function renderLibrary() {
  renderSidebarPlaylists();
  renderLibraryPlaylists();
  renderCurrentPlaylist();
}

function renderStats() {
  const uniqueTracks = new Set();

  for (const playlist of state.playlists) {
    for (const track of playlist.tracks) {
      uniqueTracks.add(track.id);
    }
  }

  if (dom.trackCount) {
    dom.trackCount.textContent = String(uniqueTracks.size);
  }

  if (dom.playlistCount) {
    dom.playlistCount.textContent = String(state.playlists.length);
  }
}

function renderAll() {
  renderSidebarPlaylists();
  renderHomePlaylists();
  renderLibraryPlaylists();
  renderCurrentPlaylist();
  renderStats();
}

/* ---------------- CREATE / EDIT PLAYLIST ---------------- */

function openPlaylistDialog(mode = "create", playlist = null) {
  if (!dom.playlistDialog || !dom.playlistName) {
    const name = window.prompt(
      mode === "rename" ? "Enter the new playlist name:" : "Enter a playlist name:",
      playlist?.name || ""
    );

    if (name !== null) {
      const success = savePlaylistName(name, mode, playlist?.id);

      if (success) {
        renderAll();
      }
    }

    return;
  }

  state.playlistDialogMode = mode;
  state.editingPlaylistId =
    mode === "rename" && playlist ? playlist.id : null;

  if (dom.playlistDialogTitle) {
    dom.playlistDialogTitle.textContent =
      mode === "rename" ? "Rename playlist" : "Create playlist";
  }

  dom.playlistName.value =
    mode === "rename" && playlist ? playlist.name : "";

  if (typeof dom.playlistDialog.showModal === "function") {
    if (!dom.playlistDialog.open) {
      dom.playlistDialog.showModal();
    }
  } else {
    const name = window.prompt(
      mode === "rename" ? "Enter the new playlist name:" : "Enter a playlist name:",
      playlist?.name || ""
    );

    if (name !== null) {
      const success = savePlaylistName(name, mode, playlist?.id);

      if (success) {
        renderAll();
      }
    }
  }

  window.setTimeout(() => dom.playlistName?.focus(), 50);
}

function closePlaylistDialog() {
  if (dom.playlistDialog?.open) {
    dom.playlistDialog.close();
  }
}

function savePlaylistName(name, mode, playlistId = null) {
  name = String(name || "").trim();

  if (!name) {
    notify("Please enter a playlist name.", "error");
    return false;
  }

  if (name.length > 60) {
    notify("Playlist names must be 60 characters or less.", "error");
    return false;
  }

  if (mode === "rename") {
    const playlist = getPlaylistById(playlistId);

    if (!playlist) {
      notify("Playlist not found.", "error");
      return false;
    }

    playlist.name = name;

    saveState();
    renderAll();
    notify("Playlist renamed.", "success");

    return true;
  }

  const playlist = createPlaylistObject(name);

  state.playlists.unshift(playlist);
  state.currentPlaylistId = playlist.id;

  saveState();
  renderAll();
  notify("Playlist created.", "success");

  return true;
}

function deleteCurrentPlaylist() {
  const playlist = getCurrentPlaylist();

  if (!playlist) {
    notify("Select a playlist first.", "error");
    return;
  }

  if (!window.confirm(`Delete "${playlist.name}"? This cannot be undone.`)) {
    return;
  }

  state.playlists = state.playlists.filter(
    item => item.id !== playlist.id
  );

  state.currentPlaylistId = null;

  saveState();
  renderAll();

  notify("Playlist deleted.", "success");
}

function openPlaylist(id) {
  const playlist = getPlaylistById(id);

  if (!playlist) {
    notify("Playlist not found.", "error");
    return;
  }

  state.currentPlaylistId = playlist.id;

  navigate("library");
  renderAll();
}

/* ---------------- ADD TRACK TO PLAYLIST ---------------- */

function addTrackToPlaylist(track) {
  if (!track) {
    return;
  }

  if (!state.playlists.length) {
    if (window.confirm("You don't have any playlists. Create one now?")) {
      openPlaylistDialog("create");
    }

    return;
  }

  const options = state.playlists
    .map((playlist, index) => `${index + 1}. ${playlist.name}`)
    .join("\n");

  const answer = window.prompt(
    `Choose a playlist by number:\n\n${options}\n\nEnter 0 to create a new playlist.`,
    "1"
  );

  if (answer === null) {
    return;
  }

  const selection = Number(answer);

  if (!Number.isInteger(selection)) {
    notify("Enter a valid playlist number.", "error");
    return;
  }

  if (selection === 0) {
    const name = window.prompt("Enter a name for the new playlist:");

    if (!name || !name.trim()) {
      return;
    }

    if (name.trim().length > 60) {
      notify("Playlist names must be 60 characters or less.", "error");
      return;
    }

    const playlist = createPlaylistObject(name.trim());
    playlist.tracks.push(track);

    state.playlists.unshift(playlist);
    state.currentPlaylistId = playlist.id;

    saveState();
    renderAll();

    notify("Playlist created and track added.", "success");
    return;
  }

  if (selection < 1 || selection > state.playlists.length) {
    notify("That playlist number does not exist.", "error");
    return;
  }

  const playlist = state.playlists[selection - 1];

  if (playlist.tracks.some(item => item.id === track.id)) {
    notify("This track is already in that playlist.");
    return;
  }

  playlist.tracks.push(track);
  state.currentPlaylistId = playlist.id;

  saveState();
  renderAll();

  notify(`Added to "${playlist.name}".`, "success");
}

/* ---------------- LIKED SONGS ---------------- */

function getLikedPlaylist() {
  return state.playlists.find(
    playlist => playlist.name.toLowerCase() === "liked songs"
  ) || null;
}

function toggleLikeCurrentTrack() {
  const track = state.currentTrack;

  if (!track) {
    return;
  }

  let playlist = getLikedPlaylist();

  if (!playlist) {
    playlist = createPlaylistObject("Liked Songs");
    state.playlists.unshift(playlist);
  }

  const index = playlist.tracks.findIndex(
    item => item.id === track.id
  );

  if (index >= 0) {
    playlist.tracks.splice(index, 1);
    notify("Removed from Liked Songs.");
  } else {
    playlist.tracks.push(track);
    notify("Added to Liked Songs.", "success");
  }

  saveState();
  renderAll();
  updateLikeButton();
}

function updateLikeButton() {
  if (!dom.playerLikeBtn) {
    return;
  }

  const track = state.currentTrack;

  if (!track) {
    dom.playerLikeBtn.disabled = true;
    dom.playerLikeBtn.classList.remove("liked");
    dom.playerLikeBtn.textContent = "♡";
    return;
  }

  dom.playerLikeBtn.disabled = false;

  const liked = Boolean(
    getLikedPlaylist()?.tracks.some(item => item.id === track.id)
  );

  dom.playerLikeBtn.classList.toggle("liked", liked);
  dom.playerLikeBtn.textContent = liked ? "♥" : "♡";
}

/* ---------------- PLAYBACK ---------------- */

function getTrackCandidates(track) {
  const candidates = [];

  if (Array.isArray(track.streamCandidates)) {
    candidates.push(
      ...track.streamCandidates.map(safeAudioUrl)
    );
  }

  if (track.provider === "audius" && track.sourceId) {
    candidates.push(
      `${AUDIUS_DIRECT_API}/tracks/${encodeURIComponent(track.sourceId)}/stream?app_name=${encodeURIComponent(APP_NAME)}`
    );
  }

  return uniqueStrings(candidates.filter(Boolean));
}

function updatePlayerMetadata(track) {
  if (!track) {
    if (dom.playerTitle) {
      dom.playerTitle.textContent = "Choose a track";
    }

    if (dom.playerArtist) {
      dom.playerArtist.textContent = "HE3AM Music Hub";
    }

    if (dom.playerCoverImage) {
      dom.playerCoverImage.removeAttribute("src");
      dom.playerCoverImage.hidden = true;
    }

    if (dom.playerCoverFallback) {
      dom.playerCoverFallback.hidden = false;
    }

    updateLikeButton();
    return;
  }

  if (dom.playerTitle) {
    dom.playerTitle.textContent = track.title;
  }

  if (dom.playerArtist) {
    dom.playerArtist.textContent = track.artist;
  }

  const artwork = safeImageUrl(track.artwork);

  if (dom.playerCoverImage) {
    if (artwork) {
      dom.playerCoverImage.src = artwork;
      dom.playerCoverImage.hidden = false;

      if (dom.playerCoverFallback) {
        dom.playerCoverFallback.hidden = true;
      }
    } else {
      dom.playerCoverImage.removeAttribute("src");
      dom.playerCoverImage.hidden = true;

      if (dom.playerCoverFallback) {
        dom.playerCoverFallback.hidden = false;
      }
    }
  }

  document.title = `${track.title} — HE3AM`;
  updateLikeButton();
}

function updatePlayPauseButton() {
  if (!dom.playPauseBtn) {
    return;
  }

  const playing = Boolean(
    dom.audio && !dom.audio.paused && !dom.audio.ended
  );

  dom.playPauseBtn.textContent = playing ? "Ⅱ" : "▶";

  dom.playPauseBtn.setAttribute(
    "aria-label",
    playing ? "Pause" : "Play"
  );

  dom.playPauseBtn.title = playing ? "Pause" : "Play";
}

function renderPlaybackState() {
  renderSearchResults();
  renderCurrentPlaylist();
  updatePlayPauseButton();
}

function stopPlaybackAttempt() {
  state.isResolvingPlayback = false;

  if (dom.audio) {
    dom.audio.pause();
  }

  updatePlayPauseButton();
}

function tryNextCandidate(token) {
  if (!isCurrentPlayback(token) || !dom.audio) {
    return;
  }

  if (state.candidateIndex >= state.playbackCandidates.length) {
    state.isResolvingPlayback = false;

    dom.audio.pause();

    updatePlayPauseButton();

    notify(
      "This track could not be played. Try another track or source.",
      "error",
      5000
    );

    return;
  }

  const candidate = state.playbackCandidates[state.candidateIndex];
  state.candidateIndex += 1;

  state.isResolvingPlayback = true;

  /*
   * Keep the token check in every asynchronous callback.
   * This prevents an old track error from skipping a new track.
   */

  dom.audio.pause();
  dom.audio.src = candidate;
  dom.audio.load();

  let settled = false;

  const onError = () => {
    if (settled || !isCurrentPlayback(token)) {
      return;
    }

    settled = true;

    dom.audio.removeEventListener("error", onError);

    tryNextCandidate(token);
  };

  dom.audio.addEventListener("error", onError);

  const playPromise = dom.audio.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        if (!isCurrentPlayback(token)) {
          return;
        }

        if (settled) {
          return;
        }

        settled = true;
        dom.audio.removeEventListener("error", onError);

        state.isResolvingPlayback = false;

        updatePlayPauseButton();
      })
      .catch(error => {
        if (!isCurrentPlayback(token) || settled) {
          return;
        }

        settled = true;
        dom.audio.removeEventListener("error", onError);

        if (error?.name === "NotAllowedError") {
          state.isResolvingPlayback = false;
          updatePlayPauseButton();

          notify(
            "The browser blocked playback. Press Play to try again.",
            "error"
          );

          return;
        }

        console.warn("Playback candidate failed:", error);

        tryNextCandidate(token);
      });
  }
}

function playTrack(track, queue = null, index = -1) {
  if (!track || !dom.audio) {
    notify("This track cannot be played.", "error");
    return;
  }

  const normalizedTrack = normalizeTrack(track);

  if (!normalizedTrack) {
    notify("The track data is invalid.", "error");
    return;
  }

  const candidates = getTrackCandidates(normalizedTrack);

  if (!candidates.length) {
    notify(
      "No playable audio URL was provided for this track.",
      "error"
    );

    return;
  }

  if (Array.isArray(queue)) {
    state.queue = queue
      .map(normalizeTrack)
      .filter(Boolean);

    const requestedIndex = index >= 0
      ? index
      : state.queue.findIndex(item => item.id === normalizedTrack.id);

    state.queueIndex = requestedIndex >= 0 ? requestedIndex : 0;
  } else {
    const existingIndex = state.queue.findIndex(
      item => item.id === normalizedTrack.id
    );

    if (existingIndex >= 0) {
      state.queueIndex = existingIndex;
    } else {
      state.queue = [normalizedTrack];
      state.queueIndex = 0;
    }
  }

  state.currentTrack = normalizedTrack;
  state.playbackToken += 1;

  const token = state.playbackToken;

  state.playbackCandidates = candidates;
  state.candidateIndex = 0;
  state.failedCandidates = new Set();
  state.isResolvingPlayback = true;

  dom.audio.pause();
  dom.audio.removeAttribute("src");

  if (dom.currentTime) {
    dom.currentTime.textContent = "0:00";
  }

  if (dom.duration) {
    dom.duration.textContent = formatTime(normalizedTrack.duration);
  }

  if (dom.progressBar) {
    dom.progressBar.value = "0";
  }

  updatePlayerMetadata(normalizedTrack);
  renderPlaybackState();

  tryNextCandidate(token);
}

function playSearchTrack(index) {
  const tracks = getFilteredSearchResults();
  const track = tracks[index];

  if (!track) {
    return;
  }

  playTrack(track, tracks, index);
}

function playPlaylist(id) {
  const playlist = getPlaylistById(id);

  if (!playlist) {
    notify("Playlist not found.", "error");
    return;
  }

  if (!playlist.tracks.length) {
    notify("This playlist has no tracks yet.");
    return;
  }

  state.currentPlaylistId = playlist.id;

  navigate("library");
  playTrack(playlist.tracks[0], playlist.tracks, 0);

  renderAll();
}

function togglePlayback() {
  if (!dom.audio) {
    return;
  }

  if (!state.currentTrack) {
    if (state.queue.length) {
      playTrack(state.queue[0], state.queue, 0);
    } else {
      notify("Search for a track first.");
    }

    return;
  }

  if (!dom.audio.paused) {
    dom.audio.pause();
    updatePlayPauseButton();
    return;
  }

  /*
   * If there is no loaded source, retry playback from
   * the start of the candidate list.
   */

  if (!dom.audio.currentSrc && state.playbackCandidates.length) {
    state.playbackToken += 1;
    state.candidateIndex = 0;
    state.isResolvingPlayback = true;
    tryNextCandidate(state.playbackToken);
    return;
  }

  const playPromise = dom.audio.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        updatePlayPauseButton();
      })
      .catch(error => {
        console.warn("Playback resume failed:", error);

        if (error?.name === "NotAllowedError") {
          notify("Press Play again to allow playback.", "error");
        } else {
          state.playbackToken += 1;
          state.candidateIndex = 0;
          state.isResolvingPlayback = true;
          tryNextCandidate(state.playbackToken);
        }
      });
  }
}

/* ---------------- NEXT / PREVIOUS ---------------- */

function playQueueIndex(index) {
  if (!state.queue.length) {
    return;
  }

  if (index < 0 || index >= state.queue.length) {
    return;
  }

  state.queueIndex = index;

  playTrack(
    state.queue[index],
    state.queue,
    index
  );
}

function playNext() {
  if (!state.queue.length) {
    notify("Your playback queue is empty.");
    return;
  }

  if (state.shuffle && state.queue.length > 1) {
    let index = state.queueIndex;

    while (index === state.queueIndex) {
      index = Math.floor(Math.random() * state.queue.length);
    }

    playQueueIndex(index);
    return;
  }

  const nextIndex = state.queueIndex + 1;

  if (nextIndex < state.queue.length) {
    playQueueIndex(nextIndex);
    return;
  }

  if (state.repeat === "all") {
    playQueueIndex(0);
    return;
  }

  /*
   * Repeat-one is handled by the audio ended event.
   * Pressing Next should still move forward when possible.
   */

  if (state.repeat === "one" && state.currentTrack) {
    playTrack(state.currentTrack, state.queue, state.queueIndex);
    return;
  }

  dom.audio?.pause();

  if (dom.audio) {
    dom.audio.currentTime = 0;
  }

  updatePlayPauseButton();
}

function playPrevious() {
  if (!state.queue.length) {
    return;
  }

  if (dom.audio && dom.audio.currentTime > 3) {
    dom.audio.currentTime = 0;
    return;
  }

  let index = state.queueIndex - 1;

  if (index < 0) {
    index = state.repeat === "all"
      ? state.queue.length - 1
      : 0;
  }

  playQueueIndex(index);
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;

  dom.shuffleBtn?.classList.toggle("active", state.shuffle);

  dom.shuffleBtn?.setAttribute(
    "aria-pressed",
    String(state.shuffle)
  );

  saveState();

  notify(
    state.shuffle ? "Shuffle enabled." : "Shuffle disabled."
  );
}

function cycleRepeat() {
  const modes = ["off", "all", "one"];
  const index = modes.indexOf(state.repeat);

  state.repeat = modes[(index + 1) % modes.length];

  updateRepeatButton();
  saveState();

  const labels = {
    off: "Repeat off",
    all: "Repeat all",
    one: "Repeat one"
  };

  notify(labels[state.repeat]);
}

function updateRepeatButton() {
  if (!dom.repeatBtn) {
    return;
  }

  dom.repeatBtn.classList.toggle(
    "active",
    state.repeat !== "off"
  );

  dom.repeatBtn.textContent =
    state.repeat === "one" ? "↻¹" : "↻";

  dom.repeatBtn.title =
    state.repeat === "one"
      ? "Repeat one"
      : state.repeat === "all"
        ? "Repeat all"
        : "Repeat off";

  dom.repeatBtn.setAttribute(
    "aria-label",
    dom.repeatBtn.title
  );

  dom.repeatBtn.setAttribute(
    "aria-pressed",
    String(state.repeat !== "off")
  );
}

/* ---------------- AUDIO EVENTS ---------------- */

function setupAudioEvents() {
  if (!dom.audio) {
    console.error("Audio element is missing.");
    return;
  }

  dom.audio.preload = "metadata";
  dom.audio.volume = clamp(
    Number(dom.audio.volume) || DEFAULT_VOLUME,
    0,
    1
  );

  dom.audio.addEventListener("play", () => {
    updatePlayPauseButton();
    renderPlaybackState();
  });

  dom.audio.addEventListener("pause", () => {
    updatePlayPauseButton();
    renderPlaybackState();
  });

  dom.audio.addEventListener("loadedmetadata", () => {
    if (dom.duration && Number.isFinite(dom.audio.duration)) {
      dom.duration.textContent = formatTime(dom.audio.duration);
    }
  });

  dom.audio.addEventListener("timeupdate", () => {
    const duration = dom.audio.duration;

    if (dom.currentTime) {
      dom.currentTime.textContent = formatTime(dom.audio.currentTime);
    }

    if (dom.duration && Number.isFinite(duration)) {
      dom.duration.textContent = formatTime(duration);
    }

    if (dom.progressBar && Number.isFinite(duration) && duration > 0) {
      const progress = dom.audio.currentTime / duration;

      dom.progressBar.value = String(
        Math.round(clamp(progress, 0, 1) * 1000)
      );
    }
  });

  dom.audio.addEventListener("ended", () => {
    if (state.repeat === "one") {
      dom.audio.currentTime = 0;

      const promise = dom.audio.play();

      if (promise && typeof promise.catch === "function") {
        promise.catch(error => {
          console.warn("Repeat playback failed:", error);
          updatePlayPauseButton();
        });
      }

      return;
    }

    const hasNext = state.queueIndex < state.queue.length - 1;

    if (state.shuffle && state.queue.length > 1) {
      playNext();
      return;
    }

    if (hasNext || state.repeat === "all") {
      playNext();
    } else {
      updatePlayPauseButton();
    }
  });

  /*
   * Candidate errors are handled inside tryNextCandidate().
   * This listener is only a safety net for errors occurring
   * after a source has already started playing.
   */

  dom.audio.addEventListener("error", () => {
    if (!state.currentTrack || state.isResolvingPlayback) {
      return;
    }

    console.warn("Audio source failed:", dom.audio.error);
    updatePlayPauseButton();
  });

  if (dom.progressBar) {
    dom.progressBar.addEventListener("input", () => {
      const duration = dom.audio.duration;

      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      const ratio = Number(dom.progressBar.value) / 1000;

      dom.audio.currentTime = clamp(ratio, 0, 1) * duration;
    });
  }

  if (dom.volume) {
    dom.volume.addEventListener("input", () => {
      const volume = clamp(Number(dom.volume.value), 0, 1);

      dom.audio.volume = volume;
      saveState();
    });
  }
}

/* ---------------- THEME ---------------- */

function applyTheme() {
  const light = state.theme === "light";

  dom.body?.classList.toggle("light-theme", light);

  if (dom.themeIcon) {
    dom.themeIcon.textContent = light ? "☾" : "☼";
  }

  if (dom.themeLabel) {
    dom.themeLabel.textContent = light ? "Dark theme" : "Light theme";
  }

  dom.themeToggle?.setAttribute(
    "aria-label",
    light ? "Switch to dark theme" : "Switch to light theme"
  );
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";

  applyTheme();
  saveState();
}

/* ---------------- BACKUP EXPORT ---------------- */

function exportBackup() {
  const backup = {
    app: APP_NAME,
    version: 3,
    exportedAt: new Date().toISOString(),
    playlists: state.playlists,
    theme: state.theme,
    volume: dom.audio?.volume ?? DEFAULT_VOLUME,
    shuffle: state.shuffle,
    repeat: state.repeat
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download =
    `he3am-backup-${new Date().toISOString().slice(0, 10)}.json`;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  notify("Backup exported.", "success");
}

/* ---------------- BACKUP IMPORT ---------------- */

async function importBackup(file) {
  if (!file) {
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    notify("Backup file is too large.", "error");
    return;
  }

  try {
    const content = await file.text();
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid backup file.");
    }

    if (!Array.isArray(parsed.playlists)) {
      throw new Error("The backup has no playlist data.");
    }

    if (!window.confirm(
      "Import this backup? Your current playlists will be replaced."
    )) {
      return;
    }

    state.playlists = parsed.playlists
      .map(normalizePlaylist)
      .filter(Boolean);

    state.currentPlaylistId = null;

    if (parsed.theme === "light" || parsed.theme === "dark") {
      state.theme = parsed.theme;
    }

    if (typeof parsed.volume === "number" && dom.audio) {
      dom.audio.volume = clamp(parsed.volume, 0, 1);

      if (dom.volume) {
        dom.volume.value = String(dom.audio.volume);
      }
    }

    if (typeof parsed.shuffle === "boolean") {
      state.shuffle = parsed.shuffle;
    }

    if (["off", "all", "one"].includes(parsed.repeat)) {
      state.repeat = parsed.repeat;
    }

    applyTheme();
    updateRepeatButton();

    dom.shuffleBtn?.classList.toggle("active", state.shuffle);

    saveState();
    renderAll();

    notify("Backup imported successfully.", "success");
  } catch (error) {
    console.error("Backup import failed:", error);

    notify(
      `Import failed: ${getErrorMessage(error)}`,
      "error",
      5000
    );
  } finally {
    if (dom.importFile) {
      dom.importFile.value = "";
    }
  }
}

/* ---------------- NAVIGATION EVENTS ---------------- */

function setupNavigationEvents() {
  dom.navItems.forEach(button => {
    button.addEventListener("click", () => {
      navigate(button.dataset.view);
    });
  });

  byId("brandHome")?.addEventListener("click", event => {
    event.preventDefault();
    navigate("home");
  });

  byId("backToTop")?.addEventListener("click", () => {
    navigate("home");
  });

  byId("forwardToSearch")?.addEventListener("click", () => {
    navigate("search");
    dom.searchInput?.focus();
  });

  byId("heroSearchBtn")?.addEventListener("click", () => {
    navigate("search");
    dom.searchInput?.focus();
  });

  byId("viewLibraryBtn")?.addEventListener("click", () => {
    navigate("library");
  });

  byId("browseSearchBtn")?.addEventListener("click", () => {
    navigate("search");
    dom.searchInput?.focus();
  });

  byId("emptySearchBtn")?.addEventListener("click", () => {
    navigate("search");
    dom.searchInput?.focus();
  });

  $$("[data-query]").forEach(button => {
    button.addEventListener("click", () => {
      performSearch(button.dataset.query);
    });
  });
}

/* ---------------- SEARCH EVENTS ---------------- */

function setupSearchEvents() {
  dom.searchForm?.addEventListener("submit", event => {
    event.preventDefault();
    performSearch(dom.searchInput?.value || "");
  });

  dom.providerFilter?.addEventListener("change", () => {
    if (!state.lastSearchQuery) {
      renderSearchResults();
      return;
    }

    /*
     * Update the provider selection and search again.
     * The request ID prevents an older request from overwriting
     * the newer results.
     */

    performSearch(state.lastSearchQuery);
  });

  dom.onlineResults?.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const index = Number(button.dataset.index);

    if (!Number.isInteger(index)) {
      return;
    }

    const tracks = getFilteredSearchResults();
    const track = tracks[index];

    if (!track) {
      return;
    }

    if (button.dataset.action === "play") {
      playTrack(track, tracks, index);
    } else if (button.dataset.action === "add") {
      addTrackToPlaylist(track);
    }
  });
}

/* ---------------- PLAYLIST EVENTS ---------------- */

function setupPlaylistEvents() {
  byId("newPlaylistBtn")?.addEventListener("click", () => {
    openPlaylistDialog("create");
  });

  byId("libraryNewPlaylistBtn")?.addEventListener("click", () => {
    openPlaylistDialog("create");
  });

  $$("[data-create-playlist]").forEach(button => {
    button.addEventListener("click", () => {
      openPlaylistDialog("create");
    });
  });

  byId("cancelPlaylistBtn")?.addEventListener("click", closePlaylistDialog);
  byId("cancelPlaylistBtnBottom")?.addEventListener("click", closePlaylistDialog);

  dom.playlistDialog?.addEventListener("click", event => {
    if (event.target === dom.playlistDialog) {
      closePlaylistDialog();
    }
  });

  dom.playlistForm?.addEventListener("submit", event => {
    event.preventDefault();

    const success = savePlaylistName(
      dom.playlistName?.value || "",
      state.playlistDialogMode,
      state.editingPlaylistId
    );

    if (success) {
      closePlaylistDialog();
    }
  });

  dom.sidebarPlaylists?.addEventListener("click", event => {
    const button = event.target.closest("[data-open-playlist]");

    if (button) {
      openPlaylist(button.dataset.openPlaylist);
    }
  });

  function handlePlaylistCardAction(event) {
    const button = event.target.closest("[data-playlist-action]");

    if (!button) {
      return;
    }

    event.stopPropagation();

    const id = button.dataset.playlistId;

    if (button.dataset.playlistAction === "open") {
      openPlaylist(id);
    } else if (button.dataset.playlistAction === "play") {
      playPlaylist(id);
    }
  }

  dom.homePlaylists?.addEventListener("click", handlePlaylistCardAction);
  dom.libraryPlaylistGrid?.addEventListener("click", handlePlaylistCardAction);

  function handlePlaylistCardKeyboard(event) {
    const target = event.target.closest("[data-playlist-action='open']");

    if (
      target &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      openPlaylist(target.dataset.playlistId);
    }
  }

  dom.homePlaylists?.addEventListener("keydown", handlePlaylistCardKeyboard);
  dom.libraryPlaylistGrid?.addEventListener("keydown", handlePlaylistCardKeyboard);

  byId("playPlaylistBtn")?.addEventListener("click", () => {
    if (state.currentPlaylistId) {
      playPlaylist(state.currentPlaylistId);
    }
  });

  byId("renamePlaylistBtn")?.addEventListener("click", () => {
    const playlist = getCurrentPlaylist();

    if (playlist) {
      openPlaylistDialog("rename", playlist);
    }
  });

  byId("deletePlaylistBtn")?.addEventListener("click", deleteCurrentPlaylist);

  dom.playlistTracks?.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const playlist = getCurrentPlaylist();

    if (!playlist) {
      return;
    }

    const index = Number(button.dataset.index);
    const track = playlist.tracks[index];

    if (!track) {
      return;
    }

    if (button.dataset.action === "play") {
      playTrack(track, playlist.tracks, index);
    } else if (button.dataset.action === "add") {
      addTrackToPlaylist(track);
    }
  });
}

/* ---------------- PLAYER EVENTS ---------------- */

function setupPlayerEvents() {
  dom.playPauseBtn?.addEventListener("click", togglePlayback);
  dom.nextTrack?.addEventListener("click", playNext);
  dom.previousTrack?.addEventListener("click", playPrevious);
  dom.shuffleBtn?.addEventListener("click", toggleShuffle);
  dom.repeatBtn?.addEventListener("click", cycleRepeat);
  dom.playerLikeBtn?.addEventListener("click", toggleLikeCurrentTrack);
}

/* ---------------- THEME EVENTS ---------------- */

function setupThemeEvents() {
  dom.themeToggle?.addEventListener("click", toggleTheme);
}

/* ---------------- BACKUP EVENTS ---------------- */

function setupBackupEvents() {
  byId("exportBtn")?.addEventListener("click", exportBackup);

  byId("importBtn")?.addEventListener("click", () => {
    dom.importFile?.click();
  });

  dom.importFile?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    if (file) {
      importBackup(file);
    }
  });
}

/* ---------------- INITIALIZATION ---------------- */

function initializePlayer() {
  if (!dom.audio) {
    console.error(
      'HE3AM: Audio element with id="audioPlayer" was not found.'
    );

    notify("The audio player is missing from the HTML.", "error");
    return;
  }

  dom.audio.preload = "metadata";

  setupAudioEvents();
}

function initializeApp() {
  if (state.destroyed) {
    return;
  }

  loadState();

  if (dom.audio && !Number.isFinite(dom.audio.volume)) {
    dom.audio.volume = DEFAULT_VOLUME;
  }

  if (dom.volume && dom.audio) {
    dom.volume.value = String(dom.audio.volume);
  }

  applyTheme();

  initializePlayer();

  setupNavigationEvents();
  setupSearchEvents();
  setupPlaylistEvents();
  setupPlayerEvents();
  setupThemeEvents();
  setupBackupEvents();

  updateRepeatButton();

  dom.shuffleBtn?.classList.toggle("active", state.shuffle);

  dom.shuffleBtn?.setAttribute(
    "aria-pressed",
    String(state.shuffle)
  );

  renderAll();
  updatePlayerMetadata(state.currentTrack);
  updatePlayPauseButton();

  /*
   * Ensure the initial page matches the active view.
   */

  navigate(state.activeView);

  console.info("HE3AM Music Hub initialized.");
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeApp,
    { once: true }
  );
} else {
  initializeApp();
}
