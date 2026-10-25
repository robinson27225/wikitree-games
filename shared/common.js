// Helpers shared by the browser pages, the Worker and the tests. No DOM or Worker APIs beyond
// crypto.getRandomValues, so it also runs under node:test.

export const MAX_PLAYERS = 200;

// Uniform integer in [0, n) from crypto randomness (rejection sampling, no modulo bias).
export function randInt(n, getRandomValues = c => crypto.getRandomValues(c)) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do { getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}

export function shuffle(arr, rand = randInt) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Seeded generator (mulberry32) so tests and "regenerate" are repeatable.
export function seeded(seed) {
  let s = seed >>> 0;
  return n => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

// "Robinson-27225", "O'Brien-12", "Smith_Jones-3" style WikiTree IDs.
export const isWikiTreeId = s => /^[A-Za-zÀ-ÿ'’.\-_ ]*[A-Za-zÀ-ÿ]-[1-9]\d*$/.test(String(s).trim());
export const cleanName = s => String(s).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
export const profileUrl = id => "https://www.wikitree.com/wiki/" + encodeURIComponent(String(id).trim().replace(/ /g, "_"));

// Lower-case, accent-free, punctuation-free form used to compare typed answers and words.
export function normText(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
// Letters only, upper case: how crossword and word-search answers are stored.
export const lettersOnly = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

// Remove control characters and angle brackets, collapse spaces, cap the length.
export const cleanText = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Parse CSV text into rows of cells. Handles quoted fields with commas, newlines and "" escapes.
// A tab-separated paste (spreadsheet copy) works too.
export function parseRows(text) {
  const s = String(text).replace(/^﻿/, "");
  const delim = (s.split("\n", 1)[0].includes("\t") && !s.split("\n", 1)[0].includes(",")) ? "\t" : ",";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = ""; rows.push(row); row = [];
    } else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

// Seconds left until a server-time deadline, never negative.
export const secsLeft = (deadline, now) => Math.max(0, Math.ceil((deadline - now) / 1000));

// Distinct, readable player colours (also used to tint crossword squares and found words).
export const PLAYER_COLORS = [
  "#f37c26", "#2f9e44", "#1c7ed6", "#c2255c", "#7048e8", "#e8a200", "#0c8599", "#d9480f",
  "#5c940d", "#a61e4d", "#364fc7", "#087f5b", "#9c36b5", "#b35900", "#1864ab", "#6f8f1a"
];
