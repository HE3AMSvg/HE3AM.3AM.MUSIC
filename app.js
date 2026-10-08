const $ = s => document.querySelector(s);

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

const AUDIUS_API = "https://api.audius.co/v1";

function save() {
  localStorage.setItem(
    "pulseMusic",
    JSON.stringify(state)
  );

  render();
}

/* =========================
   LOCAL LIBRARY
========================= */

function render() {

  const q = $("#search").value
    .toLowerCase()
    .trim();

  const playlists = state.playlists.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.description || "").toLowerCase().includes(q) ||
    p.tracks.some(t =>
      (t.title + " " + (t.artist || ""))
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

  const grid = $("#playlistGrid");

  grid.innerHTML = "";

  $("#empty").style.display =
    playlists.length ? "none" : "block";

  playlists.forEach(p => {

    const card =
      $("#playlistTemplate")
        .content
        .cloneNode(true);

    const el = card.querySelector(".card");

    card.querySelector("h3").textContent =
      p.name;

    card.querySelector("p").textContent =
      p.description || "Your playlist";

    card.querySelector(".track-count")
      .textContent =
      `${p.tracks.length} track${
        p.tracks.length === 1 ? "" : "s"
      }`;

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

        <button title="Play">
          ▶
        </button>
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

        if (
          confirm(
            `Delete "${p.name}"?`
          )
        ) {

          state.playlists =
            state.playlists.filter(
              x => x.id !== p.id
            );

          save();

        }

      };

    grid.appendChild(el);

  });

}

/* =========================
   HTML SAFETY
========================= */

function escapeHtml(s) {

  return String(s).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );

}

/* =========================
   PLAYLISTS
========================= */

function openPlaylistModal() {

  $("#playlistName").value = "";
  $("#playlistDescription").value = "";

  $("#playlistModal").showModal();

}

$("#newPlaylistBtn")
  .onclick = openPlaylistModal;

$("#playlistForm").onsubmit = e => {

  e.preventDefault();

  const name =
    $("#playlistName")
      .value
      .trim();

  const description =
    $("#playlistDescription")
      .value
      .trim();

  if (!name) return;

  state.playlists.push({

    id: Date.now(),

    name,

    description,

    tracks: []

  });

  $("#playlistModal").close();

  save();

};

/* =========================
   ADD TRACK
========================= */

function openTrackModal(id) {

  if (!state.playlists.length) {

    alert(
      "Create a playlist first."
    );

    return;

  }

  const sel =
    $("#trackPlaylist");

  sel.innerHTML =
    state.playlists
      .map(p => `
        <option
          value="${p.id}"
          ${p.id === id ? "selected" : ""}
        >
          ${escapeHtml(p.name)}
        </option>
      `)
      .join("");

  $("#trackTitle").value = "";
  $("#trackArtist").value = "";
  $("#trackUrl").value = "";

  $("#trackModal").showModal();

}

$("#addTrackBtn")
  .onclick = () =>
    openTrackModal(
      state.playlists[0]?.id
    );

$("#trackForm").onsubmit = e => {

  e.preventDefault();

  const playlist =
    state.playlists.find(
      x =>
        x.id ==
        $("#trackPlaylist").value
    );

  if (!playlist) return;

  playlist.tracks.push({

    id: Date.now(),

    title:
      $("#trackTitle")
        .value
        .trim(),

    artist:
      $("#trackArtist")
        .value
        .trim(),

    url:
      $("#trackUrl")
        .value
        .trim(),

    favorite: false

  });

  $("#trackModal").close();

  save();

};

/* =========================
   AUDIUS SEARCH
========================= */

async function searchAudius(query) {

  query = query.trim();

  if (!query) {

    $("#onlineSection")
      .classList.add("hidden");

    return;

  }

  $("#onlineSection")
    .classList.remove("hidden");

  $("#onlineStatus")
    .textContent =
    "Searching Audius...";

  $("#onlineResults")
    .innerHTML = "";

  try {

    const url =
      `${AUDIUS_API}/tracks/search?` +
      new URLSearchParams({
        query,
        limit: "15"
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

    renderOnlineResults();

  } catch (error) {

    console.error(
      "Audius search error:",
      error
    );

    $("#onlineStatus")
      .textContent =
      "Could not connect to Audius. Please try again.";

    $("#onlineResults")
      .innerHTML = "";

  }

}

function renderOnlineResults() {

  const container =
    $("#onlineResults");

  container.innerHTML = "";

  if (!onlineTracks.length) {

    $("#onlineStatus")
      .textContent =
      "No results found.";

    return;

  }

  $("#onlineStatus")
    .textContent =
    `${onlineTracks.length} results found`;

  onlineTracks.forEach(
    (track, index) => {

      const item =
        document.createElement("article");

      item.className =
        "online-track";

      const image =
        track.artwork?.["150x150"] ||
        track.artwork?.["480x480"] ||
        track.artwork?.["1000x1000"];

      item.innerHTML = `

        <div class="online-cover">
          ${
            image
              ? `<img
                   src="${escapeHtml(image)}"
                   alt=""
                   loading="lazy"
                 >`
              : "♫"
          }
        </div>

        <div class="online-info">

          <b>
            ${escapeHtml(
              track.title ||
              "Unknown title"
            )}
          </b>

          <span>
            ${escapeHtml(
              track.user?.name ||
              track.user?.handle ||
              "Unknown artist"
            )}
          </span>

        </div>

        <div class="online-actions">

          <button
            class="online-play"
            data-index="${index}"
            title="Play"
          >
            ▶
          </button>

          <button
            class="online-add"
            data-index="${index}"
            title="Add to playlist"
          >
            ＋
          </button>

        </div>
      `;

      item
        .querySelector(".online-play")
        .onclick = () =>
          playAudiusTrack(
            track,
            index
          );

      item
        .querySelector(".online-add")
        .onclick = () =>
          addAudiusToPlaylist(track);

      container.appendChild(item);

    }
  );

}

/* =========================
   AUDIUS PLAYBACK
========================= */

function getAudiusStreamUrl(track) {

  return (
    `${AUDIUS_API}/tracks/` +
    `${encodeURIComponent(track.id)}` +
    `/stream`
  );

}

function playAudiusTrack(
  track,
  index = 0
) {

  current = {

    id:
      `audius-${track.id}`,

    title:
      track.title ||
      "Unknown title",

    artist:
      track.user?.name ||
      track.user?.handle ||
      "Unknown artist",

    url:
      getAudiusStreamUrl(track),

    artwork:
      track.artwork?.["480x480"] ||
      track.artwork?.["150x150"] ||
      ""

  };

  onlineIndex = index;

  updatePlayer();

  audio.src =
    current.url;

  audio.play()
    .then(() => {

      $("#playBtn")
        .textContent = "❚❚";

    })
    .catch(error => {

      console.error(
        "Playback error:",
        error
      );

      $("#playBtn")
        .textContent = "▶";

      alert(
        "This track could not be played."
      );

    });

}

function play(t) {

  current = t;

  updatePlayer();

  if (!t.url) {

    alert(
      "This track does not have an audio URL."
    );

    return;

  }

  audio.src = t.url;

  audio.play()
    .then(() => {

      $("#playBtn")
        .textContent = "❚❚";

    })
    .catch(() => {

      $("#playBtn")
        .textContent = "▶";

    });

}

function updatePlayer() {

  if (!current) return;

  $("#playerTitle")
    .textContent =
    current.title ||
    "Nothing playing";

  $("#playerArtist")
    .textContent =
    current.artist ||
    "Unknown artist";

  const cover =
    current.artwork;

  if (cover) {

    $("#playerCover")
      .innerHTML =
      `<img
        src="${escapeHtml(cover)}"
        alt=""
      >`;

  } else {

    $("#playerCover")
      .textContent = "♪";

  }

}

/* =========================
   PLAYER
========================= */

$("#playBtn").onclick = () => {

  if (!current) return;

  if (audio.paused) {

    audio.play()
      .then(() => {

        $("#playBtn")
          .textContent = "❚❚";

      })
      .catch(() => {});

  } else {

    audio.pause();

    $("#playBtn")
      .textContent = "▶";

  }

};

audio.ontimeupdate = () => {

  const duration =
    audio.duration || 0;

  $("#progress").value =
    duration
      ? (
          audio.currentTime /
          duration *
          100
        )
      : 0;

  $("#time").textContent =
    fmt(audio.currentTime);

  $("#duration").textContent =
    fmt(duration);

};

audio.onended = () => {

  $("#playBtn")
    .textContent = "▶";

  if (
    onlineIndex >= 0 &&
    onlineIndex <
      onlineTracks.length - 1
  ) {

    playAudiusTrack(
      onlineTracks[onlineIndex + 1],
      onlineIndex + 1
    );

  }

};

$("#progress").oninput = () => {

  if (audio.duration) {

    audio.currentTime =
      $("#progress").value /
      100 *
      audio.duration;

  }

};

function fmt(n) {

  if (!Number.isFinite(n))
    return "0:00";

  return `
    ${Math.floor(n / 60)}:
    ${String(
      Math.floor(n % 60)
    ).padStart(2, "0")}
  `.replace(/\s/g, "");

}

/* =========================
   NEXT / PREVIOUS
========================= */

$("#nextBtn").onclick = () => {

  if (
    onlineTracks.length &&
    onlineIndex <
      onlineTracks.length - 1
  ) {

    playAudiusTrack(
      onlineTracks[onlineIndex + 1],
      onlineIndex + 1
    );

  }

};

$("#prevBtn").onclick = () => {

  if (
    onlineTracks.length &&
    onlineIndex > 0
  ) {

    playAudiusTrack(
      onlineTracks[onlineIndex - 1],
      onlineIndex - 1
    );

  }

};

/* =========================
   ADD AUDIUS TRACK
========================= */

function addAudiusToPlaylist(track) {

  if (!state.playlists.length) {

    alert(
      "Create a playlist first."
    );

    openPlaylistModal();

    return;

  }

  const playlist =
    state.playlists[0];

  const newTrack = {

    id:
      Date.now(),

    title:
      track.title ||
      "Unknown title",

    artist:
      track.user?.name ||
      track.user?.handle ||
      "Unknown artist",

    url:
      getAudiusStreamUrl(track),

    artwork:
      track.artwork?.["480x480"] ||
      track.artwork?.["150x150"] ||
      "",

    favorite: false

  };

  playlist.tracks.push(
    newTrack
  );

  save();

  alert(
    `"${newTrack.title}" added to "${playlist.name}".`
  );

}

/* =========================
   SEARCH
========================= */

let searchTimer;

$("#search").oninput = () => {

  render();

  clearTimeout(searchTimer);

  const value =
    $("#search")
      .value
      .trim();

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

$("#onlineSearchBtn")
  .onclick = () =>
    searchAudius(
      $("#search").value
    );

$("#closeOnlineBtn")
  .onclick = () =>
    $("#onlineSection")
      .classList.add("hidden");

/* =========================
   THEME
========================= */

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
    dark
      ? "dark"
      : "light"
  );

  $("#themeBtn")
    .textContent =
    dark
      ? "🌙"
      : "☀️";

};

if (
  localStorage.getItem(
    "pulseTheme"
  ) === "dark"
) {

  document.body
    .classList
    .add("dark");

  $("#themeBtn")
    .textContent = "🌙";

}

/* =========================
   BACKUP
========================= */

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

  URL.revokeObjectURL(
    a.href
  );

};

/* =========================
   IMPORT
========================= */

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

/* =========================
   START
========================= */

render();
