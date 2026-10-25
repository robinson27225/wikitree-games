// Crossword: host setup (builds the puzzle), the shared-screen host view, and the phone view.
import { h, clear, nameOf, colorOf, sourceBox, field, select, toast } from "./common.js";
import { parseEntriesCsv, generate } from "../shared/games/crossword.js";
import { CROSSWORD_PACKS, CROSSWORD_TEMPLATE } from "../shared/packs.js";

export const info = {
  id: "crossword", title: "Crossword", icon: "A",
  blurb: "One puzzle, everyone fills it in together. Squares you fill correctly score for you; finishing a word earns a bonus."
};

/* ---------- the grid, shared by setup preview, host and player ---------- */
function buildGrid(rows, cols, blocks, numbers, onCell) {
  const wrap = h("div", { class: "xw-wrap", style: { "--rows": rows, "--cols": cols } });
  const grid = h("div", { class: "xw-grid" });
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    if (blocks[i] === "1") { grid.append(h("div", { class: "xw-block" })); cells.push(null); continue; }
    const cell = h("div", { class: "xw-cell", "data-i": i }, numbers[i] ? h("span", { class: "xw-n" }, numbers[i]) : null, h("span", { class: "xw-l" }));
    if (onCell) cell.addEventListener("click", () => onCell(i));
    grid.append(cell); cells.push(cell);
  }
  wrap.append(grid);
  return { wrap, cells };
}
const letterEl = cell => cell.querySelector(".xw-l");

/* ================= host setup ================= */
export function setup(root) {
  const title = h("input", { type: "text", maxlength: 60, placeholder: "Crossword" });
  const minutes = select([["0", "No time limit"], ["10", "10 minutes"], ["15", "15 minutes"], ["20", "20 minutes"], ["30", "30 minutes"], ["45", "45 minutes"]], "0");
  const info1 = h("div", { class: "count", role: "status" });
  const warn = h("div", { class: "hint" });
  const preview = h("div", { class: "xw-preview" });
  let seed = 1, puzzle = null, parsedCount = 0;
  const shuffleBtn = h("button", { type: "button", class: "ghost", onclick: () => { seed++; build(); } }, "Try a different layout");
  const src = sourceBox({
    packs: CROSSWORD_PACKS, template: CROSSWORD_TEMPLATE, templateName: "crossword-template.csv", onChange: () => { seed = 1; build(); },
    placeholder: "Answer,Clue\nANCESTOR,Person from whom you descend"
  });

  function build() {
    const { entries, skipped } = parseEntriesCsv(src.text());
    parsedCount = entries.length;
    puzzle = entries.length >= 2 ? generate(entries, { seed }) : null;
    clear(preview);
    const notes = [];
    if (skipped.length) notes.push("Skipped: " + skipped.slice(0, 4).join("; ") + (skipped.length > 4 ? "…" : ""));
    if (puzzle && puzzle.unplaced.length) notes.push("Couldn't fit: " + puzzle.unplaced.map(u => u.answer).join(", ") + ". Try a different layout.");
    warn.textContent = notes.join(" ");
    shuffleBtn.disabled = !puzzle;
    if (!puzzle) { info1.textContent = entries.length ? "Add at least 2 words with clues." : ""; info1.classList.toggle("bad", !!entries.length); return; }
    info1.classList.remove("bad");
    info1.textContent = `${puzzle.entries.length} of ${entries.length} words placed in a ${puzzle.cols} by ${puzzle.rows} grid`;
    const blocks = puzzle.cells.replace(/[A-Z]/g, "0").replace(/\./g, "1");
    const numbers = {};
    puzzle.entries.forEach(e => { numbers[e.r * puzzle.cols + e.c] = e.n; });
    const g = buildGrid(puzzle.rows, puzzle.cols, blocks, numbers);
    g.cells.forEach((c, i) => { if (c) letterEl(c).textContent = puzzle.cells[i]; });
    preview.append(g.wrap);
  }

  root.append(
    field("Game title", title), src.el,
    h("p", { class: "hint" }, "One row per word: Answer, Clue. Answers are 3 to 15 letters (spaces and hyphens are ignored). The puzzle is laid out for you."),
    info1, warn, h("div", { class: "btnrow" }, shuffleBtn), preview,
    h("div", { class: "optgrid" }, field("Time limit", minutes))
  );
  build();
  return {
    getConfig() {
      if (!puzzle) return { error: "Add at least 2 words with clues." };
      const { unplaced, ...p } = puzzle;
      return { config: { title: title.value.trim() || "Crossword", minutes: Number(minutes.value), puzzle: p } };
    }
  };
}

/* ---------- state shared by host and player views ---------- */
function paint(g, v, snap, local) {
  const now = Date.now();
  g.cells.forEach((cell, i) => {
    if (!cell) return;
    let ch = v.grid[i];
    const l = local && local[i];
    if (l && now - l.t < 900 && v.locked[i] !== "1") ch = l.ch || " ";
    const locked = v.locked[i] === "1", owner = v.owners[i];
    letterEl(cell).textContent = ch === " " ? (v.solution ? v.solution[i] : "") : ch;
    cell.classList.toggle("locked", locked);
    cell.classList.toggle("owned", !locked && !!owner && ch !== " ");
    cell.classList.toggle("reveal", !!v.solution && ch === " ");
    if (owner) cell.style.setProperty("--c", colorOf(snap, owner)); else cell.style.removeProperty("--c");
  });
}

function clueList(snap, onPick) {
  const v = snap.v, box = h("div", { class: "xw-clues" });
  for (const [dir, label] of [["A", "Across"], ["D", "Down"]]) {
    const col = h("div", { class: "xw-cluecol" }, h("h3", {}, label));
    v.entries.forEach((e, idx) => {
      if (e.dir !== dir) return;
      col.append(h("div", { class: "xw-clue" + (e.solved ? " solved" : ""), "data-idx": idx, style: e.solved ? { "--c": colorOf(snap, e.solved) } : {}, onclick: onPick ? () => onPick(idx) : null },
        h("b", {}, e.n), " ", e.clue, h("small", {}, ` (${e.len})`), e.solved ? h("span", { class: "by" }, nameOf(snap, e.solved)) : null));
    });
    box.append(col);
  }
  return box;
}

/* ================= host (shared screen) ================= */
export function createHost(root) {
  let g = null, cluesEl = null, timerEl = null, key = "";
  const wrapper = h("div", { class: "xw-stage" });
  root.append(wrapper);
  return {
    update(snap) {
      const v = snap.v, k = v.rows + "x" + v.cols + snap.gameNo;
      if (k !== key) {
        key = k; clear(wrapper);
        g = buildGrid(v.rows, v.cols, v.blocks, v.numbers);
        timerEl = h("div", { class: "xw-time" + (v.deadline ? "" : " hidden"), "data-fmt": "clock", "data-deadline": v.deadline || 0 });
        cluesEl = h("div", { class: "xw-side" });
        wrapper.append(h("div", { class: "xw-left" }, timerEl, g.wrap), cluesEl);
      }
      timerEl.dataset.deadline = v.deadline || 0;
      timerEl.classList.toggle("hidden", !v.deadline || snap.status !== "playing");
      paint(g, v, snap, null);
      const sc = cluesEl.scrollTop;
      clear(cluesEl); cluesEl.append(clueList(snap)); cluesEl.scrollTop = sc;
    },
    scoreOptions() { return {}; }
  };
}

/* ================= player (phone) ================= */
export function createPlayer(root, { send, getSnap }) {
  let g = null, key = "", v = null, snap = null;
  let sel = -1, dir = "A";
  const local = {};
  let entryAt = { A: [], D: [] }, cellsOf = [];
  const bar = h("div", { class: "xw-bar" });
  const gridBox = h("div", { class: "xw-gridbox" });
  const listBox = h("div", {});
  const input = h("input", { class: "xw-input", value: " ", autocomplete: "off", autocapitalize: "characters", autocorrect: "off", spellcheck: "false", "aria-label": "Type your letters" });
  root.append(bar, gridBox, input, listBox);

  const rc = i => [Math.floor(i / v.cols), i % v.cols];
  const open = i => i >= 0 && i < v.rows * v.cols && v.blocks[i] === "0";
  const locked = i => v.locked[i] === "1";
  const letterAt = i => { const l = local[i]; if (l && Date.now() - l.t < 900 && !locked(i)) return l.ch; return v.grid[i] === " " ? "" : v.grid[i]; };

  function buildIndex() {
    entryAt = { A: Array(v.rows * v.cols).fill(-1), D: Array(v.rows * v.cols).fill(-1) };
    cellsOf = v.entries.map((e, idx) => {
      const out = [];
      for (let k = 0; k < e.len; k++) {
        const i = (e.r + (e.dir === "D" ? k : 0)) * v.cols + e.c + (e.dir === "A" ? k : 0);
        out.push(i); entryAt[e.dir][i] = idx;
      }
      return out;
    });
  }
  const activeIdx = () => (sel >= 0 ? entryAt[dir][sel] : -1);

  function select(i, toggle) {
    if (!open(i)) return;
    if (i === sel && toggle) { const other = dir === "A" ? "D" : "A"; if (entryAt[other][i] >= 0) dir = other; }
    else if (entryAt[dir][i] < 0) dir = dir === "A" ? "D" : "A";
    sel = i;
    render();
    input.focus({ preventScroll: true });
  }
  function selectEntry(idx) {
    if (idx < 0) return;
    dir = v.entries[idx].dir;
    sel = cellsOf[idx][0];                                              // start at the first square so you can type the whole word
    render();
    input.focus({ preventScroll: true });
    gridBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function stepEntry(delta) {
    const n = v.entries.length;                                            // list order: all across, then all down
    const cur = Math.max(0, activeIdx());
    let next = cur;
    for (let k = 0; k < n; k++) { next = (next + delta + n) % n; if (!v.entries[next].solved) break; }
    selectEntry(next);
  }
  function move(delta) {                      // within the active word
    const idx = activeIdx(); if (idx < 0) return;
    const cells = cellsOf[idx], at = cells.indexOf(sel), to = cells[at + delta];
    if (to != null) sel = to;
  }
  function put(ch) {
    if (sel < 0 || !v || snap.status !== "playing") return;
    if (!locked(sel)) { local[sel] = { ch, t: Date.now() }; send({ a: "put", i: sel, ch }); }
  }
  function type(ch) {
    if (sel < 0) return;
    put(ch);                                                            // a solved square ignores the letter, so typing a whole word still lines up
    const idx = activeIdx(); if (idx < 0) return;
    const cells = cellsOf[idx], at = cells.indexOf(sel);
    if (at < cells.length - 1) sel = cells[at + 1];
    render();
  }
  function back() {
    if (sel < 0) return;
    if (!locked(sel) && letterAt(sel)) { put(""); render(); return; }
    const idx = activeIdx(); if (idx < 0) return;
    const cells = cellsOf[idx], prev = cells[cells.indexOf(sel) - 1];
    if (prev != null) { sel = prev; if (!locked(prev)) put(""); }
    render();
  }
  function arrow(dr, dc) {
    if (sel < 0) return;
    let [r, c] = rc(sel);
    for (let k = 0; k < Math.max(v.rows, v.cols); k++) {
      r += dr; c += dc;
      if (r < 0 || c < 0 || r >= v.rows || c >= v.cols) return;
      if (open(r * v.cols + c)) { dir = dr ? "D" : "A"; if (entryAt[dir][r * v.cols + c] < 0) dir = dr ? "A" : "D"; sel = r * v.cols + c; render(); return; }
    }
  }

  input.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); type(e.key.toUpperCase()); }
    else if (e.key === "Backspace") { e.preventDefault(); back(); }
    else if (e.key === "Delete") { e.preventDefault(); put(""); render(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); arrow(0, -1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); arrow(0, 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); arrow(-1, 0); }
    else if (e.key === "ArrowDown") { e.preventDefault(); arrow(1, 0); }
    else if (e.key === " ") { e.preventDefault(); select(sel, true); }
    else if (e.key === "Tab") { e.preventDefault(); stepEntry(e.shiftKey ? -1 : 1); }
  });
  // Phone keyboards don't send useful keydown events; read what was typed from the input instead.
  input.addEventListener("input", () => {
    const val = input.value; input.value = " ";
    if (val.length === 0) return back();
    const ch = val.trim().slice(-1).toUpperCase();
    if (/^[A-Z]$/.test(ch)) type(ch);
  });

  function render() {
    if (!v) return;
    paint(g, v, snap, local);
    g.cells.forEach((cell, i) => {
      if (!cell) return;
      const idx = activeIdx();
      cell.classList.toggle("hl", idx >= 0 && cellsOf[idx].includes(i));
      cell.classList.toggle("sel", i === sel);
    });
    clear(bar);
    const idx = activeIdx();
    if (idx >= 0) {
      const e = v.entries[idx];
      bar.append(
        h("button", { class: "xw-step", "aria-label": "Previous clue", onclick: () => stepEntry(-1) }, "‹"),
        h("div", { class: "xw-cur" }, h("b", {}, e.n + (e.dir === "A" ? " Across" : " Down")), " ", e.clue, h("small", {}, ` (${e.len})`)),
        h("button", { class: "xw-step", "aria-label": "Next clue", onclick: () => stepEntry(1) }, "›"));
    } else bar.append(h("div", { class: "xw-cur dim" }, v.started ? "Tap a square to start" : "Waiting for the host to start…"));
  }

  return {
    update(s) {
      snap = s; v = s.v;
      const k = v.rows + "x" + v.cols + s.gameNo;
      if (k !== key) {
        key = k; sel = -1; dir = "A"; for (const x of Object.keys(local)) delete local[x];
        buildIndex();
        g = buildGrid(v.rows, v.cols, v.blocks, v.numbers, i => select(i, true));
        clear(gridBox); gridBox.append(g.wrap);
      }
      // a solved word cannot stay selected for typing
      render();
      const sc = listBox.scrollTop;
      clear(listBox); listBox.append(clueList(s, idx => selectEntry(idx)));
      listBox.scrollTop = sc;
    },
    note(text) { toast(text); }
  };
}
