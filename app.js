const $=s=>document.querySelector(s);
let state=JSON.parse(localStorage.getItem("pulseMusic")||'{"playlists":[]}');
let current=null, audio=new Audio();

function save(){localStorage.setItem("pulseMusic",JSON.stringify(state));render();}
function render(){
  const q=$("#search").value.toLowerCase();
  const playlists=state.playlists.filter(p=>p.name.toLowerCase().includes(q)||p.description.toLowerCase().includes(q)||p.tracks.some(t=>(t.title+" "+t.artist).toLowerCase().includes(q)));
  $("#playlistCount").textContent=state.playlists.length;
  $("#trackCount").textContent=state.playlists.reduce((n,p)=>n+p.tracks.length,0);
  $("#favoriteCount").textContent=state.playlists.reduce((n,p)=>n+p.tracks.filter(t=>t.favorite).length,0);
  const grid=$("#playlistGrid"); grid.innerHTML="";
  $("#empty").style.display=playlists.length?"none":"block";
  playlists.forEach(p=>{
    const card=$("#playlistTemplate").content.cloneNode(true), el=card.querySelector(".card");
    card.querySelector("h3").textContent=p.name; card.querySelector("p").textContent=p.description||"Your playlist";
    card.querySelector(".track-count").textContent=`${p.tracks.length} track${p.tracks.length===1?"":"s"}`;
    const tracks=card.querySelector(".tracks");
    p.tracks.slice(0,3).forEach(t=>{
      const row=document.createElement("div"); row.className="track";
      row.innerHTML=`<span><b>${escapeHtml(t.title)}</b> <small>— ${escapeHtml(t.artist||"Unknown artist")}</small></span><button title="Play">▶</button>`;
      row.querySelector("button").onclick=()=>play(t);
      tracks.appendChild(row);
    });
    card.querySelector(".open").onclick=()=>openTrackModal(p.id);
    card.querySelector(".more").onclick=()=>{if(confirm(`Delete "${p.name}"?`)){state.playlists=state.playlists.filter(x=>x.id!==p.id);save()}};
    grid.appendChild(el);
  });
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function openPlaylistModal(){$("#playlistName").value="";$("#playlistDescription").value="";$("#playlistModal").showModal()}
$("#newPlaylistBtn").onclick=openPlaylistModal;
$("#playlistForm").onsubmit=e=>{e.preventDefault();state.playlists.push({id:Date.now(),name:$("#playlistName").value.trim(),description:$("#playlistDescription").value.trim(),tracks:[]});$("#playlistModal").close();save()};
function openTrackModal(id){const sel=$("#trackPlaylist");sel.innerHTML=state.playlists.map(p=>`<option value="${p.id}" ${p.id===id?"selected":""}>${escapeHtml(p.name)}</option>`).join("");if(!state.playlists.length){alert("Create a playlist first.");return}$("#trackTitle").value="";$("#trackArtist").value="";$("#trackUrl").value="";$("#trackModal").showModal()}
$("#addTrackBtn").onclick=()=>openTrackModal(state.playlists[0]?.id);
$("#trackForm").onsubmit=e=>{e.preventDefault();const p=state.playlists.find(x=>x.id==$("#trackPlaylist").value);p.tracks.push({id:Date.now(),title:$("#trackTitle").value.trim(),artist:$("#trackArtist").value.trim(),url:$("#trackUrl").value.trim(),favorite:false});$("#trackModal").close();save()};
$("#search").oninput=render;
$("#themeBtn").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("pulseTheme",document.body.classList.contains("dark")?"dark":"light");$("#themeBtn").textContent=document.body.classList.contains("dark")?"🌙":"☀️"};
if(localStorage.getItem("pulseTheme")==="dark"){document.body.classList.add("dark");$("#themeBtn").textContent="🌙"}
function play(t){current=t;$("#playerTitle").textContent=t.title;$("#playerArtist").textContent=t.artist||"Unknown artist";$("#playBtn").textContent="❚❚";if(t.url){audio.src=t.url;audio.play().catch(()=>{});}}
$("#playBtn").onclick=()=>{if(!current)return;if(audio.paused){audio.play().catch(()=>{});$("#playBtn").textContent="❚❚"}else{audio.pause();$("#playBtn").textContent="▶"}};
audio.ontimeupdate=()=>{$("#progress").value=audio.duration?(audio.currentTime/audio.duration*100):0;$("#time").textContent=fmt(audio.currentTime);$("#duration").textContent=fmt(audio.duration||0)};
$("#progress").oninput=()=>{if(audio.duration)audio.currentTime=$("#progress").value/100*audio.duration};
function fmt(n){return `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,"0")}`}
$("#backupBtn").onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="pulse-music-backup.json";a.click();URL.revokeObjectURL(a.href)};
$("#importBtn").onclick=()=>$("#fileInput").click();
$("#fileInput").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!Array.isArray(d.playlists))throw Error();state=d;save()}catch{alert("Invalid backup file.")}};r.readAsText(f)};
render();
