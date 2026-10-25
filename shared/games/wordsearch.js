// Word Search: everyone hunts the same hidden words; the first player to circle a word claims it.
// Pure state machine used by the Worker and the tests.
import { parseRows, lettersOnly, cleanText, seeded } from "../common.js";

export const id = "wordsearch";
export const MIN_LEN = 3, MAX_LEN = 18, MAX_WORDS = 40, MAX_SIZE = 26;

const DIRS = {
  easy: [[0, 1], [1, 0]],
  medium: [[0, 1], [1, 0], [1, 1], [-1, 1]],
  hard: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]
};

// ---- content ----

// A list of words, one per row (first column; a header row is fine). Spaces and hyphens are dropped.
export function parseWordsCsv(text) {
  const rows = parseRows(text);
  if (rows.length && /^(words?|terms?|list)$/i.test(rows[0][0] || "")) rows.shift();
  const seen = new Set(), words = [], skipped = [];
  for (const r of rows) {
    const label = cleanText(r[0], 40), w = lettersOnly(label);
    if (!label) continue;
    if (w.length < MIN_LEN || w.length > MAX_LEN) { skipped.push(`${label} (needs ${MIN_LEN}-${MAX_LEN} letters)`); continue; }
    if (seen.has(w)) continue;
    seen.add(w); words.push({ word: w, label });
  }
  return { words: words.slice(0, MAX_WORDS), skipped };
}

// ---- grid generator ----
const autoSize = words => {
  const total = words.reduce((s, w) => s + w.word.length, 0), longest = Math.max(...words.map(w => w.word.length));
  return Math.min(MAX_SIZE, Math.max(10, longest + 1, Math.ceil(Math.sqrt(total * 2.6))));
};

function tryBuild(words, size, dirs, rand) {
  const grid = Array(size * size).fill("");
  const placed = [];
  for (const w of words.slice().sort((a, b) => b.word.length - a.word.length)) {
    let best = null, bestScore = -1;
    for (let k = 0; k < 60; k++) {
      const [dr, dc] = dirs[rand(dirs.length)], n = w.word.length;
      const r0 = dr === 0 ? rand(size) : dr > 0 ? rand(size - n + 1) : n - 1 + rand(size - n + 1);
      const c0 = dc === 0 ? rand(size) : dc > 0 ? rand(size - n + 1) : n - 1 + rand(size - n + 1);
      let ok = true, overlap = 0;
      const cells = [];
      for (let i = 0; i < n && ok; i++) {
        const idx = (r0 + dr * i) * size + (c0 + dc * i);
        if (grid[idx] && grid[idx] !== w.word[i]) ok = false;
        else { if (grid[idx]) overlap++; cells.push(idx); }
      }
      if (!ok) continue;
      if (overlap > bestScore) { best = cells; bestScore = overlap; }
      if (k > 12 && best) break;
    }
    if (!best) return null;
    best.forEach((idx, i) => { grid[idx] = w.word[i]; });
    placed.push({ word: w.word, label: w.label, cells: best });
  }
  return { grid, placed };
}

// words: [{word, label}] (word is letters only). level: easy | medium | hard.
export function generate(words, { level = "medium", size = 0, seed = 1 } = {}) {
  words = words.filter(w => w.word.length >= MIN_LEN && w.word.length <= MAX_LEN).slice(0, MAX_WORDS);
  if (!words.length) return null;
  const dirs = DIRS[level] || DIRS.medium, rand = seeded(seed);
  const longest = Math.max(...words.map(w => w.word.length));
  let n = Math.min(MAX_SIZE, Math.max(size || autoSize(words), longest));
  for (; n <= MAX_SIZE; n++) {
    let built = null;
    for (let t = 0; t < 8 && !built; t++) built = tryBuild(words, n, dirs, rand);
    if (!built) continue;
    const pool = built.placed.map(p => p.word).join("") + "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const grid = built.grid.map(ch => ch || pool[rand(pool.length)]);
    const order = new Map(words.map((w, i) => [w.word, i]));
    return { size: n, grid: grid.join(""), words: built.placed.sort((a, b) => order.get(a.word) - order.get(b.word)) };
  }
  return null;
}

// ---- validation ----
export function validateConfig(raw) {
  raw = raw || {};
  const p = raw.puzzle;
  if (!p || !Number.isInteger(p.size) || p.size < 5 || p.size > MAX_SIZE || typeof p.grid !== "string" || p.grid.length !== p.size * p.size
    || !/^[A-Z]+$/.test(p.grid) || !Array.isArray(p.words) || !p.words.length || p.words.length > MAX_WORDS)
    return { ok: false, error: "That puzzle isn't valid. Build it again." };
  const words = [];
  for (const w of p.words) {
    const word = String(w.word || ""), label = cleanText(w.label, 40) || word;
    const cells = Array.isArray(w.cells) ? w.cells : [];
    if (!/^[A-Z]+$/.test(word) || cells.length !== word.length || cells.some((c, i) => !Number.isInteger(c) || c < 0 || c >= p.grid.length || p.grid[c] !== word[i]))
      return { ok: false, error: "That puzzle isn't valid. Build it again." };
    words.push({ word, label, cells });
  }
  return {
    ok: true,
    config: {
      title: cleanText(raw.title, 60) || "Word Search", showWords: raw.showWords !== false,
      minutes: Math.min(120, Math.max(0, Math.round(Number(raw.minutes)) || 0)),
      puzzle: { size: p.size, grid: p.grid, words }
    }
  };
}

// ---- state ----
export function create(cfg) { return { cfg, found: {}, scores: {}, deadline: null, done: false, started: false }; }

export function onStart(g, ctx) {
  g.started = true;
  g.deadline = g.cfg.minutes ? ctx.now + g.cfg.minutes * 60000 : null;
}
export function nextDeadline(g) { return g.deadline; }
export function tick(g, ctx) {
  if (g.deadline && !g.done && ctx.now >= g.deadline) { g.done = true; return true; }
  return false;
}

// The squares on the straight line from one square to another, or null if it isn't straight.
export function lineCells(size, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= size * size || to >= size * size) return null;
  const r1 = Math.floor(from / size), c1 = from % size, r2 = Math.floor(to / size), c2 = to % size;
  const dr = r2 - r1, dc = c2 - c1;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const n = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  if (n < 2) return null;
  const sr = Math.sign(dr), sc = Math.sign(dc);
  return Array.from({ length: n }, (_, i) => (r1 + sr * i) * size + c1 + sc * i);
}

export function onHost(g, msg) { if (msg.a === "end") g.done = true; }

export function onPlayer(g, sid, msg, ctx) {
  if (!g.started || g.done || msg.a !== "select") return;
  const p = g.cfg.puzzle, cells = lineCells(p.size, msg.from, msg.to);
  if (!cells) return ctx.notify(sid, { text: "Drag in a straight line" });
  const text = cells.map(i => p.grid[i]).join(""), rev = [...text].reverse().join("");
  const hit = p.words.find(w => !g.found[w.word] && (w.word === text || w.word === rev));
  if (!hit) {
    const again = p.words.find(w => g.found[w.word] && (w.word === text || w.word === rev));
    return ctx.notify(sid, { text: again ? `${again.label} was already found` : "No word there" });
  }
  g.found[hit.word] = { sid, cells, at: ctx.now };
  g.scores[sid] = (g.scores[sid] || 0) + hit.word.length;
  ctx.notify(null, { text: `${ctx.players[sid] ? ctx.players[sid].name : "Someone"} found ${hit.label}!` });
  if (p.words.every(w => g.found[w.word])) g.done = true;
}

export function view(g) {
  const p = g.cfg.puzzle, showWords = g.cfg.showWords;
  const found = p.words.filter(w => g.found[w.word]).map(w => ({ word: w.word, label: w.label, sid: g.found[w.word].sid, cells: g.found[w.word].cells }));
  const v = {
    title: g.cfg.title, size: p.size, grid: p.grid, deadline: g.deadline, done: g.done, started: g.started, showWords,
    total: p.words.length, found,
    words: p.words.map(w => ({ label: showWords || g.found[w.word] ? w.label : "", len: w.word.length, found: !!g.found[w.word] }))
  };
  if (g.done) v.missed = p.words.filter(w => !g.found[w.word]).map(w => ({ label: w.label, cells: w.cells }));
  return v;
}
