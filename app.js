/* ======================================================
   HE3AM MUSIC HUB
   Audius + Jamendo
   Search, playback, playlists, theme, backup & restore
   ====================================================== */

"use strict";

/* =========================
   CONFIG
   ========================= */

const APP_NAME = "HE3AM";
const STORAGE_KEY = "pulseMusic";

const API_PROXY = "https://he3am.ghostrip82.workers.dev";

const AUDIUS_SEARCH_URL = `${API_PROXY}/api/tracks/search`;
const JAMENDO_SEARCH_URL = `${API_PROXY}/api/jamendo/tracks`;

const DEFAULT_LIMIT = 15;

/* =========================
   APP STATE
   ========================= */

const state = {
  tracks: [],
  playlists: [],
  currentTrack: null,
  currentIndex: -1,
  currentPlaylist: null,
  searchQuery: "",
  searchToken: 0,
  isSearching: false,
  provider: "all",
  theme: "dark",
  volume: 0.8,
  repeat: false,
  shuffle: false
};

let audio = null;
let elements = {};

/* =========================
   DOM HELPERS
   ========================= */

function $(selectors, root = document) {
  const list = Array.isArray(selectors)
    ? selectors
    : [selectors];

  for (const selector of list) {
    const found = root.querySelector(selector);
    if (found) return found;
  }

  return null;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined && text !== null) {
    element.textContent = String(text);
  }

  return element;
}

function setText(element, value) {
  if (element) {
    element.textContent = value ?? "";
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );
}

function getProvider(track) {
  const provider = String(
    track?.provider ||
    track?.source ||
    track?.origin ||
    ""
  ).toLowerCase();

  if (provider.includes("jamendo")) {
    return "jamendo";
  }

  if (provider.includes("audius")) {
    return "audius";
  }

  if (
    track?.jamendoId ||
    track?.audiodownload ||
    track?.audioDownload ||
    track?.album?.artist_id
  ) {
    return "jamendo";
  }

  return "audius";
}

function uniqueTracks(tracks) {
  const seen = new Set();

  return tracks.filter(track => {
    const key = `${getProvider(track)}:${
      track.id || track.trackId || track.title
    }`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

/* =========================
   STORAGE
   ========================= */

function loadSavedData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return;

    const saved = JSON.parse(raw);

    if (Array.isArray(saved)) {
      state.playlists = saved;
      return;
    }

    state.playlists = safeArray(
      saved.playlists || saved.userPlaylists
    );

    state.theme = saved.theme || "dark";
    state.volume = Number.isFinite(saved.volume)
      ? saved.volume
      : 0.8;

    state.repeat = Boolean(saved.repeat);
    state.shuffle = Boolean(saved.shuffle);
  } catch (error) {
    console.warn("Could not load saved data:", error);
  }
}

function saveData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        playlists: state.playlists,
        theme: state.theme,
        volume: state.volume,
        repeat: state.repeat,
        shuffle: state.shuffle
      })
    );
  } catch (error) {
    console.error("Could not save data:", error);
    showMessage("ذخیره اطلاعات انجام نشد.");
  }
}

/* =========================
   HTTP HELPERS
   ========================= */

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

/* =========================
   RESPONSE PARSERS
   ========================= */

function extractAudiusTracks(payload) {
  const candidates = [
    payload?.data,
    payload?.tracks,
    payload?.results,
    payload?.data?.data,
    payload?.data?.tracks,
    payload?.response?.data,
    payload?.response?.tracks,
    payload?.response?.results
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (payload?.data && typeof payload.data === "object") {
    if (payload.data.id || payload.data.title) {
      return [payload.data];
    }
  }

  if (payload?.id || payload?.title) {
    return [payload];
  }

  return [];
}

function extractJamendoTracks(payload) {
  const candidates = [
    payload?.results,
    payload?.data,
    payload?.tracks,
    payload?.response,
    payload?.results?.tracks,
    payload?.data?.results,
    payload?.data?.tracks,
    payload?.data?.data,
    payload?.response?.results,
    payload?.response?.data,
    payload?.response?.tracks,
    payload?.tracks?.results
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (payload?.results?.track) {
    return safeArray(payload.results.track);
  }

  if (payload?.results?.headers && payload?.results?.results) {
    return safeArray(payload.results.results);
  }

  return [];
}

/* =========================
   TRACK NORMALIZATION
   ========================= */

function normalizeAudiusTrack(track) {
  const id = getString(
    track?.id,
    track?.trackId,
    track?.permalink
  );

  const artwork = track?.artwork || {};

  return {
    ...track,
    id,
    audiusId: getString(track?.audiusId, id),
    provider: "audius",
    title: getString(track?.title, track?.name, "Untitled"),
    artist: getString(
      track?.artist,
      track?.user?.name,
      track?.user?.handle,
      track?.artist_name,
      "Unknown artist"
    ),
    artwork: getString(
      typeof artwork === "string" ? artwork : "",
      artwork?.["480x480"],
      artwork?.["150x150"],
      artwork?.["1000x1000"],
      track?.thumbnail,
      track?.image
    ),
    duration: Number(track?.duration) || 0,
    streamUrl: getString(
      track?.streamUrl,
      track?.stream_url,
      track?.audio
    ),
    permalink: getString(
      track?.permalink,
      track?.url
    )
  };
}

function normalizeJamendoTrack(track) {
  const id = getString(
    track?.id,
    track?.trackId,
    track?.jamendoId
  );

  const artist = track?.artist || {};

  return {
    ...track,
    id,
    jamendoId: getString(track?.jamendoId, id),
    provider: "jamendo",
    title: getString(
      track?.name,
      track?.title,
      track?.track_name,
      "Untitled"
    ),
    artist: getString(
      typeof artist === "string" ? artist : "",
      artist?.name,
      track?.artist_name,
      track?.artistName,
      "Unknown artist"
    ),
    artwork: getString(
      track?.image,
      track?.album_image,
      track?.albumImage,
      track?.artwork,
      track?.thumbnail
    ),
    duration: Number(
      track?.duration || track?.duration_seconds
    ) || 0,
    streamUrl: getString(
      track?.streamUrl,
      track?.stream,
      track?.audio,
      track?.audio_url,
      track?.audiodownload,
      track?.audioDownload
    ),
    permalink: getString(
      track?.shareurl,
      track?.shorturl,
      track?.url,
      track?.permalink
    )
  };
}

/* =========================
   AUDIO STREAMS
   ========================= */

function getStreamCandidates(track) {
  const provider = getProvider(track);
  const candidates = [];

  if (track?.streamUrl) {
    candidates.push(track.streamUrl);
  }

  if (track?.audio) {
    candidates.push(track.audio);
  }

  if (provider === "audius") {
    const id = getString(
      track?.audiusId,
      track?.id
    );

    if (id) {
      candidates.push(
        `${API_PROXY}/api/tracks/${encodeURIComponent(id)}/stream`
      );

      candidates.push(
        `https://api.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${encodeURIComponent(APP_NAME)}`
      );
    }
  }

  if (provider === "jamendo") {
    if (track?.audiodownload) {
      candidates.push(track.audiodownload);
    }

    if (track?.audioDownload) {
      candidates.push(track.audioDownload);
    }
  }

  return [...new Set(
    candidates.filter(url =>
      typeof url === "string" &&
      /^https?:\/\//i.test(url)
    )
  )];
}

async function playTrack(track, index = -1) {
  if (!track) return;

  const candidates = getStreamCandidates(track);

  if (!candidates.length) {
    showMessage(
      "آدرس پخش برای این آهنگ موجود نیست. آهنگ دیگری را امتحان کن."
    );
    return;
  }

  state.currentTrack = track;
  state.currentIndex = index;

  updatePlayerUI();

  let lastError = null;

  for (const url of candidates) {
    try {
      audio.pause();
      audio.src = url;
      audio.load();

      await audio.play();

      track.streamUrl = url;
      saveData();

      return;
    } catch (error) {
      lastError = error;
      console.warn("Stream failed:", url, error);
    }
  }

  showMessage(
    "این آهنگ پخش نشد. ممکن است لینک صوتی آن در دسترس نباشد."
  );

  console.warn("All stream candidates failed:", lastError);
}

/* Compatibility with older code */
function playAudiusTrack(track, index = -1) {
  return playTrack(
    normalizeAudiusTrack(track),
    index
  );
}

/* =========================
   SEARCH: AUDIUS
   ========================= */

async function searchAudius(query) {
  const url = new URL(AUDIUS_SEARCH_URL);

  url.searchParams.set("query", query);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(DEFAULT_LIMIT));

  const payload = await fetchJSON(url.toString());

  return extractAudiusTracks(payload)
    .map(normalizeAudiusTrack)
    .filter(track => track.id || track.title);
}

/* =========================
   SEARCH: JAMENDO
   ========================= */

async function jamendoFetch(query) {
  const url = new URL(JAMENDO_SEARCH_URL);

  url.searchParams.set("query", query);
  url.searchParams.set("search", query);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(DEFAULT_LIMIT));
  url.searchParams.set("offset", "0");

  return fetchJSON(url.toString());
}

async function searchJamendo(query) {
  const payload = await jamendoFetch(query);

  console.log("Jamendo response:", payload);

  const rawTracks = extractJamendoTracks(payload);

  console.log("Jamendo tracks found:", rawTracks.length);

  return rawTracks
    .map(normalizeJamendoTrack)
    .filter(track => track.id || track.title);
}

/* =========================
   SEARCH: BOTH SERVICES
   ========================= */

async function searchTracks(query) {
  const cleanedQuery = String(query || "").trim();

  if (!cleanedQuery) {
    showMessage("نام آهنگ یا خواننده را وارد کن.");
    return;
  }

  const token = ++state.searchToken;

  state.searchQuery = cleanedQuery;
  state.isSearching = true;

  renderLoading();

  const [audiusResult, jamendoResult] =
    await Promise.allSettled([
      searchAudius(cleanedQuery),
      searchJamendo(cleanedQuery)
    ]);

  // Ignore an older search if the user searched again.
  if (token !== state.searchToken) return;

  const audiusTracks =
    audiusResult.status === "fulfilled"
      ? audiusResult.value
      : [];

  const jamendoTracks =
    jamendoResult.status === "fulfilled"
      ? jamendoResult.value
      : [];

  if (audiusResult.status === "rejected") {
    console.error("Audius search failed:", audiusResult.reason);
  }

  if (jamendoResult.status === "rejected") {
    console.error("Jamendo search failed:", jamendoResult.reason);
  }

  // Keep results from both services, even when one service fails.
  state.tracks = uniqueTracks([
    ...audiusTracks,
    ...jamendoTracks
  ]);

  state.isSearching = false;

  renderTracks();

  setText(
    elements.searchStatus,
    `Audius: ${audiusTracks.length} | Jamendo: ${jamendoTracks.length}`
  );

  if (!state.tracks.length) {
    showMessage(
      "نتیجه‌ای پیدا نشد. اتصال Worker و پاسخ API را بررسی کن."
    );
  }
}

/* =========================
   UI ELEMENT DISCOVERY
   ========================= */

function discoverElements() {
  elements.searchInput = $([
    "#searchInput",
    "#search-input",
    "#search",
    "#query",
    'input[type="search"]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="جستجو"]'
  ]);

  elements.searchButton = $([
    "#searchBtn",
    "#searchButton",
    "#search-button",
    "#search-submit",
    '[data-action="search"]'
  ]);

  elements.results = $([
    "#trackList",
    "#tracksList",
    "#searchResults",
    "#search-results",
    "#results",
    "#tracks",
    ".track-list",
    ".search-results"
  ]);

  elements.searchStatus = $([
    "#searchStatus",
    "#search-status",
    "#resultsCount"
  ]);

  elements.playlists = $([
    "#playlists",
    "#playlistList",
    "#playlist-list",
    "#playlistContainer"
  ]);

  elements.playerTitle = $([
    "#playerTitle",
    "#nowPlayingTitle",
    "#currentTrackTitle"
  ]);

  elements.playerArtist = $([
    "#playerArtist",
    "#nowPlayingArtist",
    "#currentTrackArtist"
  ]);

  elements.playerArtwork = $([
    "#playerArtwork",
    "#nowPlayingArtwork",
    "#currentTrackArtwork"
  ]);

  elements.audio = $([
    "#audioPlayer",
    "#audio",
    "audio#player",
    "audio"
  ]);

  elements.themeButton = $([
    "#themeToggle",
    "#theme-toggle",
    '[data-action="theme"]'
  ]);

  elements.backupButton = $([
    "#exportBackup",
    "#backupExport",
    "#export-backup",
    '[data-action="export"]'
  ]);

  elements.restoreInput = $([
    "#importBackup",
    "#backupImport",
    "#restoreBackup",
    'input[type="file"][accept*="json"]'
  ]);

  elements.providerFilter = $([
    "#providerFilter",
    "#provider-filter"
  ]);
}

/* =========================
   CREATE MISSING CONTAINERS
   ========================= */

function ensureResultsContainer() {
  if (elements.results) return;

  const main = $([
    "main",
    "#app",
    ".app",
    ".container",
    "body"
  ]);

  if (!main) return;

  elements.results = createElement(
    "div",
    "he3am-results"
  );

  elements.results.id = "he3am-results";

  main.appendChild(elements.results);
}

function ensureStatusContainer() {
  if (elements.searchStatus) return;

  if (!elements.results?.parentElement) return;

  elements.searchStatus = createElement(
    "p",
    "he3am-search-status"
  );

  elements.searchStatus.id = "he3am-search-status";

  elements.results.parentElement.insertBefore(
    elements.searchStatus,
    elements.results
  );
}

/* =========================
   RENDERING
   ========================= */

function renderLoading() {
  if (elements.results) {
    elements.results.replaceChildren(
      createElement("p", "loading", "در حال جستجو در Audius و Jamendo…")
    );
  }

  setText(elements.searchStatus, "در حال دریافت نتایج…");
}

function renderTracks() {
  if (!elements.results) return;

  elements.results.replaceChildren();

  const filteredTracks = state.tracks.filter(track => {
    return (
      state.provider === "all" ||
      getProvider(track) === state.provider
    );
  });

  if (!filteredTracks.length) {
    elements.results.appendChild(
      createElement("p", "empty-results", "آهنگی برای نمایش وجود ندارد.")
    );

    return;
  }

  const fragment = document.createDocumentFragment();

  filteredTracks.forEach(track => {
    const originalIndex = state.tracks.indexOf(track);

    const card = createElement("article", "track-card");
    card.dataset.provider = getProvider(track);

    const image = createElement("img", "track-artwork");
    image.alt = `${track.title} artwork`;
    image.loading = "lazy";
    image.src = track.artwork || "";
    image.onerror = () => {
      image.style.visibility = "hidden";
    };

    const info = createElement("div", "track-info");

    const title = createElement(
      "div",
      "track-title",
      track.title
    );

    const artist = createElement(
      "div",
      "track-artist",
      track.artist
    );

    const provider = createElement(
      "span",
      `track-provider ${getProvider(track)}`,
      getProvider(track) === "jamendo"
        ? "Jamendo"
        : "Audius"
    );

    const actions = createElement("div", "track-actions");

    const playButton = createElement(
      "button",
      "track-play",
      "▶ پخش"
    );

    playButton.type = "button";

    playButton.addEventListener("click", () => {
      playTrack(track, originalIndex);
    });

    const addButton = createElement(
      "button",
      "track-add",
      "+ پلی‌لیست"
    );

    addButton.type = "button";

    addButton.addEventListener("click", () => {
      addTrackToPlaylist(track);
    });

    info.append(title, artist, provider);
    actions.append(playButton, addButton);
    card.append(image, info, actions);
    fragment.appendChild(card);
  });

  elements.results.appendChild(fragment);
}

/* =========================
   PLAYER
   ========================= */

function updatePlayerUI() {
  const track = state.currentTrack;

  if (!track) return;

  setText(elements.playerTitle, track.title);
  setText(elements.playerArtist, track.artist);

  if (elements.playerArtwork && track.artwork) {
    elements.playerArtwork.src = track.artwork;
  }

  document.title = `${track.title} — ${APP_NAME}`;
}

function playNext() {
  if (!state.tracks.length) return;

  let nextIndex;

  if (state.shuffle) {
    nextIndex = Math.floor(Math.random() * state.tracks.length);
  } else {
    nextIndex = state.currentIndex + 1;

    if (nextIndex >= state.tracks.length) {
      if (state.repeat) {
        nextIndex = 0;
      } else {
        return;
      }
    }
  }

  playTrack(state.tracks[nextIndex], nextIndex);
}

function playPrevious() {
  if (!state.tracks.length) return;

  let previousIndex = state.currentIndex - 1;

  if (previousIndex < 0) {
    previousIndex = state.tracks.length - 1;
  }

  playTrack(state.tracks[previousIndex], previousIndex);
}

function setupPlayer() {
  audio = elements.audio || createElement("audio");

  audio.id = audio.id || "he3am-audio";
  audio.preload = "metadata";
  audio.volume = state.volume;

  if (!audio.isConnected) {
    document.body.appendChild(audio);
  }

  audio.addEventListener("ended", () => {
    if (state.repeat && state.currentTrack) {
      audio.currentTime = 0;
      audio.play().catch(console.warn);
    } else {
      playNext();
    }
  });

  audio.addEventListener("error", () => {
    console.warn("Audio playback error:", audio.error);
  });

  const nextButton = $([
    "#nextTrack",
    "#nextBtn",
    "#next",
    '[data-action="next"]'
  ]);

  const previousButton = $([
    "#previousTrack",
    "#prevBtn",
    "#previous",
    '[data-action="previous"]'
  ]);

  const volumeControl = $([
    "#volume",
    "#volumeSlider",
    'input[type="range"][data-volume]'
  ]);

  const shuffleButton = $([
    "#shuffle",
    "#shuffleBtn",
    '[data-action="shuffle"]'
  ]);

  const repeatButton = $([
    "#repeat",
    "#repeatBtn",
    '[data-action="repeat"]'
  ]);

  nextButton?.addEventListener("click", playNext);
  previousButton?.addEventListener("click", playPrevious);

  volumeControl?.addEventListener("input", () => {
    state.volume = Number(volumeControl.value);
    audio.volume = state.volume;
    saveData();
  });

  shuffleButton?.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    shuffleButton.setAttribute(
      "aria-pressed",
      String(state.shuffle)
    );
    saveData();
  });

  repeatButton?.addEventListener("click", () => {
    state.repeat = !state.repeat;
    audio.loop = state.repeat;
    repeatButton.setAttribute(
      "aria-pressed",
      String(state.repeat)
    );
    saveData();
  });
}

/* =========================
   PLAYLISTS
   ========================= */

function createPlaylist(name) {
  const cleanName = String(name || "").trim();

  if (!cleanName) {
    showMessage("نام پلی‌لیست را وارد کن.");
    return null;
  }

  const playlist = {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    name: cleanName,
    tracks: [],
    createdAt: new Date().toISOString()
  };

  state.playlists.push(playlist);

  saveData();
  renderPlaylists();

  return playlist;
}

function addTrackToPlaylist(track) {
  if (!state.playlists.length) {
    const name = prompt("نام پلی‌لیست جدید:");

    if (!name) return;

    const playlist = createPlaylist(name);

    if (!playlist) return;

    playlist.tracks.push({ ...track });
    saveData();
    renderPlaylists();

    showMessage("آهنگ به پلی‌لیست اضافه شد.");
    return;
  }

  const names = state.playlists
    .map((playlist, index) => `${index + 1}. ${playlist.name}`)
    .join("\n");

  const choice = prompt(
    `شماره پلی‌لیست را وارد کن:\n${names}\n\nبرای ساخت پلی‌لیست جدید عدد 0 را وارد کن.`
  );

  if (choice === null) return;

  if (choice.trim() === "0") {
    const name = prompt("نام پلی‌لیست جدید:");

    if (!name) return;

    const playlist = createPlaylist(name);

    if (!playlist) return;

    playlist.tracks.push({ ...track });
  } else {
    const index = Number(choice) - 1;
    const playlist = state.playlists[index];

    if (!playlist) {
      showMessage("شماره پلی‌لیست معتبر نیست.");
      return;
    }

    if (!Array.isArray(playlist.tracks)) {
      playlist.tracks = [];
    }

    const exists = playlist.tracks.some(item =>
      getProvider(item) === getProvider(track) &&
      String(item.id) === String(track.id)
    );

    if (exists) {
      showMessage("این آهنگ از قبل در پلی‌لیست وجود دارد.");
      return;
    }

    playlist.tracks.push({ ...track });
  }

  saveData();
  renderPlaylists();

  showMessage("آهنگ به پلی‌لیست اضافه شد.");
}

function renderPlaylists() {
  if (!elements.playlists) return;

  elements.playlists.replaceChildren();

  state.playlists.forEach(playlist => {
    if (!Array.isArray(playlist.tracks)) {
      playlist.tracks = [];
    }

    const section = createElement("section", "playlist-card");

    const heading = createElement(
      "h3",
      "playlist-name",
      playlist.name
    );

    const count = createElement(
      "span",
      "playlist-count",
      `${playlist.tracks.length} آهنگ`
    );

    const list = createElement("div", "playlist-tracks");

    playlist.tracks.forEach((track, index) => {
      const item = createElement("div", "playlist-track");

      const label = createElement(
        "span",
        "playlist-track-label",
        `${track.title || "Untitled"} — ${track.artist || "Unknown artist"}`
      );

      const playButton = createElement("button", "", "▶");

      playButton.type = "button";

      playButton.addEventListener("click", () => {
        state.currentPlaylist = playlist.id;
        playTrack(track, index);
      });

      const removeButton = createElement("button", "", "حذف");

      removeButton.type = "button";

      removeButton.addEventListener("click", () => {
        playlist.tracks.splice(index, 1);
        saveData();
        renderPlaylists();
      });

      item.append(label, playButton, removeButton);
      list.appendChild(item);
    });

    const deleteButton = createElement(
      "button",
      "delete-playlist",
      "حذف پلی‌لیست"
    );

    deleteButton.type = "button";

    deleteButton.addEventListener("click", () => {
      const confirmed = confirm(
        `پلی‌لیست «${playlist.name}» حذف شود؟`
      );

      if (!confirmed) return;

      state.playlists = state.playlists.filter(
        item => item.id !== playlist.id
      );

      saveData();
      renderPlaylists();
    });

    section.append(heading, count, list, deleteButton);
    elements.playlists.appendChild(section);
  });
}

/* =========================
   THEME
   ========================= */

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;

  document.documentElement.classList.toggle(
    "light-theme",
    state.theme === "light"
  );

  document.documentElement.classList.toggle(
    "dark-theme",
    state.theme === "dark"
  );

  if (elements.themeButton) {
    elements.themeButton.setAttribute(
      "aria-pressed",
      String(state.theme === "light")
    );

    elements.themeButton.textContent =
      state.theme === "light" ? "☀️" : "🌙";
  }
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";

  applyTheme();
  saveData();
}

/* =========================
   BACKUP / RESTORE
   ========================= */

function exportBackup() {
  const backup = {
    app: APP_NAME,
    version: 2,
    exportedAt: new Date().toISOString(),
    playlists: state.playlists,
    theme: state.theme,
    volume: state.volume,
    repeat: state.repeat,
    shuffle: state.shuffle
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = createElement("a");

  link.href = url;
  link.download = "he3am-backup.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);

    const playlists = Array.isArray(backup)
      ? backup
      : backup.playlists || backup.userPlaylists;

    if (!Array.isArray(playlists)) {
      throw new Error("Invalid backup format");
    }

    state.playlists = playlists.map(playlist => ({
      ...playlist,
      tracks: safeArray(playlist.tracks)
    }));

    if (backup.theme) state.theme = backup.theme;
    if (Number.isFinite(backup.volume)) {
      state.volume = backup.volume;
    }

    state.repeat = Boolean(backup.repeat);
    state.shuffle = Boolean(backup.shuffle);

    saveData();
    applyTheme();
    renderPlaylists();

    if (audio) audio.volume = state.volume;

    showMessage("بکاپ با موفقیت بازیابی شد.");
  } catch (error) {
    console.error("Backup import failed:", error);
    showMessage("فایل بکاپ معتبر نیست.");
  }
}

/* =========================
   FILTERS
   ========================= */

function setupProviderFilter() {
  if (!elements.providerFilter) return;

  elements.providerFilter.addEventListener("change", () => {
    state.provider = elements.providerFilter.value || "all";
    renderTracks();
  });
}

/* =========================
   SEARCH EVENTS
   ========================= */

function setupSearch() {
  if (elements.searchButton) {
    elements.searchButton.addEventListener("click", () => {
      searchTracks(elements.searchInput?.value || "");
    });
  }

  if (elements.searchInput) {
    elements.searchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchTracks(elements.searchInput.value);
      }
    });
  }

  // Support an existing search form without requiring a new HTML file.
  const form = elements.searchInput?.closest("form");

  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      searchTracks(elements.searchInput?.value || "");
    });
  }
}

/* =========================
   BUTTON EVENTS
   ========================= */

function setupButtons() {
  elements.themeButton?.addEventListener("click", toggleTheme);

  elements.backupButton?.addEventListener("click", exportBackup);

  elements.restoreInput?.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    await importBackup(file);

    event.target.value = "";
  });

  const newPlaylistButton = $([
    "#newPlaylist",
    "#createPlaylist",
    "#create-playlist",
    '[data-action="new-playlist"]'
  ]);

  newPlaylistButton?.addEventListener("click", () => {
    const name = prompt("نام پلی‌لیست جدید:");

    if (name) createPlaylist(name);
  });
}

/* =========================
   NOTIFICATIONS
   ========================= */

function showMessage(message) {
  console.info(`[${APP_NAME}] ${message}`);

  let notice = $("#he3am-notice");

  if (!notice) {
    notice = createElement("div", "he3am-notice");
    notice.id = "he3am-notice";

    Object.assign(notice.style, {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "99999",
      padding: "12px 18px",
      borderRadius: "12px",
      background: "#222",
      color: "#fff",
      maxWidth: "90%",
      textAlign: "center"
    });

    document.body.appendChild(notice);
  }

  notice.textContent = message;
  notice.hidden = false;

  clearTimeout(notice._hideTimer);

  notice._hideTimer = setTimeout(() => {
    notice.hidden = true;
  }, 3500);
}

/* =========================
   OPTIONAL GLOBAL API
   ========================= */

window.HE3AM = {
  search: searchTracks,
  play: playTrack,
  next: playNext,
  previous: playPrevious,
  createPlaylist,
  addTrackToPlaylist,
  exportBackup,
  importBackup,
  toggleTheme,
  get state() {
    return state;
  }
};

/* =========================
   INITIALIZATION
   ========================= */

function initHE3AM() {
  discoverElements();

  ensureResultsContainer();
  ensureStatusContainer();

  loadSavedData();
  setupPlayer();
  setupSearch();
  setupButtons();
  setupProviderFilter();

  applyTheme();
  renderPlaylists();

  console.info(`${APP_NAME} Music Hub initialized.`);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHE3AM, {
    once: true
  });
} else {
  initHE3AM();
}
