// One game session: who is playing, the lobby/playing/over lifecycle, and the current game's state.
// Pure logic shared by the Worker's Durable Object and the tests; sockets and storage live elsewhere.
import { GAMES } from "./games/index.js";
import { MAX_PLAYERS, PLAYER_COLORS, cleanName, isWikiTreeId, randInt } from "./common.js";

export function createRoomData({ code, hostHash, gameId, config }, now = Date.now()) {
  const game = GAMES[gameId];
  const data = { code, hostHash, gameId, config, status: "lobby", gameNo: 1, players: {}, nextSid: 1, banned: {}, g: null, created: now };
  data.g = game.create(config, { now, players: {}, rand: randInt });
  return data;
}

export class Room {
  constructor(data) {
    this.d = data;
    this.notes = [];            // {to: sid | null, text} messages for the sockets layer to deliver
  }

  get game() { return GAMES[this.d.gameId]; }

  ctx(now) {
    const players = {};
    for (const p of Object.values(this.d.players)) players[p.sid] = { name: p.name, kind: p.kind };
    return { now, rand: randInt, players, notify: (to, note) => this.notes.push({ to, ...note }) };
  }

  sidOf(pid) { const p = this.d.players[pid]; return p ? p.sid : null; }
  pidOfSid(sid) { return Object.keys(this.d.players).find(pid => this.d.players[pid].sid === sid) || null; }
  playerCount() { return Object.keys(this.d.players).length; }

  // ---- players ----
  join(pid, { kind, name }) {
    if (this.d.banned[pid]) return { error: "The host removed you from this game" };
    kind = kind === "id" ? "id" : "name";
    name = cleanName(name || "");
    if (!pid || !/^[A-Za-z0-9-]{8,64}$/.test(pid)) return { error: "Please reload the page and try again" };
    if (!name) return { error: "Please enter a name" };
    if (kind === "id" && !isWikiTreeId(name)) return { error: "That doesn't look like a WikiTree ID (for example Robinson-27225)" };
    const clash = Object.entries(this.d.players).find(([id, p]) => id !== pid && p.name.toLowerCase() === name.toLowerCase());
    if (clash) return { error: "Someone with that name is already playing" };
    let p = this.d.players[pid];
    if (!p) {
      if (this.playerCount() >= MAX_PLAYERS) return { error: "This game is full" };
      const sid = "p" + (this.d.nextSid++).toString(36);
      p = this.d.players[pid] = { sid, name, kind, color: PLAYER_COLORS[(this.d.nextSid - 2) % PLAYER_COLORS.length] };
    } else { p.name = name; p.kind = kind; }
    return { sid: p.sid };
  }

  kick(sid) {
    const pid = this.pidOfSid(sid);
    if (!pid) return null;
    delete this.d.players[pid];
    this.d.banned[pid] = true;
    return pid;
  }

  // ---- messages ----
  syncStatus() {
    if (this.d.g.done && this.d.status === "playing") this.d.status = "over";
  }

  hostMsg(msg, now) {
    const d = this.d, ctx = this.ctx(now);
    switch (msg.a) {
      case "start":
        if (d.status !== "lobby") return;
        d.status = "playing";
        if (this.game.onStart) this.game.onStart(d.g, ctx);
        break;
      case "newGame":
        d.g = this.game.create(d.config, ctx); d.status = "lobby"; d.gameNo++;
        break;
      case "kick": return this.kick(msg.sid) ? { kicked: true } : undefined;
      default:
        if (d.status === "playing") this.game.onHost(d.g, msg, ctx);
    }
    this.syncStatus();
  }

  playerMsg(pid, msg, now) {
    const d = this.d, sid = this.sidOf(pid);
    if (!sid || d.status !== "playing") return;
    this.game.onPlayer(d.g, sid, msg, this.ctx(now));
    this.syncStatus();
  }

  // Apply any timer that has run out. Returns true if something changed.
  tick(now) {
    if (this.d.status !== "playing" || !this.game.tick) return false;
    const changed = this.game.tick(this.d.g, this.ctx(now));
    this.syncStatus();
    return changed;
  }
  nextDeadline() { return this.d.status === "playing" && this.game.nextDeadline ? this.game.nextDeadline(this.d.g) : null; }

  // ---- what each connection sees ----
  snapshot(role, pid, online, now) {
    const d = this.d, me = role === "player" ? this.sidOf(pid) : null;
    const players = Object.values(d.players).map(p => ({ sid: p.sid, name: p.name, kind: p.kind, color: p.color, online: online.has(p.sid) }));
    const ids = new Set(players.map(p => p.sid)), scores = {};
    for (const [sid, n] of Object.entries(d.g.scores)) if (ids.has(sid)) scores[sid] = n;
    return {
      t: "state", code: d.code, game: d.gameId, status: d.status, gameNo: d.gameNo, players, scores, me, now,
      v: this.game.view(d.g, role, me)
    };
  }
}
