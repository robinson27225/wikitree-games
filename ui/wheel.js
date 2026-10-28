// Spin & Solve (prize-wheel word puzzles): host setup form, the shared-screen host view, and the phone view.
import { h, clear, nameOf, playerOf, sourceBox, field, select, checkbox, toast } from "./common.js";
import { parsePuzzlesCsv, VOWELS } from "../shared/games/wheel.js";
import { WHEEL_PACKS, WHEEL_TEMPLATE } from "../shared/packs.js";
import { Sound } from "../shared/sound.js";

export const info = {
  id: "wheel", title: "Spin & Solve", icon: "$",
  blurb: "Spin the prize wheel, guess letters for cash and solve the genealogy puzzle. Take turns, with the wheel on the big screen."
};

const money = n => "$" + Number(n || 0).toLocaleString("en-US");
const TAU = Math.PI * 2;

/* ================= host setup ================= */
export function setup(root) {
  const title = h("input", { type: "text", maxlength: 60, placeholder: "Spin & Solve" });
  const preview = h("div", { class: "count", role: "status" });
  const warn = h("div", { class: "hint" });
  const rounds = select([["3", "3 puzzles"], ["5", "5 puzzles"], ["8", "8 puzzles"], ["10", "10 puzzles"]], "5");
  const timer = select([["20", "20 seconds"], ["30", "30 seconds"], ["45", "45 seconds"], ["60", "60 seconds"], ["0", "No limit"]], "30");
  const shuffle = checkbox("Shuffle the puzzles", true);
  let parsed = { puzzles: [], skipped: [] };
  const src = sourceBox({
    packs: WHEEL_PACKS, template: WHEEL_TEMPLATE, templateName: "spin-and-solve-template.csv", onChange: refresh,
    placeholder: "Category,Puzzle\nPlace,ELLIS ISLAND\nPhrase,BLOOD IS THICKER THAN WATER"
  });
  function refresh() {
    parsed = parsePuzzlesCsv(src.text());
    preview.textContent = parsed.puzzles.length ? `${parsed.puzzles.length} puzzle${parsed.puzzles.length === 1 ? "" : "s"} ready` : "";
    preview.classList.toggle("bad", !parsed.puzzles.length);
    warn.textContent = parsed.skipped.length ? "Skipped: " + parsed.skipped.slice(0, 3).join("; ") : "";
  }
  root.append(
    field("Game title", title), src.el, preview, warn,
    h("p", { class: "hint" }, "One row per puzzle: Category, Puzzle. Puzzles can be up to 60 characters and need at least 3 letters. Punctuation is shown to players as a free clue. A puzzle's text is the answer, ignoring spaces and punctuation."),
    h("div", { class: "optgrid" }, field("Puzzles to play", rounds), field("Time for each turn", timer)),
    shuffle.el,
    h("p", { class: "hint" }, "Players take turns in the order they joined, so this works best with up to about 8 players. Everyone else watches and cheers.")
  );
  refresh();
  return {
    getConfig() {
      refresh();
      if (!parsed.puzzles.length) return { error: "Add at least one puzzle with 3 or more letters." };
      return { config: { title: title.value.trim() || "Spin & Solve", puzzles: parsed.puzzles, rounds: Math.min(Number(rounds.value), parsed.puzzles.length), turnSecs: Number(timer.value), shuffle: shuffle.box.checked } };
    }
  };
}

/* ================= the wheel ================= */
function makeWheel() {
  const canvas = h("canvas", { class: "wh-wheel", "aria-label": "Prize wheel" });
  let rot = 0, anim = null, lastAt = 0, segs = [], raf = 0;

  function draw() {
    const dpr = window.devicePixelRatio || 1, size = canvas.clientWidth;
    if (!size) return;
    const px = Math.round(size * dpr);
    if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
    const ctx = canvas.getContext("2d"), r = size / 2 - size * 0.045, n = segs.length || 24, th = TAU / n;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2 + size * 0.015);
    ctx.save(); ctx.rotate(rot);
    const palette = ["#FCB815", "#f37c26", "#8FC641", "#FFE270", "#A5D167", "#FAD158"];
    let c = 0;
    segs.forEach((s, i) => {
      const special = typeof s !== "number", bankrupt = s === "BANKRUPT";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, i * th - Math.PI / 2, (i + 1) * th - Math.PI / 2); ctx.closePath();
      ctx.fillStyle = bankrupt ? "#1d2f22" : special ? "#ffffff" : palette[c++ % palette.length];
      ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#25422D"; ctx.stroke();
      ctx.save(); ctx.rotate((i + 0.5) * th - Math.PI / 2);
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillStyle = bankrupt ? "#fff" : "#25422D";
      ctx.font = `700 ${r * (special ? 0.075 : 0.1)}px Calibri, Carlito, sans-serif`;
      ctx.fillText(special ? s : "$" + s, r * 0.92, 0);
      ctx.restore();
    });
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, TAU); ctx.fillStyle = "#25422D"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = "#FCB815"; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.07, -r - size * 0.035); ctx.lineTo(r * 0.07, -r - size * 0.035); ctx.lineTo(0, -r + r * 0.08); ctx.closePath();
    ctx.fillStyle = "#f37c26"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke();
  }

  function frame(offset) {
    const now = Date.now() + offset, p = Math.min(1, Math.max(0, (now - anim.at) / (anim.until - anim.at)));
    rot = anim.from + (anim.to - anim.from) * (1 - Math.pow(1 - p, 3));
    draw();
    if (p < 1) raf = requestAnimationFrame(() => frame(offset)); else { rot = anim.to % TAU; anim = null; draw(); }
  }

  new ResizeObserver(() => draw()).observe(canvas);
  return {
    canvas,
    update(v, snap) {
      segs = v.segments;
      if (v.spin && v.spin.at !== lastAt) {
        lastAt = v.spin.at;
        const th = TAU / segs.length, target = -(v.spin.idx + 0.5) * th;
        const from = rot, to = from + ((((target - from) % TAU) + TAU) % TAU) + 5 * TAU;
        const now = Date.now() + snap.offset;
        cancelAnimationFrame(raf);
        if (now >= v.spin.until) { rot = to % TAU; anim = null; draw(); }
        else { anim = { from, to, at: v.spin.at, until: v.spin.until }; frame(snap.offset); }
      } else if (!anim) draw();
    },
    redraw: draw
  };
}

/* ================= the puzzle board ================= */
function wrapRows(text) {
  const words = text.split(" "), width = Math.max(12, ...words.map(w => w.length));
  const rows = [""];
  for (const w of words) {
    const last = rows[rows.length - 1];
    if (!last) rows[rows.length - 1] = w;
    else if (last.length + 1 + w.length <= width) rows[rows.length - 1] = last + " " + w;
    else rows.push(w);
  }
  return { rows, width };
}
function makeBoard() {
  const el = h("div", { class: "wh-board", role: "img" });
  let prev = "", prevRound = -1;
  return {
    el,
    update(v) {
      el.setAttribute("aria-label", "Puzzle: " + v.shown.replace(/_/g, "blank "));
      const { rows, width } = wrapRows(v.shown), flat = prev.replace(/ /g, "");
      let k = 0;
      clear(el); el.style.setProperty("--w", width);
      const fresh = v.round === prevRound;
      for (const row of rows) {
        const line = h("div", { class: "wh-row" });
        const pad = Math.floor((width - row.length) / 2);
        for (let i = 0; i < pad; i++) line.append(h("span", { class: "wh-gap" }));
        for (const ch of row) {
          if (ch === " ") { line.append(h("span", { class: "wh-gap" })); continue; }
          const hidden = ch === "_", letter = /[A-Z]/.test(ch);
          const was = flat[k++];
          line.append(h("span", { class: "wh-tile" + (hidden ? " blank" : "") + (!hidden && letter && fresh && was === "_" ? " new" : "") }, hidden ? "" : ch));
        }
        el.append(line);
      }
      prev = v.shown; prevRound = v.round;
    }
  };
}

const usedStrip = v => h("div", { class: "wh-used", "aria-label": "Letters called" },
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(c => h("span", { class: v.called.includes(c) ? "on" : "" }, c)));

/* ================= host (shared screen) ================= */
export function createHost(root, { send, getSnap }) {
  const wheel = makeWheel(), board = makeBoard();
  const head = h("div", { class: "wh-head" });
  const turn = h("div", { class: "wh-turn" });
  const used = h("div", {});
  const msg = h("div", { class: "wh-msg", "aria-live": "polite" });
  const cash = h("div", { class: "wh-cash" });
  const btns = h("div", { class: "btnrow", style: { justifyContent: "center" } });
  const side = h("div", { class: "wh-side" }, turn, msg, cash, used, btns);
  root.append(head, board.el, h("div", { class: "wh-lower" }, h("div", { class: "wh-wheelbox" }, wheel.canvas), side));
  let spinning = false;

  document.addEventListener("keydown", e => {
    if (e.target.closest("input,textarea,select,button,dialog")) return;
    if (e.code === "Space" && getSnap().v && getSnap().v.stage === "revealed") { e.preventDefault(); send({ a: "next" }); }
  });

  return {
    update(snap) {
      const v = snap.v, who = playerOf(snap, v.turn);
      head.replaceChildren(h("span", { class: "wh-cat" }, v.category), h("span", { class: "wh-round" }, `Puzzle ${v.round} of ${v.rounds}`));
      board.update(v);
      wheel.update(v, snap);
      if (v.stage === "spinning" && !spinning) { spinning = true; Sound.startSpin(); }
      else if (v.stage !== "spinning" && spinning) { spinning = false; Sound.landed(); }
      const revealed = v.stage === "revealed";
      turn.replaceChildren(revealed ? h("b", {}, v.winner ? `${nameOf(snap, v.winner.sid)} solved it!` : "Puzzle over")
        : who ? h("span", {}, h("span", { class: "dot", style: { background: who.color } }), " ", h("b", {}, who.name), "'s turn",
          v.deadline ? h("span", { class: "cb-timer", "data-deadline": v.deadline, style: { marginLeft: "12px" } }) : null) : "Waiting for players…");
      msg.textContent = v.stage === "spinning" ? "Spinning…" : v.stage === "guess" ? `${nameOf(snap, v.turn)} spun ${money(v.spinValue)}. Pick a consonant.` : (v.msg || "Spin the wheel!");
      clear(cash);
      snap.players.forEach(p => cash.append(h("span", { class: "wh-chip" + (p.sid === v.turn ? " on" : ""), style: { "--c": p.color } }, p.name, " ", h("b", {}, money(v.roundCash[p.sid] || 0)))));
      clear(used); used.append(usedStrip(v));
      clear(btns);
      if (revealed) btns.append(h("button", { class: "primary", onclick: () => send({ a: "next" }) }, v.round >= v.rounds ? "Show the results (Space)" : "Next puzzle (Space)"));
      else {
        btns.append(h("button", { class: "ghost", onclick: () => send({ a: "skipTurn" }) }, "Skip this turn"),
          h("button", { class: "ghost", onclick: () => send({ a: "reveal" }) }, "Give up on this puzzle"));
      }
    },
    scoreOptions() { return {}; }
  };
}

/* ================= player (phone) ================= */
export function createPlayer(root, { send }) {
  const wheel = makeWheel(), board = makeBoard();
  const head = h("div", { class: "wh-head" });
  const wheelBox = h("div", { class: "wh-wheelbox small" }, wheel.canvas);
  const status = h("div", { class: "wh-msg", "aria-live": "polite" });
  const panel = h("div", { class: "wh-panel" });
  root.append(head, board.el, wheelBox, status, panel);
  let mode = null, key = "";

  function pad(v, letters, onPick) {
    return h("div", { class: "wh-pad" }, ...letters.split("").map(c => {
      const used = v.called.includes(c);
      return h("button", { type: "button", disabled: used, class: used ? "used" : "", onclick: () => onPick(c) }, c);
    }));
  }

  let snapNow = null;
  const keyOf = snap => { const v = snap.v; return [v.stage, v.turn, v.round, v.called, (v.roundCash[snap.me] || 0) >= v.vowelCost, mode, v.winner && v.winner.sid].join("|"); };
  const render = snap => { key = keyOf(snap); build(snap); };
  const setMode = m => { mode = m; render(snapNow); };

  function build(snap) {
    const v = snap.v, me = snap.me, mine = v.turn === me, cashMe = v.roundCash[me] || 0;
    clear(panel);
    if (v.stage === "revealed") {
      panel.append(h("div", { class: "cp-result" + (v.winner && v.winner.sid === me ? " good" : "") }, v.winner ? `${v.winner.sid === me ? "You" : nameOf(snap, v.winner.sid)} solved it: ${v.answer}` : `The answer was ${v.answer}`));
      return;
    }
    if (!mine) { panel.append(h("div", { class: "cp-msg" }, v.turn ? `${nameOf(snap, v.turn)}'s turn` : "Waiting for players…")); return; }
    const timer = v.deadline ? h("span", { class: "cb-timer", "data-deadline": v.deadline }) : null;
    panel.append(h("div", { class: "wh-yours" }, h("b", {}, "Your turn!"), " ", timer, h("span", { class: "hint" }, ` Round cash ${money(cashMe)}`)));
    if (v.stage === "spinning") { panel.append(h("div", { class: "cp-msg" }, "Here it goes…")); return; }
    if (mode === "solve") {
      const input = h("input", { type: "text", maxlength: 70, placeholder: "Type the whole puzzle", autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
      const go = () => { if (input.value.trim()) { mode = null; send({ a: "solve", text: input.value }); } };
      input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      panel.append(h("div", { class: "cp-form" }, input, h("div", { class: "btnrow", style: { justifyContent: "center" } },
        h("button", { class: "primary", onclick: go }, "Solve it"), h("button", { class: "ghost", onclick: () => setMode(null) }, "Cancel"))));
      setTimeout(() => input.focus(), 50);
      return;
    }
    if (v.stage === "guess") {
      panel.append(h("div", { class: "cp-msg" }, `${money(v.spinValue)} a letter. Pick a consonant:`),
        pad(v, "BCDFGHJKLMNPQRSTVWXYZ", c => send({ a: "consonant", ch: c })),
        h("button", { class: "ghost", onclick: () => setMode("solve") }, "Solve the puzzle"));
      return;
    }
    if (mode === "vowel") {
      panel.append(h("div", { class: "cp-msg" }, `A vowel costs ${money(v.vowelCost)}. Pick one:`), pad(v, VOWELS, c => { mode = null; send({ a: "vowel", ch: c }); }),
        h("button", { class: "ghost", onclick: () => setMode(null) }, "Back"));
      return;
    }
    const canBuy = cashMe >= v.vowelCost && [...VOWELS].some(c => !v.called.includes(c));
    panel.append(
      h("button", { class: "buzz", onclick: () => send({ a: "spin" }) }, "SPIN!"),
      h("div", { class: "btnrow", style: { justifyContent: "center", marginTop: "12px" } },
        h("button", { class: "ghost", disabled: !canBuy, onclick: () => setMode("vowel") }, `Buy a vowel (${money(v.vowelCost)})`),
        h("button", { class: "ghost", onclick: () => setMode("solve") }, "Solve the puzzle")));
  }

  let turnKey = "";
  return {
    update(snap) {
      snapNow = snap;
      const v = snap.v, mine = v.turn === snap.me;
      head.replaceChildren(h("span", { class: "wh-cat" }, v.category), h("span", { class: "wh-round" }, `Puzzle ${v.round}/${v.rounds}`));
      board.update(v); wheel.update(v, snap);
      status.textContent = v.stage === "spinning" ? "Spinning…" : v.stage === "guess" && !mine ? `${nameOf(snap, v.turn)} spun ${money(v.spinValue)}` : (v.msg || "");
      const tk = v.stage + "|" + v.turn + "|" + v.round;
      if (tk !== turnKey) { turnKey = tk; mode = null; }          // a new stage or turn always starts from the main choices
      if (keyOf(snap) !== key) render(snap);
      else { const t = panel.querySelector("[data-deadline]"); if (t) t.dataset.deadline = v.deadline || 0; }
    },
    note(text) { toast(text); }
  };
}
