// Spin & Solve: a word-puzzle game on a prize wheel. Players take turns to spin, guess a consonant
// for cash, buy a vowel, or solve the puzzle. Pure state machine used by the Worker and the tests.
import { parseRows, cleanText, lettersOnly, randInt, shuffle } from "../common.js";

export const id = "wheel";
export const VOWELS = "AEIOU", VOWEL_COST = 250, SOLVE_MIN = 500;
export const SPIN_MS = 4500, NEXT_MS = 12000;
export const MAX_PUZZLES = 40, MAX_ROUNDS = 10, MAX_PUZZLE_LEN = 60;

// 24 wheel segments: a dollar amount per letter, BANKRUPT (lose this round's cash and the turn) or LOSE A TURN.
export const SEGMENTS = [
  600, 500, 700, "BANKRUPT", 800, 550, 900, 650, "LOSE A TURN", 750, 500, 1000,
  700, "BANKRUPT", 850, 600, 1500, 650, 500, "LOSE A TURN", 800, 550, 900, 700
];

// ---- content ----
export function cleanPuzzle(s) {
  const t = String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[‘’]/g, "'").replace(/[^A-Z0-9 '&!?,.:\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_PUZZLE_LEN).trim();
  return (t.match(/[A-Z]/g) || []).length >= 3 ? t : "";
}

// Rows of Category, Puzzle (a header row is fine; with a single column the category is "Puzzle").
export function parsePuzzlesCsv(text) {
  const rows = parseRows(text);
  if (rows.length && /^categor/i.test(rows[0][0] || "")) rows.shift();
  const puzzles = [], skipped = [], seen = new Set();
  for (const r of rows) {
    const two = r.length > 1 && r[1];
    const category = two ? cleanText(r[0], 30) || "Puzzle" : "Puzzle", raw = two ? r[1] : r[0];
    const text = cleanPuzzle(raw);
    if (!text) { skipped.push(`${cleanText(raw, 30)} (needs at least 3 letters)`); continue; }
    if (seen.has(text)) continue;
    seen.add(text); puzzles.push({ category, text });
  }
  return { puzzles: puzzles.slice(0, MAX_PUZZLES), skipped };
}

const num = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

export function validateConfig(raw) {
  raw = raw || {};
  const puzzles = [], seen = new Set();
  for (const p of (Array.isArray(raw.puzzles) ? raw.puzzles : []).slice(0, MAX_PUZZLES)) {
    const text = cleanPuzzle(p && p.text);
    if (!text || seen.has(text)) continue;
    seen.add(text); puzzles.push({ category: cleanText(p.category, 30) || "Puzzle", text });
  }
  if (!puzzles.length) return { ok: false, error: "Add at least one puzzle with 3 or more letters" };
  return {
    ok: true,
    config: {
      title: cleanText(raw.title, 60) || "Spin & Solve", puzzles,
      rounds: num(raw.rounds, 1, Math.min(MAX_ROUNDS, puzzles.length), Math.min(5, puzzles.length)),
      turnSecs: raw.turnSecs === 0 ? 0 : num(raw.turnSecs, 10, 120, 30),
      shuffle: raw.shuffle !== false
    }
  };
}

// ---- helpers ----
const ids = ctx => Object.keys(ctx.players);
const nameOf = (ctx, sid) => (ctx.players[sid] ? ctx.players[sid].name : "Someone");
const money = n => "$" + n.toLocaleString("en-US");
const puzzle = g => g.puzzles[g.round];
const lettersIn = g => [...new Set(puzzle(g).text.match(/[A-Z]/g))];
const complete = g => lettersIn(g).every(l => g.called.includes(l));

function armTurn(g, ctx) { g.deadline = g.cfg.turnSecs ? ctx.now + g.cfg.turnSecs * 1000 : null; }

function startRound(g, ctx) {
  const l = ids(ctx);
  g.called = []; g.roundCash = {}; g.winner = null; g.spin = null; g.spinValue = 0; g.nextAt = null; g.idle = 0;
  g.turn = l.length ? l[g.round % l.length] : null;
  g.stage = "spin"; armTurn(g, ctx);
}
function nextTurn(g, ctx) {
  const l = ids(ctx);
  if (!l.length) { g.turn = null; return; }
  g.turn = l[(l.indexOf(g.turn) + 1) % l.length];
  g.stage = "spin"; g.spin = null; armTurn(g, ctx);
}
function ensureTurn(g, ctx) {
  if (!g.started || g.done || g.stage === "revealed") return;
  const l = ids(ctx);
  if (!l.length) { g.turn = null; return; }
  if (!g.turn || !ctx.players[g.turn]) { g.turn = l[g.round % l.length]; g.stage = "spin"; g.spin = null; armTurn(g, ctx); }
}
function endRound(g, ctx, sid) {
  g.stage = "revealed"; g.deadline = null; g.spin = null; g.nextAt = ctx.now + NEXT_MS;
  if (sid) {
    const bank = Math.max(g.roundCash[sid] || 0, SOLVE_MIN);
    g.scores[sid] = (g.scores[sid] || 0) + bank;
    g.winner = { sid, bank };
    g.msg = `${nameOf(ctx, sid)} solved it and banks ${money(bank)}!`;
  } else g.msg = "Nobody solved this one.";
}
function advance(g, ctx) {
  g.round++;
  if (g.round >= g.puzzles.length) { g.done = true; g.stage = "revealed"; g.nextAt = null; return; }
  startRound(g, ctx);
}
// A player picks a letter. cost is what a vowel charges; consonants pay out per letter found.
function guessLetter(g, ctx, sid, ch, vowel) {
  g.called.push(ch); g.idle = 0;
  const n = (puzzle(g).text.match(new RegExp(ch, "g")) || []).length, who = nameOf(ctx, sid);
  if (!n) { g.msg = `${who}: no ${ch}.`; nextTurn(g, ctx); return; }
  if (!vowel) g.roundCash[sid] = (g.roundCash[sid] || 0) + n * g.spinValue;
  g.msg = vowel ? `${who} bought ${ch}: ${n} found.` : `${who}: ${n} × ${ch} = ${money(n * g.spinValue)}`;
  if (complete(g)) return endRound(g, ctx, sid);
  g.stage = "spin"; g.spin = null; armTurn(g, ctx);
}
function resolveSpin(g, ctx) {
  const seg = SEGMENTS[g.spin.idx], who = nameOf(ctx, g.turn);
  if (typeof seg === "number") { g.spinValue = seg; g.stage = "guess"; armTurn(g, ctx); g.msg = `${who} spun ${money(seg)}. Pick a consonant.`; }
  else if (seg === "BANKRUPT") { g.roundCash[g.turn] = 0; g.msg = `${who} went BANKRUPT!`; nextTurn(g, ctx); }
  else { g.msg = `${who} loses a turn.`; nextTurn(g, ctx); }
}

// ---- state ----
export function create(cfg, ctx) {
  const rand = ctx.rand || randInt;
  const list = cfg.shuffle ? shuffle(cfg.puzzles, rand) : cfg.puzzles.slice();
  return {
    cfg, puzzles: list.slice(0, cfg.rounds), round: 0, called: [], roundCash: {}, scores: {}, turn: null, stage: "spin", spin: null,
    spinValue: 0, deadline: null, nextAt: null, winner: null, idle: 0, msg: "", done: false, started: false
  };
}

export function onStart(g, ctx) { g.started = true; startRound(g, ctx); }

export function nextDeadline(g) {
  if (g.stage === "spinning" && g.spin) return g.spin.until;
  if (g.stage === "revealed") return g.nextAt;
  return g.deadline;
}

export function tick(g, ctx) {
  if (!g.started || g.done) return false;
  const before = g.turn;
  ensureTurn(g, ctx);
  let changed = g.turn !== before;
  if (g.stage === "revealed") {
    if (g.nextAt && ctx.now >= g.nextAt) { advance(g, ctx); return true; }
    return changed;
  }
  if (g.stage === "spinning" && ctx.now >= g.spin.until) { resolveSpin(g, ctx); return true; }
  if ((g.stage === "spin" || g.stage === "guess") && g.deadline && ctx.now >= g.deadline) {
    g.msg = `${nameOf(ctx, g.turn)} ran out of time.`;
    g.idle++;
    if (g.idle >= Math.max(3, ids(ctx).length * 2)) endRound(g, ctx, null); else nextTurn(g, ctx);
    return true;
  }
  return changed;
}

export function onHost(g, msg, ctx) {
  if (!g.started) return;
  ensureTurn(g, ctx);
  switch (msg.a) {
    case "next": if (g.stage === "revealed" && !g.done) advance(g, ctx); break;
    case "skipTurn": if (g.stage === "spin" || g.stage === "guess") { g.msg = `${nameOf(ctx, g.turn)}'s turn was skipped.`; nextTurn(g, ctx); } break;
    case "reveal": if (g.stage !== "revealed" && !g.done) endRound(g, ctx, null); break;
    case "end": g.done = true; break;
  }
}

export function onPlayer(g, sid, msg, ctx) {
  if (!g.started || g.done) return;
  ensureTurn(g, ctx);
  if (sid !== g.turn) return;
  const rand = ctx.rand || randInt;
  const ch = typeof msg.ch === "string" ? msg.ch.toUpperCase() : "";
  switch (msg.a) {
    case "spin":
      if (g.stage !== "spin") return;
      g.spin = { idx: rand(SEGMENTS.length), at: ctx.now, until: ctx.now + SPIN_MS };
      g.stage = "spinning"; g.deadline = null; g.idle = 0;
      break;
    case "consonant":
      if (g.stage !== "guess" || !/^[B-DF-HJ-NP-TV-Z]$/.test(ch) || g.called.includes(ch)) return;
      guessLetter(g, ctx, sid, ch, false);
      break;
    case "vowel":
      if (g.stage !== "spin" || !/^[AEIOU]$/.test(ch) || g.called.includes(ch)) return;
      if ((g.roundCash[sid] || 0) < VOWEL_COST) return ctx.notify(sid, { text: `A vowel costs ${money(VOWEL_COST)}. Spin to earn some cash first.` });
      g.roundCash[sid] -= VOWEL_COST;
      guessLetter(g, ctx, sid, ch, true);
      break;
    case "solve": {
      if (g.stage !== "spin" && g.stage !== "guess") return;
      g.idle = 0;
      if (lettersOnly(msg.text) && lettersOnly(msg.text) === lettersOnly(puzzle(g).text)) endRound(g, ctx, sid);
      else { g.msg = `${nameOf(ctx, sid)} guessed wrong.`; nextTurn(g, ctx); }
      break;
    }
  }
}

export function view(g) {
  const p = g.puzzles[Math.min(g.round, g.puzzles.length - 1)];
  const revealed = g.stage === "revealed";
  return {
    title: g.cfg.title, round: Math.min(g.round + 1, g.puzzles.length), rounds: g.puzzles.length, category: p.category,
    shown: revealed ? p.text : p.text.replace(/[A-Z]/g, c => (g.called.includes(c) ? c : "_")),
    called: [...g.called].sort().join(""), segments: SEGMENTS, stage: g.stage, turn: g.turn, deadline: g.deadline,
    spin: g.spin, spinValue: g.stage === "guess" ? g.spinValue : 0, roundCash: g.roundCash, msg: g.msg, winner: g.winner,
    answer: revealed ? p.text : undefined, nextAt: g.nextAt, vowelCost: VOWEL_COST, solveMin: SOLVE_MIN, done: g.done, started: g.started
  };
}
