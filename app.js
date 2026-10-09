/* =========================================================
   HE3AM MUSIC HUB
   Search · Audius · Jamendo · Player · Playlists
   Shuffle · Repeat · Backup · Theme · Local Storage
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const API_PROXY = "https://he3am.ghostrip82.workers.dev";

const AUDIUS_SEARCH_URL = `${API_PROXY}/api/tracks/search`;
const JAMENDO_SEARCH_URL = `${API_PROXY}/api/jamendo/tracks`;

const STORAGE_KEY = "pulseMusic";
const APP_NAME = "HE3AM";

const DEFAULT_VOLUME = 0.8;
const MAX_SEARCH_RESULTS = 50;
const REQUEST_TIMEOUT = 15000;

/* =========================================================
   DOM
   ========================================================= */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

const dom = {
  searchForm: $("#searchForm"),
  searchInput: $("#searchInput"),
  searchButton: $("#searchButton"),

  homeView: $("#homeView"),
  searchView: $("#searchView"),
  libraryView: $("#libraryView"),

  navItems: $$("[data-view]"),

  backToTop: $("#backToTop"),
  forwardToSearch: $("#forwardToSearch"),

  heroSearchBtn: $("#heroSearchBtn"),
  browseSearchBtn: $("#browseSearchBtn"),
  viewLibraryBtn: $("#viewLibraryBtn"),
  emptySearchBtn: $("#emptySearchBtn"),

  moodButtons: $$("[data-query]"),

  playlistGrid: $("#playlistGrid"),
  homePlaylists: $("#homePlaylists"),
  homePlaylistsEmpty: $("#homePlaylistsEmpty"),
  libraryPlaylistGrid: $("#libraryPlaylistGrid"),

  newPlaylistBtn: $("#newPlaylistBtn"),
  libraryNewPlaylistBtn: $("#libraryNewPlaylistBtn"),

  playlistDialog: $("#playlistDialog"),
  playlistForm: $("#playlistForm"),
  playlistName: $("#playlistName"),
  playlistDialogTitle: $("#playlistDialogTitle"),
  cancelPlaylistBtn: $("#cancelPlaylistBtn"),
  cancelPlaylistBtnBottom: $("#cancelPlaylistBtnBottom"),

  trackCount: $("#trackCount"),
  playlistCount: $("#playlistCount"),

  providerFilter: $("#providerFilter"),
  searchStatus: $("#searchStatus"),
  onlineSection: $("#onlineSection"),
  resultsHeading: $("#resultsHeading"),
  onlineStatus: $("#onlineStatus"),
  onlineResults: $("#onlineResults"),
  searchEmptyState: $("#searchEmptyState"),

  currentPlaylist: $("#currentPlaylist"),
  currentPlaylistTitle: $("#currentPlaylistTitle"),
  currentPlaylistMeta: $("#currentPlaylistMeta"),
  playlistTracks: $("#playlistTracks"),

  playPlaylistBtn: $("#playPlaylistBtn"),
  renamePlaylistBtn: $("#renamePlaylistBtn"),
  deletePlaylistBtn: $("#deletePlaylistBtn"),

  emptyLibrary: $("#emptyLibrary"),

  exportBtn: $("#exportBtn"),
  importBtn: $("#importBtn"),
  importFile: $("#importFile"),
  themeToggle: $("#themeToggle"),

  messageRegion: $("#messageRegion"),

  player: $("#player"),
  playerCover: $("#playerCover"),
  playerCoverFallback: $("#playerCoverFallback"),
  playerTitle: $("#playerTitle"),
  playerArtist: $("#playerArtist"),
  playerLikeBtn: $("#playerLikeBtn"),

  shuffleBtn: $("#shuffleBtn"),
  previousTrack: $("#previousTrack"),
  playPauseBtn: $("#playPauseBtn"),
  nextTrack: $("#nextTrack"),
  repeatBtn: $("#repeatBtn"),

  currentTime: $("#currentTime"),
  progressBar: $("#progressBar"),
  duration: $("#duration"),
  volume: $("#volume")
};

/* =========================================================
   AUDIO
   ========================================================= */

const audio = new Audio();

audio.preload = "metadata";
audio.volume = DEFAULT_VOLUME;

/* =========================================================
   STATE
   ========================================================= */

const state = {
  view: "home",

  playlists: [],
  likedTracks: [],

  searchResults: [],
  searchQuery: "",
  searchProvider: "all",

  queue: [],
  queueIndex: -1,
  currentTrack: null,

  selectedPlaylistId: null,

  isPlaying: false,
  shuffle: false,
  repeat: false,

  theme: "dark",

  searchController: null,
  playbackCandidates: [],
  playbackCandidateIndex: 0,

  requestNumber: 0,
  messageTimer: null,
  searchTimer: null
};

/* =========================================================
   UTILITIES
   ========================================================= */

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function safeURL(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const parsed = new URL(value, window.location.href);

    if (!["http:", "https:", "blob:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

function getImage(track) {
  return (
    safeURL(track?.artwork) ||
    safeURL(track?.cover) ||
    safeURL(track?.image) ||
    safeURL(track?.thumbnail) ||
    ""
  );
}

function getTrackTitle(track) {
  return track?.title || track?.name || "Unknown track";
}

function getTrackArtist(track) {
  return (
    track?.artist ||
    track?.artistName ||
    track?.user?.name ||
    track?.user?.handle ||
    track?.creator ||
    track?.author ||
    "Unknown artist"
  );
}

function formatTime(seconds) {
  const value = Number(seconds);

  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const remainder = Math.floor(value % 60);

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function shuffleArray(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function normalizeProvider(value) {
  const provider = String(value || "").toLowerCase();

  if (provider.includes("jamendo")) return "jamendo";
  if (provider.includes("audius")) return "audius";

  return provider || "unknown";
}

function getTrackKey(track) {
  return `${normalizeProvider(track?.provider)}:${track?.id ?? track?.url ?? track?.title ?? ""}`;
}

/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function showMessage(message, type = "info", duration = 3500) {
  if (!dom.messageRegion) return;

  clearTimeout(state.messageTimer);

  const box = document.createElement("div");

  box.className = `app-message ${type}`;
  box.textContent = message;

  dom.messageRegion.replaceChildren(box);

  state.messageTimer = setTimeout(() => {
    if (box.isConnected) {
      box.remove();
    }
  }, duration);
}

/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function createDefaultPlaylist() {
  return {
    id: createId(),
    name: "My Playlist",
    tracks: [],
    createdAt: new Date().toISOString()
  };
}

function saveState() {
  const data = {
    version: 2,

    playlists: state.playlists,
    likedTracks: state.likedTracks,

    theme: state.theme,

    settings: {
      volume: audio.volume,
      shuffle: state.shuffle,
      repeat: state.repeat
    }
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Could not save music data:", error);

    showMessage(
      "Storage is full or unavailable. Your latest changes may not be saved.",
      "warning"
    );
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      state.playlists = [];
      state.likedTracks = [];
      state.theme = "dark";
      return;
    }

    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      // Basic compatibility with older playlist-only backups.
      state.playlists = data.map(normalizePlaylist);
      state.likedTracks = [];
      state.theme = "dark";
      return;
    }

    state.playlists = Array.isArray(data.playlists)
      ? data.playlists.map(normalizePlaylist)
      : [];

    state.likedTracks = Array.isArray(data.likedTracks)
      ? data.likedTracks.map(normalizeTrack)
      : [];

    state.theme = data.theme === "light" ? "light" : "dark";

    if (data.settings) {
      if (Number.isFinite(Number(data.settings.volume))) {
        audio.volume = Math.min(
          1,
          Math.max(0, Number(data.settings.volume))
        );
      }

      state.shuffle = Boolean(data.settings.shuffle);
      state.repeat = Boolean(data.settings.repeat);
    }
  } catch (error) {
    console.error("Could not load saved music data:", error);

    state.playlists = [];
    state.likedTracks = [];
    state.theme = "dark";
  }
}

function normalizePlaylist(playlist) {
  return {
    id: String(playlist?.id || createId()),
    name: String(playlist?.name || "Untitled playlist"),
    tracks: Array.isArray(playlist?.tracks)
      ? playlist.tracks.map(normalizeTrack)
      : [],
    createdAt: playlist?.createdAt || new Date().toISOString()
  };
}

function normalizeTrack(track) {
  return {
    id: String(track?.id ?? createId()),
    title: String(track?.title || track?.name || "Unknown track"),
    artist: String(
      track?.artist ||
      track?.artistName ||
      track?.user?.name ||
      track?.creator ||
      "Unknown artist"
    ),

    artwork: safeURL(
      track?.artwork ||
      track?.cover ||
      track?.image ||
      track?.thumbnail ||
      ""
    ),

    provider: normalizeProvider(track?.provider),

    duration: Number(track?.duration) || 0,

    streamUrl: safeURL(
      track?.streamUrl ||
      track?.stream_url ||
      track?.audio ||
      track?.audioUrl ||
      track?.download ||
      ""
    ),

    permalink: safeURL(
      track?.permalink ||
      track?.externalUrl ||
      track?.url ||
      ""
    ),

    genre: String(track?.genre || ""),
    addedAt: track?.addedAt || null
  };
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setView(view) {
  const allowed = ["home", "search", "library"];

  if (!allowed.includes(view)) {
    view = "home";
  }

  state.view = view;

  if (dom.homeView) {
    dom.homeView.hidden = view !== "home";
  }

  if (dom.searchView) {
    dom.searchView.hidden = view !== "search";
  }

  if (dom.libraryView) {
    dom.libraryView.hidden = view !== "library";
  }

  dom.navItems.forEach(button => {
    const active = button.dataset.view === view;

    button.classList.toggle("active", active);

    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  if (view === "library") {
    renderLibrary();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function openSearch(query = "") {
  setView("search");

  if (dom.searchInput) {
    dom.searchInput.value = query;
  }

  if (query.trim()) {
    searchMusic(query.trim());
  } else if (dom.searchInput) {
    dom.searchInput.focus();
  }
}

/* =========================================================
   PLAYLIST MANAGEMENT
   ========================================================= */

let editingPlaylistId = null;

function openPlaylistDialog(playlist = null) {
  editingPlaylistId = playlist?.id || null;

  if (dom.playlistDialogTitle) {
    dom.playlistDialogTitle.textContent = playlist
      ? "Rename playlist"
      : "Create playlist";
  }

  if (dom.playlistName) {
    dom.playlistName.value = playlist?.name || "";
  }

  const submitButton = $('button[type="submit"]', dom.playlistForm);

  if (submitButton) {
    submitButton.textContent = playlist
      ? "Save changes"
      : "Create playlist";
  }

  if (dom.playlistDialog?.showModal) {
    dom.playlistDialog.showModal();
  } else {
    const name = prompt(
      playlist ? "Rename playlist:" : "Playlist name:",
      playlist?.name || ""
    );

    if (name?.trim()) {
      if (playlist) {
        renamePlaylist(playlist.id, name);
      } else {
        createPlaylist(name);
      }
    }
  }

  setTimeout(() => dom.playlistName?.focus(), 50);
}

function closePlaylistDialog() {
  if (dom.playlistDialog?.open) {
    dom.playlistDialog.close();
  }

  editingPlaylistId = null;
}

function createPlaylist(name) {
  const cleanName = String(name || "").trim();

  if (!cleanName) {
    showMessage("Please enter a playlist name.", "warning");
    return;
  }

  if (cleanName.length > 60) {
    showMessage("Playlist names can contain up to 60 characters.", "warning");
    return;
  }

  const playlist = {
    id: createId(),
    name: cleanName,
    tracks: [],
    createdAt: new Date().toISOString()
  };

  state.playlists.unshift(playlist);
  state.selectedPlaylistId = playlist.id;

  saveState();
  renderAll();
  renderLibrary();

  showMessage(`Created "${cleanName}".`, "success");
}

function renamePlaylist(id, name) {
  const cleanName = String(name || "").trim();

  if (!cleanName) {
    showMessage("Please enter a playlist name.", "warning");
    return;
  }

  const playlist = state.playlists.find(item => item.id === id);

  if (!playlist) return;

  playlist.name = cleanName.slice(0, 60);

  saveState();
  renderAll();
  renderLibrary();

  showMessage("Playlist renamed.", "success");
}

function deletePlaylist(id) {
  const playlist = state.playlists.find(item => item.id === id);

  if (!playlist) return;

  const confirmed = confirm(
    `Delete "${playlist.name}"? This cannot be undone.`
  );

  if (!confirmed) return;

  state.playlists = state.playlists.filter(item => item.id !== id);

  if (state.selectedPlaylistId === id) {
    state.selectedPlaylistId = null;
  }

  saveState();
  renderAll();
  renderLibrary();

  showMessage("Playlist deleted.", "success");
}

function getSelectedPlaylist() {
  return state.playlists.find(
    playlist => playlist.id === state.selectedPlaylistId
  ) || null;
}

function selectPlaylist(id) {
  const playlist = state.playlists.find(item => item.id === id);

  if (!playlist) return;

  state.selectedPlaylistId = playlist.id;

  setView("library");
  renderLibrary();
}

function addTrackToPlaylist(track) {
  if (!state.playlists.length) {
    const create = confirm(
      "You don't have a playlist yet. Create one now?"
    );

    if (create) {
      openPlaylistDialog();
    }

    return;
  }

  const choices = state.playlists
    .map((playlist, index) => `${index + 1}. ${playlist.name}`)
    .join("\n");

  const answer = prompt(
    `Add "${getTrackTitle(track)}" to which playlist?\n\n${choices}\n\nEnter a playlist number:`
  );

  if (answer === null) return;

  const index = Number.parseInt(answer, 10) - 1;
  const playlist = state.playlists[index];

  if (!playlist) {
    showMessage("Invalid playlist number.", "warning");
    return;
  }

  addTrackToPlaylistById(track, playlist.id);
}

function addTrackToPlaylistById(track, playlistId) {
  const playlist = state.playlists.find(item => item.id === playlistId);

  if (!playlist) return;

  const normalized = normalizeTrack(track);
  const key = getTrackKey(normalized);

  const exists = playlist.tracks.some(
    existing => getTrackKey(existing) === key
  );

  if (exists) {
    showMessage("This track is already in that playlist.", "warning");
    return;
  }

  normalized.addedAt = new Date().toISOString();

  playlist.tracks.push(normalized);

  saveState();
  renderAll();
  renderLibrary();

  showMessage(`Added to "${playlist.name}".`, "success");
}

function removeTrackFromPlaylist(playlistId, trackKey) {
  const playlist = state.playlists.find(item => item.id === playlistId);

  if (!playlist) return;

  playlist.tracks = playlist.tracks.filter(
    track => getTrackKey(track) !== trackKey
  );

  saveState();
  renderAll();
  renderLibrary();

  showMessage("Track removed from playlist.", "success");
}

/* =========================================================
   LIKED TRACKS
   ========================================================= */

function isTrackLiked(track) {
  const key = getTrackKey(track);

  return state.likedTracks.some(
    item => getTrackKey(item) === key
  );
}

function toggleLike(track) {
  if (!track) return;

  const key = getTrackKey(track);

  if (isTrackLiked(track)) {
    state.likedTracks = state.likedTracks.filter(
      item => getTrackKey(item) !== key
    );

    showMessage("Removed from saved tracks.", "success");
  } else {
    state.likedTracks.unshift({
      ...normalizeTrack(track),
      addedAt: new Date().toISOString()
    });

    showMessage("Track saved.", "success");
  }

  saveState();
  renderAll();
  updatePlayer();
}

/* =========================================================
   RENDER PLAYLISTS
   ========================================================= */

function renderSidebarPlaylists() {
  if (!dom.playlistGrid) return;

  dom.playlistGrid.replaceChildren();

  if (!state.playlists.length) {
    const empty = document.createElement("div");

    empty.className = "sidebar-playlist-count";
    empty.textContent = "No playlists yet";

    dom.playlistGrid.appendChild(empty);
    return;
  }

  state.playlists.forEach(playlist => {
    const button = document.createElement("button");

    button.type = "button";

    button.className = "sidebar-playlist";

    if (playlist.id === state.selectedPlaylistId) {
      button.classList.add("active");
    }

    button.innerHTML = `
      <span class="sidebar-playlist-cover">♫</span>

      <span class="sidebar-playlist-info">
        <span class="sidebar-playlist-name">
          ${escapeHTML(playlist.name)}
        </span>

        <span class="sidebar-playlist-count">
          ${playlist.tracks.length} tracks
        </span>
      </span>
    `;

    button.addEventListener("click", () => {
      selectPlaylist(playlist.id);
    });

    dom.playlistGrid.appendChild(button);
  });
}

function createPlaylistCard(playlist) {
  const card = document.createElement("article");

  card.className = "playlist-card";

  const coverTrack = playlist.tracks.find(track => track.artwork);
  const cover = coverTrack ? getImage(coverTrack) : "";

  card.innerHTML = `
    <div class="playlist-card-cover">
      ${
        cover
          ? `<img src="${escapeHTML(cover)}" alt="" loading="lazy">`
          : `<span class="playlist-card-cover-symbol">♫</span>`
      }

      <button
        class="playlist-card-play"
        type="button"
        aria-label="Play ${escapeHTML(playlist.name)}"
        title="Play playlist"
      >▶</button>
    </div>

    <h3 class="playlist-card-title">
      ${escapeHTML(playlist.name)}
    </h3>

    <p class="playlist-card-description">
      ${playlist.tracks.length} tracks · Your collection
    </p>
  `;

  $(".playlist-card-cover", card)?.addEventListener("click", () => {
    selectPlaylist(playlist.id);
  });

  $(".playlist-card-title", card)?.addEventListener("click", () => {
    selectPlaylist(playlist.id);
  });

  $(".playlist-card-play", card)?.addEventListener("click", event => {
    event.stopPropagation();

    if (!playlist.tracks.length) {
      showMessage("This playlist is empty.", "warning");
      selectPlaylist(playlist.id);
      return;
    }

    playQueue(playlist.tracks, 0);
  });

  return card;
}

function renderHomePlaylists() {
  if (!dom.homePlaylists) return;

  dom.homePlaylists.replaceChildren();

  const playlists = state.playlists.slice(0, 4);

  playlists.forEach(playlist => {
    dom.homePlaylists.appendChild(createPlaylistCard(playlist));
  });

  if (dom.homePlaylistsEmpty) {
    dom.homePlaylistsEmpty.hidden = playlists.length > 0;
  }
}

function renderLibrary() {
  if (!dom.libraryPlaylistGrid) return;

  dom.libraryPlaylistGrid.replaceChildren();

  state.playlists.forEach(playlist => {
    dom.libraryPlaylistGrid.appendChild(createPlaylistCard(playlist));
  });

  const playlist = getSelectedPlaylist();

  if (dom.currentPlaylist) {
    dom.currentPlaylist.hidden = !playlist;
  }

  if (dom.emptyLibrary) {
    dom.emptyLibrary.hidden = state.playlists.length > 0;
  }

  if (!playlist) {
    return;
  }

  if (dom.currentPlaylistTitle) {
    dom.currentPlaylistTitle.textContent = playlist.name;
  }

  if (dom.currentPlaylistMeta) {
    dom.currentPlaylistMeta.textContent =
      `${playlist.tracks.length} tracks`;
  }

  if (dom.playlistTracks) {
    dom.playlistTracks.replaceChildren();

    if (!playlist.tracks.length) {
      const empty = document.createElement("div");

      empty.className = "empty-state";

      empty.innerHTML = `
        <div class="empty-state-icon">♫</div>
        <h3>This playlist is empty</h3>
        <p>Search for music and add tracks to this playlist.</p>
        <button class="primary-button" type="button">
          Discover music
        </button>
      `;

      $(".primary-button", empty)?.addEventListener("click", () => {
        openSearch();
      });

      dom.playlistTracks.appendChild(empty);
    } else {
      playlist.tracks.forEach((track, index) => {
        const row = createTrackRow(track, {
          index,
          playlistId: playlist.id,
          removable: true
        });

        dom.playlistTracks.appendChild(row);
      });
    }
  }
}

/* =========================================================
   TRACK NORMALIZATION
   ========================================================= */

function normalizeSearchTrack(raw, provider) {
  if (!raw || typeof raw !== "object") return null;

  const actualProvider = normalizeProvider(
    raw.provider ||
    raw.source ||
    provider
  );

  const user = raw.user || raw.artist || {};

  const normalized = {
    id: String(
      raw.id ??
      raw.track_id ??
      raw.trackId ??
      raw._id ??
      createId()
    ),

    title: String(
      raw.title ||
      raw.name ||
      raw.track_name ||
      "Unknown track"
    ),

    artist: String(
      typeof user === "string"
        ? user
        : user.name ||
          user.handle ||
          raw.artistName ||
          raw.artist_name ||
          raw.creator ||
          raw.author ||
          "Unknown artist"
    ),

    artwork: safeURL(
      raw.artwork ||
      raw.artwork_url ||
      raw.cover ||
      raw.image ||
      raw.thumbnail ||
      raw.album_image ||
      raw.album?.image ||
      raw.album?.image_url ||
      raw.user?.profile_picture?.["150x150"] ||
      ""
    ),

    provider: actualProvider,

    duration: Number(
      raw.duration ||
      raw.duration_seconds ||
      raw.length ||
      0
    ),

    streamUrl: safeURL(
      raw.streamUrl ||
      raw.stream_url ||
      raw.audioUrl ||
      raw.audio_url ||
      raw.audio ||
      raw.download ||
      raw.download_url ||
      ""
    ),

    permalink: safeURL(
      raw.permalink ||
      raw.externalUrl ||
      raw.external_url ||
      raw.url ||
      raw.share_url ||
      ""
    ),

    genre: String(raw.genre || ""),

    rawId: raw.id ?? raw.track_id ?? null
  };

  if (actualProvider === "jamendo" && normalized.duration > 10000) {
    normalized.duration = normalized.duration / 1000;
  }

  if (actualProvider === "audius" && normalized.duration > 100000) {
    normalized.duration = normalized.duration / 1000;
  }

  return normalized;
}

/* =========================================================
   API RESPONSE PARSING
   ========================================================= */

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;

  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.data,
    payload.results,
    payload.tracks,
    payload.items,
    payload.response,
    payload.result,
    payload.data?.data,
    payload.data?.results,
    payload.data?.tracks,
    payload.results?.tracks,
    payload.response?.data
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildSearchURL(base, query, provider) {
  const url = new URL(base);

  url.searchParams.set("query", query);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(MAX_SEARCH_RESULTS));

  if (provider) {
    url.searchParams.set("provider", provider);
  }

  return url.href;
}

async function searchAudius(query, signal) {
  const url = buildSearchURL(
    AUDIUS_SEARCH_URL,
    query,
    "audius"
  );

  const payload = await fetchJSON(url, { signal });

  return extractArray(payload)
    .map(track => normalizeSearchTrack(track, "audius"))
    .filter(Boolean);
}

async function searchJamendo(query, signal) {
  const url = buildSearchURL(
    JAMENDO_SEARCH_URL,
    query,
    "jamendo"
  );

  const payload = await fetchJSON(url, { signal });

  return extractArray(payload)
    .map(track => normalizeSearchTrack(track, "jamendo"))
    .filter(Boolean);
}

/* =========================================================
   SEARCH
   ========================================================= */

async function searchMusic(query) {
  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) {
    showMessage("Enter a song or artist to search.", "warning");
    return;
  }

  state.searchQuery = cleanQuery;

  state.searchController?.abort();

  const controller = new AbortController();

  state.searchController = controller;

  const requestNumber = ++state.requestNumber;

  setView("search");

  if (dom.searchInput) {
    dom.searchInput.value = cleanQuery;
  }

  if (dom.searchStatus) {
    dom.searchStatus.textContent = "Searching music providers…";
  }

  if (dom.onlineStatus) {
    dom.onlineStatus.textContent = "";
  }

  if (dom.resultsHeading) {
    dom.resultsHeading.textContent = `Results for "${cleanQuery}"`;
  }

  if (dom.onlineResults) {
    dom.onlineResults.replaceChildren();
  }

  if (dom.searchEmptyState) {
    dom.searchEmptyState.hidden = true;
  }

  if (dom.onlineSection) {
    dom.onlineSection.hidden = false;
  }

  if (dom.searchButton) {
    dom.searchButton.disabled = true;
    dom.searchButton.textContent = "Searching…";
  }

  const provider = state.searchProvider;

  const jobs = [];

  if (provider === "all" || provider === "audius") {
    jobs.push(
      searchAudius(cleanQuery, controller.signal)
        .then(tracks => ({ provider: "audius", tracks }))
        .catch(error => ({
          provider: "audius",
          tracks: [],
          error
        }))
    );
  }

  if (provider === "all" || provider === "jamendo") {
    jobs.push(
      searchJamendo(cleanQuery, controller.signal)
        .then(tracks => ({ provider: "jamendo", tracks }))
        .catch(error => ({
          provider: "jamendo",
          tracks: [],
          error
        }))
    );
  }

  try {
    const results = await Promise.all(jobs);

    if (requestNumber !== state.requestNumber) return;

    const combined = results.flatMap(result => result.tracks);

    const unique = new Map();

    combined.forEach(track => {
      const key = getTrackKey(track);

      if (!unique.has(key)) {
        unique.set(key, track);
      }
    });

    state.searchResults = Array.from(unique.values());

    renderSearchResults();

    const failed = results.filter(result => result.error);
    const succeeded = results.length - failed.length;

    if (state.searchResults.length) {
      if (dom.searchStatus) {
        dom.searchStatus.textContent =
          `${state.searchResults.length} tracks found`;
      }

      if (dom.onlineStatus) {
        dom.onlineStatus.textContent =
          failed.length
            ? `${succeeded} provider(s) responded`
            : "All selected providers searched";
      }
    } else {
      if (dom.searchStatus) {
        dom.searchStatus.textContent = "No matching tracks found.";
      }

      if (dom.onlineStatus) {
        dom.onlineStatus.textContent =
          failed.length === results.length
            ? "Could not connect to the selected music providers."
            : "Try another song, artist, or genre.";
      }

      if (dom.searchEmptyState) {
        dom.searchEmptyState.hidden = false;
      }
    }
  } catch (error) {
    if (error.name === "AbortError") return;

    console.error("Search failed:", error);

    if (requestNumber !== state.requestNumber) return;

    if (dom.searchStatus) {
      dom.searchStatus.textContent = "Search failed.";
    }

    if (dom.onlineStatus) {
      dom.onlineStatus.textContent =
        "Check your connection and Worker API settings.";
    }

    if (dom.searchEmptyState) {
      dom.searchEmptyState.hidden = false;
    }

    showMessage("Could not search music providers.", "error");
  } finally {
    if (requestNumber === state.requestNumber && dom.searchButton) {
      dom.searchButton.disabled = false;
      dom.searchButton.textContent = "Search";
    }
  }
}

/* =========================================================
   TRACK RENDERING
   ========================================================= */

function createTrackRow(track, options = {}) {
  const {
    index = 0,
    playlistId = null,
    removable = false
  } = options;

  const row = document.createElement("article");

  row.className = "track-row";

  const playing =
    state.currentTrack &&
    getTrackKey(state.currentTrack) === getTrackKey(track);

  if (playing) {
    row.classList.add("is-playing");
  }

  const image = getImage(track);
  const liked = isTrackLiked(track);

  row.innerHTML = `
    <div class="track-cover">
      ${
        image
          ? `<img src="${escapeHTML(image)}" alt="" loading="lazy">`
          : `<span class="track-cover-symbol">♫</span>`
      }
    </div>

    <div class="track-info">
      <div class="track-title">
        ${escapeHTML(getTrackTitle(track))}
      </div>

      <div class="track-artist">
        ${escapeHTML(getTrackArtist(track))}
      </div>

      <span class="track-provider">
        ${escapeHTML(normalizeProvider(track.provider))}
      </span>
    </div>

    <div class="track-actions">

      <button
        class="track-action track-play-button"
        type="button"
        aria-label="Play ${escapeHTML(getTrackTitle(track))}"
        title="Play"
      >${playing && state.isPlaying ? "Ⅱ" : "▶"}</button>

      <button
        class="track-action"
        data-action="like"
        type="button"
        aria-label="${liked ? "Remove saved track" : "Save track"}"
        title="${liked ? "Unsave track" : "Save track"}"
      >${liked ? "♥" : "♡"}</button>

      ${
        removable
          ? `
            <button
              class="track-action"
              data-action="remove"
              type="button"
              aria-label="Remove track from playlist"
              title="Remove from playlist"
            >×</button>
          `
          : `
            <button
              class="track-action"
              data-action="add"
              type="button"
              aria-label="Add track to playlist"
              title="Add to playlist"
            >＋</button>
          `
      }

    </div>
  `;

  $(".track-play-button", row)?.addEventListener("click", () => {
    if (playlistId) {
      const playlist = state.playlists.find(
        item => item.id === playlistId
      );

      if (playlist) {
        playQueue(playlist.tracks, index);
      }
    } else {
      playQueue(state.searchResults, index);
    }
  });

  $('[data-action="like"]', row)?.addEventListener("click", () => {
    toggleLike(track);
  });

  $('[data-action="add"]', row)?.addEventListener("click", () => {
    addTrackToPlaylist(track);
  });

  $('[data-action="remove"]', row)?.addEventListener("click", () => {
    removeTrackFromPlaylist(
      playlistId,
      getTrackKey(track)
    );
  });

  return row;
}

function renderSearchResults() {
  if (!dom.onlineResults) return;

  dom.onlineResults.replaceChildren();

  const provider = state.searchProvider;

  const tracks = state.searchResults.filter(track => {
    return provider === "all" || track.provider === provider;
  });

  if (!tracks.length) {
    if (dom.searchEmptyState) {
      dom.searchEmptyState.hidden = false;
    }

    return;
  }

  if (dom.searchEmptyState) {
    dom.searchEmptyState.hidden = true;
  }

  const fragment = document.createDocumentFragment();

  tracks.forEach((track, index) => {
    fragment.appendChild(
      createTrackRow(track, { index })
    );
  });

  dom.onlineResults.appendChild(fragment);
}

/* =========================================================
   PLAYBACK CANDIDATES
   ========================================================= */

function uniqueURLs(urls) {
  return [...new Set(urls.map(safeURL).filter(Boolean))];
}

function getPlaybackCandidates(track) {
  const candidates = [];

  if (track.streamUrl) {
    candidates.push(track.streamUrl);
  }

  if (track.audioUrl) {
    candidates.push(track.audioUrl);
  }

  if (track.audio) {
    candidates.push(track.audio);
  }

  if (track.downloadUrl) {
    candidates.push(track.downloadUrl);
  }

  if (track.provider === "audius" && track.id) {
    candidates.push(
      `https://api.audius.co/v1/tracks/${encodeURIComponent(track.id)}/stream?app_name=HE3AM`
    );

    candidates.push(
      `https://api.audius.co/v1/tracks/${encodeURIComponent(track.id)}/stream`
    );
  }

  return uniqueURLs(candidates);
}

/* =========================================================
   PLAYBACK QUEUE
   ========================================================= */

function playQueue(tracks, startIndex = 0) {
  if (!Array.isArray(tracks) || !tracks.length) {
    showMessage("There are no tracks to play.", "warning");
    return;
  }

  state.queue = tracks.map(normalizeTrack);

  const safeIndex = Math.min(
    Math.max(0, Number(startIndex) || 0),
    state.queue.length - 1
  );

  state.queueIndex = safeIndex;

  playTrack(state.queue[safeIndex]);
}

async function playTrack(track) {
  if (!track) return;

  const normalized = normalizeTrack(track);
  const candidates = getPlaybackCandidates(normalized);

  if (!candidates.length) {
    state.currentTrack = normalized;
    state.isPlaying = false;

    updatePlayer();

    showMessage(
      "No playable audio URL was found for this track.",
      "error"
    );

    return;
  }

  state.currentTrack = normalized;
  state.playbackCandidates = candidates;
  state.playbackCandidateIndex = 0;

  updatePlayer();

  await tryPlaybackCandidate(0);
}

async function tryPlaybackCandidate(index) {
  if (
    index < 0 ||
    index >= state.playbackCandidates.length
  ) {
    state.isPlaying = false;

    updatePlayer();

    showMessage(
      "This track could not be played. Try another track.",
      "error",
      5000
    );

    return;
  }

  state.playbackCandidateIndex = index;

  const url = state.playbackCandidates[index];

  audio.pause();
  audio.src = url;
  audio.load();

  try {
    await audio.play();

    state.isPlaying = true;

    updatePlayer();
    updateTrackRows();
  } catch (error) {
    console.warn(
      `Playback candidate ${index + 1} failed:`,
      error
    );

    if (error.name === "NotAllowedError") {
      state.isPlaying = false;
      updatePlayer();

      showMessage(
        "Press Play to allow audio playback.",
        "warning"
      );

      return;
    }

    if (index + 1 < state.playbackCandidates.length) {
      tryPlaybackCandidate(index + 1);
      return;
    }

    state.isPlaying = false;
    updatePlayer();

    showMessage(
      "Playback failed. The source may be unavailable or blocked.",
      "error",
      5000
    );
  }
}

async function togglePlayPause() {
  if (!state.currentTrack) {
    if (state.searchResults.length) {
      playQueue(state.searchResults, 0);
      return;
    }

    const playlist = state.playlists.find(
      item => item.tracks.length
    );

    if (playlist) {
      playQueue(playlist.tracks, 0);
      return;
    }

    openSearch();
    showMessage("Search for a track to start listening.", "info");
    return;
  }

  if (audio.paused) {
    try {
      await audio.play();

      state.isPlaying = true;

      updatePlayer();
      updateTrackRows();
    } catch (error) {
      console.warn("Could not resume playback:", error);

      const nextCandidate = state.playbackCandidateIndex + 1;

      if (nextCandidate < state.playbackCandidates.length) {
        tryPlaybackCandidate(nextCandidate);
      } else {
        showMessage(
          "Unable to resume this track. Try another source.",
          "error"
        );
      }
    }
  } else {
    audio.pause();

    state.isPlaying = false;

    updatePlayer();
    updateTrackRows();
  }
}

function playNext(manual = true) {
  if (!state.queue.length) {
    showMessage("There is no next track.", "info");
    return;
  }

  if (state.repeat && !manual && state.currentTrack) {
    audio.currentTime = 0;

    audio.play().catch(() => {
      showMessage("Could not replay this track.", "error");
    });

    return;
  }

  if (state.shuffle && state.queue.length > 1) {
    let nextIndex = state.queueIndex;

    while (nextIndex === state.queueIndex) {
      nextIndex = Math.floor(Math.random() * state.queue.length);
    }

    state.queueIndex = nextIndex;

    playTrack(state.queue[state.queueIndex]);
    return;
  }

  if (state.queueIndex < state.queue.length - 1) {
    state.queueIndex += 1;

    playTrack(state.queue[state.queueIndex]);
    return;
  }

  if (state.repeat && manual) {
    state.queueIndex = 0;

    playTrack(state.queue[0]);
    return;
  }

  state.isPlaying = false;

  updatePlayer();

  if (manual) {
    showMessage("You've reached the end of the queue.", "info");
  }
}

function playPrevious() {
  if (!state.queue.length) return;

  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  if (state.shuffle && state.queue.length > 1) {
    let previousIndex = state.queueIndex;

    while (previousIndex === state.queueIndex) {
      previousIndex = Math.floor(Math.random() * state.queue.length);
    }

    state.queueIndex = previousIndex;
    playTrack(state.queue[previousIndex]);

    return;
  }

  if (state.queueIndex > 0) {
    state.queueIndex -= 1;
    playTrack(state.queue[state.queueIndex]);
    return;
  }

  audio.currentTime = 0;
}

/* =========================================================
   PLAYER UI
   ========================================================= */

function updatePlayer() {
  const track = state.currentTrack;

  if (dom.playerTitle) {
    dom.playerTitle.textContent = track
      ? getTrackTitle(track)
      : "Nothing playing";
  }

  if (dom.playerArtist) {
    dom.playerArtist.textContent = track
      ? getTrackArtist(track)
      : "Choose a track to begin";
  }

  const artwork = track ? getImage(track) : "";

  if (dom.playerCover) {
    if (artwork) {
      dom.playerCover.src = artwork;
      dom.playerCover.hidden = false;

      if (dom.playerCoverFallback) {
        dom.playerCoverFallback.hidden = true;
      }
    } else {
      dom.playerCover.removeAttribute("src");
      dom.playerCover.hidden = true;

      if (dom.playerCoverFallback) {
        dom.playerCoverFallback.hidden = false;
      }
    }
  }

  if (dom.playPauseBtn) {
    dom.playPauseBtn.textContent = state.isPlaying ? "Ⅱ" : "▶";

    dom.playPauseBtn.setAttribute(
      "aria-label",
      state.isPlaying ? "Pause" : "Play"
    );

    dom.playPauseBtn.title = state.isPlaying ? "Pause" : "Play";
  }

  dom.shuffleBtn?.classList.toggle("active", state.shuffle);
  dom.repeatBtn?.classList.toggle("active", state.repeat);

  if (dom.shuffleBtn) {
    dom.shuffleBtn.setAttribute("aria-pressed", String(state.shuffle));
  }

  if (dom.repeatBtn) {
    dom.repeatBtn.setAttribute("aria-pressed", String(state.repeat));
  }

  if (dom.playerLikeBtn) {
    const liked = track && isTrackLiked(track);

    dom.playerLikeBtn.textContent = liked ? "♥" : "♡";
    dom.playerLikeBtn.classList.toggle("active", Boolean(liked));

    dom.playerLikeBtn.setAttribute(
      "aria-label",
      liked ? "Remove saved track" : "Save current track"
    );
  }

  updateProgress();
}

function updateProgress() {
  const current = Number(audio.currentTime) || 0;
  const total = Number(audio.duration) || 0;

  if (dom.currentTime) {
    dom.currentTime.textContent = formatTime(current);
  }

  if (dom.duration) {
    dom.duration.textContent = formatTime(total);
  }

  if (dom.progressBar) {
    dom.progressBar.max = total || 100;
    dom.progressBar.value = total
      ? Math.min(current, total)
      : 0;
  }
}

function updateTrackRows() {
  if (state.view === "search") {
    renderSearchResults();
  }

  if (state.view === "library") {
    renderLibrary();
  }
}

/* =========================================================
   THEME
   ========================================================= */

function applyTheme() {
  document.body.classList.toggle(
    "light-theme",
    state.theme === "light"
  );

  if (dom.themeToggle) {
    dom.themeToggle.innerHTML =
      state.theme === "light"
        ? "<span>☾</span> Dark theme"
        : "<span>☼</span> Light theme";
  }
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";

  applyTheme();
  saveState();
}

/* =========================================================
   BACKUP EXPORT / IMPORT
   ========================================================= */

function exportBackup() {
  const data = {
    app: APP_NAME,
    version: 2,
    exportedAt: new Date().toISOString(),

    playlists: state.playlists,
    likedTracks: state.likedTracks,

    theme: state.theme,

    settings: {
      volume: audio.volume,
      shuffle: state.shuffle,
      repeat: state.repeat
    }
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `he3am-backup-${new Date().toISOString().slice(0, 10)}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showMessage("Backup exported successfully.", "success");
}

async function importBackup(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const playlists = Array.isArray(data)
      ? data
      : data.playlists;

    if (!Array.isArray(playlists)) {
      throw new Error("Invalid backup format");
    }

    const confirmed = confirm(
      "Importing this backup will replace your current playlists and saved tracks. Continue?"
    );

    if (!confirmed) return;

    state.playlists = playlists.map(normalizePlaylist);

    state.likedTracks = Array.isArray(data.likedTracks)
      ? data.likedTracks.map(normalizeTrack)
      : [];

    state.theme = data.theme === "light" ? "light" : "dark";

    if (data.settings) {
      if (Number.isFinite(Number(data.settings.volume))) {
        audio.volume = Math.min(
          1,
          Math.max(0, Number(data.settings.volume))
        );
      }

      state.shuffle = Boolean(data.settings.shuffle);
      state.repeat = Boolean(data.settings.repeat);
    }

    state.selectedPlaylistId = null;

    saveState();
    applyTheme();
    renderAll();
    renderLibrary();
    updatePlayer();

    showMessage("Backup imported successfully.", "success");
  } catch (error) {
    console.error("Backup import failed:", error);

    showMessage(
      "Could not import this file. Please select a valid HE3AM backup.",
      "error"
    );
  } finally {
    if (dom.importFile) {
      dom.importFile.value = "";
    }
  }
}

/* =========================================================
   RENDER ALL
   ========================================================= */

function renderCounts() {
  const savedCount = state.likedTracks.length;

  const playlistTrackCount = state.playlists.reduce(
    (total, playlist) => total + playlist.tracks.length,
    0
  );

  if (dom.trackCount) {
    dom.trackCount.textContent = String(
      Math.max(savedCount, playlistTrackCount)
    );
  }

  if (dom.playlistCount) {
    dom.playlistCount.textContent = String(state.playlists.length);
  }
}

function renderAll() {
  renderSidebarPlaylists();
  renderHomePlaylists();
  renderCounts();

  if (state.view === "search") {
    renderSearchResults();
  }

  if (state.view === "library") {
    renderLibrary();
  }
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function bindEvents() {
  // Main navigation
  dom.navItems.forEach(button => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
    });
  });

  // Search form
  dom.searchForm?.addEventListener("submit", event => {
    event.preventDefault();

    searchMusic(dom.searchInput?.value || "");
  });

  // Search provider filter
  dom.providerFilter?.addEventListener("change", () => {
    state.searchProvider = dom.providerFilter.value;

    if (state.searchQuery) {
      searchMusic(state.searchQuery);
    } else {
      renderSearchResults();
    }
  });

  // Search shortcuts
  dom.heroSearchBtn?.addEventListener("click", () => {
    openSearch();
  });

  dom.browseSearchBtn?.addEventListener("click", () => {
    setView("library");
  });

  dom.viewLibraryBtn?.addEventListener("click", () => {
    setView("library");
  });

  dom.emptySearchBtn?.addEventListener("click", () => {
    openSearch();
  });

  dom.backToTop?.addEventListener("click", () => {
    setView("home");
  });

  dom.forwardToSearch?.addEventListener("click", () => {
    openSearch();
  });

  // Mood cards
  dom.moodButtons.forEach(button => {
    button.addEventListener("click", () => {
      openSearch(button.dataset.query || "");
    });
  });

  // Playlist creation
  dom.newPlaylistBtn?.addEventListener("click", () => {
    openPlaylistDialog();
  });

  dom.libraryNewPlaylistBtn?.addEventListener("click", () => {
    openPlaylistDialog();
  });

  $$("[data-create-playlist]").forEach(button => {
    button.addEventListener("click", () => {
      openPlaylistDialog();
    });
  });

  dom.cancelPlaylistBtn?.addEventListener("click", closePlaylistDialog);

  dom.cancelPlaylistBtnBottom?.addEventListener(
    "click",
    closePlaylistDialog
  );

  dom.playlistDialog?.addEventListener("click", event => {
    if (event.target === dom.playlistDialog) {
      closePlaylistDialog();
    }
  });

  dom.playlistForm?.addEventListener("submit", event => {
    event.preventDefault();

    const name = dom.playlistName?.value || "";

    if (editingPlaylistId) {
      renamePlaylist(editingPlaylistId, name);
    } else {
      createPlaylist(name);
    }

    closePlaylistDialog();
  });

  // Current playlist controls
  dom.playPlaylistBtn?.addEventListener("click", () => {
    const playlist = getSelectedPlaylist();

    if (!playlist || !playlist.tracks.length) {
      showMessage("This playlist is empty.", "warning");
      return;
    }

    playQueue(playlist.tracks, 0);
  });

  dom.renamePlaylistBtn?.addEventListener("click", () => {
    const playlist = getSelectedPlaylist();

    if (playlist) {
      openPlaylistDialog(playlist);
    }
  });

  dom.deletePlaylistBtn?.addEventListener("click", () => {
    const playlist = getSelectedPlaylist();

    if (playlist) {
      deletePlaylist(playlist.id);
    }
  });

  // Player controls
  dom.playPauseBtn?.addEventListener("click", togglePlayPause);

  dom.nextTrack?.addEventListener("click", () => {
    playNext(true);
  });

  dom.previousTrack?.addEventListener("click", playPrevious);

  dom.shuffleBtn?.addEventListener("click", () => {
    state.shuffle = !state.shuffle;

    updatePlayer();
    saveState();

    showMessage(
      state.shuffle ? "Shuffle enabled." : "Shuffle disabled.",
      "info"
    );
  });

  dom.repeatBtn?.addEventListener("click", () => {
    state.repeat = !state.repeat;

    updatePlayer();
    saveState();

    showMessage(
      state.repeat ? "Repeat enabled." : "Repeat disabled.",
      "info"
    );
  });

  dom.playerLikeBtn?.addEventListener("click", () => {
    if (state.currentTrack) {
      toggleLike(state.currentTrack);
    } else {
      showMessage("Play a track first.", "info");
    }
  });

  // Seek
  dom.progressBar?.addEventListener("input", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }

    audio.currentTime = Number(dom.progressBar.value);
    updateProgress();
  });

  // Volume
  dom.volume?.addEventListener("input", () => {
    const volume = Number(dom.volume.value);

    audio.volume = Math.min(1, Math.max(0, volume));

    saveState();
  });

  // Theme
  dom.themeToggle?.addEventListener("click", toggleTheme);

  // Backup
  dom.exportBtn?.addEventListener("click", exportBackup);

  dom.importBtn?.addEventListener("click", () => {
    dom.importFile?.click();
  });

  dom.importFile?.addEventListener("change", event => {
    importBackup(event.target.files?.[0]);
  });

  // Audio events
  audio.addEventListener("play", () => {
    state.isPlaying = true;

    updatePlayer();
    updateTrackRows();
  });

  audio.addEventListener("pause", () => {
    state.isPlaying = false;

    updatePlayer();
    updateTrackRows();
  });

  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("durationchange", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);

  audio.addEventListener("ended", () => {
    if (state.repeat) {
      audio.currentTime = 0;

      audio.play().catch(error => {
        console.warn("Repeat playback failed:", error);
      });

      return;
    }

    if (state.queueIndex < state.queue.length - 1 || state.shuffle) {
      playNext(false);
    } else {
      state.isPlaying = false;

      updatePlayer();
      updateTrackRows();
    }
  });

  audio.addEventListener("error", () => {
    if (!state.currentTrack) return;

    const nextCandidate = state.playbackCandidateIndex + 1;

    if (nextCandidate < state.playbackCandidates.length) {
      tryPlaybackCandidate(nextCandidate);
    } else {
      state.isPlaying = false;
      updatePlayer();
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", event => {
    const target = event.target;

    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;

    if (isTyping || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      togglePlayPause();
    }

    if (event.code === "ArrowRight" && event.shiftKey) {
      playNext(true);
    }

    if (event.code === "ArrowLeft" && event.shiftKey) {
      playPrevious();
    }
  });
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function initializeApp() {
  loadState();

  if (dom.volume) {
    dom.volume.value = String(audio.volume);
  }

  if (dom.providerFilter) {
    dom.providerFilter.value = state.searchProvider;
  }

  applyTheme();
  bindEvents();
  renderAll();
  renderLibrary();
  updatePlayer();

  console.info(`${APP_NAME} Music Hub initialized.`);
}

initializeApp();
