// Clue Board: a Jeopardy-style quiz. The host runs the board on a shared screen, players buzz in
// from their own devices, the host (or the server, in auto mode) judges the answer.
// Pure state machine used by the Worker and the tests. Players are referred to by their short
// public id (sid); the room maps secret player ids to sids.
import { parseRows, cleanText, normText, randInt } from "../common.js";

export const id = "clue";
export const MAX_CATEGORIES = 8, MAX_ROWS = 8;
const MAX_CLUE = 300, MAX_ANSWER = 80, MAX_NAME = 40;

// ---- content ----

// Rows of Category, Value, Clue, Answer (a header row is fine; Value may be left out).
// Put several accepted answers in the Answer cell separated by | (the first one is shown).
export function parseBoardCsv(text) {
  const rows = parseRows(text);
  if (rows.length && /^categor/i.test(rows[0][0] || "")) rows.shift();
  const cats = [], byName = new Map(), warnings = [];
  rows.forEach((r, i) => {
    let name, value, clue, answer;
    const numeric = s => /^\$?\s*\d+$/.test(s || "");
    if (r.length >= 4 || (r.length === 3 && numeric(r[1]))) { [name, value, clue, answer] = r.length >= 4 ? r : [r[0], r[1], r[2], ""]; }
    else { [name, clue, answer] = r; value = ""; }
    name = cleanText(name, MAX_NAME); clue = cleanText(clue, MAX_CLUE); answer = cleanText(answer, MAX_ANSWER * 3);
    if (!name || !clue || !answer) { warnings.push(`Row ${i + 1} is missing its category, clue or answer, so it was skipped.`); return; }
    const key = normText(name);
    if (!byName.has(key)) { byName.set(key, { name, clues: [] }); cats.push(byName.get(key)); }
    byName.get(key).clues.push({ value: parseInt(String(value).replace(/\D/g, ""), 10) || 0, clue, answer });
  });
  for (const c of cats) c.clues.forEach((cl, i) => { if (!cl.value) cl.value = (i + 1) * 100; });
  return { categories: cats, warnings };
}

const num = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

export function validateConfig(raw) {
  raw = raw || {};
  const cats = [];
  for (const c of (Array.isArray(raw.categories) ? raw.categories : []).slice(0, MAX_CATEGORIES)) {
    const clues = [];
    for (const cl of (Array.isArray(c && c.clues) ? c.clues : []).slice(0, MAX_ROWS)) {
      const clue = cleanText(cl && cl.clue, MAX_CLUE), answer = cleanText(cl && cl.answer, MAX_ANSWER * 3);
      if (!clue || !answer) continue;
      clues.push({ value: num(cl.value, 1, 100000, (clues.length + 1) * 100), clue, answer });
    }
    const name = cleanText(c && c.name, MAX_NAME);
    if (name && clues.length) cats.push({ name, clues });
  }
  if (!cats.length) return { ok: false, error: "Add at least one category with a clue and an answer" };
  const rows = Math.max(...cats.map(c => c.clues.length));
  return {
    ok: true,
    config: {
      title: cleanText(raw.title, 60) || "Clue Board",
      categories: cats, rows,
      readAloud: raw.readAloud !== false,            // host reads each clue out, then opens the buzzers
      judging: raw.judging === "auto" ? "auto" : "host",
      dailyDoubles: num(raw.dailyDoubles, 0, 2, 1),
      buzzSecs: num(raw.buzzSecs, 5, 60, 15),
      answerSecs: num(raw.answerSecs, 5, 60, 15)
    }
  };
}

// ---- answer matching ----
const stripLead = s => s.replace(/^(what|who|where|when|which)( (is|are|was|were))?( (a|an|the))? /, "").replace(/^(a|an|the) /, "");
const normAnswer = s => stripLead(normText(String(s).replace(/\([^)]*\)/g, " ")));
function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export const acceptedAnswers = answer => String(answer).split("|").map(s => s.trim()).filter(Boolean);
export function matchesAnswer(typed, answer) {
  const t = normAnswer(typed);
  if (!t) return false;
  return acceptedAnswers(answer).some(a => {
    const n = normAnswer(a);
    if (!n) return false;
    if (n === t) return true;
    const allow = n.length >= 10 ? 2 : n.length >= 5 ? 1 : 0;      // forgive a typo in longer answers
    return allow > 0 && distance(n, t) <= allow;
  });
}
export const displayAnswer = answer => acceptedAnswers(answer)[0] || "";

// ---- state ----
const key = (c, r) => c + "." + r;

export function create(cfg, ctx) {
  const rand = ctx.rand || randInt;
  const g = { cfg, used: {}, dd: [], current: null, control: null, scores: {}, done: false, log: null };
  const pool = [];
  cfg.categories.forEach((cat, c) => cat.clues.forEach((_, r) => { if (cat.clues.length < 3 || r >= 1) pool.push(key(c, r)); }));
  for (let i = 0; i < cfg.dailyDoubles && pool.length > 1; i++) g.dd.push(pool.splice(rand(pool.length), 1)[0]);
  return g;
}

const tile = (g, c, r) => g.cfg.categories[c] && g.cfg.categories[c].clues[r];
const maxValue = g => Math.max(...g.cfg.categories.flatMap(c => c.clues.map(x => x.value)));
const playerIds = ctx => Object.keys(ctx.players);
export const maxWager = (g, pid) => Math.max(g.scores[pid] || 0, maxValue(g));

function reveal(g, result) {
  const cur = g.current;
  cur.stage = "revealed"; cur.deadline = null; cur.result = result || { pid: null, ok: null, delta: 0 };
}
function credit(g, pid, delta) { g.scores[pid] = (g.scores[pid] || 0) + delta; }

function judge(g, ok, ctx) {
  const cur = g.current, pid = cur.pid;
  const delta = cur.dd ? cur.wager : tile(g, cur.c, cur.r).value;
  if (ok) {
    credit(g, pid, delta); g.control = pid;
    reveal(g, { pid, ok: true, delta });
  } else {
    credit(g, pid, -delta); cur.locked[pid] = true;
    const eligible = !cur.dd && playerIds(ctx).some(p => !cur.locked[p]);
    if (eligible) { cur.stage = "open"; cur.pid = null; cur.typed = ""; cur.deadline = ctx.now + Math.min(g.cfg.buzzSecs, 8) * 1000; cur.lastWrong = pid; }
    else reveal(g, { pid, ok: false, delta: -delta });
  }
}

function finishIfDone(g) {
  const all = g.cfg.categories.every((cat, c) => cat.clues.every((_, r) => g.used[key(c, r)]));
  if (all) g.done = true;
}

export function nextDeadline(g) { return g.current && g.current.deadline || null; }

// Apply any timer that has run out. Returns true if the state changed.
export function tick(g, ctx) {
  const cur = g.current;
  if (!cur || !cur.deadline || ctx.now < cur.deadline) return false;
  if (cur.stage === "open") reveal(g, { pid: null, ok: null, delta: 0 });
  else if (cur.stage === "answering") judge(g, false, ctx);
  else if (cur.stage === "wager") { cur.wager = 5; cur.stage = "answering"; cur.deadline = ctx.now + g.cfg.answerSecs * 2000; }
  else return false;
  return true;
}

export function onHost(g, msg, ctx) {
  const cur = g.current;
  switch (msg.a) {
    case "pick": {
      if (cur) return "Finish the current clue first";
      const c = msg.c | 0, r = msg.r | 0, t = tile(g, c, r);
      if (!t || g.used[key(c, r)]) return "That clue is already used";
      const ids = playerIds(ctx);
      const dd = g.dd.includes(key(c, r));
      if (dd && !ids.length) return "A Daily Double needs at least one player";
      g.current = { key: key(c, r), c, r, dd, stage: "reading", pid: null, locked: {}, typed: "", deadline: null, wager: 0, result: null };
      if (dd) {
        const who = g.control && ctx.players[g.control] ? g.control : ids[randInt(ids.length)];
        g.current.pid = who; g.current.stage = "wager"; g.current.deadline = ctx.now + 30000;
      } else if (!g.cfg.readAloud) { g.current.stage = "open"; g.current.deadline = ctx.now + g.cfg.buzzSecs * 1000; }
      break;
    }
    case "open":
      if (!cur || cur.stage !== "reading") return;
      cur.stage = "open"; cur.deadline = ctx.now + g.cfg.buzzSecs * 1000;
      break;
    case "judge":
      if (!cur || cur.stage !== "answering") return;
      judge(g, !!msg.ok, ctx);
      break;
    case "reveal":
      if (!cur || cur.stage === "revealed") return;
      reveal(g, null);
      break;
    case "back":
      if (!cur || cur.stage !== "revealed") return;
      g.used[cur.key] = true; g.current = null; finishIfDone(g);
      break;
    case "control":
      if (msg.sid && !ctx.players[msg.sid]) return;
      g.control = msg.sid || null;
      break;
    case "adjust": {
      const sid = msg.sid, d = Math.round(Number(msg.delta));
      if (!ctx.players[sid] || !Number.isFinite(d) || Math.abs(d) > 100000) return;
      credit(g, sid, d);
      break;
    }
    case "end": g.done = true; break;
  }
}

export function onPlayer(g, sid, msg, ctx) {
  const cur = g.current;
  if (!cur) return;
  if (msg.a === "buzz") {
    if (cur.stage !== "open" || cur.locked[sid] || cur.dd) return;
    cur.pid = sid; cur.stage = "answering"; cur.typed = "";
    cur.deadline = ctx.now + g.cfg.answerSecs * 1000;
  } else if (msg.a === "answer") {
    if (cur.stage !== "answering" || cur.pid !== sid) return;
    cur.typed = cleanText(msg.text, MAX_ANSWER);
    if (g.cfg.judging === "auto" && cur.typed) judge(g, matchesAnswer(cur.typed, tile(g, cur.c, cur.r).answer), ctx);
  } else if (msg.a === "wager") {
    if (cur.stage !== "wager" || cur.pid !== sid) return;
    const top = maxWager(g, sid);
    cur.wager = Math.min(top, Math.max(5, Math.round(Number(msg.amount)) || 5));
    cur.stage = "answering"; cur.deadline = ctx.now + g.cfg.answerSecs * 2000;
  }
}

export function view(g, role, sid) {
  const cfg = g.cfg, cur = g.current;
  const v = {
    title: cfg.title, categories: cfg.categories.map(c => c.name), rows: cfg.rows,
    values: cfg.categories.map(c => c.clues.map(x => x.value)),
    used: g.used, control: g.control, judging: cfg.judging, readAloud: cfg.readAloud, done: g.done, current: null
  };
  if (cur) {
    const t = tile(g, cur.c, cur.r), isHost = role === "host", revealed = cur.stage === "revealed";
    v.current = {
      c: cur.c, r: cur.r, category: cfg.categories[cur.c].name, value: t.value, stage: cur.stage, dd: cur.dd,
      pid: cur.pid, locked: Object.keys(cur.locked), deadline: cur.deadline, wager: cur.wager, result: cur.result,
      clue: (cur.stage === "wager" && !isHost) ? "" : t.clue,
      answer: (isHost || revealed) ? displayAnswer(t.answer) : undefined,
      accepted: (isHost || revealed) ? acceptedAnswers(t.answer) : undefined,
      typed: (isHost || cur.pid === sid || revealed) ? cur.typed : "",
      match: isHost && cur.typed ? matchesAnswer(cur.typed, t.answer) : undefined,
      maxWager: cur.stage === "wager" ? maxWager(g, cur.pid) : undefined
    };
  }
  return v;
}
