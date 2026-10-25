// Word Search: host setup (builds the puzzle), the shared-screen host view, and the phone view.
import { h, clear, nameOf, colorOf, sourceBox, field, select, checkbox, toast } from "./common.js";
import { parseWordsCsv, generate } from "../shared/games/wordsearch.js";
import { WORDSEARCH_PACKS, WORDSEARCH_TEMPLATE } from "../shared/packs.js";

export const info = {
  id: "wordsearch", title: "Word Search", icon: "W",
  blurb: "Everyone hunts the same hidden genealogy words. Circle a word first and it's yours."
};

function buildGrid(size, letters, onStart) {
  const wrap = h("div", { class: "ws-wrap", style: { "--n": size } });
  const grid = h("div", { class: "ws-grid" });
  const cells = [];
  for (let i = 0; i < size * size; i++) {
    const c = h("div", { class: "ws-cell", "data-i": i }, h("span", {}, letters[i]));
    grid.append(c); cells.push(c);
  }
  wrap.append(grid);
  return { wrap, grid, cells };
}

function paintFound(g, v, snap) {
  g.cells.forEach(c => { c.classList.remove("found", "missed"); c.style.removeProperty("--c"); });
  for (const f of v.missed || []) for (const i of f.cells) g.cells[i].classList.add("missed");
  for (const f of v.found) for (const i of f.cells) { g.cells[i].classList.add("found"); g.cells[i].style.setProperty("--c", colorOf(snap, f.sid)); }
}

function wordList(snap) {
  const v = snap.v, byLabel = new Map(v.found.map(f => [f.label, f]));
  const box = h("div", { class: "ws-words" });
  if (v.showWords) {
    v.words.forEach(w => {
      const f = byLabel.get(w.label);
      box.append(h("span", { class: "ws-word" + (w.found ? " found" : ""), style: f ? { "--c": colorOf(snap, f.sid) } : {}, title: f ? "Found by " + nameOf(snap, f.sid) : "" }, w.label));
    });
  } else {
    box.append(h("div", { class: "hint" }, `${v.total - v.found.length} of ${v.total} words still hidden. No list this time!`));
    v.found.forEach(f => box.append(h("span", { class: "ws-word found", style: { "--c": colorOf(snap, f.sid) } }, f.label)));
  }
  return box;
}

/* ================= host setup ================= */
export function setup(root) {
  const title = h("input", { type: "text", maxlength: 60, placeholder: "Word Search" });
  const level = select([["easy", "Easy: across and down"], ["medium", "Medium: plus diagonals"], ["hard", "Hard: any direction, even backwards"]], "medium", () => build());
  const size = select([["0", "Automatic"], ["12", "12 by 12"], ["15", "15 by 15"], ["18", "18 by 18"], ["22", "22 by 22"]], "0", () => build());
  const minutes = select([["0", "No time limit"], ["5", "5 minutes"], ["10", "10 minutes"], ["15", "15 minutes"], ["20", "20 minutes"]], "0");
  const list = checkbox("Show the list of words to find", true);
  const info1 = h("div", { class: "count", role: "status" });
  const warn = h("div", { class: "hint" });
  const preview = h("div", { class: "ws-preview" });
  let seed = 1, puzzle = null, words = [];
  const shuffleBtn = h("button", { type: "button", class: "ghost", onclick: () => { seed++; build(); } }, "Shuffle the grid");
  const src = sourceBox({
    packs: WORDSEARCH_PACKS, template: WORDSEARCH_TEMPLATE, templateName: "word-search-template.csv", onChange: () => { seed = 1; build(); },
    placeholder: "One word or phrase per line.\nTry surnames from your own family tree!"
  });

  function build() {
    const parsed = parseWordsCsv(src.text());
    words = parsed.words;
    puzzle = words.length ? generate(words, { level: level.value, size: Number(size.value), seed }) : null;
    clear(preview);
    const notes = [];
    if (parsed.skipped.length) notes.push("Skipped: " + parsed.skipped.slice(0, 4).join("; ") + (parsed.skipped.length > 4 ? "…" : ""));
    warn.textContent = notes.join(" ");
    shuffleBtn.disabled = !puzzle;
    if (!puzzle) { info1.textContent = words.length ? "Those words don't fit. Try a bigger grid or fewer words." : ""; info1.classList.toggle("bad", !!words.length); return; }
    info1.classList.remove("bad");
    info1.textContent = `${puzzle.words.length} words hidden in a ${puzzle.size} by ${puzzle.size} grid`;
    const g = buildGrid(puzzle.size, puzzle.grid);
    for (const w of puzzle.words) for (const i of w.cells) g.cells[i].classList.add("preview");
    preview.append(g.wrap, h("p", { class: "hint" }, "The highlighted letters are the hidden words (players don't see this)."));
  }

  root.append(
    field("Game title", title), src.el,
    h("p", { class: "hint" }, "One word or phrase per line, 3 to 18 letters, up to 40 words. Spaces and hyphens are removed. Tip: paste the surnames from your own family tree."),
    info1, warn, h("div", { class: "btnrow" }, shuffleBtn), preview,
    h("div", { class: "optgrid" }, field("Difficulty", level), field("Grid size", size), field("Time limit", minutes)),
    list.el
  );
  build();
  return {
    getConfig() {
      if (!puzzle) return { error: "Add some words to hide in the grid." };
      return { config: { title: title.value.trim() || "Word Search", showWords: list.box.checked, minutes: Number(minutes.value), puzzle } };
    }
  };
}

/* ================= host (shared screen) ================= */
export function createHost(root) {
  let g = null, key = "";
  const wrapper = h("div", { class: "ws-stage" });
  const side = h("div", { class: "ws-side" });
  root.append(wrapper);
  return {
    update(snap) {
      const v = snap.v, k = v.size + v.grid + snap.gameNo;
      if (k !== key) {
        key = k; clear(wrapper); g = buildGrid(v.size, v.grid); clear(side);
        wrapper.append(h("div", { class: "ws-left" }, g.wrap), side);
      }
      paintFound(g, v, snap);
      clear(side);
      side.append(
        h("div", { class: "ws-progress" }, h("b", {}, v.found.length), ` / ${v.total} found`, v.deadline && snap.status === "playing" ? h("span", { class: "xw-time", "data-fmt": "clock", "data-deadline": v.deadline }) : null),
        wordList(snap));
    },
    scoreOptions() { return {}; }
  };
}

/* ================= player (phone) ================= */
export function createPlayer(root, { send }) {
  let g = null, key = "", v = null, snap = null, size = 0;
  let start = -1, pick = [], anchor = -1;
  const bar = h("div", { class: "ws-bar" });
  const gridBox = h("div", { class: "ws-gridbox" });
  const listBox = h("div", {});
  root.append(bar, gridBox, listBox);

  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); const c = el && el.closest && el.closest(".ws-cell"); return c ? Number(c.dataset.i) : -1; };

  // Snap the drag to the nearest of the eight directions, starting from the square first touched.
  function line(from, toPoint) {
    const r1 = Math.floor(from / size), c1 = from % size, r2 = Math.floor(toPoint / size), c2 = toPoint % size;
    const dr = r2 - r1, dc = c2 - c1;
    if (!dr && !dc) return [from];
    const step = Math.round(Math.atan2(dr, dc) / (Math.PI / 4)), sr = [0, 1, 1, 1, 0, -1, -1, -1][(step + 8) % 8], sc = [1, 1, 0, -1, -1, -1, 0, 1][(step + 8) % 8];
    const out = [];
    for (let k = 0, r = r1, c = c1; k < size && r >= 0 && c >= 0 && r < size && c < size; k++, r += sr, c += sc) {
      out.push(r * size + c);
      if (k >= Math.max(Math.abs(dr), Math.abs(dc))) break;
    }
    return out;
  }
  function showPick() {
    g.cells.forEach((c, i) => { c.classList.toggle("pick", pick.includes(i)); c.classList.toggle("anchor", i === anchor && pick.length <= 1); });
  }

  function attach() {
    const grid = g.grid;
    grid.addEventListener("pointerdown", e => {
      if (snap.status !== "playing") return;
      const i = cellAt(e.clientX, e.clientY); if (i < 0) return;
      e.preventDefault(); grid.setPointerCapture(e.pointerId);
      start = i; pick = [i]; showPick();
    });
    grid.addEventListener("pointermove", e => {
      if (start < 0) return;
      const i = cellAt(e.clientX, e.clientY); if (i < 0) return;
      pick = line(start, i); showPick();
    });
    const end = () => {
      if (start < 0) return;
      const from = pick[0], to = pick[pick.length - 1];
      if (pick.length > 1) { send({ a: "select", from, to }); anchor = -1; }
      else if (anchor >= 0 && anchor !== from) { send({ a: "select", from: anchor, to: from }); anchor = -1; }   // tap the first and last letter
      else anchor = from;
      start = -1; pick = []; showPick();
    };
    grid.addEventListener("pointerup", end);
    grid.addEventListener("pointercancel", () => { start = -1; pick = []; showPick(); });
  }

  return {
    update(s) {
      snap = s; v = s.v; size = v.size;
      const k = v.size + v.grid + s.gameNo;
      if (k !== key) { key = k; g = buildGrid(v.size, v.grid); clear(gridBox); gridBox.append(g.wrap); attach(); anchor = -1; }
      paintFound(g, v, s);
      clear(bar);
      bar.append(h("div", { class: "ws-progress" }, h("b", {}, v.found.length), ` / ${v.total} found`,
        v.deadline && s.status === "playing" ? h("span", { class: "xw-time", "data-fmt": "clock", "data-deadline": v.deadline }) : null),
        h("div", { class: "hint" }, s.status === "playing" ? "Drag across a word, or tap its first and last letters." : "Waiting for the host to start…"));
      clear(listBox); listBox.append(wordList(s));
    },
    note(text) { toast(text); }
  };
}
