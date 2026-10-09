
/* ======================================================
   HE3AM.3AM.MUSIC — Audius via Cloudflare Worker
   Search, playback, playlists, theme and backup
   ====================================================== */

const API_PROXY = "https://he3am.ghostrip82.workers.dev";
const STORAGE_KEY = "pulseMusic";
const APP_NAME = "HE3AM";

const AUDIUS_BASES = [
  "https://api.audius.co/v1",
  "https://discoveryprovider.audius.co/v1"
];

let state = {
  playlists: [],
  currentPlaylistId: null,
  currentTrack: null,
  theme: "dark"
};

let onlineTracks = [];
let searchTimer = null;
let searchController = null;
let searchSequence = 0;
let streamSequence = 0;

let currentStreamCandidates = [];
let currentStreamIndex = 0;

const audio = new Audio();
audio.preload = "metadata";

const $ = selector => document.querySelector(selector);

/* ---------------- Helpers ---------------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createId() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save state:", error);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const parsed = JSON.parse(saved);
    state = { ...state, ...parsed };

    if (!Array.isArray(state.playlists)) {
      state.playlists = [];
    }

    state.playlists = state.playlists.map(playlist => ({
      ...playlist,
      tracks: Array.isArray(playlist.tracks)
        ? playlist.tracks
        : []
    }));

    if (!["dark", "light"].includes(state.theme)) {
      state.theme = "dark";
    }
  } catch (error) {
    console.error("Could not load saved state:", error);
  }
}

/* ---------------- Track helpers ---------------- */

function getArtwork(track) {
  const artwork = track?.artwork;

  if (typeof artwork === "string" && artwork) {
    return artwork;
  }

  return (
    artwork?.["1000x1000"] ||
    artwork?.["480x480"] ||
    artwork?.["150x150"] ||
    track?.thumbnail ||
    "https://placehold.co/500x500?text=HE3AM"
  );
}

function getArtist(track) {
  return (
    track?.user?.name ||
    track?.user?.handle ||
    track?.artist ||
    "Unknown Artist"
  );
}

function getTrackTitle(track) {
  return track?.title || "Unknown Track";
}

function getTrackId(track) {
  return track?.audiusId || track?.id || null;
}

function getStreamCandidates(track) {
  const id = getTrackId(track);
  if (!id) return [];

  const params = new URLSearchParams({
    app_name: APP_NAME
  });

  const encodedId = encodeURIComponent(id);

  return AUDIUS_BASES.map(base =>
    `${base}/tracks/${encodedId}/stream?${params}`
  );
}

function streamUrl(track) {
  return getStreamCandidates(track)[0] || "";
}

/* ---------------- Playlists ---------------- */

function getCurrentPlaylist() {
  return state.playlists.find(
    playlist => playlist.id === state.currentPlaylistId
  );
}

function createPlaylist(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;

  const playlist = {
    id: createId(),
    name: cleanName,
    tracks: []
  };

  state.playlists.push(playlist);
  state.currentPlaylistId = playlist.id;

  saveState();
  renderAll();
}

function deletePlaylist(id) {
  const playlist = state.playlists.find(item => item.id === id);
  if (!playlist) return;

  if (!confirm(`Delete playlist "${playlist.name}"?`)) {
    return;
  }

  state.playlists = state.playlists.filter(item => item.id !== id);

  if (state.currentPlaylistId === id) {
    state.currentPlaylistId = state.playlists[0]?.id || null;
  }

  saveState();
  renderAll();
}

function addTrackToPlaylist(track, playlistId) {
  const playlist = state.playlists.find(item => item.id === playlistId);
  if (!playlist || !track) return;

  const trackId = getTrackId(track);

  const exists = playlist.tracks.some(item => {
    if (trackId && getTrackId(item)) {
      return getTrackId(item) === trackId;
    }

    return item.title === track.title &&
      item.artist === track.artist;
  });

  if (exists) {
    alert("This song is already in the playlist.");
    return;
  }

  playlist.tracks.push({
    id: createId(),
    audiusId: trackId,
    title: getTrackTitle(track),
    artist: getArtist(track),
    artwork: track.artwork || getArtwork(track),
    streamUrl: track.streamUrl || streamUrl(track),
    duration: Number(track.duration) || 0
  });

  saveState();
  renderAll();
}

/* ---------------- Audius API via Worker ---------------- */

async function audiusFetch(path, options = {}) {
  const sourceUrl = new URL(path, "https://audius.local");

  if (sourceUrl.pathname !== "/tracks/search") {
    throw new Error("Unsupported Audius API endpoint.");
  }

  const requestUrl = new URL(
    "/api/tracks/search",
    API_PROXY
  );

  sourceUrl.searchParams.forEach((value, key) => {
    requestUrl.searchParams.set(key, value);
  });

  const response = await fetch(requestUrl.toString(), {
    ...options,
    method: "GET",
    headers: {
      Accept: "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Music proxy HTTP ${response.status}`);
  }

  return response.json();
}

/* ---------------- Search ---------------- */

async function searchAudius(query) {
  query = String(query || "").trim();
  if (!query) return;

  const section = $("#onlineSection");
  const status = $("#onlineStatus");
  const results = $("#onlineResults");

  if (!section || !status || !results) return;

  if (searchController) {
    searchController.abort();
  }

  searchController = new AbortController();

  const controller = searchController;
  const requestId = ++searchSequence;

  section.classList.remove("hidden");
  status.textContent = "Searching Audius...";

  results.innerHTML = `
    <div class="empty-state">
      <h3>Searching...</h3>
      <p>Looking for "${escapeHtml(query)}"</p>
    </div>
  `;

  const params = new URLSearchParams({
    query,
    limit: "15",
    offset: "0",
    sort_method: "relevant"
  });

  try {
    const json = await audiusFetch(
      `/tracks/search?${params.toString()}`,
      { signal: controller.signal }
    );

    if (requestId !== searchSequence) return;

    onlineTracks = Array.isArray(json?.data)
      ? json.data
      : [];

    status.textContent = `${onlineTracks.length} result(s) found`;
    renderOnline();
  } catch (error) {
    if (error.name === "AbortError") return;
    if (requestId !== searchSequence) return;

    console.error("Audius search error:", error);

    onlineTracks = [];
    status.textContent = "Could not connect to Audius.";

    results.innerHTML = `
      <div class="empty-state">
        <h3>Audius is temporarily unavailable.</h3>
        <p>${escapeHtml(error.message || "Unknown error")}</p>
      </div>
    `;
  }
}

/* ---------------- Search results ---------------- */

function renderOnline() {
  const results = $("#onlineResults");
  if (!results) return;

  if (!onlineTracks.length) {
    results.innerHTML = `
      <div class="empty-state">
        <h3>No songs found</h3>
        <p>Try another song or artist.</p>
      </div>
    `;
    return;
  }

  results.innerHTML = onlineTracks.map((track, index) => `
    <div class="track-card">
      <img
        class="track-cover"
        src="${escapeHtml(getArtwork(track))}"
        alt="${escapeHtml(getTrackTitle(track))}"
        loading="lazy"
        onerror="this.onerror=null;this.src='https://placehold.co/500x500?text=HE3AM'"
      >

      <div class="track-info">
        <div class="track-title">
          ${escapeHtml(getTrackTitle(track))}
        </div>
        <div class="track-artist">
          ${escapeHtml(getArtist(track))}
        </div>
      </div>

      <div class="track-actions">
        <button
          class="play-online-btn"
          data-index="${index}"
          type="button"
          title="Play"
        >▶</button>

        <button
          class="add-online-btn"
          data-index="${index}"
          type="button"
          title="Add to playlist"
        >+</button>
      </div>
    </div>
  `).join("");

  results.querySelectorAll(".play-online-btn").forEach(button => {
    button.addEventListener("click", () => {
      playAudiusTrack(onlineTracks[Number(button.dataset.index)]);
    });
  });

  results.querySelectorAll(".add-online-btn").forEach(button => {
    button.addEventListener("click", () => {
      addOnlineTrack(onlineTracks[Number(button.dataset.index)]);
    });
  });
}

function addOnlineTrack(track) {
  if (!track) return;

  if (!state.playlists.length) {
    alert("Create a playlist first.");
    return;
  }

  const playlist = getCurrentPlaylist() || state.playlists[0];

  addTrackToPlaylist({
    audiusId: track.id,
    title: getTrackTitle(track),
    artist: getArtist(track),
    artwork: getArtwork(track),
    streamUrl: streamUrl(track),
    duration: track.duration || 0
  }, playlist.id);
}

/* ---------------- Playback ---------------- */

function setCurrentTrack(track) {
  state.currentTrack = {
    ...track,
    audiusId: getTrackId(track),
    title: getTrackTitle(track),
    artist: getArtist(track),
    artwork: getArtwork(track),
    streamUrl: track.streamUrl || streamUrl(track)
  };

  updatePlayer();
}

function showPlaybackError(error) {
  console.error("Audius playback error:", error);

  const status = $("#onlineStatus");

  if (status) {
    status.textContent =
      "Unable to play this track. Try another song.";
  }
}

function startStreamCandidate(index, requestId) {
  if (requestId !== streamSequence) return;

  if (index >= currentStreamCandidates.length) {
    updatePlayButton();

    showPlaybackError(
      new Error("All available Audius stream endpoints failed.")
    );

    alert(
      "این آهنگ پخش نشد. ممکن است ترک محدود یا موقتاً غیرقابل‌دسترس باشد. یک آهنگ دیگر را امتحان کن."
    );

    return;
  }

  currentStreamIndex = index;

  const url = currentStreamCandidates[index];

  audio.pause();
  audio.removeAttribute("src");
  audio.load();

  audio.src = url;
  audio.load();

  const playPromise = audio.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(error => {
      if (requestId !== streamSequence) return;

      console.warn(`Audius stream attempt ${index + 1} failed:`, error);

      if (error.name === "NotAllowedError") {
        updatePlayButton();
        return;
      }

      startStreamCandidate(index + 1, requestId);
    });
  }
}

function playAudiusTrack(track) {
  if (!track) return;

  const candidates = getStreamCandidates(track);

  if (!candidates.length) {
    alert("Audius did not provide a valid track ID.");
    return;
  }

  const requestId = ++streamSequence;

  currentStreamCandidates = candidates;
  currentStreamIndex = 0;

  setCurrentTrack({
    ...track,
    streamUrl: candidates[0]
  });

  startStreamCandidate(0, requestId);
}

function playLocalTrack(track) {
  if (!track) return;

  const candidates = getStreamCandidates(track);
  const urls = candidates.length
    ? candidates
    : track.streamUrl
      ? [track.streamUrl]
      : [];

  if (!urls.length) {
    alert("This track does not have a playable stream.");
    return;
  }

  const requestId = ++streamSequence;

  currentStreamCandidates = urls;
  currentStreamIndex = 0;

  setCurrentTrack({
    ...track,
    streamUrl: urls[0]
  });

  startStreamCandidate(0, requestId);
}

/* ---------------- Player UI ---------------- */

function updatePlayer() {
  const track = state.currentTrack;
  if (!track) return;

  const title = $("#playerTitle");
  const artist = $("#playerArtist");
  const cover = $("#playerCover");

  if (title) title.textContent = track.title || "Unknown Track";
  if (artist) artist.textContent = track.artist || "Unknown Artist";

  if (cover) {
    cover.onerror = () => {
      cover.onerror = null;
      cover.src = "https://placehold.co/500x500?text=HE3AM";
    };
    cover.src = track.artwork || getArtwork(track);
  }

  updatePlayButton();
  updateProgress();
}

function updatePlayButton() {
  const button = $("#playPauseBtn");
  if (button) button.textContent = audio.paused ? "▶" : "❚❚";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remainder}`;
}

function updateProgress() {
  const progress = $("#progressBar");
  const current = $("#currentTime");
  const duration = $("#duration");

  if (progress) {
    progress.value =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? (audio.currentTime / audio.duration) * 100
        : 0;
  }

  if (current) current.textContent = formatTime(audio.currentTime);
  if (duration) duration.textContent = formatTime(audio.duration);
}

/* ---------------- Playlist rendering ---------------- */

function renderPlaylists() {
  const container = $("#playlistGrid");
  if (!container) return;

  if (!state.playlists.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No playlists yet</h3>
        <p>Create your first playlist.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.playlists.map(playlist => `
    <div class="playlist-card" data-playlist-id="${escapeHtml(playlist.id)}">
      <div>
        <h3>${escapeHtml(playlist.name)}</h3>
        <p>${playlist.tracks.length} track(s)</p>
      </div>

      <div class="playlist-card-actions">
        <button
          class="open-playlist-btn"
          data-id="${escapeHtml(playlist.id)}"
          type="button"
        >Open</button>

        <button
          class="delete-playlist-btn"
          data-id="${escapeHtml(playlist.id)}"
          type="button"
        >Delete</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".open-playlist-btn").forEach(button => {
    button.addEventListener("click", () => {
      state.currentPlaylistId = button.dataset.id;
      saveState();
      renderAll();
    });
  });

  container.querySelectorAll(".delete-playlist-btn").forEach(button => {
    button.addEventListener("click", () => {
      deletePlaylist(button.dataset.id);
    });
  });
}

function renderCurrentPlaylist() {
  const container = $("#currentPlaylist");
  if (!container) return;

  const playlist = getCurrentPlaylist();

  if (!playlist) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No playlist selected</h3>
      </div>
    `;
    return;
  }

  if (!playlist.tracks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>${escapeHtml(playlist.name)}</h3>
        <p>This playlist is empty.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="playlist-header">
      <h2>${escapeHtml(playlist.name)}</h2>
      <span>${playlist.tracks.length} tracks</span>
    </div>

    <div class="playlist-tracks">
      ${playlist.tracks.map((track, index) => `
        <div class="track-card">
          <img
            class="track-cover"
            src="${escapeHtml(track.artwork || "https://placehold.co/500x500?text=HE3AM")}"
            alt="${escapeHtml(track.title)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='https://placehold.co/500x500?text=HE3AM'"
          >

          <div class="track-info">
            <div class="track-title">${escapeHtml(track.title)}</div>
            <div class="track-artist">${escapeHtml(track.artist)}</div>
          </div>

          <button
            class="play-local-btn"
            data-index="${index}"
            type="button"
            title="Play"
          >▶</button>
        </div>
      `).join("")}
    </div>
  `;

  container.querySelectorAll(".play-local-btn").forEach(button => {
    button.addEventListener("click", () => {
      playLocalTrack(playlist.tracks[Number(button.dataset.index)]);
    });
  });
}

/* ---------------- Statistics ---------------- */

function updateStats() {
  const playlistCount = $("#playlistCount");
  const trackCount = $("#trackCount");

  if (playlistCount) {
    playlistCount.textContent = state.playlists.length;
  }

  if (trackCount) {
    trackCount.textContent = state.playlists.reduce(
      (total, playlist) => total + playlist.tracks.length,
      0
    );
  }
}

/* ---------------- Search controls ---------------- */

function setupSearch() {
  const input = $("#searchInput");
  const button = $("#searchButton");
  if (!input) return;

  async function performSearch() {
    clearTimeout(searchTimer);

    const query = input.value.trim();

    if (!query) {
      $("#onlineSection")?.classList.add("hidden");
      return;
    }

    await searchAudius(query);
  }

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);

    const query = input.value.trim();

    if (!query) {
      if (searchController) searchController.abort();
      searchSequence++;
      $("#onlineSection")?.classList.add("hidden");
      return;
    }

    searchTimer = setTimeout(() => searchAudius(query), 500);
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      performSearch();
    }
  });

  button?.addEventListener("click", performSearch);
}

/* ---------------- Theme ---------------- */

function applyTheme() {
  document.body.dataset.theme = state.theme;
  document.documentElement.dataset.theme = state.theme;
}

function setupTheme() {
  const button = $("#themeToggle");

  applyTheme();

  button?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveState();
    applyTheme();
  });
}

/* ---------------- Playlist dialog ---------------- */

function setupPlaylistDialog() {
  const openButton = $("#newPlaylistBtn");
  const dialog = $("#playlistDialog");
  const form = $("#playlistForm");
  const cancel = $("#cancelPlaylistBtn");

  if (!openButton || !dialog || !form) return;

  openButton.addEventListener("click", () => {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.classList.remove("hidden");
    }
  });

  cancel?.addEventListener("click", () => {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.classList.add("hidden");
    }
  });

  form.addEventListener("submit", event => {
    event.preventDefault();

    const input = $("#playlistName");
    if (!input) return;

    createPlaylist(input.value);
    input.value = "";

    if (typeof dialog.close === "function") {
      dialog.close();
    }
  });
}

/* ---------------- Player controls ---------------- */

function setupPlayer() {
  const playPause = $("#playPauseBtn");
  const progress = $("#progressBar");

  playPause?.addEventListener("click", async () => {
    if (!audio.src) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        console.error("Resume playback error:", error);
      }
    } else {
      audio.pause();
    }

    updatePlayButton();
  });

  progress?.addEventListener("input", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime =
        (Number(progress.value) / 100) * audio.duration;
    }
  });

  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("durationchange", updateProgress);
  audio.addEventListener("play", updatePlayButton);
  audio.addEventListener("pause", updatePlayButton);
  audio.addEventListener("ended", updatePlayButton);

  audio.addEventListener("error", () => {
    console.error("Audio element error:", {
      code: audio.error?.code,
      message: audio.error?.message,
      source: audio.currentSrc
    });

    const requestId = streamSequence;

    if (currentStreamIndex + 1 < currentStreamCandidates.length) {
      startStreamCandidate(currentStreamIndex + 1, requestId);
    } else {
      updatePlayButton();
    }
  });
}

/* ---------------- Backup / restore ---------------- */

function setupBackup() {
  const exportButton = $("#exportBtn");
  const importButton = $("#importBtn");
  const importFile = $("#importFile");

  exportButton?.addEventListener("click", () => {
    const blob = new Blob(
      [JSON.stringify(state, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "he3am-music-backup.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  });

  importButton?.addEventListener("click", () => {
    importFile?.click();
  });

  importFile?.addEventListener("change", () => {
    const file = importFile.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);

        if (!imported || !Array.isArray(imported.playlists)) {
          throw new Error("Invalid backup");
        }

        state = { ...state, ...imported };

        state.playlists = state.playlists.map(playlist => ({
          ...playlist,
          tracks: Array.isArray(playlist.tracks)
            ? playlist.tracks
            : []
        }));

        if (!["dark", "light"].includes(state.theme)) {
          state.theme = "dark";
        }

        saveState();
        renderAll();

        alert("Backup imported successfully.");
      } catch (error) {
        console.error("Import error:", error);
        alert("Could not import this backup.");
      } finally {
        importFile.value = "";
      }
    };

    reader.readAsText(file);
  });
}

/* ---------------- Render and init ---------------- */

function renderAll() {
  renderPlaylists();
  renderCurrentPlaylist();
  updateStats();
  updatePlayer();
}

function init() {
  loadState();

  if (
    state.playlists.length &&
    !state.playlists.some(
      playlist => playlist.id === state.currentPlaylistId
    )
  ) {
    state.currentPlaylistId = state.playlists[0].id;
    saveState();
  }

  setupSearch();
  setupTheme();
  setupPlaylistDialog();
  setupPlayer();
  setupBackup();

  renderAll();

  console.log("HE3AM.3AM.MUSIC initialized successfully.");
}

document.addEventListener("DOMContentLoaded", init);
