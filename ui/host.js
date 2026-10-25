// Host page: pick a game, set up its content, open a lobby, then run the game on a shared screen.
import { renderFooter, SHORT_URL } from "../shared/config.js";
import { connect, createRoom, makeState, store } from "../shared/net.js";
import { Sound } from "../shared/sound.js";
import { UI, ORDER } from "./games.js";
import { h, clear, renderScores, startClock, refreshClock, toast, confetti, results } from "./common.js";

renderFooter(document.getElementById("foot"));
const $ = id => document.getElementById(id);
let shown = "";
const show = id => {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
  if (id !== shown) { shown = id; scrollTo(0, 0); }
};
const st = makeState();
startClock(() => st.get().offset);

let net = null, room = null, gameId = null, gameUI = null, setupApi = null, setupGame = null, overFor = 0;
const send = msg => net && net.send(msg);

/* ---------- 1. choose a game ---------- */
ORDER.forEach(id => {
  const i = UI[id].info;
  $("gameCards").append(h("button", { class: "gamecard", type: "button", onclick: () => chooseGame(id) },
    h("span", { class: "ic" }, i.icon), h("h2", {}, i.title), h("p", {}, i.blurb)));
});

const saved = store.get("host");
if (saved && saved.code) {
  $("resumeBox").classList.remove("hidden");
  $("resume").textContent = `Resume game ${saved.code}`;
  $("resume").onclick = () => open(saved);
}

/* ---------- 2. set up ---------- */
function chooseGame(id) {
  setupGame = id;
  const i = UI[id].info;
  $("setupTitle").textContent = i.title;
  $("setupBlurb").textContent = i.blurb;
  $("setupErr").textContent = "";
  clear($("setupForm"));
  setupApi = UI[id].setup($("setupForm"));
  show("setup");
  scrollTo(0, 0);
}
$("backBtn").onclick = () => show("choose");

$("openLobby").onclick = async () => {
  $("setupErr").textContent = "";
  const res = setupApi.getConfig();
  if (res.error) { $("setupErr").textContent = res.error; return; }
  $("openLobby").disabled = true;
  try { open({ ...(await createRoom(setupGame, res.config)), game: setupGame }); }
  catch (e) { $("setupErr").textContent = e.message; }
  $("openLobby").disabled = false;
};

/* ---------- connection ---------- */
function open(r) {
  room = r; store.set("host", r);
  if (net) net.close();
  net = connect(`/ws/${r.code}?role=host&key=${encodeURIComponent(r.hostKey)}`, {
    onMessage,
    onStatus(s, failures) {
      $("conn").classList.toggle("hidden", s === "open");
      if (s === "closed" && failures >= 3) {            // the saved game has expired or the key is wrong
        net.close(); net = null; store.del("host"); room = null;
        $("resumeBox").classList.add("hidden");
        show("choose");
        toast("That game is no longer available. Start a new one.");
      }
    }
  });
}

function onMessage(m) {
  if (m.t === "state") onState(st.apply(m));
  else if (m.t === "note") toast(m.text);
}

const joinUrl = () => {
  const u = new URL("play.html", location.href);
  u.search = ""; u.searchParams.set("g", room.code);
  const w = new URLSearchParams(location.search).get("worker");
  if (w) u.searchParams.set("worker", w);
  return u.href;
};
const shortLink = () => SHORT_URL ? SHORT_URL + "?g=" + room.code : joinUrl();

function onState(snap) {
  room.code = snap.code;
  if (!gameUI || gameId !== snap.game) {
    gameId = snap.game;
    clear($("gameArea"));
    gameUI = UI[gameId].createHost($("gameArea"), { send, getSnap: st.get });
  }
  $("stageCode").textContent = snap.code;
  $("stageCount").textContent = snap.players.length;
  if (snap.status === "lobby") { renderLobby(snap); $("over").classList.remove("show"); show("lobby"); return; }
  show("stage");
  $("stageTitle").textContent = snap.v.title || UI[gameId].info.title;
  gameUI.update(snap);
  renderScores($("scores"), snap, gameUI.scoreOptions ? gameUI.scoreOptions(snap) : {});
  refreshClock();
  $("endBtn").classList.toggle("hidden", snap.status !== "playing");
  $("showResults").classList.toggle("hidden", snap.status !== "over");
  if (snap.status === "over") finish(snap); else $("over").classList.remove("show");
}

/* ---------- 3. lobby ---------- */
function renderLobby(snap) {
  const shown = shortLink().replace(/^https?:\/\//, "");
  $("lobbyTitle").textContent = snap.v.title || "Join the game";
  clear($("joinUrl")).append(document.createTextNode("Go to "), h("b", {}, shown));
  $("bigCode").textContent = snap.code;
  $("lobbyCount").textContent = snap.players.length;
  $("playToo").href = joinUrl();
  clear($("chips"));
  snap.players.forEach(p => $("chips").append(h("span", { class: "chip" + (p.online ? "" : " off") },
    h("span", { class: "dot", style: { background: p.color } }), p.name,
    h("button", { type: "button", title: "Remove " + p.name, "aria-label": "Remove " + p.name, onclick: () => send({ a: "kick", sid: p.sid }) }, "×"))));
  $("startBtn").disabled = !snap.players.length;
  $("lobbyNote").textContent = snap.players.length ? "Press START when everyone is in. Players can also join after the game begins." : "Waiting for the first player…";
}
$("copyLink").onclick = async () => {
  try { await navigator.clipboard.writeText(shortLink()); toast("Link copied"); } catch (e) { toast(shortLink()); }
};
$("startBtn").onclick = () => { Sound.unlock(); send({ a: "start" }); };

/* ---------- 4/5. playing and results ---------- */
$("endBtn").onclick = () => { if (confirm("End the game now and show the results?")) send({ a: "end" }); };
function finish(snap) {
  if (overFor === snap.gameNo) return;
  overFor = snap.gameNo;
  clear($("resultsBox")).append(results(snap, null));
  $("over").classList.add("show");
  confetti($("confetti"));
  Sound.cheer();
}
$("showResults").onclick = () => { clear($("resultsBox")).append(results(st.get(), null)); $("over").classList.add("show"); };
$("lookBtn").onclick = () => $("over").classList.remove("show");
$("againBtn").onclick = () => { Sound.stopAll(); $("over").classList.remove("show"); send({ a: "newGame" }); };
$("newSession").onclick = () => { store.del("host"); location.reload(); };

/* ---------- sound ---------- */
function renderMute() { $("muteBtn").textContent = Sound.prefs.on ? "Sound on" : "Sound off"; $("muteBtn").setAttribute("aria-pressed", Sound.prefs.on); }
$("muteBtn").onclick = () => { Sound.unlock(); Sound.prefs.on = !Sound.prefs.on; Sound.save(); if (!Sound.prefs.on) Sound.stopAll(); renderMute(); };
renderMute();
document.addEventListener("pointerdown", () => Sound.unlock(), { once: true });
