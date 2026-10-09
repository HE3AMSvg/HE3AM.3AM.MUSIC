/* ======================================================
   HE3AM MUSIC HUB
   Search, playback, playlists, themes and backup
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
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

function byId(id) {
  return document.getElementById(id);
}

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

  queue: [],
  queueIndex: -1,

  currentTrack: null,

  shuffle: false,

  repeat: "off",

  theme: "dark",

  loadingSearch: false,

  searchRequestId: 0,

  playlistDialogMode: "create",

  editingPlaylistId: null,

  playbackToken: 0,

  candidateIndex: 0,

  playbackCandidates: [],

  isResolvingPlayback: false
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
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function safeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const parsed = new URL(value, window.location.href);

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

function safeAudioUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const parsed = new URL(value, window.location.href);

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function normalizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();

  return text || fallback;
}

function getErrorMessage(error) {
  if (!error) {
    return "An unknown error occurred.";
  }

  if (error.name === "AbortError") {
    return "The request took too long. Please try again.";
  }

  return error.message || "Something went wrong.";
}

/* ---------------- NOTIFICATIONS ---------------- */

function notify(message, type = "info", timeout = 3200) {
  if (!dom.messageRegion) {
    return;
  }

  const toast = document.createElement("div");

  toast.className = `toast ${type}`;

  const icon = document.createElement("span");

  icon.className = "toast-icon";

  icon.textContent =
    type === "error"
      ? "!"
      : type === "success"
        ? "✓"
        : "•";

  const text = document.createElement("span");

  text.textContent = String(message);

  toast.append(icon, text);

  dom.messageRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, timeout);
}

/* ---------------- API ---------------- */

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();

  const timeout = window.setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT);

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
    payload.data?.tracks
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
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
      artwork["150x150"] ||
      artwork["1000x1000"] ||
      ""
    );
  }

  return "";
}

function normalizeAudiusTrack(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  const id = String(track.id ?? "");

  const title = normalizeText(track.title);

  if (!id || !title) {
    return null;
  }

  const artist = normalizeText(
    track.user?.name ||
    track.user?.handle ||
    track.artist ||
    track.artist_name,
    "Unknown artist"
  );

  const suppliedStream = safeAudioUrl(
    track.stream_url ||
    track.stream ||
    track.audio_url
  );

  const streamCandidates = [];

  if (suppliedStream) {
    streamCandidates.push(suppliedStream);
  }

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

    duration:
      Number.isFinite(duration) && duration > 0
        ? duration
        : 0,

    permalink: safeImageUrl(track.permalink),

    streamCandidates: uniqueStrings(streamCandidates)
  };
}

function normalizeJamendoTrack(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  const id = String(track.id ?? "");

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

    duration:
      Number.isFinite(duration) && duration > 0
        ? duration
        : 0,

    permalink: safeImageUrl(track.shareurl || track.permalink),

    streamCandidates: uniqueStrings(streamCandidates)
  };
}

function normalizeTrack(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  const provider = String(
    track.provider ||
    track.source ||
    ""
  ).toLowerCase();

  if (provider === "audius") {
    return normalizeAudiusTrack(track);
  }

  if (provider === "jamendo") {
    return normalizeJamendoTrack(track);
  }

  if (String(track.id || "").startsWith("audius:")) {
    return {
      ...track,
      id: String(track.id),
      provider: "audius",
      streamCandidates: uniqueStrings(
        (track.streamCandidates || []).map(safeAudioUrl)
      )
    };
  }

  if (String(track.id || "").startsWith("jamendo:")) {
    return {
      ...track,
      id: String(track.id),
      provider: "jamendo",
      streamCandidates: uniqueStrings(
        (track.streamCandidates || []).map(safeAudioUrl)
      )
    };
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
      return tracks;
    }
  } catch (error) {
    errors.push(error);
  }

  /*
    Direct Audius search is a fallback.
    It depends on Audius availability and browser CORS support.
  */

  const directURL = buildQueryURL(
    AUDIUS_DIRECT_API,
    "/tracks/search",
    query
  );

  const url = new URL(directURL);

  url.searchParams.set("app_name", APP_NAME);
  url.searchParams.set("limit", String(MAX_SEARCH_RESULTS));

  try {
    const payload = await fetchJSON(url.href);

    const tracks = unwrapCollection(payload)
      .map(normalizeAudiusTrack)
      .filter(Boolean);

    if (tracks.length) {
      return tracks;
    }

    return [];
  } catch (error) {
    errors.push(error);

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
    .filter(Boolean);
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
        ? errors.join(" ")
        : "No tracks were found."
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
      dom.providerFilter?.value || "all",
      query
    );

    if (requestId !== state.searchRequestId) {
      return;
    }

    const deduplicated = new Map();

    for (const track of tracks) {
      if (!track?.id) {
        continue;
      }

      if (!deduplicated.has(track.id)) {
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

  const isPlaying =
    state.currentTrack?.id === track.id;

  const title = escapeHTML(track.title);
  const artist = escapeHTML(track.artist);

  const provider = escapeHTML(
    String(track.provider || "music").toUpperCase()
  );

  const cover = artwork
    ? `
      <img
        src="${escapeHTML(artwork)}"
        alt=""
        loading="lazy"
        data-cover-image
      >
    `
    : `
      <span class="track-cover-symbol">♫</span>
    `;

  return `
    <article
      class="track-row ${isPlaying ? "is-playing" : ""}"
      data-track-row="${index}"
    >

      <div class="track-cover">
        ${cover}
      </div>

      <div class="track-info">

        <span class="track-title" title="${title}">
          ${title}
        </span>

        <span class="track-artist">
          ${artist}
        </span>

        <span class="track-provider">
          ${provider}
        </span>

      </div>

      <div class="track-actions">

        <button
          class="track-action track-play-button"
          type="button"
          data-action="play"
          data-index="${index}"
          data-context="${context}"
          aria-label="Play ${title}"
          title="Play"
        >
          ${isPlaying && !dom.audio?.paused ? "Ⅱ" : "▶"}
        </button>

        <button
          class="track-action"
          type="button"
          data-action="add"
          data-index="${index}"
          data-context="${context}"
          aria-label="Add ${title} to playlist"
          title="Add to playlist"
        >
          +
        </button>

      </div>

    </article>
  `;
}

function attachImageFallbacks(root) {
  $$("[data-cover-image]", root).forEach(image => {
    image.addEventListener("error", () => {
      const cover = image.closest(".track-cover");

      if (cover) {
        image.remove();

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
    .map((track, index) =>
      trackRowHTML(track, index, "search")
    )
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
    }
  }

  dom.navItems.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
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
    name,
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
    ? playlist.tracks
        .map(normalizeTrack)
        .filter(Boolean)
    : [];

  const deduplicated = new Map();

  for (const track of tracks) {
    deduplicated.set(track.id, track);
  }

  return {
    id: String(playlist.id || createId()),
    name: name.slice(0, 60),
    tracks: Array.from(deduplicated.values()),
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

    notify(
      "Browser storage is unavailable. Changes may not be saved.",
      "error"
    );

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

    if (
      parsed.theme === "light" ||
      parsed.theme === "dark"
    ) {
      state.theme = parsed.theme;
    }

    if (typeof parsed.volume === "number") {
      if (dom.audio) {
        dom.audio.volume = Math.min(
          1,
          Math.max(0, parsed.volume)
        );
      }

      if (dom.volume) {
        dom.volume.value = String(
          Math.min(1, Math.max(0, parsed.volume))
        );
      }
    }

    if (typeof parsed.shuffle === "boolean") {
      state.shuffle = parsed.shuffle;
    }

    if (
      parsed.repeat === "off" ||
      parsed.repeat === "all" ||
      parsed.repeat === "one"
    ) {
      state.repeat = parsed.repeat;
    }
  } catch (error) {
    console.error("Could not restore the saved state.", error);

    notify(
      "Saved data could not be read. Your old backup may still be usable.",
      "error"
    );
  }
}

function saveState() {
  const payload = {
    version: 2,

    playlists: state.playlists,

    theme: state.theme,

    volume: dom.audio?.volume ?? DEFAULT_VOLUME,

    shuffle: state.shuffle,

    repeat: state.repeat,

    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch (error) {
    console.error("Could not save state.", error);

    notify(
      "Could not save data. Browser storage may be full.",
      "error"
    );
  }
}

/* ---------------- PLAYLIST RENDERING ---------------- */

function renderSidebarPlaylists() {
  if (!dom.sidebarPlaylists) {
    return;
  }

  dom.sidebarPlaylists.innerHTML = state.playlists
    .map(playlist => `
      <button
        class="sidebar-playlist ${
          state.currentPlaylistId === playlist.id ? "active" : ""
        }"
        type="button"
        data-open-playlist="${escapeHTML(playlist.id)}"
        title="${escapeHTML(playlist.name)}"
      >

        <span class="sidebar-playlist-icon">♫</span>

        <span class="sidebar-playlist-name">
          ${escapeHTML(playlist.name)}
        </span>

      </button>
    `)
    .join("");
}

function playlistCardHTML(playlist) {
  return `
    <article
      class="playlist-card"
      data-playlist-card="${escapeHTML(playlist.id)}"
    >

      <div
        class="playlist-card-art"
        data-playlist-action="open"
        data-playlist-id="${escapeHTML(playlist.id)}"
        role="button"
        tabindex="0"
        aria-label="Open ${escapeHTML(playlist.name)}"
      >
        <span>♫</span>
      </div>

      <div class="playlist-card-title">
        ${escapeHTML(playlist.name)}
      </div>

      <div class="playlist-card-meta">
        ${playlist.tracks.length}
        track${playlist.tracks.length === 1 ? "" : "s"}
      </div>

      <div class="playlist-card-actions">

        <button
          class="primary-button"
          type="button"
          data-playlist-action="play"
          data-playlist-id="${escapeHTML(playlist.id)}"
        >
          ▶ Play
        </button>

        <button
          class="secondary-button"
          type="button"
          data-playlist-action="open"
          data-playlist-id="${escapeHTML(playlist.id)}"
        >
          Open
        </button>

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
    dom.homePlaylistsEmpty.hidden =
      state.playlists.length > 0;
  }
}

function renderLibraryPlaylists() {
  if (dom.libraryPlaylistGrid) {
    dom.libraryPlaylistGrid.innerHTML =
      state.playlists.map(playlistCardHTML).join("");
  }

  if (dom.libraryEmptyState) {
    dom.libraryEmptyState.hidden =
      state.playlists.length > 0;
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
    if (dom.playlistTracks) {
      dom.playlistTracks.replaceChildren();
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
      .map((track, index) =>
        trackRowHTML(track, index, "playlist")
      )
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
    dom.trackCount.textContent =
      String(uniqueTracks.size);
  }

  if (dom.playlistCount) {
    dom.playlistCount.textContent =
      String(state.playlists.length);
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
    return;
  }

  state.playlistDialogMode = mode;

  state.editingPlaylistId =
    mode === "rename" && playlist
      ? playlist.id
      : null;

  if (dom.playlistDialogTitle) {
    dom.playlistDialogTitle.textContent =
      mode === "rename"
        ? "Rename playlist"
        : "Create playlist";
  }

  dom.playlistName.value =
    mode === "rename" && playlist
      ? playlist.name
      : "";

  if (typeof dom.playlistDialog.showModal === "function") {
    if (!dom.playlistDialog.open) {
      dom.playlistDialog.showModal();
    }
  } else {
    const name = window.prompt(
      mode === "rename"
        ? "Enter the new playlist name:"
        : "Enter a playlist name:",
      playlist?.name || ""
    );

    if (name !== null) {
      savePlaylistName(name, mode, playlist?.id);
    }
  }

  window.setTimeout(() => {
    dom.playlistName?.focus();
  }, 50);
}

function closePlaylistDialog() {
  if (
    dom.playlistDialog &&
    dom.playlistDialog.open
  ) {
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

  const confirmed = window.confirm(
    `Delete "${playlist.name}"? This cannot be undone.`
  );

  if (!confirmed) {
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
    const create = window.confirm(
      "You don't have any playlists. Create one now?"
    );

    if (create) {
      openPlaylistDialog("create");
    }

    return;
  }

  const options = state.playlists
    .map((playlist, index) =>
      `${index + 1}. ${playlist.name}`
    )
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

  const alreadyExists = playlist.tracks.some(
    item => item.id === track.id
  );

  if (alreadyExists) {
    notify("This track is already in that playlist.");
    return;
  }

  playlist.tracks.push(track);

  state.currentPlaylistId = playlist.id;

  saveState();
  renderAll();

  notify(`Added to "${playlist.name}".`, "success");
}

/* ---------------- LIKE TRACK ---------------- */

function getLikedPlaylist() {
  return state.playlists.find(
    playlist => playlist.name === "Liked Songs"
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

  const playlist = getLikedPlaylist();

  const liked = Boolean(
    playlist?.tracks.some(item => item.id === track.id)
  );

  dom.playerLikeBtn.classList.toggle("liked", liked);

  dom.playerLikeBtn.textContent =
    liked ? "♥" : "♡";
}

/* ---------------- PLAYBACK CANDIDATES ---------------- */

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

  return uniqueStrings(
    candidates.filter(Boolean)
  );
}

function updatePlayerMetadata(track) {
  if (!track) {
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
    dom.audio &&
    !dom.audio.paused &&
    !dom.audio.ended
  );

  dom.playPauseBtn.textContent =
    playing ? "Ⅱ" : "▶";

  dom.playPauseBtn.setAttribute(
    "aria-label",
    playing ? "Pause" : "Play"
  );

  dom.playPauseBtn.title =
    playing ? "Pause" : "Play";
}

function renderPlaybackState() {
  renderSearchResults();

  renderCurrentPlaylist();

  updatePlayPauseButton();
}

function updatePlaybackCandidates() {
  if (!dom.audio) {
    return;
  }

  if (
    state.candidateIndex >=
    state.playbackCandidates.length
  ) {
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

  const candidate =
    state.playbackCandidates[state.candidateIndex];

  state.candidateIndex += 1;

  state.isResolvingPlayback = true;

  dom.audio.src = candidate;

  try {
    dom.audio.load();
  } catch (error) {
    console.warn("Audio load failed.", error);
  }

  const token = state.playbackToken;

  const playPromise = dom.audio.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        if (token !== state.playbackToken) {
          return;
        }

        state.isResolvingPlayback = false;

        updatePlayPauseButton();
      })
      .catch(error => {
        if (token !== state.playbackToken) {
          return;
        }

        /*
          A browser may reject playback before the media
          error event. Move to the next candidate.
        */

        console.warn("Playback candidate failed.", error);

        if (
          error.name === "NotAllowedError"
        ) {
          state.isResolvingPlayback = false;

          updatePlayPauseButton();

          notify(
            "Playback was blocked by the browser. Press Play to try again.",
            "error"
          );

          return;
        }

        updatePlaybackCandidates();
      });
  }
}

function playTrack(track, queue = null, index = -1) {
  if (!track || !dom.audio) {
    notify("This track cannot be played.", "error");
    return;
  }

  const candidates = getTrackCandidates(track);

  if (!candidates.length) {
    notify(
      "No playable audio URL was provided for this track.",
      "error"
    );

    return;
  }

  if (Array.isArray(queue)) {
    state.queue = queue.slice();

    state.queueIndex =
      index >= 0 ? index : state.queue.findIndex(
        item => item.id === track.id
      );
  } else {
    const currentQueueIndex = state.queue.findIndex(
      item => item.id === track.id
    );

    if (currentQueueIndex >= 0) {
      state.queueIndex = currentQueueIndex;
    } else {
      state.queue = [track];
      state.queueIndex = 0;
    }
  }

  state.currentTrack = track;

  state.playbackToken += 1;

  state.playbackCandidates = candidates;
  state.candidateIndex = 0;
  state.isResolvingPlayback = true;

  dom.audio.pause();

  dom.audio.removeAttribute("src");

  updatePlayerMetadata(track);

  updatePlaybackCandidates();

  renderPlaybackState();
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
      playTrack(
        state.queue[0],
        state.queue,
        0
      );
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

  const playPromise = dom.audio.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(updatePlayPauseButton)
      .catch(error => {
        console.warn("Playback resume failed.", error);

        notify(
          "This track could not resume. Try selecting it again.",
          "error"
        );
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
      index = Math.floor(
        Math.random() * state.queue.length
      );
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

  if (state.repeat === "one" && state.currentTrack) {
    playTrack(
      state.currentTrack,
      state.queue,
      state.queueIndex
    );

    return;
  }

  dom.audio.pause();

  dom.audio.currentTime = 0;

  updatePlayPauseButton();
}

function playPrevious() {
  if (!state.queue.length) {
    return;
  }

  if (
    dom.audio &&
    dom.audio.currentTime > 3
  ) {
    dom.audio.currentTime = 0;
    return;
  }

  let index = state.queueIndex - 1;

  if (index < 0) {
    if (state.repeat === "all") {
      index = state.queue.length - 1;
    } else {
      index = 0;
    }
  }

  playQueueIndex(index);
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;

  dom.shuffleBtn?.classList.toggle(
    "active",
    state.shuffle
  );

  saveState();

  notify(
    state.shuffle
      ? "Shuffle enabled."
      : "Shuffle disabled."
  );
}

function cycleRepeat() {
  const modes = ["off", "all", "one"];

  const index = modes.indexOf(state.repeat);

  state.repeat = modes[
    (index + 1) % modes.length
  ];

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
    state.repeat === "one"
      ? "↻¹"
      : "↻";

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
}

/* ---------------- AUDIO EVENTS ---------------- */

function setupAudioEvents() {
  if (!dom.audio) {
    return;
  }

  dom.audio.preload = "metadata";

  dom.audio.volume = DEFAULT_VOLUME;

  dom.audio.addEventListener("play", () => {
    updatePlayPauseButton();
    renderPlaybackState();
  });

  dom.audio.addEventListener("pause", () => {
    updatePlayPauseButton();
    renderPlaybackState();
  });

  dom.audio.addEventListener("loadedmetadata", () => {
    if (dom.duration) {
      dom.duration.textContent = formatTime(
        dom.audio.duration
      );
    }
  });

  dom.audio.addEventListener("timeupdate", () => {
    if (!Number.isFinite(dom.audio.duration)) {
      return;
    }

    if (dom.currentTime) {
      dom.currentTime.textContent = formatTime(
        dom.audio.currentTime
      );
    }

    if (dom.duration) {
      dom.duration.textContent = formatTime(
        dom.audio.duration
      );
    }

    if (dom.progressBar) {
      const progress =
        dom.audio.duration > 0
          ? dom.audio.currentTime / dom.audio.duration
          : 0;

      dom.progressBar.value = String(
        Math.round(progress * 1000)
      );
    }
  });

  dom.audio.addEventListener("ended", () => {
    if (state.repeat === "one") {
      dom.audio.currentTime = 0;

      dom.audio.play().catch(error => {
        console.warn("Repeat playback failed.", error);
      });

      return;
    }

    const hasNext =
      state.queueIndex < state.queue.length - 1;

    if (hasNext || state.repeat === "all") {
      playNext();
    } else {
      updatePlayPauseButton();
    }
  });

  dom.audio.addEventListener("error", () => {
    if (!state.currentTrack) {
      return;
    }

    if (state.isResolvingPlayback) {
      updatePlaybackCandidates();
      return;
    }

    console.warn(
      "Audio source failed:",
      dom.audio.error
    );

    notify(
      "The audio source failed. Try another track.",
      "error",
      5000
    );

    updatePlayPauseButton();
  });

  if (dom.progressBar) {
    dom.progressBar.addEventListener("input", () => {
      const duration = dom.audio.duration;

      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      const ratio =
        Number(dom.progressBar.value) / 1000;

      dom.audio.currentTime = Math.max(
        0,
        Math.min(duration, duration * ratio)
      );
    });
  }

  if (dom.volume) {
    dom.volume.addEventListener("input", () => {
      dom.audio.volume = Math.min(
        1,
        Math.max(0, Number(dom.volume.value))
      );

      saveState();
    });
  }
}

/* ---------------- THEME ---------------- */

function applyTheme() {
  const light = state.theme === "light";

  dom.body.classList.toggle(
    "light-theme",
    light
  );

  if (dom.themeIcon) {
    dom.themeIcon.textContent =
      light ? "☾" : "☼";
  }

  if (dom.themeLabel) {
    dom.themeLabel.textContent =
      light ? "Dark theme" : "Light theme";
  }

  dom.themeToggle?.setAttribute(
    "aria-label",
    light ? "Switch to dark theme" : "Switch to light theme"
  );
}

function toggleTheme() {
  state.theme =
    state.theme === "dark"
      ? "light"
      : "dark";

  applyTheme();
  saveState();
}

/* ---------------- BACKUP EXPORT ---------------- */

function exportBackup() {
  const backup = {
    app: APP_NAME,

    version: 2,

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

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

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
    const text = await file.text();

    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid backup file.");
    }

    if (!Array.isArray(parsed.playlists)) {
      throw new Error("The backup has no playlist data.");
    }

    const confirmed = window.confirm(
      "Import this backup? Your current playlists will be replaced."
    );

    if (!confirmed) {
      return;
    }

    state.playlists = parsed.playlists
      .map(normalizePlaylist)
      .filter(Boolean);

    state.currentPlaylistId = null;

    if (
      parsed.theme === "light" ||
      parsed.theme === "dark"
    ) {
      state.theme = parsed.theme;
    }

    if (typeof parsed.volume === "number" && dom.audio) {
      dom.audio.volume = Math.max(
        0,
        Math.min(1, parsed.volume)
      );

      if (dom.volume) {
        dom.volume.value = String(dom.audio.volume);
      }
    }

    if (typeof parsed.shuffle === "boolean") {
      state.shuffle = parsed.shuffle;
    }

    if (
      parsed.repeat === "off" ||
      parsed.repeat === "all" ||
      parsed.repeat === "one"
    ) {
      state.repeat = parsed.repeat;
    }

    applyTheme();

    updateRepeatButton();

    dom.shuffleBtn?.classList.toggle(
      "active",
      state.shuffle
    );

    saveState();
    renderAll();

    notify("Backup imported successfully.", "success");
  } catch (error) {
    console.error("Backup import failed.", error);

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

/* ---------------- EVENT HANDLERS ---------------- */

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
    navigate("library");
  });

  byId("emptySearchBtn")?.addEventListener("click", () => {
    navigate("search");

    dom.searchInput?.focus();
  });

  $$("[data-query]").forEach(button => {
    button.addEventListener("click", () => {
      const query = button.dataset.query;

      performSearch(query);
    });
  });
}

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
    }

    if (button.dataset.action === "add") {
      addTrackToPlaylist(track);
    }
  });
}

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

  byId("cancelPlaylistBtn")?.addEventListener("click", () => {
    closePlaylistDialog();
  });

  dom.playlistDialog?.addEventListener("click", event => {
    if (event.target === dom.playlistDialog) {
      closePlaylistDialog();
    }
  });

  dom.playlistForm?.addEventListener("submit", event => {
    event.preventDefault();

    const name = dom.playlistName?.value || "";

    const success = savePlaylistName(
      name,
      state.playlistDialogMode,
      state.editingPlaylistId
    );

    if (success) {
      closePlaylistDialog();
    }
  });

  dom.sidebarPlaylists?.addEventListener("click", event => {
    const button = event.target.closest("[data-open-playlist]");

    if (!button) {
      return;
    }

    openPlaylist(button.dataset.openPlaylist);
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
    }

    if (button.dataset.playlistAction === "play") {
      playPlaylist(id);
    }
  }

  dom.homePlaylists?.addEventListener(
    "click",
    handlePlaylistCardAction
  );

  dom.libraryPlaylistGrid?.addEventListener(
    "click",
    handlePlaylistCardAction
  );

  function handlePlaylistCardKeyboard(event) {
    if (
      event.target.matches("[data-playlist-action='open']") &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();

      openPlaylist(event.target.dataset.playlistId);
    }
  }

  dom.homePlaylists?.addEventListener(
    "keydown",
    handlePlaylistCardKeyboard
  );

  dom.libraryPlaylistGrid?.addEventListener(
    "keydown",
    handlePlaylistCardKeyboard
  );

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

  byId("deletePlaylistBtn")?.addEventListener("click", () => {
    deleteCurrentPlaylist();
  });

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
    }

    if (button.dataset.action === "add") {
      addTrackToPlaylist(track);
    }
  });
}

function setupPlayerEvents() {
  dom.playPauseBtn?.addEventListener("click", () => {
    togglePlayback();
  });

  dom.nextTrack?.addEventListener("click", () => {
    playNext();
  });

  dom.previousTrack?.addEventListener("click", () => {
    playPrevious();
  });

  dom.shuffleBtn?.addEventListener("click", () => {
    toggleShuffle();
  });

  dom.repeatBtn?.addEventListener("click", () => {
    cycleRepeat();
  });

  dom.playerLikeBtn?.addEventListener("click", () => {
    toggleLikeCurrentTrack();
  });
}

function setupThemeEvents() {
  dom.themeToggle?.addEventListener("click", () => {
    toggleTheme();
  });
}

function setupBackupEvents() {
  byId("exportBtn")?.addEventListener("click", () => {
    exportBackup();
  });

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
    console.error("Audio element is missing.");
    return;
  }

  dom.audio.volume = DEFAULT_VOLUME;

  if (dom.volume) {
    dom.volume.value = String(DEFAULT_VOLUME);
  }

  setupAudioEvents();
}

function initializeApp() {
  loadState();

  applyTheme();

  initializePlayer();

  setupNavigationEvents();

  setupSearchEvents();

  setupPlaylistEvents();

  setupPlayerEvents();

  setupThemeEvents();

  setupBackupEvents();

  updateRepeatButton();

  dom.shuffleBtn?.classList.toggle(
    "active",
    state.shuffle
  );

  renderAll();

  updatePlayerMetadata(null);

  updatePlayPauseButton();

  console.info("HE3AM Music Hub initialized.");
}

document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
  { once: true }
);
