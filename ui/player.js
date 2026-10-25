// Player page: enter a game code and a WikiTree ID (or just a username), then play on your own device.
import { renderFooter } from "../shared/config.js";
import { connect, makeState, store } from "../shared/net.js";
import { isWikiTreeId, cleanName } from "../shared/common.js";
import { UI } from "./games.js";
import { h, clear, renderScores, startClock, refreshClock, results, toast, confetti } from "./common.js";

renderFooter(document.getElementById("foot"));
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const st = makeState();
startClock(() => st.get().offset);

/* ---------- identity ---------- */
let pid = store.get("pid");
if (!pid) { pid = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now(); store.set("pid", pid); }
let kind = store.get("kind") === "name" ? "name" : "id";
function renderMode() {
  $("modeId").setAttribute("aria-pressed", kind === "id");
  $("modeName").setAttribute("aria-pressed", kind === "name");
  $("whoLbl").textContent = kind === "id" ? "Your WikiTree ID" : "Your username";
  $("who").placeholder = kind === "id" ? "Robinson-27225" : "Pick a name";
  $("whoHint").textContent = kind === "id" ? "Your ID is shown to the group, and winners link to their WikiTree profile." : "Your username is shown to the group.";
}
$("modeId").onclick = () => { kind = "id"; renderMode(); };
$("modeName").onclick = () => { kind = "name"; renderMode(); };
renderMode();
$("who").value = store.get("who") || "";
const gParam = (params.get("g") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
$("code").value = gParam;
if (gParam) $("codeField").classList.add("hidden");

/* ---------- connection ---------- */
let net = null, joined = false, wantJoin = null, gameId = null, gameUI = null, overFor = 0, session = null;
const send = msg => net && net.send(msg);
const say = (id, text) => { $(id).textContent = text; };

function startConnection(code) {
  if (net) net.close();
  net = connect("/ws/" + code, {
    onOpen() { if (wantJoin) send({ t: "join", pid, ...wantJoin }); },
    onMessage,
    onStatus(state, failures) {
      $("conn").classList.toggle("hidden", state === "open" || !joined);
      if (!joined && failures >= 3) {
        say("joinErr", "Can't reach that game. Check the code and try again.");
        $("joinBtn").disabled = false; wantJoin = null; net.close();
        store.del("session");
        $("join").classList.remove("hidden"); $("game").classList.add("hidden");
      }
    }
  });
}

function onMessage(m) {
  if (m.t === "state") onState(st.apply(m));
  else if (m.t === "note") { if (gameUI && gameUI.note) gameUI.note(m.text); else toast(m.text); }
  else if (m.t === "kicked") {
    net.close(); store.del("session"); joined = false;
    $("game").classList.add("hidden"); $("join").classList.remove("hidden");
    $("joinBtn").disabled = false; say("joinErr", "The host removed you from the game.");
  } else if (m.t === "error" && !joined) {
    say("joinErr", m.reason); $("joinBtn").disabled = false; wantJoin = null; store.del("session");
  }
}

function onState(snap) {
  if (!joined) {
    joined = true;
    store.set("session", { code: snap.code, kind: wantJoin.kind, name: wantJoin.name, at: Date.now() });
    $("join").classList.add("hidden"); $("game").classList.remove("hidden");
  }
  if (!gameUI || gameId !== snap.game) {
    gameId = snap.game; clear($("gameArea"));
    gameUI = UI[gameId].createPlayer($("gameArea"), { send, getSnap: st.get });
    $("gameName").textContent = UI[gameId].info.title;
  }
  const me = snap.players.find(p => p.sid === snap.me);
  $("whoAmI").replaceChildren(h("small", {}, "Playing as "), me ? me.name : "");
  const lobby = snap.status === "lobby", over = snap.status === "over";
  // Don't show a puzzle before the host starts, so nobody gets a head start.
  $("gameArea").classList.toggle("hidden", lobby);
  $("waiting").classList.toggle("hidden", !lobby);
  if (lobby) $("waiting").replaceChildren("Waiting for the host to start…", h("small", {}, `${snap.players.length} player${snap.players.length === 1 ? "" : "s"} in the game`));
  $("presults").classList.toggle("hidden", !over);
  if (!lobby) gameUI.update(snap);
  renderScores($("scores"), snap, { me: snap.me });
  refreshClock();
  if (over) {
    clear($("presults")).append(h("h2", {}, "Game over!"), results(snap, snap.me), h("canvas", { id: "pconfetti", style: { position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 40 } }));
    if (overFor !== snap.gameNo) { overFor = snap.gameNo; const c = $("pconfetti"); c.width = innerWidth; c.height = innerHeight; confetti(c, 4500); $("boardBox").open = true; }
  }
}

/* ---------- joining ---------- */
function join(code, k, name) {
  kind = k; wantJoin = { kind: k, name };
  store.set("kind", k); store.set("who", name);
  $("joinBtn").disabled = true;
  startConnection(code);
}
$("joinBtn").onclick = () => {
  const code = $("code").value.trim().toUpperCase();
  const name = cleanName($("who").value);
  say("joinErr", "");
  if (!/^[A-Z0-9]{4}$/.test(code)) return say("joinErr", "Enter the 4-letter game code");
  if (!name) return say("joinErr", kind === "id" ? "Enter your WikiTree ID" : "Pick a username");
  if (kind === "id" && !isWikiTreeId(name)) return say("joinErr", "That doesn't look like a WikiTree ID, for example Robinson-27225");
  join(code, kind, name);
};
for (const id of ["who", "code"]) $(id).addEventListener("keydown", e => { if (e.key === "Enter") $("joinBtn").click(); });
$("leave").onclick = () => { store.del("session"); location.href = location.pathname + (params.get("worker") ? "?worker=" + encodeURIComponent(params.get("worker")) : ""); };

// Coming back to the same game (refresh, locked phone): rejoin without asking again.
const prev = store.get("session");
if (prev && prev.code && Date.now() - prev.at < 12 * 3600e3 && (!gParam || gParam === prev.code)) {
  $("code").value = prev.code;
  join(prev.code, prev.kind, prev.name);
}
