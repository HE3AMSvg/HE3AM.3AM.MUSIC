const $ = s => document.querySelector(s);

/* =========================
   AUDIUS
========================= */

const AUDIUS_API_KEY =
  "0x95346463237963a1311f3675753aa73056fd1f87";

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


/* =========================
   HELPERS
========================= */

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


/* =========================
   PLAYLIST RENDER
========================= */

function render() {
  const grid = $("#playlistGrid");

  if (!grid) return;

  const q = ($("#search")?.value || "")
    .toLowerCase()
    .trim();

  const playlists =
    state.playlists.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description || "")
        .toLowerCase()
        .includes(q) ||
      p.tracks.some(t =>
        `${t.title} ${t.artist || ""}`
          .toLowerCase()
          .includes(q)
      )
    );

  if ($("#playlistCount")) {
    $("#playlistCount").textContent =
      state.playlists.length;
  }

  if ($("#trackCount")) {
    $("#trackCount").textContent =
      state.playlists.reduce(
        (n, p) => n + p.tracks.length,
        0
      );
  }

  if ($("#favoriteCount")) {
    $("#favoriteCount").textContent =
      state.playlists.reduce(
        (n, p) =>
          n +
          p.tracks.filter(
            t => t.favorite
          ).length,
        0
      );
  }

  grid.innerHTML = "";

  if ($("#empty")) {
    $("#empty").style.display =
      playlists.length ? "none" : "block";
  }

  playlists.forEach(p => {

    const template =
      $("#playlistTemplate");

    if (!template) return;

    const card =
      template.content.cloneNode(true);

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
            — ${escapeHtml(
              t.artist || "Unknown artist"
            )}
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

    grid.appendChild(card);
  });
}


/* =========================
   PLAYLIST
========================= */

function openPlaylistModal() {

  if ($("#playlistName"))
    $("#playlistName").value = "";

  if ($("#playlistDescription"))
    $("#playlistDescription").value = "";

  $("#playlistModal")?.showModal();
}

$("#newPlaylistBtn")?.addEventListener(
  "click",
  openPlaylistModal
);

$("#playlistForm")?.addEventListener(
  "submit",
  e => {

    e.preventDefault();

    const name =
      $("#playlistName")
        .value
        .trim();

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
  }
);


/* =========================
   ADD LOCAL TRACK
========================= */

function openTrackModal(id) {

  if (!state.playlists.length) {

    alert(
      "Create a playlist first."
    );

    openPlaylistModal();

    return;
  }

  $("#trackPlaylist").innerHTML =
    state.playlists
      .map(p => `
        <option value="${p.id}">
          ${escapeHtml(p.name)}
        </option>
      `)
      .join("");

  $("#trackPlaylist").value = id;

  $("#trackTitle").value = "";
  $("#trackArtist").value = "";
  $("#trackUrl").value = "";

  $("#trackModal").showModal();
}

$("#addTrackBtn")?.addEventListener(
  "click",
  () =>
    openTrackModal(
      state.playlists[0]?.id
    )
);

$("#trackForm")?.addEventListener(
  "submit",
  e => {

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
      artwork: "",
      favorite: false
    });

    $("#trackModal").close();

    save();
  }
);


/* =========================
   AUDIUS SEARCH
========================= */

async function searchAudius(query) {

  query = query.trim();

  if (!query) return;

  const section =
    $("#onlineSection");

  const status =
    $("#onlineStatus");

  const results =
    $("#onlineResults");

  if (!section || !status || !results)
    return;

  section.classList.remove("hidden");

  status.textContent =
    "Searching Audius...";

  results.innerHTML = `
    <div style="padding:20px">
      Searching...
    </div>
  `;

  try {

    const params =
      new URLSearchParams({
        query,
        limit: "15",
        offset: "0"
      });

    const response =
      await fetch(
        `${API}/tracks/search?${params}`,
        {
          method: "GET",
          headers: {
            "X-API-Key":
              AUDIUS_API_KEY
          }
        }
      );

    if (!response.ok) {

      throw new Error(
        `Audius HTTP ${response.status}`
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

    console.error(
      "Audius search error:",
      error
    );

    status.textContent =
      "Could not connect to Audius.";

    results.innerHTML = `
      <div style="padding:20px">
        Audius is temporarily unavailable.
        <br>
        Please try again.
      </div>
    `;
  }
}


/* =========================
   ONLINE RESULTS
========================= */

function getArtwork(track) {

  return (
    track.artwork?.["1000x1000"] ||
    track.artwork?.["480x480"] ||
    track.artwork?.["150x150"] ||
    ""
  );
}

function getArtist(track) {

  return (
    track.user?.name ||
    track.user?.handle ||
    "Unknown artist"
  );
}

function renderOnline() {

  const results =
    $("#onlineResults");

  if (!results) return;

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
        getArtist(track);

      const cover =
        getArtwork(track);

      const item =
        document.createElement("div");

      item.className =
        "online-track";

      item.innerHTML = `

        <div class="online-cover">

          ${
            cover
              ? `
                <img
                  src="${escapeHtml(cover)}"
                  alt=""
                >
              `
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
            ${escapeHtml(artist)}
          </span>

        </div>

        <div class="online-actions">

          <button
            class="online-play"
            title="Play"
          >
            ▶
          </button>

          <button
            class="online-add"
            title="Add to playlist"
          >
            ＋
          </button>

        </div>
      `;

      item
        .querySelector(".online-play")
        .onclick = () =>
          playAudius(
            track,
            index
          );

      item
        .querySelector(".online-add")
        .onclick = () =>
          addAudius(track);

      results.appendChild(item);
    }
  );
}


/* =========================
   AUDIUS STREAM
========================= */

function streamUrl(track) {

  return (
    `${API}/tracks/` +
    `${encodeURIComponent(track.id)}` +
    `/stream`
  );
}


/* =========================
   PLAY AUDIUS
========================= */

function playAudius(track, index) {

  onlineIndex = index;

  current = {

    title:
      track.title ||
      "Unknown title",

    artist:
      getArtist(track),

    url:
      streamUrl(track),

    artwork:
      getArtwork(track)
  };

  updatePlayer();

  audio.src =
    current.url;

  audio.load();

  audio.play()
    .then(() => {

      if ($("#playBtn")) {
        $("#playBtn").textContent =
          "❚❚";
      }

    })
    .catch(error => {

      console.error(
        "Playback error:",
        error
      );

      if ($("#playBtn")) {
        $("#playBtn").textContent =
          "▶";
      }
    });
}


/* =========================
   LOCAL PLAY
========================= */

function play(track) {

  current = track;

  onlineIndex = -1;

  updatePlayer();

  if (!track.url) {

    alert(
      "This track has no audio URL."
    );

    return;
  }

  audio.src =
    track.url;

  audio.load();

  audio.play()
    .then(() => {

      if ($("#playBtn")) {
        $("#playBtn").textContent =
          "❚❚";
      }

    })
    .catch(() => {});
}


/* =========================
   PLAYER UI
========================= */

function updatePlayer() {

  if (!current) return;

  if ($("#playerTitle")) {
    $("#playerTitle").textContent =
      current.title;
  }

  if ($("#playerArtist")) {
    $("#playerArtist").textContent =
      current.artist ||
      "Unknown artist";
  }

  const cover =
    $("#playerCover");

  if (!cover) return;

  if (current.artwork) {

    cover.innerHTML = `
      <img
        src="${escapeHtml(
          current.artwork
        )}"
        alt=""
        style="
          width:100%;
          height:100%;
          object-fit:cover;
          border-radius:10px
        "
      >
    `;

  } else {

    cover.textContent =
      "♪";
  }
}


/* =========================
   MAIN PLAYER
========================= */

$("#playBtn")?.addEventListener(
  "click",
  () => {

    if (!current) return;

    if (audio.paused) {

      audio.play()
        .then(() => {

          $("#playBtn").textContent =
            "❚❚";

        })
        .catch(() => {});

    } else {

      audio.pause();

      $("#playBtn").textContent =
        "▶";
    }
  }
);


/* NEXT */

$("#nextBtn")?.addEventListener(
  "click",
  () => {

    if (
      onlineIndex >= 0 &&
      onlineIndex <
        onlineTracks.length - 1
    ) {

      playAudius(
        onlineTracks[
          onlineIndex + 1
        ],
        onlineIndex + 1
      );
    }
  }
);


/* PREVIOUS */

$("#prevBtn")?.addEventListener(
  "click",
  () => {

    if (onlineIndex > 0) {

      playAudius(
        onlineTracks[
          onlineIndex - 1
        ],
        onlineIndex - 1
      );
    }
  }
);


/* =========================
   AUDIO EVENTS
========================= */

audio.ontimeupdate = () => {

  const duration =
    audio.duration || 0;

  if ($("#progress")) {

    $("#progress").value =
      duration
        ? (
            audio.currentTime /
            duration
          ) * 100
        : 0;
  }

  if ($("#time")) {

    $("#time").textContent =
      formatTime(
        audio.currentTime
      );
  }

  if ($("#duration")) {

    $("#duration").textContent =
      formatTime(duration);
  }
};


audio.onplay = () => {

  if ($("#playBtn")) {
    $("#playBtn").textContent =
      "❚❚";
  }
};


audio.onpause = () => {

  if ($("#playBtn")) {
    $("#playBtn").textContent =
      "▶";
  }
};


audio.onerror = error => {

  console.error(
    "Audio error:",
    error
  );

  if ($("#playBtn")) {
    $("#playBtn").textContent =
      "▶";
  }
};


audio.onended = () => {

  if (
    onlineIndex >= 0 &&
    onlineIndex <
      onlineTracks.length - 1
  ) {

    playAudius(
      onlineTracks[
        onlineIndex + 1
      ],
      onlineIndex + 1
    );

  } else {

    if ($("#playBtn")) {
      $("#playBtn").textContent =
        "▶";
    }
  }
};


/* PROGRESS */

$("#progress")?.addEventListener(
  "input",
  () => {

    if (!audio.duration)
      return;

    audio.currentTime =
      audio.duration *
      (
        $("#progress").value /
        100
      );
  }
);


/* =========================
   TIME
========================= */

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
}


/* =========================
   ADD AUDIUS TRACK
========================= */

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

  const alreadyExists =
    playlist.tracks.some(
      t =>
        t.audiusId === track.id
    );

  if (alreadyExists) {

    alert(
      "This song is already in your playlist."
    );

    return;
  }

  playlist.tracks.push({

    id: Date.now(),

    audiusId:
      track.id,

    title:
      track.title ||
      "Unknown title",

    artist:
      getArtist(track),

    url:
      streamUrl(track),

    artwork:
      getArtwork(track),

    favorite:
      false
  });

  save();

  alert(
    "Song added to your playlist."
  );
}


/* =========================
   SEARCH
========================= */

let searchTimer;

$("#search")?.addEventListener(
  "input",
  () => {

    render();

    clearTimeout(
      searchTimer
    );

    const value =
      $("#search")
        .value
        .trim();

    if (!value) {

      $("#onlineSection")
        ?.classList
        .add("hidden");

      return;
    }

    searchTimer =
      setTimeout(
        () =>
          searchAudius(value),
        600
      );
  }
);


$("#search")?.addEventListener(
  "keydown",
  e => {

    if (e.key !== "Enter")
      return;

    e.preventDefault();

    clearTimeout(
      searchTimer
    );

    searchAudius(
      $("#search").value
    );
  }
);


$("#onlineSearchBtn")
  ?.addEventListener(
    "click",
    () =>
      searchAudius(
        $("#search").value
      )
  );


$("#closeOnlineBtn")
  ?.addEventListener(
    "click",
    () =>
      $("#onlineSection")
        ?.classList
        .add("hidden")
  );


/* =========================
   THEME
========================= */

$("#themeBtn")
  ?.addEventListener(
    "click",
    () => {

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

      $("#themeBtn").textContent =
        dark ? "🌙" : "☀️";
    }
  );


if (
  localStorage.getItem(
    "pulseTheme"
  ) === "dark"
) {

  document.body
    .classList
    .add("dark");

  if ($("#themeBtn")) {
    $("#themeBtn").textContent =
      "🌙";
  }
}


/* =========================
   BACKUP
========================= */

$("#backupBtn")
  ?.addEventListener(
    "click",
    () => {

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
    }
  );


/* =========================
   IMPORT
========================= */

$("#importBtn")
  ?.addEventListener(
    "click",
    () =>
      $("#fileInput")?.click()
  );


$("#fileInput")
  ?.addEventListener(
    "change",
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
    }
  );


/* =========================
   START
========================= */

render();
