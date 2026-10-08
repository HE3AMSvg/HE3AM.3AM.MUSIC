// ===============================
// HE3AM.3AM.MUSIC - app.js
// Audius REST API version
// ===============================

const AUDIUS_API_KEY = "YOUR_NEW_API_KEY";

const STORAGE_KEY = "pulseMusic";

let state = {
  playlists: [],
  currentPlaylistId: null,
  currentTrack: null,
  theme: "dark"
};

let onlineTracks = [];
let audio = new Audio();
let searchTimer = null;

// ===============================
// DOM HELPERS
// ===============================

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ===============================
// LOCAL STORAGE
// ===============================

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const parsed = JSON.parse(saved);

      state = {
        ...state,
        ...parsed
      };
    }
  } catch (error) {
    console.error("Could not load saved data:", error);
  }
}

// ===============================
// ARTWORK / ARTIST HELPERS
// ===============================

function getArtwork(track) {
  return (
    track?.artwork?.["1000x1000"] ||
    track?.artwork?.["480x480"] ||
    track?.artwork?.["150x150"] ||
    track?.artwork?.["1000x1000"] ||
    "https://via.placeholder.com/500?text=HE3AM"
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

// ===============================
// PLAYLIST HELPERS
// ===============================

function getCurrentPlaylist() {
  return state.playlists.find(
    (playlist) => playlist.id === state.currentPlaylistId
  );
}

function createId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

function createPlaylist(name) {
  const cleanName = name.trim();

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
  const playlist = state.playlists.find(
    (item) => item.id === id
  );

  if (!playlist) return;

  if (
    !confirm(
      `Delete playlist "${playlist.name}"?`
    )
  ) {
    return;
  }

  state.playlists = state.playlists.filter(
    (item) => item.id !== id
  );

  if (state.currentPlaylistId === id) {
    state.currentPlaylistId =
      state.playlists[0]?.id || null;
  }

  saveState();
  renderAll();
}

function addTrackToPlaylist(track, playlistId) {
  const playlist = state.playlists.find(
    (item) => item.id === playlistId
  );

  if (!playlist) return;

  const trackId =
    track.audiusId ||
    track.id ||
    track.url ||
    createId();

  const alreadyExists = playlist.tracks.some(
    (item) =>
      item.audiusId === trackId ||
      item.id === trackId
  );

  if (alreadyExists) {
    alert("This song is already in the playlist.");
    return;
  }

  playlist.tracks.push({
    id: createId(),
    audiusId: track.audiusId || track.id || null,
    title: track.title || "Unknown Track",
    artist: track.artist || "Unknown Artist",
    artwork: track.artwork || "",
    streamUrl: track.streamUrl || "",
    duration: track.duration || 0
  });

  saveState();
  renderAll();
}

// ===============================
// AUDIUS
// ===============================

async function searchAudius(query) {
  query = query.trim();

  if (!query) return;

  const section = $("#onlineSection");
  const status = $("#onlineStatus");
  const results = $("#onlineResults");

  if (!section || !status || !results) {
    console.error(
      "Audius UI elements were not found."
    );
    return;
  }

  section.classList.remove("hidden");

  status.textContent = "Searching Audius...";

  results.innerHTML = `
    <div style="padding:20px">
      Searching for
      <strong>${escapeHtml(query)}</strong>...
    </div>
  `;

  try {
    const params = new URLSearchParams({
      query: query,
      limit: "15",
      offset: "0",
      sort_method: "relevant"
    });

    const response = await fetch(
      `https://api.audius.co/v1/tracks/search?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "X-API-Key": AUDIUS_API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `Audius HTTP ${response.status}`
      );
    }

    const json = await response.json();

    onlineTracks = Array.isArray(json.data)
      ? json.data
      : [];

    status.textContent =
      `${onlineTracks.length} result(s) found`;

    renderOnline();

  } catch (error) {
    console.error(
      "Audius search error:",
      error
    );

    onlineTracks = [];

    status.textContent =
      "Could not connect to Audius.";

    results.innerHTML = `
      <div style="padding:20px">
        <strong>
          Audius is temporarily unavailable.
        </strong>

        <br><br>

        <small>
          ${escapeHtml(
            error?.message ||
            "Unknown error"
          )}
        </small>
      </div>
    `;
  }
}

// ===============================
// AUDIUS STREAM
// ===============================

function streamUrl(track) {
  if (!track?.id) return "";

  return (
    `https://api.audius.co/v1/tracks/` +
    `${encodeURIComponent(track.id)}` +
    `/stream?app_name=HE3AM`
  );
}

// ===============================
// RENDER ONLINE RESULTS
// ===============================

function renderOnline() {
  const results = $("#onlineResults");

  if (!results) return;

  if (!onlineTracks.length) {
    results.innerHTML = `
      <div style="padding:20px">
        No songs found.
      </div>
    `;

    return;
  }

  results.innerHTML = onlineTracks
    .map((track, index) => {
      const title = getTrackTitle(track);
      const artist = getArtist(track);
      const artwork = getArtwork(track);

      return `
        <div class="track-card online-track">
          <img
            class="track-cover"
            src="${escapeHtml(artwork)}"
            alt="${escapeHtml(title)}"
            loading="lazy"
          >

          <div class="track-info">
            <div class="track-title">
              ${escapeHtml(title)}
            </div>

            <div class="track-artist">
              ${escapeHtml(artist)}
            </div>
          </div>

          <div class="track-actions">

            <button
              class="play-online-btn"
              data-index="${index}"
              title="Play"
            >
              ▶
            </button>

            <button
              class="add-online-btn"
              data-index="${index}"
              title="Add to playlist"
            >
              +
            </button>

          </div>
        </div>
      `;
    })
    .join("");

  document
    .querySelectorAll(".play-online-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const index =
          Number(button.dataset.index);

        playAudiusTrack(
          onlineTracks[index]
        );
      });
    });

  document
    .querySelectorAll(".add-online-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const index =
          Number(button.dataset.index);

        addOnlineTrack(
          onlineTracks[index]
        );
      });
    });
}

// ===============================
// ADD ONLINE TRACK
// ===============================

function addOnlineTrack(track) {
  if (!track) return;

  if (!state.playlists.length) {
    alert(
      "Create a playlist first, then add the song."
    );

    return;
  }

  const playlist =
    getCurrentPlaylist() ||
    state.playlists[0];

  const newTrack = {
    audiusId: track.id,
    title: getTrackTitle(track),
    artist: getArtist(track),
    artwork: getArtwork(track),
    streamUrl: streamUrl(track),
    duration: track.duration || 0
  };

  addTrackToPlaylist(
    newTrack,
    playlist.id
  );
}

// ===============================
// PLAY AUDIUS TRACK
// ===============================

function playAudiusTrack(track) {
  if (!track) return;

  const url =
    track.streamUrl ||
    streamUrl(track);

  if (!url) {
    alert("Stream URL is not available.");
    return;
  }

  state.currentTrack = {
    ...track,
    title: getTrackTitle(track),
    artist: getArtist(track),
    artwork: getArtwork(track),
    streamUrl: url
  };

  audio.src = url;

  audio
    .play()
    .then(() => {
      updatePlayer();
    })
    .catch((error) => {
      console.error(
        "Playback error:",
        error
      );

      alert(
        "Could not play this song."
      );
    });

  updatePlayer();
}

// ===============================
// PLAY LOCAL TRACK
// ===============================

function playLocalTrack(track) {
  if (!track) return;

  if (!track.streamUrl) {
    alert(
      "This track does not have a playable stream."
    );

    return;
  }

  state.currentTrack = track;

  audio.src = track.streamUrl;

  audio
    .play()
    .then(() => {
      updatePlayer();
    })
    .catch((error) => {
      console.error(
        "Playback error:",
        error
      );
    });

  updatePlayer();
}

// ===============================
// PLAYER
// ===============================

function updatePlayer() {
  const track = state.currentTrack;

  if (!track) return;

  const playerTitle =
    $("#playerTitle");

  const playerArtist =
    $("#playerArtist");

  const playerCover =
    $("#playerCover");

  if (playerTitle) {
    playerTitle.textContent =
      track.title ||
      "Unknown Track";
  }

  if (playerArtist) {
    playerArtist.textContent =
      track.artist ||
      "Unknown Artist";
  }

  if (playerCover) {
    playerCover.src =
      track.artwork ||
      getArtwork(track);
  }

  updatePlayButton();
}

function updatePlayButton() {
  const button =
    $("#playPauseBtn");

  if (!button) return;

  button.textContent =
    audio.paused
      ? "▶"
      : "❚❚";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const mins =
    Math.floor(seconds / 60);

  const secs =
    Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");

  return `${mins}:${secs}`;
}

function updateProgress() {
  const progress =
    $("#progressBar");

  const currentTime =
    $("#currentTime");

  const duration =
    $("#duration");

  if (progress && audio.duration) {
    progress.value =
      (audio.currentTime /
        audio.duration) *
      100;
  }

  if (currentTime) {
    currentTime.textContent =
      formatTime(
        audio.currentTime
      );
  }

  if (duration) {
    duration.textContent =
      formatTime(
        audio.duration
      );
  }
}

// ===============================
// RENDER PLAYLISTS
// ===============================

function renderPlaylists() {
  const container =
    $("#playlistGrid");

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

  container.innerHTML =
    state.playlists
      .map((playlist) => {
        return `
          <div
            class="playlist-card"
            data-playlist-id="${escapeHtml(
              playlist.id
            )}"
          >

            <div class="playlist-card-content">

              <h3>
                ${escapeHtml(
                  playlist.name
                )}
              </h3>

              <p>
                ${
                  playlist.tracks.length
                }
                track(s)
              </p>

            </div>

            <div class="playlist-card-actions">

              <button
                class="open-playlist-btn"
                data-id="${escapeHtml(
                  playlist.id
                )}"
              >
                Open
              </button>

              <button
                class="delete-playlist-btn"
                data-id="${escapeHtml(
                  playlist.id
                )}"
              >
                Delete
              </button>

            </div>

          </div>
        `;
      })
      .join("");

  document
    .querySelectorAll(
      ".open-playlist-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          state.currentPlaylistId =
            button.dataset.id;

          saveState();
          renderAll();
        }
      );
    });

  document
    .querySelectorAll(
      ".delete-playlist-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          deletePlaylist(
            button.dataset.id
          );
        }
      );
    });
}

// ===============================
// RENDER CURRENT PLAYLIST
// ===============================

function renderCurrentPlaylist() {
  const container =
    $("#currentPlaylist");

  if (!container) return;

  const playlist =
    getCurrentPlaylist();

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
        <h3>
          ${escapeHtml(
            playlist.name
          )}
        </h3>

        <p>
          This playlist is empty.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div class="playlist-header">
      <h2>
        ${escapeHtml(
          playlist.name
        )}
      </h2>

      <span>
        ${playlist.tracks.length} tracks
      </span>
    </div>

    <div class="playlist-tracks">
      ${playlist.tracks
        .map((track, index) => {
          return `
            <div
              class="track-card local-track"
              data-track-index="${index}"
            >

              <img
                class="track-cover"
                src="${escapeHtml(
                  track.artwork ||
                  "https://via.placeholder.com/500?text=HE3AM"
                )}"
                alt="${escapeHtml(
                  track.title
                )}"
                loading="lazy"
              >

              <div class="track-info">

                <div class="track-title">
                  ${escapeHtml(
                    track.title
                  )}
                </div>

                <div class="track-artist">
                  ${escapeHtml(
                    track.artist
                  )}
                </div>

              </div>

              <button
                class="play-local-btn"
                data-index="${index}"
              >
                ▶
              </button>

            </div>
          `;
        })
        .join("")}
    </div>
  `;

  document
    .querySelectorAll(
      ".play-local-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const index =
            Number(
              button.dataset.index
            );

          playLocalTrack(
            playlist.tracks[index]
          );
        }
      );
    });
}

// ===============================
// STATS
// ===============================

function updateStats() {
  const playlistCount =
    $("#playlistCount");

  const trackCount =
    $("#trackCount");

  if (playlistCount) {
    playlistCount.textContent =
      state.playlists.length;
  }

  if (trackCount) {
    const total =
      state.playlists.reduce(
        (sum, playlist) =>
          sum +
          playlist.tracks.length,
        0
      );

    trackCount.textContent =
      total;
  }
}

// ===============================
// RENDER EVERYTHING
// ===============================

function renderAll() {
  renderPlaylists();
  renderCurrentPlaylist();
  updateStats();
  updatePlayer();
}

// ===============================
// SEARCH
// ===============================

function setupSearch() {
  const searchInput =
    $("#searchInput");

  if (!searchInput) return;

  searchInput.addEventListener(
    "input",
    () => {
      clearTimeout(searchTimer);

      const query =
        searchInput.value.trim();

      if (!query) {
        const section =
          $("#onlineSection");

        if (section) {
          section.classList.add(
            "hidden"
          );
        }

        return;
      }

      searchTimer =
        setTimeout(() => {
          searchAudius(query);
        }, 500);
    }
  );

  searchInput.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        event.preventDefault();

        clearTimeout(
          searchTimer
        );

        searchAudius(
          searchInput.value
        );
      }
    }
  );
}

// ===============================
// THEME
// ===============================

function setupTheme() {
  const button =
    $("#themeToggle");

  if (!button) return;

  applyTheme();

  button.addEventListener(
    "click",
    () => {
      state.theme =
        state.theme === "dark"
          ? "light"
          : "dark";

      saveState();
      applyTheme();
    }
  );
}

function applyTheme() {
  document.documentElement.dataset.theme =
    state.theme;

  document.body.dataset.theme =
    state.theme;
}

// ===============================
// PLAYLIST DIALOG
// ===============================

function setupPlaylistDialog() {
  const openButton =
    $("#newPlaylistBtn");

  const dialog =
    $("#playlistDialog");

  const form =
    $("#playlistForm");

  const cancelButton =
    $("#cancelPlaylistBtn");

  if (
    !openButton ||
    !dialog ||
    !form
  ) {
    return;
  }

  openButton.addEventListener(
    "click",
    () => {
      if (
        typeof dialog.showModal ===
        "function"
      ) {
        dialog.showModal();
      } else {
        dialog.classList.remove(
          "hidden"
        );
      }
    }
  );

  cancelButton?.addEventListener(
    "click",
    () => {
      if (
        typeof dialog.close ===
        "function"
      ) {
        dialog.close();
      } else {
        dialog.classList.add(
          "hidden"
        );
      }
    }
  );

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      const input =
        $("#playlistName");

      if (!input) return;

      createPlaylist(
        input.value
      );

      input.value = "";

      if (
        typeof dialog.close ===
        "function"
      ) {
        dialog.close();
      } else {
        dialog.classList.add(
          "hidden"
        );
      }
    }
  );
}

// ===============================
// PLAYER EVENTS
// ===============================

function setupPlayer() {
  const playPause =
    $("#playPauseBtn");

  const progress =
    $("#progressBar");

  playPause?.addEventListener(
    "click",
    () => {
      if (!audio.src) return;

      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }

      updatePlayButton();
    }
  );

  progress?.addEventListener(
    "input",
    () => {
      if (!audio.duration) return;

      audio.currentTime =
        (Number(progress.value) /
          100) *
        audio.duration;
    }
  );

  audio.addEventListener(
    "timeupdate",
    updateProgress
  );

  audio.addEventListener(
    "loadedmetadata",
    updateProgress
  );

  audio.addEventListener(
    "play",
    updatePlayButton
  );

  audio.addEventListener(
    "pause",
    updatePlayButton
  );

  audio.addEventListener(
    "ended",
    () => {
      updatePlayButton();
    }
  );
}

// ===============================
// BACKUP / IMPORT
// ===============================

function setupBackup() {
  const exportButton =
    $("#exportBtn");

  const importButton =
    $("#importBtn");

  const importInput =
    $("#importFile");

  exportButton?.addEventListener(
    "click",
    () => {
      const data =
        JSON.stringify(
          state,
          null,
          2
        );

      const blob =
        new Blob(
          [data],
          {
            type:
              "application/json"
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;
      link.download =
        "he3am-music-backup.json";

      link.click();

      URL.revokeObjectURL(url);
    }
  );

  importButton?.addEventListener(
    "click",
    () => {
      importInput?.click();
    }
  );

  importInput?.addEventListener(
    "change",
    () => {
      const file =
        importInput.files?.[0];

      if (!file) return;

      const reader =
        new FileReader();

      reader.onload = () => {
        try {
          const imported =
            JSON.parse(
              reader.result
            );

          if (
            !imported ||
            !Array.isArray(
              imported.playlists
            )
          ) {
            throw new Error(
              "Invalid backup file"
            );
          }

          state = {
            ...state,
            ...imported
          };

          saveState();
          renderAll();

          alert(
            "Backup imported successfully."
          );

        } catch (error) {
          console.error(
            "Import error:",
            error
          );

          alert(
            "Could not import this backup."
          );
        }
      };

      reader.readAsText(file);
    }
  );
}

// ===============================
// INITIALIZATION
// ===============================

function init() {
  loadState();

  if (
    state.playlists.length &&
    !state.currentPlaylistId
  ) {
    state.currentPlaylistId =
      state.playlists[0].id;

    saveState();
  }

  setupSearch();
  setupTheme();
  setupPlaylistDialog();
  setupPlayer();
  setupBackup();

  renderAll();

  console.log(
    "HE3AM.3AM.MUSIC initialized successfully."
  );
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
