
/* =========================================================
   HE3AM MUSIC HUB
   Audius + Jamendo | Search | Player | Playlists | Backup
   ========================================================= */

"use strict";

/* -------------------------
   CONFIG
   ------------------------- */

const APP_NAME = "HE3AM";
const STORAGE_KEY = "pulseMusic";
const API_PROXY = "https://he3am.ghostrip82.workers.dev";
const AUDIUS_SEARCH_URL = `${API_PROXY}/api/tracks/search`;
const JAMENDO_SEARCH_URL = `${API_PROXY}/api/jamendo/tracks`;
const DEFAULT_LIMIT = 15;
const PLACEHOLDER_COVER =
  "https://placehold.co/160x160/1b211d/39e58c?text=H";

/* -------------------------
   STATE
   ------------------------- */

const state = {
  tracks: [],
  playlists: [],
  currentTrack: null,
  currentIndex: -1,
  currentPlaylist: null,
  searchQuery: "",
  searchToken: 0,
  playToken: 0,
  provider: "all",
  theme: "dark",
  volume: 0.8,
  repeat: false,
  shuffle: false
};

let audio;
let elements = {};
let noticeTimer;

/* -------------------------
   HELPERS
   ------------------------- */

function $(selector, root = document) {
  return root.querySelector(selector);
}

function createElement(tag, className = "", text = "") {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined && text !== null) {
    element.textContent = String(text);
  }

  return element;
}

function setText(element, value) {
  if (element) element.textContent = value ?? "";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function showMessage(message) {
  console.info(`[${APP_NAME}] ${message}`);

  let notice = $("#he3am-notice");

  if (!notice) {
    notice = createElement("div", "he3am-notice");
    notice.id = "he3am-notice";
    notice.setAttribute("role", "status");
    document.body.appendChild(notice);
  }

  notice.textContent = message;
  notice.hidden = false;

  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.hidden = true;
  }, 3500);
}

function getProvider(track) {
  const provider = String(
    track?.provider ||
    track?.source ||
    track?.origin ||
    ""
  ).toLowerCase();

  if (provider.includes("jamendo")) return "jamendo";
  if (provider.includes("audius")) return "audius";

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
    const id = getString(
      track.id,
      track.trackId,
      track.title
    );

    const key = `${getProvider(track)}:${id}`;

    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });
}

function normalizePlaylist(playlist) {
  return {
    id: getString(playlist?.id) ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: getString(playlist?.name, "My Playlist"),
    tracks: safeArray(playlist?.tracks),
    createdAt: playlist?.createdAt || new Date().toISOString()
  };
}

/* -------------------------
   DOM DISCOVERY
   ------------------------- */

function discoverElements() {
  elements.searchForm = $("#searchForm");
  elements.searchInput = $("#searchInput");
  elements.searchButton = $("#searchButton");
  elements.searchStatus = $("#searchStatus");
  elements.results = $("#trackList");
  elements.providerFilter = $("#providerFilter");

  elements.playlists = $("#playlists");
  elements.playlistGrid = $("#playlistGrid");
  elements.playlistCount = $("#playlistCount");
  elements.trackCount = $("#trackCount");
  elements.currentPlaylist = $("#currentPlaylist");

  elements.playerTitle = $("#playerTitle");
  elements.playerArtist = $("#playerArtist");
  elements.playerArtwork = $("#playerArtwork");
  elements.playPauseButton = $("#playPauseBtn");
  elements.progressBar = $("#progressBar");
  elements.currentTime = $("#currentTime");
  elements.duration = $("#duration");
  elements.volume = $("#volume");

  elements.themeButton = $("#themeToggle");
  elements.exportButton = $("#exportBackup");
  elements.importInput = $("#importBackup");
  elements.newPlaylistButtons = [
    $("#newPlaylist"),
    $("#createPlaylist")
  ].filter(Boolean);
}

/* -------------------------
   STORAGE
   ------------------------- */

function loadSavedData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);

    // Support older backups that saved playlists as an array.
    if (Array.isArray(saved)) {
      state.playlists = saved.map(normalizePlaylist);
      return;
    }

    state.playlists = safeArray(
      saved.playlists || saved.userPlaylists
    ).map(normalizePlaylist);

    state.theme = saved.theme === "light" ? "light" : "dark";

    const savedVolume = Number(saved.volume);
    if (Number.isFinite(savedVolume)) {
      state.volume = Math.min(1, Math.max(0, savedVolume));
    }

    state.repeat = Boolean(saved.repeat);
    state.shuffle = Boolean(saved.shuffle);
  } catch (error) {
    console.warn("Could not load saved data:", error);
    showMessage("اطلاعات ذخیره‌شده قابل خواندن نبود.");
  }
}

function saveData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
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

/* -------------------------
   API
   ------------------------- */

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

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
    if (Array.isArray(candidate)) return candidate;
  }

  if (payload?.data && typeof payload.data === "object") {
    if (payload.data.id || payload.data.title) {
      return [payload.data];
    }
  }

  if (payload?.id || payload?.title) return [payload];

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
    if (Array.isArray(candidate)) return candidate;
  }

  if (payload?.results?.track) {
    return safeArray(payload.results.track);
  }

  return [];
}

/* -------------------------
   TRACK NORMALIZATION
   ------------------------- */

function normalizeAudiusTrack(track) {
  const artwork = track?.artwork || {};
  const id = getString(track?.id, track?.trackId);

  return {
    ...track,
    id,
    audiusId: getString(track?.audiusId, id),
    provider: "audius",
    title: getString(track?.title, track?.name, "Untitled"),
    artist: getString(
      typeof track?.artist === "string" ? track.artist : "",
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
    permalink: getString(track?.permalink, track?.url)
  };
}

function normalizeJamendoTrack(track) {
  const id = getString(track?.id, track?.trackId, track?.jamendoId);
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
    duration: Number(track?.duration || track?.duration_seconds) || 0,
    streamUrl: getString(
      track?.streamUrl,
      track?.stream,
      track?.audio,
      track?.audio_url,
      track?.audiodownload,
      track?.audioDownload
    ),
    audiodownload: getString(track?.audiodownload),
    audioDownload: getString(track?.audioDownload),
    permalink: getString(
      track?.shareurl,
      track?.shorturl,
      track?.url,
      track?.permalink
    )
  };
}

/* -------------------------
   SEARCH
   ------------------------- */

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

async function searchJamendo(query) {
  const url = new URL(JAMENDO_SEARCH_URL);

  url.searchParams.set("query", query);
  url.searchParams.set("search", query);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(DEFAULT_LIMIT));
  url.searchParams.set("offset", "0");

  const payload = await fetchJSON(url.toString());

  return extractJamendoTracks(payload)
    .map(normalizeJamendoTrack)
    .filter(track => track.id || track.title);
}

async function searchTracks(query) {
  const cleaned = String(query || "").trim();

  if (!cleaned) {
    showMessage("نام آهنگ یا خواننده را وارد کن.");
    elements.searchInput?.focus();
    return;
  }

  const token = ++state.searchToken;
  state.searchQuery = cleaned;

  setText(elements.searchStatus, "در حال جستجو در Audius و Jamendo…");
  renderLoading();

  const [audiusResult, jamendoResult] = await Promise.allSettled([
    searchAudius(cleaned),
    searchJamendo(cleaned)
  ]);

  // Ignore results from an earlier search.
  if (token !== state.searchToken) return;

  const audiusTracks = audiusResult.status === "fulfilled"
    ? audiusResult.value
    : [];

  const jamendoTracks = jamendoResult.status === "fulfilled"
    ? jamendoResult.value
    : [];

  if (audiusResult.status === "rejected") {
    console.error("Audius search failed:", audiusResult.reason);
  }

  if (jamendoResult.status === "rejected") {
    console.error("Jamendo search failed:", jamendoResult.reason);
  }

  state.tracks = uniqueTracks([...audiusTracks, ...jamendoTracks]);

  renderTracks();

  const failed = [
    audiusResult.status === "rejected" ? "Audius" : "",
    jamendoResult.status === "rejected" ? "Jamendo" : ""
  ].filter(Boolean);

  setText(
    elements.searchStatus,
    `${state.tracks.length} tracks · Audius: ${audiusTracks.length} · Jamendo: ${jamendoTracks.length}` +
      (failed.length ? ` · Unavailable: ${failed.join(", ")}` : "")
  );

  if (!state.tracks.length) {
    showMessage(
      failed.length === 2
        ? "جستجو در هر دو سرویس ناموفق بود. Worker را بررسی کن."
        : "نتیجه‌ای پیدا نشد. عبارت دیگری امتحان کن."
    );
  }
}

function renderLoading() {
  if (!elements.results) return;

  const loading = createElement("div", "empty-state");
  loading.append(
    createElement("span", "empty-icon", "♫"),
    createElement("h3", "", "Searching for music…"),
    createElement("p", "", "Checking Audius and Jamendo.")
  );

  elements.results.replaceChildren(loading);
  setText(elements.trackCount, "…");
}

/* -------------------------
   TRACK RENDERING
   ------------------------- */

function renderTracks() {
  if (!elements.results) return;

  const filtered = state.tracks.filter(track =>
    state.provider === "all" || getProvider(track) === state.provider
  );

  setText(elements.trackCount, filtered.length);
  elements.results.replaceChildren();

  if (!filtered.length) {
    const empty = createElement("div", "empty-state");
    empty.append(
      createElement("span", "empty-icon", "♫"),
      createElement("h3", "", state.tracks.length
        ? "No tracks for this filter"
        : "Your next favorite starts here"),
      createElement("p", "", state.tracks.length
        ? "Choose another music platform."
        : "Search for a song or artist to explore music.")
    );

    elements.results.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach(track => {
    const originalIndex = state.tracks.indexOf(track);
    const provider = getProvider(track);
    const card = createElement("article", "track-card");
    card.dataset.provider = provider;

    const image = createElement("img", "track-artwork");
    image.alt = `${track.title} artwork`;
    image.loading = "lazy";
    image.src = track.artwork || PLACEHOLDER_COVER;
    image.onerror = () => {
      image.onerror = null;
      image.src = PLACEHOLDER_COVER;
    };

    const info = createElement("div", "track-info");
    const title = createElement("div", "track-title", track.title);
    const artist = createElement("div", "track-artist", track.artist);
    const badge = createElement(
      "span",
      `track-provider ${provider}`,
      provider === "jamendo" ? "Jamendo" : "Audius"
    );

    const actions = createElement("div", "track-actions");
    const playButton = createElement("button", "track-play", "▶ Play");
    playButton.type = "button";
    playButton.addEventListener("click", () => playTrack(track));

    const addButton = createElement("button", "track-add", "+ Playlist");
    addButton.type = "button";
    addButton.addEventListener("click", () => addTrackToPlaylist(track));

    info.append(title, artist, badge);
    actions.append(playButton, addButton);
    card.append(image, info, actions);
    fragment.appendChild(card);

    // Preserve original search index for next/previous playback.
    card.dataset.trackIndex = String(originalIndex);
  });

  elements.results.appendChild(fragment);
}

/* -------------------------
   AUDIO STREAMS
   ------------------------- */

function getStreamCandidates(track) {
  const provider = getProvider(track);
  const candidates = [];

  const addCandidate = value => {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      candidates.push(value);
    }
  };

  addCandidate(track?.streamUrl);
  addCandidate(track?.stream_url);
  addCandidate(track?.audio);
  addCandidate(track?.stream);

  if (provider === "audius") {
    const id = getString(track?.audiusId, track?.id);

    if (id) {
      addCandidate(
        `${API_PROXY}/api/tracks/${encodeURIComponent(id)}/stream`
      );

      addCandidate(
        `https://api.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${encodeURIComponent(APP_NAME)}`
      );
    }
  }

  if (provider === "jamendo") {
    addCandidate(track?.audiodownload);
    addCandidate(track?.audioDownload);
    addCandidate(track?.audio_url);
  }

  return [...new Set(candidates)];
}

async function playTrack(track, index = -1) {
  if (!track || !audio) return;

  const candidates = getStreamCandidates(track);

  if (!candidates.length) {
    showMessage("لینک پخش این آهنگ موجود نیست.");
    return;
  }

  const playToken = ++state.playToken;
  state.currentTrack = track;

  const resolvedIndex = index >= 0
    ? index
    : state.tracks.findIndex(item =>
        getProvider(item) === getProvider(track) &&
        String(item.id) === String(track.id)
      );

  state.currentIndex = resolvedIndex;
  updatePlayerUI();

  let lastError = null;

  for (const url of candidates) {
    if (playToken !== state.playToken) return;

    try {
      audio.pause();
      audio.src = url;
      audio.load();

      await audio.play();

      if (playToken !== state.playToken) {
        audio.pause();
        return;
      }

      track.streamUrl = url;
      saveData();
      return;
    } catch (error) {
      lastError = error;
      console.warn("Stream failed:", url, error);
    }
  }

  if (playToken === state.playToken) {
    showMessage(
      "پخش این آهنگ ناموفق بود؛ ممکن است لینک صوتی در دسترس نباشد."
    );
    console.warn("All stream candidates failed:", lastError);
  }
}

function updatePlayerUI() {
  const track = state.currentTrack;
  if (!track) return;

  setText(elements.playerTitle, track.title || "Untitled");
  setText(elements.playerArtist, track.artist || "Unknown artist");

  if (elements.playerArtwork) {
    elements.playerArtwork.onerror = () => {
      elements.playerArtwork.onerror = null;
      elements.playerArtwork.src = PLACEHOLDER_COVER;
    };

    elements.playerArtwork.src = track.artwork || PLACEHOLDER_COVER;
  }

  document.title = `${track.title || "Music"} — ${APP_NAME}`;
  setText(elements.currentTime, "0:00");
  setText(elements.duration, formatTime(track.duration || 0));

  if (elements.progressBar) elements.progressBar.value = 0;
}

function playNext() {
  if (!state.tracks.length) {
    showMessage("اول یک آهنگ جستجو کن.");
    return;
  }

  let nextIndex;

  if (state.shuffle) {
    if (state.tracks.length === 1) {
      nextIndex = 0;
    } else {
      do {
        nextIndex = Math.floor(Math.random() * state.tracks.length);
      } while (nextIndex === state.currentIndex);
    }
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

  if (audio && audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  let previousIndex = state.currentIndex - 1;

  if (previousIndex < 0) {
    previousIndex = state.tracks.length - 1;
  }

  playTrack(state.tracks[previousIndex], previousIndex);
}

/* -------------------------
   PLAYER SETUP
   ------------------------- */

function setupPlayer() {
  audio = $("#audioPlayer") || createElement("audio");
  audio.preload = "metadata";
  audio.volume = state.volume;

  if (!audio.isConnected) document.body.appendChild(audio);

  if (elements.volume) elements.volume.value = state.volume;

  elements.playPauseButton?.addEventListener("click", async () => {
    if (!state.currentTrack) {
      showMessage("اول یک آهنگ انتخاب کن.");
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        console.warn("Resume failed:", error);
        showMessage("پخش آهنگ شروع نشد.");
      }
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("play", () => {
    setText(elements.playPauseButton, "Ⅱ");
    elements.playPauseButton?.setAttribute("aria-label", "Pause");
  });

  audio.addEventListener("pause", () => {
    setText(elements.playPauseButton, "▶");
    elements.playPauseButton?.setAttribute("aria-label", "Play");
  });

  audio.addEventListener("timeupdate", () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;

    if (elements.progressBar) {
      elements.progressBar.value = duration
        ? (audio.currentTime / duration) * 100
        : 0;
    }

    setText(elements.currentTime, formatTime(audio.currentTime));
    setText(elements.duration, formatTime(duration));
  });

  audio.addEventListener("loadedmetadata", () => {
    setText(elements.duration, formatTime(audio.duration));
  });

  audio.addEventListener("ended", () => {
    if (state.repeat) {
      audio.currentTime = 0;
      audio.play().catch(error => console.warn("Repeat failed:", error));
    } else {
      playNext();
    }
  });

  audio.addEventListener("error", () => {
    console.warn("Audio playback error:", audio.error);
  });

  elements.progressBar?.addEventListener("input", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime =
        (Number(elements.progressBar.value) / 100) * audio.duration;
    }
  });

  elements.volume?.addEventListener("input", () => {
    state.volume = Math.min(1, Math.max(0, Number(elements.volume.value)));
    audio.volume = state.volume;
    saveData();
  });

  $("#nextTrack")?.addEventListener("click", playNext);
  $("#previousTrack")?.addEventListener("click", playPrevious);

  const shuffleButton = $("#shuffle");
  shuffleButton?.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    shuffleButton.setAttribute("aria-pressed", String(state.shuffle));
    saveData();
  });

  const repeatButton = $("#repeat");
  repeatButton?.addEventListener("click", () => {
    state.repeat = !state.repeat;
    repeatButton.setAttribute("aria-pressed", String(state.repeat));
    saveData();
  });
}

/* -------------------------
   PLAYLISTS
   ------------------------- */

function createPlaylist(name) {
  const cleanName = String(name || "").trim();

  if (!cleanName) {
    showMessage("نام پلی‌لیست را وارد کن.");
    return null;
  }

  if (state.playlists.some(
    playlist => playlist.name.toLowerCase() === cleanName.toLowerCase()
  )) {
    showMessage("یک پلی‌لیست با این نام از قبل وجود دارد.");
    return null;
  }

  const playlist = normalizePlaylist({
    id: globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: cleanName,
    tracks: [],
    createdAt: new Date().toISOString()
  });

  state.playlists.push(playlist);
  saveData();
  renderPlaylists();

  showMessage("پلی‌لیست ساخته شد.");
  return playlist;
}

function promptCreatePlaylist() {
  const name = prompt("نام پلی‌لیست جدید:");

  if (name !== null && name.trim()) {
    createPlaylist(name);
  }
}

function addTrackToPlaylist(track) {
  if (!state.playlists.length) {
    const name = prompt("برای این آهنگ یک پلی‌لیست بساز:");

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
    const playlist = state.playlists[Number(choice) - 1];

    if (!playlist) {
      showMessage("شماره پلی‌لیست معتبر نیست.");
      return;
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

function openPlaylist(playlistId) {
  const playlist = state.playlists.find(item => item.id === playlistId);
  if (!playlist || !elements.currentPlaylist) return;

  state.currentPlaylist = playlist.id;
  elements.currentPlaylist.replaceChildren();

  const header = createElement("div", "section-header");
  const headingGroup = createElement("div");
  headingGroup.append(
    createElement("span", "section-kicker", "YOUR COLLECTION"),
    createElement("h2", "", playlist.name),
    createElement("p", "", `${playlist.tracks.length} tracks`)
  );

  const closeButton = createElement("button", "", "Close");
  closeButton.type = "button";
  closeButton.addEventListener("click", () => {
    state.currentPlaylist = null;
    elements.currentPlaylist.replaceChildren();
  });

  header.append(headingGroup, closeButton);

  const list = createElement("div", "playlist-tracks");

  if (!playlist.tracks.length) {
    list.appendChild(
      createElement("p", "empty-results", "هنوز آهنگی به این پلی‌لیست اضافه نشده.")
    );
  }

  playlist.tracks.forEach((track, index) => {
    const row = createElement("div", "playlist-track");
    const label = createElement(
      "span",
      "playlist-track-label",
      `${track.title || "Untitled"} — ${track.artist || "Unknown artist"}`
    );

    const playButton = createElement("button", "", "▶");
    playButton.type = "button";
    playButton.addEventListener("click", () => {
      const searchIndex = state.tracks.findIndex(item =>
        getProvider(item) === getProvider(track) &&
        String(item.id) === String(track.id)
      );

      playTrack(track, searchIndex);
    });

    const removeButton = createElement("button", "", "Remove");
    removeButton.type = "button";
    removeButton.addEventListener("click", () => {
      playlist.tracks.splice(index, 1);
      saveData();
      renderPlaylists();
      openPlaylist(playlist.id);
    });

    row.append(label, playButton, removeButton);
    list.appendChild(row);
  });

  elements.currentPlaylist.append(header, list);
  elements.currentPlaylist.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderPlaylists() {
  const playlists = state.playlists;

  setText(elements.playlistCount, playlists.length);

  if (elements.playlists) {
    elements.playlists.replaceChildren();

    playlists.forEach(playlist => {
      const button = createElement(
        "button",
        "sidebar-playlist",
        playlist.name
      );

      button.type = "button";
      button.title = playlist.name;
      button.addEventListener("click", () => openPlaylist(playlist.id));

      elements.playlists.appendChild(button);
    });
  }

  if (elements.playlistGrid) {
    elements.playlistGrid.replaceChildren();

    if (!playlists.length) {
      const empty = createElement("div", "empty-state");
      empty.append(
        createElement("span", "empty-icon", "＋"),
        createElement("h3", "", "Build your own collection"),
        createElement("p", "", "Create a playlist and save tracks you love.")
      );
      elements.playlistGrid.appendChild(empty);
    }

    playlists.forEach(playlist => {
      playlist.tracks = safeArray(playlist.tracks);

      const card = createElement("article", "playlist-card");
      const heading = createElement("h3", "playlist-name", playlist.name);
      const count = createElement(
        "span",
        "playlist-count",
        `${playlist.tracks.length} آهنگ`
      );

      const openButton = createElement("button", "", "Open playlist");
      openButton.type = "button";
      openButton.addEventListener("click", () => openPlaylist(playlist.id));

      const list = createElement("div", "playlist-tracks");

      playlist.tracks.slice(0, 4).forEach((track, index) => {
        const row = createElement("div", "playlist-track");
        const label = createElement(
          "span",
          "playlist-track-label",
          `${track.title || "Untitled"} — ${track.artist || "Unknown artist"}`
        );

        const playButton = createElement("button", "", "▶");
        playButton.type = "button";
        playButton.setAttribute("aria-label", `Play ${track.title || "track"}`);

        playButton.addEventListener("click", () => {
          const searchIndex = state.tracks.findIndex(item =>
            getProvider(item) === getProvider(track) &&
            String(item.id) === String(track.id)
          );

          playTrack(track, searchIndex);
        });

        row.append(label, playButton);
        list.appendChild(row);
      });

      const deleteButton = createElement("button", "delete-playlist", "Delete playlist");
      deleteButton.type = "button";
      deleteButton.addEventListener("click", () => {
        if (!confirm(`پلی‌لیست «${playlist.name}» حذف شود؟`)) return;

        state.playlists = state.playlists.filter(
          item => item.id !== playlist.id
        );

        if (state.currentPlaylist === playlist.id) {
          state.currentPlaylist = null;
          elements.currentPlaylist?.replaceChildren();
        }

        saveData();
        renderPlaylists();
      });

      card.append(heading, count, openButton, list, deleteButton);
      elements.playlistGrid.appendChild(card);
    });
  }

  if (state.currentPlaylist) {
    const selected = state.playlists.find(
      playlist => playlist.id === state.currentPlaylist
    );

    if (selected) {
      // Do not automatically reopen or scroll during normal updates.
      renderCurrentPlaylistWithoutScroll(selected);
    }
  }
}

function renderCurrentPlaylistWithoutScroll(playlist) {
  if (!elements.currentPlaylist) return;

  elements.currentPlaylist.replaceChildren();

  const header = createElement("div", "section-header");
  const group = createElement("div");

  group.append(
    createElement("span", "section-kicker", "YOUR COLLECTION"),
    createElement("h2", "", playlist.name),
    createElement("p", "", `${playlist.tracks.length} tracks`)
  );

  const close = createElement("button", "", "Close");
  close.type = "button";
  close.addEventListener("click", () => {
    state.currentPlaylist = null;
    elements.currentPlaylist.replaceChildren();
  });

  header.append(group, close);

  const list = createElement("div", "playlist-tracks");

  playlist.tracks.forEach((track, index) => {
    const row = createElement("div", "playlist-track");
    const label = createElement(
      "span",
      "playlist-track-label",
      `${track.title || "Untitled"} — ${track.artist || "Unknown artist"}`
    );

    const play = createElement("button", "", "▶");
    play.type = "button";
    play.addEventListener("click", () => {
      const searchIndex = state.tracks.findIndex(item =>
        getProvider(item) === getProvider(track) &&
        String(item.id) === String(track.id)
      );

      playTrack(track, searchIndex);
    });

    const remove = createElement("button", "", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      playlist.tracks.splice(index, 1);
      saveData();
      renderPlaylists();
    });

    row.append(label, play, remove);
    list.appendChild(row);
  });

  if (!playlist.tracks.length) {
    list.appendChild(
      createElement("p", "empty-results", "هنوز آهنگی در این پلی‌لیست نیست.")
    );
  }

  elements.currentPlaylist.append(header, list);
}

/* -------------------------
   THEME
   ------------------------- */

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;

  if (elements.themeButton) {
    elements.themeButton.textContent =
      state.theme === "dark" ? "☀️ Toggle theme" : "🌙 Toggle theme";

    elements.themeButton.setAttribute(
      "aria-pressed",
      String(state.theme === "light")
    );
  }
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  saveData();
}

/* -------------------------
   BACKUP / RESTORE
   ------------------------- */

function exportBackup() {
  const backup = {
    app: APP_NAME,
    version: 3,
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

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("فایل بکاپ آماده شد.");
}

async function importBackup(file) {
  if (!file) return;

  try {
    const content = await file.text();
    const backup = JSON.parse(content);

    const playlists = Array.isArray(backup)
      ? backup
      : backup.playlists || backup.userPlaylists;

    if (!Array.isArray(playlists)) {
      throw new Error("Invalid backup format");
    }

    state.playlists = playlists.map(normalizePlaylist);

    if (backup.theme === "light" || backup.theme === "dark") {
      state.theme = backup.theme;
    }

    if (Number.isFinite(backup.volume)) {
      state.volume = Math.min(1, Math.max(0, backup.volume));
    }

    state.repeat = Boolean(backup.repeat);
    state.shuffle = Boolean(backup.shuffle);

    if (audio) audio.volume = state.volume;
    if (elements.volume) elements.volume.value = state.volume;

    $("#repeat")?.setAttribute("aria-pressed", String(state.repeat));
    $("#shuffle")?.setAttribute("aria-pressed", String(state.shuffle));

    applyTheme();
    saveData();
    renderPlaylists();

    showMessage("بکاپ با موفقیت بازیابی شد.");
  } catch (error) {
    console.error("Backup import failed:", error);
    showMessage("فایل بکاپ معتبر نیست.");
  }
}

/* -------------------------
   EVENT SETUP
   ------------------------- */

function setupSearch() {
  elements.searchForm?.addEventListener("submit", event => {
    event.preventDefault();
    searchTracks(elements.searchInput?.value || "");
  });

  elements.searchButton?.addEventListener("click", event => {
    // The button belongs to the form; prevent duplicate submissions.
    if (!elements.searchForm) {
      event.preventDefault();
      searchTracks(elements.searchInput?.value || "");
    }
  });

  elements.providerFilter?.addEventListener("change", () => {
    state.provider = elements.providerFilter.value || "all";
    renderTracks();
  });
}

function setupButtons() {
  elements.themeButton?.addEventListener("click", toggleTheme);
  elements.exportButton?.addEventListener("click", exportBackup);

  elements.importInput?.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    await importBackup(file);
    event.target.value = "";
  });

  elements.newPlaylistButtons.forEach(button => {
    button.addEventListener("click", promptCreatePlaylist);
  });

  $("#backButton")?.addEventListener("click", () => history.back());
  $("#forwardButton")?.addEventListener("click", () => history.forward());

  // Highlight the matching navigation link.
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach(item => {
        item.classList.toggle("active", item === link);
      });
    });
  });
}

/* -------------------------
   INITIALIZATION
   ------------------------- */

function initHE3AM() {
  discoverElements();
  loadSavedData();

  setupPlayer();
  setupSearch();
  setupButtons();

  applyTheme();
  renderPlaylists();
  renderTracks();

  if (elements.volume) elements.volume.value = state.volume;

  $("#repeat")?.setAttribute("aria-pressed", String(state.repeat));
  $("#shuffle")?.setAttribute("aria-pressed", String(state.shuffle));

  console.info(`${APP_NAME} Music Hub initialized.`);
}

/* -------------------------
   PUBLIC API
   ------------------------- */

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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHE3AM, { once: true });
} else {
  initHE3AM();
}
