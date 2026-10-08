const $ = (s) => document.querySelector(s);

const API = "https://api.audius.co/v1";

let state = JSON.parse(
  localStorage.getItem("pulseMusic") || '{"playlists":[]}'
);

let audio = new Audio();
let current = null;
let onlineTracks = [];
let onlineIndex = -1;

function save() {
  localStorage.setItem("pulseMusic", JSON.stringify(state));
  render();
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

/* ---------- LIBRARY ---------- */

function render() {
  const grid = $("#playlistGrid");
  if (!grid) return;

  grid.innerHTML = "";

  $("#playlistCount").textContent = state.playlists.length;

  const total = state.playlists.reduce(
    (n, p) => n + p.tracks.length,
    0
  );

  $("#trackCount").textContent = total;

  $("#favoriteCount").textContent =
    state.playlists.reduce(
      (n, p) => n + p.tracks.filter(t => t.favorite).length,
      0
    );

  state.playlists.forEach(playlist => {
    const card = $("#playlistTemplate")
      .content
      .cloneNode(true);

    card.querySelector("h3").textContent = playlist.name;
    card.querySelector("p").textContent =
      playlist.description || "Your playlist";

    card.querySelector(".track-count").textContent =
      `${playlist.tracks.length} tracks`;

    const tracks = card.querySelector(".tracks");

    playlist.tracks.slice(0, 3).forEach(track => {
      const row = document.createElement("div");

      row.className = "track";

      row.innerHTML = `
        <span>
          <b>${escapeHtml(track.title)}</b>
          <small> — ${escapeHtml(track.artist)}</small>
        </span>
        <button>▶</button>
      `;

      row.querySelector("button").onclick = () => play(track);

      tracks.appendChild(row);
    });

    card.querySelector(".open").onclick = () =>
      openTrackModal(playlist.id);

    card.querySelector(".more").onclick = () => {
      if (confirm(`Delete "${playlist.name}"?`)) {
        state.playlists = state.playlists.filter(
          p => p.id !== playlist.id
        );
        save();
      }
    };

    grid.appendChild(card);
  });

  $("#empty").style.display =
    state.playlists.length ? "none" : "block";
}

/* ---------- PLAYLIST ---------- */

function openPlaylistModal() {
  $("#playlistName").value = "";
  $("#playlistDescription").value = "";
  $("#playlistModal").showModal();
}

$("#newPlaylistBtn").onclick = openPlaylistModal;

$("#playlistForm").onsubmit = e => {
  e.preventDefault();

  const name = $("#playlistName").value.trim();

  if (!name) return;

  state.playlists.push({
    id: Date.now(),
    name,
    description: $("#playlistDescription").value.trim(),
    tracks: []
  });

  $("#playlistModal").close();
  save();
};

/* ---------- ADD TRACK ---------- */

function openTrackModal(id) {
  if (!state.playlists.length) {
    alert("Create a playlist first.");
    openPlaylistModal();
    return;
  }

  $("#trackPlaylist").innerHTML =
    state.playlists.map(p => `
      <option value="${p.id}" ${p.id == id ? "selected" : ""}>
        ${escapeHtml(p.name)}
      </option>
    `).join("");

  $("#trackTitle").value = "";
  $("#trackArtist").value = "";
  $("#trackUrl").value = "";

  $("#trackModal").showModal();
}

$("#addTrackBtn").onclick = () =>
  openTrackModal(state.playlists[0]?.id);

$("#trackForm").onsubmit = e => {
  e.preventDefault();

  const playlist = state.playlists.find(
    p => p.id == $("#trackPlaylist").value
  );

  if (!playlist) return;

  playlist.tracks.push({
    id: Date.now(),
    title: $("#trackTitle").value.trim(),
    artist: $("#trackArtist").value.trim(),
    url: $("#trackUrl").value.trim(),
    artwork: "",
    favorite: false
  });

  $("#trackModal").close();
  save();
};

/* ---------- AUDIUS SEARCH ---------- */

async function searchAudius(query) {
  query = query.trim();

  if (!query) {
    $("#onlineSection").classList.add("hidden");
    return;
  }

  $("#onlineSection").classList.remove("hidden");
  $("#onlineStatus").textContent = "Searching...";
  $("#onlineResults").innerHTML = "";

  try {
    const url =
      `${API}/tracks/search?query=${encodeURIComponent(query)}&limit=15`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    onlineTracks = result.data || [];

    renderOnline();

  } catch (error) {
    console.error(error);

    $("#onlineStatus").textContent =
      "Audius is unavailable right now.";

    $("#onlineResults").innerHTML = `
      <div class="online-error">
        <b>Could not connect to Audius.</b>
        <p>Please try again in a moment.</p>
        <button class="primary" id="retryAudius">
          Retry
        </button>
      </div>
    `;

    $("#retryAudius").onclick = () =>
      searchAudius(query);
  }
}

function renderOnline() {
  const box = $("#onlineResults");

  box.innerHTML = "";

  if (!onlineTracks.length) {
    $("#onlineStatus").textContent =
      "No results found.";
    return;
  }

  $("#onlineStatus").textContent =
    `${onlineTracks.length} results`;

  onlineTracks.forEach((track, index) => {
    const artist =
      track.user?.name ||
      track.user?.handle ||
      "Unknown artist";

    const cover =
      track.artwork?.["480x480"] ||
      track.artwork?.["150x150"] ||
      "";

    const item = document.createElement("article");

    item.className = "online-track";

    item.innerHTML = `
      <div class="online-cover">
        ${
          cover
            ? `<img src="${escapeHtml(cover)}" alt="">`
            : "♫"
        }
      </div>

      <div class="online-info">
        <b>${escapeHtml(track.title)}</b>
        <span>${escapeHtml(artist)}</span>
      </div>

      <div class="online-actions">
        <button class="online-play">▶</button>
        <button class="online-add">＋</button>
      </div>
    `;

    item.querySelector(".online-play").onclick =
      () => playAudius(track, index);

    item.querySelector(".online-add").onclick =
      () => addAudius(track);

    box.appendChild(item);
  });
}

/* ---------- AUDIUS PLAYER ---------- */

function audiusUrl(track) {
  return `${API}/tracks/${encodeURIComponent(track.id)}/stream`;
}

function playAudius(track, index) {
  onlineIndex = index;

  current = {
    title: track.title || "Unknown",
    artist:
      track.user?.name ||
      track.user?.handle ||
      "Unknown artist",
    url: audiusUrl(track),
    artwork:
      track.artwork?.["480x480"] ||
      track.artwork?.["150x150"] ||
      ""
  };

  updatePlayer();

  audio.src = current.url;

  audio.play()
    .then(() => {
      $("#playBtn").textContent = "❚❚";
    })
    .catch(error => {
      console.error("Playback error:", error);
      $("#playBtn").textContent = "▶";
      alert("This track cannot be played.");
    });
}

function play(track) {
  current = track;

  updatePlayer();

  if (!track.url) {
    alert("This track has no audio URL.");
    return;
  }

  audio.src = track.url;

  audio.play()
    .then(() => {
      $("#playBtn").textContent = "❚❚";
    })
    .catch(() => {
      $("#playBtn").textContent = "▶";
    });
}

function updatePlayer() {
  if (!current) return;

  $("#playerTitle").textContent =
    current.title || "Nothing playing";

  $("#playerArtist").textContent =
    current.artist || "Unknown artist";

  if (current.artwork) {
    $("#playerCover").innerHTML =
      `<img src="${escapeHtml(current.artwork)}" alt="">`;
  } else {
    $("#playerCover").textContent = "♪";
  }
}

/* ---------- PLAYER CONTROLS ---------- */

$("#playBtn").onclick = () => {
  if (!current) return;

  if (audio.paused) {
    audio.play();
    $("#playBtn").textContent = "❚❚";
  } else {
    audio.pause();
    $("#playBtn").textContent = "▶";
  }
};

$("#nextBtn").onclick = () => {
  if (onlineIndex < onlineTracks.length - 1) {
    playAudius(
      onlineTracks[onlineIndex + 1],
      onlineIndex + 1
    );
  }
};

$("#prevBtn").onclick = () => {
  if (onlineIndex > 0) {
    playAudius(
      onlineTracks[onlineIndex - 1],
      onlineIndex - 1
    );
  }
};

audio.ontimeupdate = () => {
  const duration = audio.duration || 0;

  $("#progress").value =
    duration
      ? audio.currentTime / duration * 100
      : 0;

  $("#time").textContent =
    formatTime(audio.currentTime);

  $("#duration").textContent =
    formatTime(duration);
};

audio.onended = () => {
  $("#playBtn").textContent = "▶";

  if (onlineIndex < onlineTracks.length - 1) {
    playAudius(
      onlineTracks[onlineIndex + 1],
      onlineIndex + 1
    );
  }
};

$("#progress").oninput = () => {
  if (audio.duration) {
    audio.currentTime =
      audio.duration *
      ($("#progress").value / 100);
  }
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${min}:${sec}`;
};

/* ---------- ADD AUDIUS TRACK ---------- */

function addAudius(track) {
  if (!state.playlists.length) {
    alert("Create a playlist first.");
    openPlaylistModal();
    return;
  }

  const playlist = state.playlists[0];

  playlist.tracks.push({
    id: Date.now(),
    title: track.title,
    artist:
      track.user?.name ||
      track.user?.handle ||
      "Unknown artist",
    url: audiusUrl(track),
    artwork:
      track.artwork?.["480x480"] ||
      track.artwork?.["150x150"] ||
      "",
    favorite: false
  });

  save();

  alert("Added to your playlist.");
}

/* ---------- SEARCH ---------- */

let searchTimer;

$("#search").oninput = () => {
  render();

  clearTimeout(searchTimer);

  const value = $("#search").value.trim();

  if (!value) {
    $("#onlineSection").classList.add("hidden");
    return;
  }

  searchTimer = setTimeout(
    () => searchAudius(value),
    700
  );
};

$("#search").onkeydown = e => {
  if (e.key === "Enter") {
    searchAudius($("#search").value);
  }
};

$("#onlineSearchBtn").onclick = () =>
  searchAudius($("#search").value);

$("#closeOnlineBtn").onclick = () =>
  $("#onlineSection").classList.add("hidden");

/* ---------- THEME ---------- */

$("#themeBtn").onclick = () => {
  document.body.classList.toggle("dark");

  const dark =
    document.body.classList.contains("dark");

  localStorage.setItem(
    "pulseTheme",
    dark ? "dark" : "light"
  );

  $("#themeBtn").textContent =
    dark ? "🌙" : "☀️";
};

if (
  localStorage.getItem("pulseTheme") === "dark"
) {
  document.body.classList.add("dark");
  $("#themeBtn").textContent = "🌙";
}

/* ---------- BACKUP ---------- */

$("#backupBtn").onclick = () => {
  const blob = new Blob(
    [JSON.stringify(state, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");

  a.href = URL.createObjectURL(blob);
  a.download = "pulse-music-backup.json";
  a.click();

  URL.revokeObjectURL(a.href);
};

/* ---------- IMPORT ---------- */

$("#importBtn").onclick = () =>
  $("#fileInput").click();

$("#fileInput").onchange = e => {
  const file = e.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      if (!Array.isArray(data.playlists)) {
        throw new Error();
      }

      state = data;
      save();

    } catch {
      alert("Invalid backup file.");
    }
  };

  reader.readAsText(file);
};

/* ---------- START ---------- */

render();
