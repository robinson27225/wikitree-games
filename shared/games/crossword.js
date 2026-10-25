// Crossword: a puzzle built from answer/clue pairs that everyone fills in together.
// Squares are scored for whoever typed the letter that ended up in a finished word.
// Pure state machine used by the Worker and the tests.
import { parseRows, cleanText, lettersOnly, seeded, randInt } from "../common.js";

export const id = "crossword";
export const MIN_LEN = 3, MAX_LEN = 15, MAX_ENTRIES = 60, MAX_DIM = 40;
const CANVAS = 2 * MAX_LEN + 3;

// ---- content ----

// Rows of Answer, Clue (a header row is fine). Returns the cleaned entries and what was skipped.
export function parseEntriesCsv(text) {
  const rows = parseRows(text);
  if (rows.length && /^(answer|word)s?$/i.test(rows[0][0] || "")) rows.shift();
  const seen = new Set(), entries = [], skipped = [];
  for (const r of rows) {
    const answer = lettersOnly(r[0] || ""), clue = cleanText(r[1], 200);
    if (!r[0]) continue;
    if (answer.length < MIN_LEN || answer.length > MAX_LEN) { skipped.push(`${r[0]} (needs ${MIN_LEN}-${MAX_LEN} letters)`); continue; }
    if (!clue) { skipped.push(`${r[0]} (no clue)`); continue; }
    if (seen.has(answer)) continue;
    seen.add(answer); entries.push({ answer, clue });
  }
  return { entries: entries.slice(0, MAX_ENTRIES), skipped };
}

// ---- layout generator ----
// Greedy: put the longest word down, then keep crossing the remaining words onto letters already
// placed, many times over with different orders, and keep the layout that uses the most words.
// The placement rules guarantee every run of two or more letters in the grid is one of the words.
function attempt(words, rand) {
  const S = CANVAS, grid = Array.from({ length: S }, () => Array(S).fill(""));
  const across = Array.from({ length: S }, () => Array(S).fill(false));
  const down = Array.from({ length: S }, () => Array(S).fill(false));
  const placed = [];
  const has = (r, c) => r >= 0 && c >= 0 && r < S && c < S && grid[r][c] !== "";

  function crossings(w, r, c, horiz) {
    const dr = horiz ? 0 : 1, dc = horiz ? 1 : 0, n = w.length;
    const er = r + dr * (n - 1), ec = c + dc * (n - 1);
    if (r < 0 || c < 0 || er >= S || ec >= S) return -1;
    if (has(r - dr, c - dc) || has(er + dr, ec + dc)) return -1;
    let cross = 0;
    for (let i = 0; i < n; i++) {
      const rr = r + dr * i, cc = c + dc * i, cur = grid[rr][cc];
      if (cur) {
        if (cur !== w[i] || (horiz ? across : down)[rr][cc]) return -1;
        cross++;
      } else if (horiz ? (has(rr - 1, cc) || has(rr + 1, cc)) : (has(rr, cc - 1) || has(rr, cc + 1))) return -1;
    }
    return cross;
  }
  function put(e, r, c, horiz) {
    const dr = horiz ? 0 : 1, dc = horiz ? 1 : 0;
    for (let i = 0; i < e.answer.length; i++) {
      const rr = r + dr * i, cc = c + dc * i;
      grid[rr][cc] = e.answer[i]; (horiz ? across : down)[rr][cc] = true;
    }
    placed.push({ ...e, r, c, horiz });
  }

  const bounds = () => ({
    minR: Math.min(...placed.map(p => p.r)), minC: Math.min(...placed.map(p => p.c)),
    maxR: Math.max(...placed.map(p => (p.horiz ? p.r : p.r + p.answer.length - 1))), maxC: Math.max(...placed.map(p => (p.horiz ? p.c + p.answer.length - 1 : p.c)))
  });

  const order = words.slice().sort((a, b) => b.answer.length - a.answer.length + (rand(5) - 2));
  const first = order.shift();
  put(first, Math.floor(S / 2), Math.floor((S - first.answer.length) / 2), true);

  let left = order, progress = true;
  while (left.length && progress) {
    progress = false;
    const next = [];
    for (const e of left) {
      const w = e.answer, cands = [];
      let best = -1e9;
      const box = bounds();
      for (const p of placed) {
        for (let i = 0; i < p.answer.length; i++) {
          const pr = p.horiz ? p.r : p.r + i, pc = p.horiz ? p.c + i : p.c;
          for (let j = 0; j < w.length; j++) {
            if (w[j] !== grid[pr][pc]) continue;
            const horiz = !p.horiz, r = horiz ? pr : pr - j, c = horiz ? pc - j : pc;
            const x = crossings(w, r, c, horiz);
            if (x < 1) continue;
            const er = horiz ? r : r + w.length - 1, ec = horiz ? c + w.length - 1 : c;
            const h = Math.max(box.maxR, er) - Math.min(box.minR, r) + 1, wd = Math.max(box.maxC, ec) - Math.min(box.minC, c) + 1;
            const score = x * 3 - Math.max(h, wd) * 2 - Math.min(h, wd);     // more crossings, then a smaller, squarer grid
            if (score > best) { best = score; cands.length = 0; }
            if (score === best) cands.push([r, c, horiz]);
          }
        }
      }
      if (!cands.length) { next.push(e); continue; }
      const [r, c, horiz] = cands[rand(cands.length)];
      put(e, r, c, horiz); progress = true;
    }
    left = next;
  }
  return { placed, unplaced: left };
}

function finish(placed, unplaced) {
  const minR = Math.min(...placed.map(p => p.r)), minC = Math.min(...placed.map(p => p.c));
  const maxR = Math.max(...placed.map(p => p.horiz ? p.r : p.r + p.answer.length - 1));
  const maxC = Math.max(...placed.map(p => p.horiz ? p.c + p.answer.length - 1 : p.c));
  const rows = maxR - minR + 1, cols = maxC - minC + 1;
  const cells = Array(rows * cols).fill(".");
  for (const p of placed) for (let i = 0; i < p.answer.length; i++) {
    const r = p.r - minR + (p.horiz ? 0 : i), c = p.c - minC + (p.horiz ? i : 0);
    cells[r * cols + c] = p.answer[i];
  }
  const filled = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && cells[r * cols + c] !== ".";
  const numberAt = new Map();
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!filled(r, c)) continue;
    if ((!filled(r, c - 1) && filled(r, c + 1)) || (!filled(r - 1, c) && filled(r + 1, c))) numberAt.set(r * cols + c, ++n);
  }
  const entries = placed.map(p => {
    const r = p.r - minR, c = p.c - minC;
    return { n: numberAt.get(r * cols + c), dir: p.horiz ? "A" : "D", r, c, len: p.answer.length, answer: p.answer, clue: p.clue };
  }).sort((a, b) => (a.dir === b.dir ? a.n - b.n : a.dir < b.dir ? -1 : 1));
  return { rows, cols, cells: cells.join(""), entries, unplaced: unplaced.map(u => ({ answer: u.answer, clue: u.clue })) };
}

// entries: [{answer, clue}] (answers already letters only). Different seeds give different layouts.
export function generate(entries, { seed = 1, tries = 200 } = {}) {
  const words = entries.filter(e => e.answer.length >= MIN_LEN && e.answer.length <= MAX_LEN).slice(0, MAX_ENTRIES);
  if (words.length < 2) return null;
  const rand = seeded(seed);
  let best = null;
  for (let t = 0; t < tries; t++) {
    const r = attempt(words, rand);
    const rs = r.placed.map(p => p.r), cs = r.placed.map(p => p.c);
    const h = Math.max(...r.placed.map(p => (p.horiz ? p.r + 1 : p.r + p.answer.length))) - Math.min(...rs);
    const w = Math.max(...r.placed.map(p => (p.horiz ? p.c + p.answer.length : p.c + 1))) - Math.min(...cs);
    const size = Math.max(h, w) * 10 + Math.min(h, w);               // a small, squarish grid reads best on a phone
    if (!best || r.placed.length > best.r.placed.length || (r.placed.length === best.r.placed.length && size < best.size)) best = { r, size };
  }
  return finish(best.r.placed, best.r.unplaced);
}

// ---- validation ----
function entryCells(p, e) {
  const out = [];
  for (let i = 0; i < e.len; i++) out.push((e.r + (e.dir === "D" ? i : 0)) * p.cols + e.c + (e.dir === "A" ? i : 0));
  return out;
}

export function validateConfig(raw) {
  raw = raw || {};
  const p = raw.puzzle;
  if (!p || !Number.isInteger(p.rows) || !Number.isInteger(p.cols) || p.rows < 2 || p.cols < 2 || p.rows > MAX_DIM || p.cols > MAX_DIM
    || typeof p.cells !== "string" || p.cells.length !== p.rows * p.cols || !/^[A-Z.]+$/.test(p.cells) || !Array.isArray(p.entries))
    return { ok: false, error: "That puzzle isn't valid. Build it again." };
  if (p.entries.length < 2 || p.entries.length > MAX_ENTRIES) return { ok: false, error: "A crossword needs between 2 and " + MAX_ENTRIES + " words" };
  const entries = [];
  for (const e of p.entries) {
    const ent = { n: e.n | 0, dir: e.dir === "D" ? "D" : "A", r: e.r | 0, c: e.c | 0, len: e.len | 0, answer: String(e.answer || ""), clue: cleanText(e.clue, 200) };
    if (!/^[A-Z]+$/.test(ent.answer) || ent.answer.length !== ent.len || !ent.clue || ent.r < 0 || ent.c < 0) return { ok: false, error: "That puzzle isn't valid. Build it again." };
    const cells = entryCells(p, ent);
    if (ent.r + (ent.dir === "D" ? ent.len : 1) > p.rows || ent.c + (ent.dir === "A" ? ent.len : 1) > p.cols
      || cells.some((ci, i) => p.cells[ci] !== ent.answer[i])) return { ok: false, error: "That puzzle isn't valid. Build it again." };
    entries.push(ent);
  }
  return {
    ok: true,
    config: {
      title: cleanText(raw.title, 60) || "Crossword", minutes: Math.min(120, Math.max(0, Math.round(Number(raw.minutes)) || 0)),
      puzzle: { rows: p.rows, cols: p.cols, cells: p.cells, entries }
    }
  };
}

// ---- state ----
export function create(cfg) {
  const p = cfg.puzzle, n = p.rows * p.cols;
  return {
    cfg, grid: Array(n).fill(""), owner: Array(n).fill(""), locked: Array(n).fill(false), credited: {},
    solved: {}, scores: {}, deadline: null, done: false, started: false, notes: []
  };
}

export function onStart(g, ctx) {
  g.started = true;
  g.deadline = g.cfg.minutes ? ctx.now + g.cfg.minutes * 60000 : null;
}
export function nextDeadline(g) { return g.deadline; }
export function tick(g, ctx) {
  if (g.deadline && !g.done && ctx.now >= g.deadline) { g.done = true; return true; }
  return false;
}

function checkEntries(g, sid, cell, ctx) {
  const p = g.cfg.puzzle;
  p.entries.forEach((e, idx) => {
    if (g.solved[idx]) return;
    const cells = entryCells(p, e);
    if (!cells.includes(cell)) return;
    if (cells.some(ci => !g.grid[ci])) return;
    if (cells.some((ci, i) => g.grid[ci] !== e.answer[i])) { ctx.notify(sid, { text: `${e.n} ${e.dir === "A" ? "across" : "down"} is full but not right yet` }); return; }
    g.solved[idx] = sid;
    for (const ci of cells) {
      g.locked[ci] = true;
      if (!g.credited[ci]) { g.credited[ci] = true; if (g.owner[ci]) g.scores[g.owner[ci]] = (g.scores[g.owner[ci]] || 0) + 1; }
    }
    g.scores[sid] = (g.scores[sid] || 0) + 3;
    ctx.notify(null, { text: `${ctx.players[sid] ? ctx.players[sid].name : "Someone"} solved ${e.n} ${e.dir === "A" ? "across" : "down"}!` });
  });
  if (Object.keys(g.solved).length === p.entries.length) g.done = true;
}

export function onHost(g, msg) {
  if (msg.a === "end") g.done = true;
}

export function onPlayer(g, sid, msg, ctx) {
  if (!g.started || g.done || msg.a !== "put") return;
  const p = g.cfg.puzzle, i = msg.i;
  if (!Number.isInteger(i) || i < 0 || i >= g.grid.length || p.cells[i] === "." || g.locked[i]) return;
  const ch = typeof msg.ch === "string" ? msg.ch.toUpperCase() : "";
  if (ch && !/^[A-Z]$/.test(ch)) return;
  g.grid[i] = ch; g.owner[i] = ch ? sid : "";
  if (ch) checkEntries(g, sid, i, ctx);
}

export function view(g, role) {
  const p = g.cfg.puzzle;
  const numbers = {};
  p.entries.forEach(e => { numbers[e.r * p.cols + e.c] = e.n; });
  const v = {
    title: g.cfg.title, rows: p.rows, cols: p.cols, deadline: g.deadline, done: g.done, started: g.started,
    blocks: p.cells.replace(/[A-Z]/g, "0").replace(/\./g, "1"),     // "1" is a black square
    numbers,
    entries: p.entries.map((e, idx) => ({ n: e.n, dir: e.dir, r: e.r, c: e.c, len: e.len, clue: e.clue, solved: g.solved[idx] || "" })),
    grid: g.grid.map(x => x || " ").join(""), owners: g.owner, locked: g.locked.map(x => (x ? 1 : 0)).join("")
  };
  if (g.done) v.solution = p.cells;
  return v;
}
