const $ = s => document.querySelector(s);

const API = "https://api.audius.co/v1";

let state;

try {
  state = JSON.parse(
    localStorage.getItem("pulseMusic") ||
    '{"playlists":[]}'
  );
} catch {
  state = { playlists: [] };
}

let current = null;
let audio = new Audio();
let onlineTracks = [];
let onlineIndex = -1;

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function save() {
  localStorage.setItem(
    "pulseMusic",
    JSON.stringify(state)
  );
  render();
}

function render() {
  const grid = $("#playlistGrid");
  if (!grid) return;

  const q = ($("#search")?.value || "")
    .toLowerCase()
    .trim();

  const playlists =
    state.playlists.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      p.tracks.some(t =>
        `${t.title} ${t.artist || ""}`
          .toLowerCase()
          .includes(q)
      )
    );

  $("#playlistCount").textContent =
    state.playlists.length;

  $("#trackCount").textContent =
    state.playlists.reduce(
      (n, p) => n + p.tracks.length,
      0
    );

  $("#favoriteCount").textContent =
    state.playlists.reduce(
      (n, p) =>
        n + p.tracks.filter(t => t.favorite).length,
      0
    );

  grid.innerHTML = "";

  $("#empty").style.display =
    playlists.length ? "none" : "block";

  playlists.forEach(p => {

    const card =
      $("#playlistTemplate")
        .content
        .cloneNode(true);

    card.querySelector("h3").textContent =
      p.name;

    card.querySelector("p").textContent =
      p.description || "Your playlist";

    card.querySelector(".track-count")
      .textContent =
      `${p.tracks.length} track${p.tracks.length === 1 ? "" : "s"}`;

    const tracks =
      card.querySelector(".tracks");

    p.tracks.slice(0, 3).forEach(t => {

      const row =
        document.createElement("div");

      row.className = "track";

      row.innerHTML = `
        <span>
          <b>${escapeHtml(t.title)}</b>
          <small>
            — ${escapeHtml(t.artist || "Unknown artist")}
          </small>
        </span>

        <button>▶</button>
      `;

      row.querySelector("button")
        .onclick = () => play(t);

      tracks.appendChild(row);
    });

    card.querySelector(".open")
      .onclick = () =>
        openTrackModal(p.id);

    card.querySelector(".more")
      .onclick = () => {

        if (confirm(`Delete "${p.name}"?`)) {

          state.playlists =
            state.playlists.filter(
              x => x.id !== p.id
            );

          save();
        }
      };

    grid.appendChild(card);
  });
}

/* PLAYLIST */

function openPlaylistModal() {
  $("#playlistName").value = "";
  $("#playlistDescription").value = "";
  $("#playlistModal").showModal();
}

$("#newPlaylistBtn").onclick =
  openPlaylistModal;

$("#playlistForm").onsubmit = e => {

  e.preventDefault();

  const name =
    $("#playlistName").value.trim();

  if (!name) return;

  state.playlists.push({
    id: Date.now(),
    name,
    description:
      $("#playlistDescription")
        .value
        .trim(),
    tracks: []
  });

  $("#playlistModal").close();

  save();
};

/* ADD TRACK */

function openTrackModal(id) {

  if (!state.playlists.length) {
    alert("Create a playlist first.");
    openPlaylistModal();
    return;
  }

  $("#trackPlaylist").innerHTML =
    state.playlists.map(p => `
      <option value="${p.id}">
        ${escapeHtml(p.name)}
      </option>
    `).join("");

  $("#trackPlaylist").value = id;

  $("#trackTitle").value = "";
  $("#trackArtist").value = "";
  $("#trackUrl").value = "";

  $("#trackModal").showModal();
}

$("#addTrackBtn").onclick = () =>
  openTrackModal(
    state.playlists[0]?.id
  );

$("#trackForm").onsubmit = e => {

  e.preventDefault();

  const p =
    state.playlists.find(
      x =>
        x.id ==
        $("#trackPlaylist").value
    );

  if (!p) return;

  p.tracks.push({
    id: Date.now(),
    title:
      $("#trackTitle").value.trim(),
    artist:
      $("#trackArtist").value.trim(),
    url:
      $("#trackUrl").value.trim(),
    artwork: "",
    favorite: false
  });

  $("#trackModal").close();

  save();
};

/* AUDIUS SEARCH */

async function searchAudius(query) {

  query = query.trim();

  if (!query) return;

  const section =
    $("#onlineSection");

  const status =
    $("#onlineStatus");

  const results =
    $("#onlineResults");

  section.classList.remove("hidden");

  status.textContent =
    "Searching...";

  results.innerHTML = "";

  try {

    const url =
      `${API}/tracks/search?` +
      new URLSearchParams({
        query,
        limit: 15,
        offset: 0
      });

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const json =
      await response.json();

    onlineTracks =
      Array.isArray(json.data)
        ? json.data
        : [];

    renderOnline();

  } catch (error) {

    console.error(error);

    status.textContent =
      "Audius could not be reached.";

    results.innerHTML = `
      <div style="padding:20px">
        Try searching again in a moment.
      </div>
    `;
  }
}

function renderOnline() {

  const results =
    $("#onlineResults");

  results.innerHTML = "";

  if (!onlineTracks.length) {

    $("#onlineStatus").textContent =
      "No songs found.";

    return;
  }

  $("#onlineStatus").textContent =
    `${onlineTracks.length} songs found`;

  onlineTracks.forEach(
    (track, index) => {

      const artist =
        track.user?.name ||
        track.user?.handle ||
        "Unknown artist";

      const cover =
        track.artwork?.["480x480"] ||
        track.artwork?.["150x150"] ||
        "";

      const item =
        document.createElement("div");

      item.className =
        "online-track";

      item.innerHTML = `

        <div class="online-cover">

          ${
            cover
              ? `<img
                   src="${escapeHtml(cover)}"
                   alt=""
                 >`
              : "♫"
          }

        </div>

        <div class="online-info">

          <b>
            ${escapeHtml(track.title)}
          </b>

          <span>
            ${escapeHtml(artist)}
          </span>

        </div>

        <div class="online-actions">

          <button class="online-play">
            ▶
          </button>

          <button class="online-add">
            ＋
          </button>

        </div>
      `;

      item.querySelector(".online-play")
        .onclick = () =>
          playAudius(track, index);

      item.querySelector(".online-add")
        .onclick = () =>
          addAudius(track);

      results.appendChild(item);
    }
  );
}

/* AUDIUS PLAY */

function streamUrl(track) {

  return (
    `${API}/tracks/` +
    `${encodeURIComponent(track.id)}` +
    `/stream`
  );
}

function playAudius(track, index) {

  onlineIndex = index;

  current = {
    title:
      track.title ||
      "Unknown title",

    artist:
      track.user?.name ||
      track.user?.handle ||
      "Unknown artist",

    url:
      streamUrl(track),

    artwork:
      track.artwork?.["480x480"] ||
      track.artwork?.["150x150"] ||
      ""
  };

  updatePlayer();

  audio.src =
    current.url;

  audio.play()
    .then(() => {
      $("#playBtn").textContent =
        "❚❚";
    })
    .catch(error => {
      console.error(error);
      $("#playBtn").textContent =
        "▶";
    });
}

/* LOCAL PLAY */

function play(track) {

  current = track;

  updatePlayer();

  if (!track.url) {
    alert("This track has no audio URL.");
    return;
  }

  audio.src =
    track.url;

  audio.play()
    .then(() => {
      $("#playBtn").textContent =
        "❚❚";
    })
    .catch(() => {});
}

function updatePlayer() {

  if (!current) return;

  $("#playerTitle").textContent =
    current.title;

  $("#playerArtist").textContent =
    current.artist ||
    "Unknown artist";

  if (current.artwork) {

    $("#playerCover").innerHTML =
      `<img
        src="${escapeHtml(current.artwork)}"
        alt=""
        style="width:100%;height:100%;object-fit:cover;border-radius:10px"
      >`;

  } else {

    $("#playerCover").textContent =
      "♪";
  }
}

/* PLAYER */

$("#playBtn").onclick = () => {

  if (!current) return;

  if (audio.paused) {

    audio.play();

    $("#playBtn").textContent =
      "❚❚";

  } else {

    audio.pause();

    $("#playBtn").textContent =
      "▶";
  }
};

$("#nextBtn").onclick = () => {

  if (
    onlineIndex >= 0 &&
    onlineIndex <
      onlineTracks.length - 1
  ) {

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

  const duration =
    audio.duration || 0;

  $("#progress").value =
    duration
      ? audio.currentTime /
        duration *
        100
      : 0;

  $("#time").textContent =
    formatTime(audio.currentTime);

  $("#duration").textContent =
    formatTime(duration);
};

audio.onended = () => {

  $("#playBtn").textContent =
    "▶";

  if (
    onlineIndex >= 0 &&
    onlineIndex <
      onlineTracks.length - 1
  ) {

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

  if (!Number.isFinite(seconds))
    return "0:00";

  return (
    Math.floor(seconds / 60) +
    ":" +
    String(
      Math.floor(seconds % 60)
    ).padStart(2, "0")
  );
};

/* ADD ONLINE TRACK */

function addAudius(track) {

  if (!state.playlists.length) {

    alert(
      "Create a playlist first."
    );

    openPlaylistModal();

    return;
  }

  const playlist =
    state.playlists[0];

  playlist.tracks.push({

    id: Date.now(),

    title:
      track.title,

    artist:
      track.user?.name ||
      track.user?.handle ||
      "Unknown artist",

    url:
      streamUrl(track),

    artwork:
      track.artwork?.["480x480"] ||
      track.artwork?.["150x150"] ||
      "",

    favorite: false
  });

  save();

  alert(
    "Song added to your playlist."
  );
}

/* SEARCH */

let searchTimer;

$("#search").oninput = () => {

  render();

  clearTimeout(searchTimer);

  const value =
    $("#search").value.trim();

  if (!value) {

    $("#onlineSection")
      .classList.add("hidden");

    return;
  }

  searchTimer =
    setTimeout(
      () => searchAudius(value),
      600
    );
};

$("#search").onkeydown = e => {

  if (e.key === "Enter") {

    e.preventDefault();

    searchAudius(
      $("#search").value
    );
  }
};

$("#onlineSearchBtn").onclick =
  () =>
    searchAudius(
      $("#search").value
    );

$("#closeOnlineBtn").onclick =
  () =>
    $("#onlineSection")
      .classList.add("hidden");

/* THEME */

$("#themeBtn").onclick = () => {

  document.body
    .classList
    .toggle("dark");

  const dark =
    document.body
      .classList
      .contains("dark");

  localStorage.setItem(
    "pulseTheme",
    dark ? "dark" : "light"
  );

  $("#themeBtn").textContent =
    dark ? "🌙" : "☀️";
};

if (
  localStorage.getItem(
    "pulseTheme"
  ) === "dark"
) {

  document.body
    .classList
    .add("dark");

  $("#themeBtn").textContent =
    "🌙";
}

/* BACKUP */

$("#backupBtn").onclick = () => {

  const blob =
    new Blob(
      [
        JSON.stringify(
          state,
          null,
          2
        )
      ],
      {
        type:
          "application/json"
      }
    );

  const a =
    document.createElement("a");

  a.href =
    URL.createObjectURL(blob);

  a.download =
    "pulse-music-backup.json";

  a.click();

  URL.revokeObjectURL(a.href);
};

/* IMPORT */

$("#importBtn").onclick =
  () =>
    $("#fileInput").click();

$("#fileInput").onchange =
  e => {

    const file =
      e.target.files[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = () => {

      try {

        const data =
          JSON.parse(
            reader.result
          );

        if (
          !Array.isArray(
            data.playlists
          )
        ) {
          throw new Error();
        }

        state = data;

        save();

      } catch {

        alert(
          "Invalid backup file."
        );
      }
    };

    reader.readAsText(file);
  };

/* START */

render();
