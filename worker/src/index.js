// WikiTree Games realtime server: a Worker that creates sessions and a Durable Object (one per
// game code) that holds the game, relays it to the host and players and enforces the rules.
// All game rules live in ../../shared so they can be tested without Cloudflare.
import { GAMES } from "../../shared/games/index.js";
import { Room, createRoomData } from "../../shared/room.js";
import { randInt } from "../../shared/common.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no I, L, O, 0, 1
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY = 300000;
const MAX_MSG = 4000;
const FLUSH_MS = 120;               // players see changes within this long; bounds the fan-out
const SAVE_MS = 1500;
const RATE = { windowMs: 1000, max: 40 };

const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");
const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const newCode = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randInt(CODE_ALPHABET.length)]).join("");

function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;                                   // non-browser clients (tests, curl)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean).includes(origin);
}
const cors = request => ({
  "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});
const json = (request, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(request) } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(request) });
    if (!originAllowed(request, env)) return new Response("Origin not allowed", { status: 403 });

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const text = await request.text();
      if (text.length > MAX_BODY) return json(request, { error: "That game is too big" }, 413);
      let body = {};
      try { body = JSON.parse(text); } catch (e) { /* handled below */ }
      const game = GAMES[body.game];
      if (!game) return json(request, { error: "Unknown game" }, 400);
      const checked = game.validateConfig(body.config);
      if (!checked.ok) return json(request, { error: checked.error }, 400);
      const hostKey = randomHex(16), hostHash = await sha256(hostKey);
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch("https://room/init", { method: "POST", body: JSON.stringify({ code, hostHash, gameId: body.game, config: checked.config }) });
        if (res.status === 200) return json(request, { code, hostKey });
      }
      return json(request, { error: "Could not allocate a game code, try again" }, 503);
    }

    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{4})$/);
    if (m && request.headers.get("Upgrade") === "websocket") {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase()));
      return stub.fetch(request);
    }
    return new Response("WikiTree Games server", { status: 200 });
  }
};

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = null;
    this.sent = new Map();          // ws -> last roster revision / payload sent, to skip repeats
    this.rate = new Map();          // ws -> {start, n}
    this.flushTimer = null; this.saveTimer = null; this.deadlineTimer = null;
    this.rosterRev = 1;
    state.blockConcurrencyWhile(async () => {
      const data = await state.storage.get("room");
      if (data) { this.room = new Room(data); this.armDeadline(); }
    });
  }

  async save() {
    this.saveTimer = null;
    if (!this.room) return;
    await this.state.storage.put("room", this.room.d);
    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }
  queueSave() { if (!this.saveTimer) this.saveTimer = setTimeout(() => this.save(), SAVE_MS); }

  async alarm() {
    for (const ws of this.state.getWebSockets()) { try { ws.close(1001, "Game expired"); } catch (e) {} }
    await this.state.storage.deleteAll();
    this.room = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/init") {
      if (this.room) return new Response("exists", { status: 409 });
      const { code, hostHash, gameId, config } = await request.json();
      this.room = new Room(createRoomData({ code, hostHash, gameId, config }));
      await this.save();
      return new Response("ok");
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
    if (!this.room) return new Response("No such game", { status: 404 });
    const role = url.searchParams.get("role") === "host" ? "host" : "player";
    if (role === "host" && (await sha256(url.searchParams.get("key") || "")) !== this.room.d.hostHash)
      return new Response("Bad host key", { status: 403 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ role, pid: null });
    if (role === "host") { this.rosterRev++; this.flushNow(); }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- sending ----
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) {} }

  onlineSids() {
    const out = new Set();
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.role === "player" && a.pid) { const sid = this.room.sidOf(a.pid); if (sid) out.add(sid); }
    }
    return out;
  }

  flushNow() {
    clearTimeout(this.flushTimer); this.flushTimer = null;
    if (!this.room) return;
    const now = Date.now(), online = this.onlineSids();
    const onlineKey = [...online].sort().join();
    if (onlineKey !== this.lastOnlineKey) { this.lastOnlineKey = onlineKey; this.rosterRev++; }
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.role === "player" && !a.pid) continue;                    // connected but not joined yet
      const snap = this.room.snapshot(a.role, a.pid, online, now);
      const prev = this.sent.get(ws) || {};
      if (prev.rev === this.rosterRev) delete snap.players; else snap.rev = this.rosterRev;
      const body = JSON.stringify({ ...snap, now: 0 });
      if (prev.body !== body || snap.rev) this.send(ws, snap);
      this.sent.set(ws, { rev: this.rosterRev, body });
    }
    const notes = this.room.notes.splice(0);
    for (const n of notes) {
      for (const ws of this.state.getWebSockets()) {
        const a = ws.deserializeAttachment() || {};
        const mine = a.pid && this.room.sidOf(a.pid) === n.to;
        if (a.role === "host" || n.to === null || n.to === undefined || mine) this.send(ws, { t: "note", text: n.text, private: n.to != null });
      }
    }
    this.queueSave();
  }
  queueFlush() { if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flushNow(), FLUSH_MS); }

  // Run the game's timers: lazily before every message and with a timeout while a deadline is pending.
  armDeadline() {
    clearTimeout(this.deadlineTimer); this.deadlineTimer = null;
    const dl = this.room && this.room.nextDeadline();
    if (!dl) return;
    this.deadlineTimer = setTimeout(() => { this.deadlineTimer = null; this.runTick(); }, Math.max(50, dl - Date.now() + 20));
  }
  runTick() {
    if (!this.room) return;
    if (this.room.tick(Date.now())) this.queueFlush();
    this.armDeadline();
  }

  // ---- websocket handlers ----
  limited(ws) {
    const now = Date.now(), r = this.rate.get(ws) || { start: now, n: 0 };
    if (now - r.start > RATE.windowMs) { r.start = now; r.n = 0; }
    this.rate.set(ws, r);
    return ++r.n > RATE.max;
  }

  async webSocketMessage(ws, raw) {
    if (!this.room || typeof raw !== "string" || raw.length > MAX_MSG || this.limited(ws)) return;
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg !== "object") return;
    const att = ws.deserializeAttachment() || {}, now = Date.now();
    this.room.tick(now);

    if (att.role === "host") {
      const out = this.room.hostMsg(msg, now);
      if (out && out.kicked) this.rosterRev++;
      this.dropKicked();
    } else if (msg.t === "join") {
      const pid = typeof msg.pid === "string" ? msg.pid : "";
      const res = this.room.join(pid, msg);
      if (res.error) return this.send(ws, { t: "error", reason: res.error });
      ws.serializeAttachment({ role: "player", pid });
      this.rosterRev++;
      await this.save();
      this.flushNow();
      this.armDeadline();
      return;
    } else if (att.pid) {
      this.room.playerMsg(att.pid, msg, now);
    }
    this.armDeadline();
    if (msg.a === "start" || msg.a === "newGame" || msg.a === "end" || msg.a === "back") { await this.save(); this.flushNow(); }
    else this.queueFlush();
  }

  // Close the sockets of anyone the host removed.
  dropKicked() {
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.role === "player" && a.pid && !this.room.sidOf(a.pid)) {
        this.send(ws, { t: "kicked" });
        try { ws.close(1000, "Removed by the host"); } catch (e) {}
      }
    }
  }

  async webSocketClose(ws) { this.sent.delete(ws); this.rate.delete(ws); this.queueFlush(); }
  async webSocketError(ws) { this.sent.delete(ws); this.rate.delete(ws); this.queueFlush(); }
}
